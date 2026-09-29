import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { autosaveCommit } from '../../git-worktree.ts';
import type {
  DraftPrInput,
  DraftPrOutcome,
  ForgeAvailability,
  ForgeComment,
  ForgeCommentsData,
  ForgeDriver,
  ForgeItem,
  ForgePrChange,
  ForgePrDiffResult,
  ForgePrStatus,
  ForgeRefKind,
  ForgeSearchData,
} from './types.ts';
import {
  buildPrBody,
  GH_PR_DIFF_FILE_CAP,
  GH_PR_PATCH_CAP,
  type ChecksGlyph,
  type GithubChecksData,
  type GithubData,
  type GithubRefStatusData,
  type ReferenceStatus,
} from './github.ts';

/**
 * The GitLab forge driver — gitlab.com and self-hosted instances (`CEZ_GITLAB_HOSTS`), through
 * the `glab` CLI's authenticated `glab api`, so it uses whatever `glab auth login` set up and needs
 * no token of its own.
 *
 * The cockpit's forge tab and its routes speak the GitHub payload shapes (`GithubData`,
 * `GithubChecksData`, …; BACKWARD_COMPATIBILITY.md §2), so this driver answers in exactly those
 * shapes: a merge request is a `pr` row whose `number` is its project-scoped IID, an issue an
 * `issue` row. GitLab numbers the two separately (`#12` and `!12` can both exist), which the
 * shapes already allow, because every route takes the kind alongside the number.
 *
 * Every function degrades in the payload (`available: false` + a one-line reason), never throws.
 */

const exec = promisify(execFile);

export interface GitlabRepoRef {
  host: string;
  /** Full project path, subgroups included: `group/subgroup/project`. */
  path: string;
}

const CACHE_MS = 60_000;
const LIST_MAX = 100;
const SEARCH_MAX = 50;

function glabBin(): string {
  return process.env.CEZ_GLAB_BIN ?? 'glab';
}

