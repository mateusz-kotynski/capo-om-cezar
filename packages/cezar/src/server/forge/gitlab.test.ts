import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  countDiffLines,
  createGitlabDriver,
  detectGitlab,
  fetchGitlab,
  fetchGitlabChecks,
  fetchGitlabComments,
  fetchGitlabPrDiff,
  fetchGitlabRefStatus,
  mrStatus,
  pipelineGlyph,
  searchGitlabItems,
  type GitlabRepoRef,
} from './gitlab.ts';

/**
 * The GitLab driver against a fake `glab`: it logs its argv and answers each `glab api` endpoint
 * from a prefix → JSON map (longest prefix wins; `null` answers a 404), so every payload the
 * cockpit's forge tab reads is checked without a network.
 */

let dir: string;
let mapFile: string;
let logFile: string;
const saved: Record<string, string | undefined> = {};

const FAKE_GLAB = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GLAB_LOG, JSON.stringify(args) + '\\n');
const endpoint = args[args.length - 1];
const map = JSON.parse(fs.readFileSync(process.env.FAKE_GLAB_MAP, 'utf8'));
const key = Object.keys(map).sort((a, b) => b.length - a.length).find((k) => endpoint.startsWith(k));
if (key === undefined) { process.stderr.write('no fixture for ' + endpoint); process.exit(1); }
if (map[key] === null) { process.stderr.write('glab: 404 Not Found'); process.exit(1); }
process.stdout.write(JSON.stringify(map[key]));
`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'cez-gitlab-'));
  const bin = join(dir, 'glab.cjs');
  writeFileSync(bin, FAKE_GLAB);
  chmodSync(bin, 0o755);
  mapFile = join(dir, 'map.json');
  logFile = join(dir, 'log.jsonl');
  for (const k of ['CEZ_GLAB_BIN', 'FAKE_GLAB_MAP', 'FAKE_GLAB_LOG', 'CEZ_DRY_RUN']) saved[k] = process.env[k];
  process.env.CEZ_GLAB_BIN = bin;
  process.env.FAKE_GLAB_MAP = mapFile;
  process.env.FAKE_GLAB_LOG = logFile;
  delete process.env.CEZ_DRY_RUN;
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => writeFileSync(logFile, ''));

let n = 0;
/** A fresh project per test: the driver's caches are keyed by project. */
function project(fixtures: (api: string) => Record<string, unknown>): GitlabRepoRef {
  const ref = { host: 'gitlab.example.com', path: `acme/team/p${++n}` };
  writeFileSync(mapFile, JSON.stringify(fixtures(`projects/${encodeURIComponent(ref.path)}`)));
  return ref;
}

const calls = (): string[][] =>
  readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as string[]);
/** The endpoints asked for. Matched by content: a glab process a failed Promise.all in an earlier
 *  test did not wait for may still append to the log. */
const endpoints = (): string[] => calls().map((c) => c[c.length - 1]!);

const issue = (iid: number, extra: Record<string, unknown> = {}) => ({
  iid,
  title: `Issue ${iid}`,
  author: { username: 'ann', avatar_url: 'https://a/ann.png' },
  created_at: '2026-09-01T10:00:00Z',
  labels: ['bug'],
  description: 'body',
  web_url: `https://gitlab.example.com/acme/team/-/issues/${iid}`,
  user_notes_count: 2,
  state: 'opened',
  ...extra,
});
const mr = (iid: number, extra: Record<string, unknown> = {}) => ({
  ...issue(iid),
  title: `MR ${iid}`,
  web_url: `https://gitlab.example.com/acme/team/-/merge_requests/${iid}`,
  draft: false,
  sha: 'a'.repeat(40),
  source_branch: `feat/${iid}`,
  target_branch: 'main',
  ...extra,
});

describe('pipelineGlyph / mrStatus / countDiffLines', () => {
  it('maps pipeline states onto the tab glyphs', () => {
    expect(['success', 'failed', 'canceled', 'running', 'manual', 'skipped', undefined].map(pipelineGlyph))
      .toEqual(['passing', 'failing', 'failing', 'pending', 'pending', null, null]);
  });

  it('puts a merge request in the chip vocabulary', () => {
    const base = mr(1) as Parameters<typeof mrStatus>[0];
    expect(mrStatus({ ...base, state: 'merged' })).toBe('merged');
    expect(mrStatus({ ...base, state: 'closed' })).toBe('closed');
    expect(mrStatus({ ...base, draft: true })).toBe('draft');
    expect(mrStatus({ ...base, head_pipeline: { status: 'failed' } })).toBe('checks-failing');
    expect(mrStatus({ ...base, head_pipeline: { status: 'running' } })).toBe('checks-pending');
    expect(mrStatus({ ...base, detailed_merge_status: 'mergeable' })).toBe('ready');
    expect(mrStatus({ ...base, detailed_merge_status: 'not_approved' })).toBe('review-required');
    expect(mrStatus(base)).toBe('open');
  });

  it('counts only hunk lines', () => {
    expect(countDiffLines('@@ -1,2 +1,3 @@\n a\n-b\n+c\n+d\n')).toEqual({ additions: 2, deletions: 1 });
  });
});

