import type { RepoInfo } from '../git.ts';
import { createGithubDriver } from './github.ts';
import { createGitlabDriver, type GitlabRepoRef } from './gitlab.ts';
import type { ForgeDriver, ForgeKind } from './types.ts';

/**
 * Forge resolution (cockpit-ui redesign spec §"Forge-driver seam"): map the
 * repo's origin remote to a driver — github.com → the GitHub driver, anything
 * else (GitLab, self-hosted, no remote, not a repo) → null. The health route
 * serializes the result as `forge: {kind, available, reason?} | null`; a null
 * forge means plain-git features only (diffs, commit, push, branches).
 */

export interface ParsedRemote {
  host: string;
  owner: string;
  repo: string;
}

/**
 * Parse a git remote URL into host/owner/repo. Handles the scheme forms
 * (`https://`, `ssh://`, `git://`, with optional credentials and port) and the
 * scp-like form (`git@host:owner/repo.git`). Null for local paths and anything
 * else that doesn't look like a forge remote.
 */
export function parseRemote(remote: string): ParsedRemote | null {
  const r = remote.trim().replace(/\/+$/, '');
  let host: string | undefined;
  let path: string | undefined;
  const url = /^(?:https?|ssh|git|git\+ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(r);
  if (url) {
    [, host, path] = url;
  } else {
    // scp-like: [user@]host:owner/repo(.git) — a leading '/' (local path)
    // can't match the host group, so plain directories fall through to null.
    const scp = /^(?:[^@/:]+@)?([^:/]+):(.+)$/.exec(r);
    if (!scp) return null;
    [, host, path] = scp;
  }
  if (!host || !path) return null;
  const parts = path.replace(/\.git$/i, '').split('/').filter(Boolean);
  const owner = parts[parts.length - 2];
  const repo = parts[parts.length - 1];
  if (!owner || !repo) return null;
  return { host: host.toLowerCase(), owner, repo };
}

/** Remote host → forge kind. The one host table both `resolveForge` and the
 *  registry probe read. Self-hosted GitLab instances join through `CEZ_GITLAB_HOSTS`
 *  (comma-separated host names), read per call so a restart is all a change needs. */
const FORGE_HOSTS: Record<string, ForgeKind> = { 'github.com': 'github', 'gitlab.com': 'gitlab' };

function forgeKindOfHost(host: string): ForgeKind | null {
  if (Object.hasOwn(FORGE_HOSTS, host)) return FORGE_HOSTS[host]!;
  const extra = (process.env.CEZ_GITLAB_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(host) ? 'gitlab' : null;
}

/** The remote's full project path — `group/subgroup/project` — which GitLab needs where
 *  `parseRemote` keeps only the last two segments. Null when the remote does not parse. */
export function parseRemotePath(remote: string): { host: string; path: string } | null {
  const parsed = parseRemote(remote);
  if (!parsed) return null;
  const r = remote.trim().replace(/\/+$/, '');
  const url = /^(?:https?|ssh|git|git\+ssh):\/\/(?:[^@/]+@)?[^/:]+(?::\d+)?\/(.+)$/.exec(r);
  const scp = url ? null : /^(?:[^@/:]+@)?[^:/]+:(.+)$/.exec(r);
  const raw = (url?.[1] ?? scp?.[1] ?? '').replace(/\.git$/i, '');
  const path = raw.split('/').filter(Boolean).join('/');
  return path ? { host: parsed.host, path } : null;
}

/**
 * Which forge a remote URL belongs to, without building a driver (#698): the
 * registry's per-project probe classifies each root from its remote alone —
 * plain string parsing, no `gh` shell-out — so the sidebar can gate each
 * project's GitHub tab on the project's own remote.
 */
export function forgeKindOfRemote(remote: string | undefined): ForgeKind | null {
  const parsed = remote ? parseRemote(remote) : null;
  return parsed ? forgeKindOfHost(parsed.host) : null;
}

/**
 * A remote's web root — `https://github.com/owner/repo` — or null for anything not on a known
 * forge host.
 *
 * Built from the PARSED remote, never by string-editing the raw one, and that is the point: a
 * remote may carry credentials (`https://user:token@github.com/o/r.git`), and this is a value the
 * cockpit renders and links to. Rebuilding it from `{host, owner, repo}` leaves nothing to leak.
 */
export function forgeWebRoot(remote: string | undefined): string | null {
  const parsed = remote ? parseRemote(remote) : null;
  if (!parsed) return null;
  const kind = forgeKindOfHost(parsed.host);
  if (kind === 'gitlab') {
    const full = parseRemotePath(remote!);
    return full ? `https://${full.host}/${full.path}` : null;
  }
  if (!kind) return null;
  return `https://${parsed.host}/${parsed.owner}/${parsed.repo}`;
}

/** Remote host → driver | null. */
export function resolveForge(repoInfo: RepoInfo | null): ForgeDriver | null {
  if (!repoInfo?.remote) return null;
  const parsed = parseRemote(repoInfo.remote);
  if (!parsed) return null;
  const kind = forgeKindOfHost(parsed.host);
  if (kind === 'github') {
    return createGithubDriver(repoInfo.root, { owner: parsed.owner, repo: parsed.repo });
  }
  if (kind === 'gitlab') {
    const ref = gitlabRef(repoInfo.remote);
    return ref ? createGitlabDriver(repoInfo.root, ref) : null;
  }
  return null;
}

/** The GitLab project a remote names, or null when it is not on a GitLab host. */
export function gitlabRef(remote: string | undefined): GitlabRepoRef | null {
  const full = remote ? parseRemotePath(remote) : null;
  return full && forgeKindOfHost(full.host) === 'gitlab' ? full : null;
}

export type { ForgeDriver, ForgeAvailability, ForgeItem, ForgeKind, ForgePrStatus, ForgeRefKind } from './types.ts';