async function glab(ref: GitlabRepoRef, cwd: string, endpoint: string, extra: string[] = [], timeout = 15_000): Promise<string> {
  const { stdout } = await exec(glabBin(), ['api', '--hostname', ref.host, ...extra, endpoint], {
    cwd,
    timeout,
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

const projectApi = (ref: GitlabRepoRef): string => `projects/${encodeURIComponent(ref.path)}`;

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.slice(0, 300) ?? '';
}

/** One-line reason for a failed `glab` call — ENOENT and auth failures get their remedy. */
export function glabReason(err: unknown): string {
  const e = err as { code?: string; stderr?: string; message?: string };
  if (e?.code === 'ENOENT') return 'glab CLI not found — install it and run `glab auth login`';
  const text = firstLine(e?.stderr || e?.message || String(err));
  if (/401|unauthori[sz]ed|not logged|authenticat/i.test(text)) return `GitLab login needed — run \`glab auth login\` (${text})`;
  return text || 'GitLab is unreachable';
}

// ---- GitLab REST shapes (validated at the boundary, extras stripped) -------------------------

const glUser = z.object({ username: z.string(), avatar_url: z.string().nullish() }).nullish();
const glIssue = z.object({
  iid: z.number().int().positive(),
  title: z.string(),
  author: glUser,
  created_at: z.string(),
  labels: z.array(z.string()).default([]),
  description: z.string().nullish(),
  web_url: z.string(),
  user_notes_count: z.number().int().nonnegative().default(0),
  state: z.string().default('opened'),
});
const glPipeline = z.object({ status: z.string().nullish() }).nullish();
const glMr = glIssue.extend({
  draft: z.boolean().nullish(),
  work_in_progress: z.boolean().nullish(),
  has_conflicts: z.boolean().nullish(),
  sha: z.string().nullish(),
  source_branch: z.string().nullish(),
  target_branch: z.string().nullish(),
  head_pipeline: glPipeline,
  detailed_merge_status: z.string().nullish(),
});
type GlMr = z.infer<typeof glMr>;
const glLabel = z.object({ name: z.string(), color: z.string().default('') });
const glNote = z.object({
  id: z.number(),
  body: z.string().default(''),
  author: glUser,
  created_at: z.string(),
  system: z.boolean().default(false),
});
const glDiff = z.object({
  old_path: z.string(),
  new_path: z.string(),
  new_file: z.boolean().default(false),
  renamed_file: z.boolean().default(false),
  deleted_file: z.boolean().default(false),
  diff: z.string().nullish(),
  too_large: z.boolean().nullish(),
  collapsed: z.boolean().nullish(),
});

const isDraft = (mr: GlMr): boolean => Boolean(mr.draft ?? mr.work_in_progress);

/** A pipeline status → the tab's CI glyph. `null` = no CI, or nothing that ran. */
export function pipelineGlyph(status: string | null | undefined): ChecksGlyph {
  switch (status) {
    case 'success':
      return 'passing';
    case 'failed':
    case 'canceled':
      return 'failing';
    case 'created':
    case 'waiting_for_resource':
    case 'preparing':
    case 'pending':
    case 'running':
    case 'scheduled':
    case 'manual':
      return 'pending';
    default:
      return null;
  }
}

function issueItem(issue: z.infer<typeof glIssue>): ForgeItem {
  return {
    kind: 'issue',
    number: issue.iid,
    title: issue.title,
    author: issue.author?.username ?? '?',
    createdAt: issue.created_at,
    labels: issue.labels,
    body: (issue.description ?? '').slice(0, 8000),
    url: issue.web_url,
    comments: issue.user_notes_count,
  };
}

function mrItem(mr: GlMr): ForgeItem {
  return {
    ...issueItem(mr),
    kind: 'pr',
    isDraft: isDraft(mr),
    checks: mr.head_pipeline ? pipelineGlyph(mr.head_pipeline.status) : null,
  };
}

// ---- availability ---------------------------------------------------------------------------

const detectCache = new Map<string, { at: number; value: ForgeAvailability }>();

export async function detectGitlab(ref: GitlabRepoRef, root: string): Promise<ForgeAvailability> {
  if (process.env.CEZ_DRY_RUN === '1') return { available: true };
  const key = `${ref.host}\0${ref.path}`;
  const hit = detectCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: ForgeAvailability;
  try {
    z.object({ id: z.number() }).parse(JSON.parse(await glab(ref, root, projectApi(ref))));
    value = { available: true };
  } catch (err) {
    value = { available: false, reason: glabReason(err) };
  }
  detectCache.set(key, { at: Date.now(), value });
  return value;
}

/** The health path's non-blocking read: the last known answer, revalidated off the request path
 *  when stale; null only until the first probe lands. */
export function detectGitlabCached(ref: GitlabRepoRef, root: string): ForgeAvailability | null {
  if (process.env.CEZ_DRY_RUN === '1') return { available: true };
  const hit = detectCache.get(`${ref.host}\0${ref.path}`);
  if (!hit || Date.now() - hit.at >= CACHE_MS) void detectGitlab(ref, root).catch(() => {});
  return hit?.value ?? null;
}

// ---- the tab's list ---------------------------------------------------------------------------

const listCache = new Map<string, { at: number; limit: number; data: GithubData }>();

export async function fetchGitlab(ref: GitlabRepoRef, root: string, refresh = false, limit = 30): Promise<GithubData> {
  const capped = Math.min(Math.max(limit, 1), LIST_MAX);
  const key = `${ref.host}\0${ref.path}`;
  const hit = listCache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS && hit.limit >= capped) return hit.data;
  try {
    const api = projectApi(ref);
    const [issuesOut, mrsOut, labelsOut] = await Promise.all([
      glab(ref, root, `${api}/issues?state=opened&order_by=created_at&per_page=${capped}`),
      glab(ref, root, `${api}/merge_requests?state=opened&order_by=created_at&per_page=${capped}`),
      glab(ref, root, `${api}/labels?per_page=100`).catch(() => '[]'),
    ]);
    const labelColors: Record<string, string> = {};
    for (const label of z.array(glLabel).parse(JSON.parse(labelsOut))) {
      const hex = label.color.replace(/^#/, '');
      if (/^[0-9a-f]{6}$/i.test(hex)) labelColors[label.name] = hex.toLowerCase();
    }
    const data: GithubData = {
      available: true,
      repo: ref.path,
      syncedAt: new Date().toISOString(),
      issues: z.array(glIssue).parse(JSON.parse(issuesOut)).map(issueItem),
      prs: z.array(glMr).parse(JSON.parse(mrsOut)).map(mrItem),
      labelColors,
    };
    listCache.set(key, { at: Date.now(), limit: capped, data });
    return data;
  } catch (err) {
    return { available: false, reason: glabReason(err), issues: [], prs: [] };
  }
}

export async function searchGitlabItems(
  ref: GitlabRepoRef,
  root: string,
  kind: 'issue' | 'pr',
  query: string,
  limit = 30,
): Promise<ForgeSearchData> {
  const capped = Math.min(Math.max(limit, 1), SEARCH_MAX);
  try {
    const path = kind === 'issue' ? 'issues' : 'merge_requests';
    const out = await glab(
      ref,
      root,
      `${projectApi(ref)}/${path}?state=all&search=${encodeURIComponent(query)}&per_page=${capped}`,
    );
    const items = kind === 'issue'
      ? z.array(glIssue).parse(JSON.parse(out)).map(issueItem)
      : z.array(glMr).parse(JSON.parse(out)).map((mr) => ({ ...mrItem(mr), checks: null }));
    return { available: true, items, truncated: items.length >= capped };
  } catch (err) {
    return { available: false, reason: glabReason(err), items: [] };
  }
}

// ---- merge requests one by one ------------------------------------------------------------------

async function getMr(ref: GitlabRepoRef, root: string, iid: number): Promise<GlMr> {
  return glMr.parse(JSON.parse(await glab(ref, root, `${projectApi(ref)}/merge_requests/${iid}`)));
}

export async function fetchGitlabChecks(ref: GitlabRepoRef, root: string, numbers: number[]): Promise<GithubChecksData> {
  try {
    const checks: Record<number, ChecksGlyph> = {};
    const wanted = [...new Set(numbers)].filter((n) => Number.isInteger(n) && n > 0).slice(0, LIST_MAX);
    await Promise.all(
      wanted.map(async (n) => {
        try {
          checks[n] = pipelineGlyph((await getMr(ref, root, n)).head_pipeline?.status);
        } catch {
          checks[n] = null;
        }
      }),
    );
    return { available: true, checks };
  } catch (err) {
    return { available: false, reason: glabReason(err) };
  }
}

/** Where a merge request stands, in the chip vocabulary the task tables share with GitHub. */
export function mrStatus(mr: GlMr): ReferenceStatus {
  if (mr.state === 'merged') return 'merged';
  if (mr.state === 'closed' || mr.state === 'locked') return 'closed';
  if (isDraft(mr)) return 'draft';
  const glyph = pipelineGlyph(mr.head_pipeline?.status);
  if (glyph === 'failing') return 'checks-failing';
  if (glyph === 'pending') return 'checks-pending';
  if (mr.detailed_merge_status === 'mergeable') return 'ready';
  if (mr.detailed_merge_status === 'not_approved') return 'review-required';
  return 'open';
}

export async function fetchGitlabRefStatus(
  ref: GitlabRepoRef,
  root: string,
  wanted: { prs: number[]; issues: number[] },
): Promise<GithubRefStatusData> {
  const prs: Record<number, ReferenceStatus> = {};
  const issues: Record<number, ReferenceStatus> = {};
  const conflicts: number[] = [];
  let failure: string | undefined;
  await Promise.all([
    ...wanted.prs.map(async (n) => {
      try {
        const mr = await getMr(ref, root, n);
        prs[n] = mrStatus(mr);
        if (mr.state === 'opened' && mr.has_conflicts) conflicts.push(n);
      } catch (err) {
        failure ??= glabReason(err);
      }
    }),
    ...wanted.issues.map(async (n) => {
      try {
        const issue = glIssue.parse(JSON.parse(await glab(ref, root, `${projectApi(ref)}/issues/${n}`)));
        issues[n] = issue.state === 'closed' ? 'completed' : 'open';
      } catch (err) {
        failure ??= glabReason(err);
      }
    }),
  ]);
  const known = Object.keys(prs).length + Object.keys(issues).length;
  if (known === 0 && failure) return { available: false, reason: failure, recheckAfterMs: 60_000 };
  const settled = (s: ReferenceStatus) => s === 'merged' || s === 'closed' || s === 'completed' || s === 'not-planned';
  const open = [...Object.values(prs), ...Object.values(issues)].some((s) => !settled(s));
  return { available: true, prs, issues, conflicts, recheckAfterMs: open || failure ? 60_000 : null };
}

/** Lines added/removed in a unified diff body (hunks only; GitLab sends no file header). */
export function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions++;
    else if (line.startsWith('-')) deletions++;
  }
  return { additions, deletions };
}

