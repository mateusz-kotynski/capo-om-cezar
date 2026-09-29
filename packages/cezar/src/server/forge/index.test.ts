import { describe, expect, it } from 'vitest';
import type { RepoInfo } from '../git.ts';
import { forgeKindOfRemote, forgeWebRoot, gitlabRef, parseRemote, parseRemotePath, resolveForge } from './index.ts';

/** Forge resolution (spec §"Forge-driver seam"): remote host → driver | null. */

const info = (remote?: string): RepoInfo => ({ root: '/repo', branch: 'main', remote });

describe('parseRemote', () => {
  it.each([
    ['https://github.com/acme/demo.git', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['https://github.com/acme/demo', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['https://user:token@github.com/acme/demo.git', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['git@github.com:acme/demo.git', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['ssh://git@github.com/acme/demo.git', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['ssh://git@github.com:2222/acme/demo.git', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['git://github.com/acme/demo.git', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['https://GitHub.com/acme/demo.git', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['https://github.com/acme/demo/', { host: 'github.com', owner: 'acme', repo: 'demo' }],
    ['git@gitlab.com:group/sub/project.git', { host: 'gitlab.com', owner: 'sub', repo: 'project' }],
  ])('parses %s', (remote, expected) => {
    expect(parseRemote(remote)).toEqual(expected);
  });

  it.each([
    ['/srv/git/demo.git'], // local bare path — not a forge
    ['../relative/path'],
    ['https://github.com/only-owner'],
    [''],
  ])('rejects %s', (remote) => {
    expect(parseRemote(remote)).toBeNull();
  });
});

describe('forgeKindOfRemote', () => {
  // The registry probe's classification (#698) — same host table as resolveForge,
  // but string-only: no driver, no repo root, no `gh`.
  it.each([
    ['https://github.com/acme/demo.git', 'github'],
    ['git@github.com:acme/demo.git', 'github'],
    ['git@gitlab.com:acme/demo.git', 'gitlab'],
    ['https://git.example.com/acme/demo.git', null],
    ['/srv/git/demo.git', null],
    [undefined, null],
  ])('classifies %s as %s', (remote, expected) => {
    expect(forgeKindOfRemote(remote)).toBe(expected);
  });
});

describe('resolveForge', () => {
  it('maps a github.com https remote to the GitHub driver', () => {
    expect(resolveForge(info('https://github.com/acme/demo.git'))?.kind).toBe('github');
  });

  it('maps a github.com scp-like remote to the GitHub driver', () => {
    expect(resolveForge(info('git@github.com:acme/demo.git'))?.kind).toBe('github');
  });

  it('maps a gitlab.com remote to the GitLab driver', () => {
    expect(resolveForge(info('git@gitlab.com:acme/demo.git'))?.kind).toBe('gitlab');
  });

  it('maps a self-hosted host to the GitLab driver once CEZ_GITLAB_HOSTS names it', () => {
    const before = process.env.CEZ_GITLAB_HOSTS;
    process.env.CEZ_GITLAB_HOSTS = 'git.example.com, other.example';
    try {
      expect(resolveForge(info('https://git.example.com/acme/demo.git'))?.kind).toBe('gitlab');
      expect(forgeKindOfRemote('git@other.example:a/b.git')).toBe('gitlab');
    } finally {
      if (before === undefined) delete process.env.CEZ_GITLAB_HOSTS;
      else process.env.CEZ_GITLAB_HOSTS = before;
    }
  });

  it('returns null for a self-hosted host', () => {
    expect(resolveForge(info('https://git.example.com/acme/demo.git'))).toBeNull();
  });

  it('returns null when the repo has no remote', () => {
    expect(resolveForge(info(undefined))).toBeNull();
  });

  it('returns null when not in a git repo at all', () => {
    expect(resolveForge(null)).toBeNull();
  });

  it('returns null for a local-path remote', () => {
    expect(resolveForge(info('/srv/git/demo.git'))).toBeNull();
  });
});

describe('GitHub driver viewUrl', () => {
  const driver = resolveForge(info('git@github.com:acme/demo.git'))!;

  it.each([
    ['repo', 'x', 'https://github.com/acme/demo'],
    ['issue', 142, 'https://github.com/acme/demo/issues/142'],
    ['pr', 128, 'https://github.com/acme/demo/pull/128'],
    ['branch', 'feat/cockpit ui', 'https://github.com/acme/demo/tree/feat/cockpit%20ui'],
    ['commit', 'abc1234', 'https://github.com/acme/demo/commit/abc1234'],
  ] as const)('%s → %s', (kind, ref, expected) => {
    expect(driver.viewUrl(kind, ref)).toBe(expected);
  });
});

describe('GitLab project paths', () => {
  it.each([
    ['git@gitlab.com:group/sub/project.git', { host: 'gitlab.com', path: 'group/sub/project' }],
    ['https://oauth2:tok@gitlab.com/group/project.git', { host: 'gitlab.com', path: 'group/project' }],
    ['ssh://git@gitlab.com:2222/a/b/c/d.git', { host: 'gitlab.com', path: 'a/b/c/d' }],
  ])('keeps every subgroup of %s', (remote, expected) => {
    expect(parseRemotePath(remote)).toEqual(expected);
    expect(gitlabRef(remote)).toEqual(expected);
  });

  it('builds the web root from the full path, never from the credentials', () => {
    expect(forgeWebRoot('https://oauth2:tok@gitlab.com/group/sub/project.git')).toBe('https://gitlab.com/group/sub/project');
  });

  it('is null off GitLab hosts', () => {
    expect(gitlabRef('git@github.com:acme/demo.git')).toBeNull();
    expect(gitlabRef(undefined)).toBeNull();
  });
});