describe('fetchGitlab (the forge tab list)', () => {
  it('lists open issues and merge requests with label colors, through glab api on the project host', async () => {
    const ref = project((api) => ({
      [`${api}/issues`]: [issue(3)],
      [`${api}/merge_requests`]: [mr(7, { draft: true })],
      [`${api}/labels`]: [{ name: 'bug', color: '#D9534F' }, { name: 'odd', color: 'red' }],
    }));
    const data = await fetchGitlab(ref, dir);
    expect(data.available).toBe(true);
    expect(data.repo).toBe(ref.path);
    expect(data.issues).toEqual([
      expect.objectContaining({ kind: 'issue', number: 3, author: 'ann', labels: ['bug'], comments: 2 }),
    ]);
    expect(data.prs).toEqual([expect.objectContaining({ kind: 'pr', number: 7, isDraft: true, checks: null })]);
    expect(data.labelColors).toEqual({ bug: 'd9534f' });
    expect(calls().every((c) => c.slice(0, 3).join(' ') === 'api --hostname gitlab.example.com')).toBe(true);
    expect(endpoints()).toContain(
      `projects/${encodeURIComponent(ref.path)}/issues?state=opened&order_by=created_at&per_page=30`,
    );
    // the second read inside a minute is served from the cache
    writeFileSync(logFile, '');
    await fetchGitlab(ref, dir);
    expect(endpoints().filter((e) => e.includes(encodeURIComponent(ref.path)))).toEqual([]);
  });

  it('degrades in the payload with glab\'s reason', async () => {
    const ref = project(() => ({}));
    const data = await fetchGitlab(ref, dir);
    expect(data).toEqual(expect.objectContaining({ available: false, issues: [], prs: [] }));
    expect(data.reason).toMatch(/no fixture/);
  });
});

describe('search, checks and reference status', () => {
  it('searches every state', async () => {
    const ref = project((api) => ({ [`${api}/merge_requests`]: [mr(2, { state: 'merged' })] }));
    const found = await searchGitlabItems(ref, dir, 'pr', 'login limit', 10);
    expect(found).toEqual({ available: true, items: [expect.objectContaining({ number: 2, kind: 'pr' })], truncated: false });
    expect(endpoints().some((e) => e.includes('state=all&search=login%20limit&per_page=10'))).toBe(true);
  });

  it('reads each merge request\'s head pipeline', async () => {
    const ref = project((api) => ({
      [`${api}/merge_requests/1`]: mr(1, { head_pipeline: { status: 'success' } }),
      [`${api}/merge_requests/2`]: mr(2, { head_pipeline: { status: 'failed' } }),
      [`${api}/merge_requests/3`]: null,
    }));
    expect(await fetchGitlabChecks(ref, dir, [1, 2, 3])).toEqual({
      available: true,
      checks: { 1: 'passing', 2: 'failing', 3: null },
    });
  });

  it('answers merge request and issue chips, conflicts, and when to ask again', async () => {
    const ref = project((api) => ({
      [`${api}/merge_requests/5`]: mr(5, { has_conflicts: true }),
      [`${api}/merge_requests/6`]: mr(6, { state: 'merged' }),
      [`${api}/issues/9`]: issue(9, { state: 'closed' }),
    }));
    expect(await fetchGitlabRefStatus(ref, dir, { prs: [5, 6], issues: [9] })).toEqual({
      available: true,
      prs: { 5: 'open', 6: 'merged' },
      issues: { 9: 'completed' },
      conflicts: [5],
      recheckAfterMs: 60_000,
    });
    const settled = project((api) => ({ [`${api}/merge_requests/6`]: mr(6, { state: 'merged' }) }));
    expect((await fetchGitlabRefStatus(settled, dir, { prs: [6], issues: [] })).recheckAfterMs).toBeNull();
  });
});