export async function fetchGitlabPrDiff(ref: GitlabRepoRef, root: string, number: number): Promise<ForgePrDiffResult> {
  try {
    const mr = await getMr(ref, root, number);
    const rows: z.infer<typeof glDiff>[] = [];
    const api = `${projectApi(ref)}/merge_requests/${number}`;
    try {
      for (let page = 1; page <= GH_PR_DIFF_FILE_CAP / 100; page++) {
        const next = z.array(glDiff).parse(JSON.parse(await glab(ref, root, `${api}/diffs?per_page=100&page=${page}`, [], 30_000)));
        rows.push(...next);
        if (next.length < 100) break;
      }
    } catch {
      // GitLab before 15.7 has no /diffs: the older /changes carries the same rows in one call.
      const changes = z.object({ changes: z.array(glDiff) }).parse(JSON.parse(await glab(ref, root, `${api}/changes`, [], 30_000)));
      rows.push(...changes.changes);
    }
    let truncated = rows.length >= GH_PR_DIFF_FILE_CAP;
    const reasons: string[] = truncated ? [`Only the first ${GH_PR_DIFF_FILE_CAP} files are shown.`] : [];
    const files: ForgePrChange[] = rows.slice(0, GH_PR_DIFF_FILE_CAP).map((row) => {
      const status: ForgePrChange['status'] = row.new_file ? 'added' : row.deleted_file ? 'removed' : row.renamed_file ? 'renamed' : 'modified';
      const body = row.diff ?? '';
      const { additions, deletions } = countDiffLines(body);
      const change: ForgePrChange = {
        path: row.new_path,
        ...(row.renamed_file ? { previousPath: row.old_path } : {}),
        status,
        additions,
        deletions,
      };
      if (row.too_large || row.collapsed || Buffer.byteLength(body, 'utf8') > GH_PR_PATCH_CAP) {
        change.patchUnavailableReason = 'too-large';
        change.truncated = true;
        truncated = true;
      } else if (!body) {
        change.patchUnavailableReason = 'binary';
      } else {
        change.patch = body;
      }
      return change;
    });
    if (truncated && reasons.length === 0) reasons.push('Some files are too large to show.');
    return {
      available: true,
      number,
      headSha: mr.sha ?? '',
      files,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      truncated,
      ...(reasons.length ? { reason: reasons.join(' ') } : {}),
    };
  } catch (err) {
    return { available: false, reason: glabReason(err) };
  }
}

export async function fetchGitlabComments(
  ref: GitlabRepoRef,
  root: string,
  kind: 'issue' | 'pr',
  number: number,
): Promise<ForgeCommentsData> {
  try {
    const path = kind === 'issue' ? 'issues' : 'merge_requests';
    const itemUrl = z
      .object({ web_url: z.string() })
      .parse(JSON.parse(await glab(ref, root, `${projectApi(ref)}/${path}/${number}`))).web_url;
    const notes = z
      .array(glNote)
      .parse(JSON.parse(await glab(ref, root, `${projectApi(ref)}/${path}/${number}/notes?sort=asc&order_by=created_at&per_page=100`)));
    const comments: ForgeComment[] = notes
      .filter((note) => !note.system)
      .map((note) => ({
        id: note.id,
        author: note.author?.username ?? '?',
        ...(note.author?.avatar_url ? { avatarUrl: note.author.avatar_url } : {}),
        createdAt: note.created_at,
        body: note.body.slice(0, 8000),
        kind: 'comment' as const,
        url: `${itemUrl}#note_${note.id}`,
      }));
    return { available: true, comments, truncated: notes.length >= 100 };
  } catch (err) {
    return { available: false, reason: glabReason(err), comments: [] };
  }
}

// ---- draft merge request (review gate) -------------------------------------------------------

const MR_URL_RE = /https?:\/\/\S+\/-\/merge_requests\/\d+/;

async function execTool(cmd: string, args: string[], cwd: string, timeout = 60_000) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? String(err) };
  }
}