describe('merge request diff and comments', () => {
  it('maps /diffs rows onto the PR changes shape', async () => {
    const ref = project((api) => ({
      [`${api}/merge_requests/4`]: mr(4),
      [`${api}/merge_requests/4/diffs`]: [
        { old_path: 'a.ts', new_path: 'a.ts', diff: '@@ -1 +1,2 @@\n-x\n+y\n+z\n' },
        { old_path: 'old.md', new_path: 'new.md', renamed_file: true, diff: '' },
        { old_path: 'big.json', new_path: 'big.json', new_file: true, too_large: true, diff: '' },
      ],
    }));
    const diff = await fetchGitlabPrDiff(ref, dir, 4);
    expect(diff).toEqual(expect.objectContaining({ available: true, number: 4, headSha: 'a'.repeat(40), additions: 2, deletions: 1, truncated: true }));
    if (!diff.available) throw new Error('unreachable');
    expect(diff.files).toEqual([
      { path: 'a.ts', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1 +1,2 @@\n-x\n+y\n+z\n' },
      { path: 'new.md', previousPath: 'old.md', status: 'renamed', additions: 0, deletions: 0, patchUnavailableReason: 'binary' },
      { path: 'big.json', status: 'added', additions: 0, deletions: 0, patchUnavailableReason: 'too-large', truncated: true },
    ]);
  });

  it('falls back to /changes on a GitLab without /diffs', async () => {
    const ref = project((api) => ({
      [`${api}/merge_requests/8`]: mr(8),
      [`${api}/merge_requests/8/diffs`]: null,
      [`${api}/merge_requests/8/changes`]: { changes: [{ old_path: 'b', new_path: 'b', diff: '@@\n+1\n' }] },
    }));
    const diff = await fetchGitlabPrDiff(ref, dir, 8);
    expect(diff.available && diff.files.map((f) => [f.path, f.additions])).toEqual([['b', 1]]);
  });

  it('lists human notes only, linked to their anchors', async () => {
    const ref = project((api) => ({
      [`${api}/merge_requests/4/notes`]: [
        { id: 11, body: 'looks good', author: { username: 'bo' }, created_at: '2026-09-02T00:00:00Z' },
        { id: 12, body: 'added 1 commit', author: { username: 'bo' }, created_at: '2026-09-02T01:00:00Z', system: true },
      ],
      [`${api}/merge_requests/4`]: mr(4),
    }));
    const thread = await fetchGitlabComments(ref, dir, 'pr', 4);
    expect(thread).toEqual({
      available: true,
      truncated: false,
      comments: [{
        id: 11,
        author: 'bo',
        createdAt: '2026-09-02T00:00:00Z',
        body: 'looks good',
        kind: 'comment',
        url: 'https://gitlab.example.com/acme/team/-/merge_requests/4#note_11',
      }],
    });
  });
});

describe('the driver', () => {
  it('finds a branch\'s merge request and builds GitLab web URLs', async () => {
    const ref = project((api) => ({
      [`${api}/merge_requests?source_branch=`]: [mr(12)],
      [`${api}/merge_requests/12`]: mr(12, { head_pipeline: { status: 'running' } }),
    }));
    const driver = createGitlabDriver(dir, ref);
    expect(driver.kind).toBe('gitlab');
    expect(await driver.prStatus('feat/x y')).toEqual({
      number: 12,
      url: 'https://gitlab.example.com/acme/team/-/merge_requests/12',
      state: 'open',
      isDraft: false,
      checks: 'pending',
    });
    expect(endpoints().some((e) => e.includes('source_branch=feat%2Fx%20y'))).toBe(true);
    expect(driver.viewUrl('pr', 12)).toBe(`https://gitlab.example.com/${ref.path}/-/merge_requests/12`);
    expect(driver.viewUrl('branch', 'feat/x')).toBe(`https://gitlab.example.com/${ref.path}/-/tree/feat/x`);
    expect(driver.viewUrl('repo', '')).toBe(`https://gitlab.example.com/${ref.path}`);
  });

  it('reports a missing glab with its remedy, and caches the probe', async () => {
    const ref = project(() => ({}));
    process.env.CEZ_GLAB_BIN = join(dir, 'no-such-glab');
    try {
      expect(await detectGitlab(ref, dir)).toEqual({
        available: false,
        reason: 'glab CLI not found — install it and run `glab auth login`',
      });
      expect(createGitlabDriver(dir, ref).detectCached()).toEqual(expect.objectContaining({ available: false }));
    } finally {
      process.env.CEZ_GLAB_BIN = join(dir, 'glab.cjs');
    }
  });

  it('warms the health probe in the background on the first cached read', async () => {
    const ref = project((api) => ({ [api]: { id: 1 } }));
    const driver = createGitlabDriver(dir, ref);
    expect(driver.detectCached()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(driver.detectCached()).toEqual({ available: true });
    try {
    } finally {
      process.env.CEZ_GLAB_BIN = join(dir, 'glab.cjs');
    }
  });
});