export async function createGitlabDraftMr(ref: GitlabRepoRef, input: DraftPrInput): Promise<DraftPrOutcome> {
  const { run } = input;
  const worktree = run.worktreePath;
  const branch = run.branch;
  if (!worktree || !branch) return { ok: false, error: 'this task has no worktree/branch to publish' };
  const saved = await autosaveCommit(worktree, 'pre-PR');
  if (saved === 'refused') return { ok: false, error: 'worktree has unresolved merge conflicts — resolve them, then publish again' };
  if (saved === 'failed') return { ok: false, error: 'could not commit the final changes — check git status in the worktree' };
  if (process.env.CEZ_DRY_RUN === '1') {
    return { ok: true, url: `https://${ref.host}/${ref.path}/-/merge_requests/777`, dryRun: true };
  }
  const push = await execTool('git', ['push', '-u', 'origin', branch], worktree);
  if (!push.ok) return { ok: false, error: `git push failed — ${firstLine(push.stderr) || 'unknown error'}` };
  let target = run.baseBranch?.replace(/^origin\//, '');
  if (!target || /^[0-9a-f]{7,40}$/i.test(target)) {
    try {
      target = z.object({ default_branch: z.string() }).parse(JSON.parse(await glab(ref, worktree, projectApi(ref)))).default_branch;
    } catch (err) {
      return { ok: false, error: `could not read the default branch — ${glabReason(err)}` };
    }
  }
  const title = /^draft:/i.test(run.title) ? run.title : `Draft: ${run.title}`;
  try {
    const out = await glab(ref, worktree, `${projectApi(ref)}/merge_requests`, [
      '--method', 'POST',
      '-f', `source_branch=${branch}`,
      '-f', `target_branch=${target}`,
      '-f', `title=${title}`,
      '-f', `description=${buildPrBody(input.handoffText, run.task)}`,
    ], 60_000);
    const url = z.object({ web_url: z.string() }).safeParse(JSON.parse(out));
    const found = url.success ? url.data.web_url : MR_URL_RE.exec(out)?.[0];
    if (!found) return { ok: false, error: 'GitLab returned no merge request URL — check the merge requests page' };
    return { ok: true, url: found, dryRun: false };
  } catch (err) {
    return { ok: false, error: `creating the merge request failed — ${glabReason(err)}` };
  }
}

// ---- the driver ----------------------------------------------------------------------------------

export function createGitlabDriver(repoRoot: string, ref: GitlabRepoRef): ForgeDriver {
  return {
    kind: 'gitlab',
    detect: () => detectGitlab(ref, repoRoot),
    detectCached: () => detectGitlabCached(ref, repoRoot),
    listIssues: async (opts) => (await fetchGitlab(ref, repoRoot, opts?.refresh, opts?.limit)).issues,
    listPRs: async (opts) => (await fetchGitlab(ref, repoRoot, opts?.refresh, opts?.limit)).prs,
    searchItems: (kind, query, opts) => searchGitlabItems(ref, repoRoot, kind, query, opts?.limit),
    prDiff: (number) => fetchGitlabPrDiff(ref, repoRoot, number),
    createPR: (input) => createGitlabDraftMr(ref, input),
    prStatus: async (branch): Promise<ForgePrStatus | null> => {
      try {
        const out = await glab(
          ref,
          repoRoot,
          `${projectApi(ref)}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&order_by=updated_at&per_page=1`,
        );
        const first = z.array(glMr).parse(JSON.parse(out))[0];
        if (!first) return null;
        const mr = await getMr(ref, repoRoot, first.iid);
        return {
          number: mr.iid,
          url: mr.web_url,
          state: mr.state === 'merged' ? 'merged' : mr.state === 'opened' ? 'open' : 'closed',
          isDraft: isDraft(mr),
          checks: pipelineGlyph(mr.head_pipeline?.status),
        };
      } catch {
        return null;
      }
    },
    viewUrl: (kind: ForgeRefKind, value: string | number): string | null => {
      const base = `https://${ref.host}/${ref.path}`;
      const path = String(value).split('/').map(encodeURIComponent).join('/');
      switch (kind) {
        case 'repo':
          return base;
        case 'issue':
          return `${base}/-/issues/${path}`;
        case 'pr':
          return `${base}/-/merge_requests/${path}`;
        case 'branch':
          return `${base}/-/tree/${path}`;
        case 'commit':
          return `${base}/-/commit/${path}`;
      }
    },
  };
}
