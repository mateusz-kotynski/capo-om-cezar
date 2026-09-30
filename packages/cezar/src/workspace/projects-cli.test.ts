import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadWorkspaceConfig } from './config.ts';
import { clearProjectProbeCache, registerProject } from './projects.ts';
import { runProjectsCommand, type ProjectsCommandIo } from './projects-cli.ts';

/**
 * `cezar projects` (spec 2026-07-20-multi-project-workspace, step 5.2): the
 * offline registry CLI. Every test pins `CEZ_HOME` to a temp dir — these cases
 * register and remove projects for real, and must never touch the developer's
 * own `~/.cezar`.
 */
describe('cezar projects CLI', () => {
  const originalHome = process.env.CEZ_HOME;
  let home: string;
  let repos: string;
  let io: ProjectsCommandIo & { out: string[]; err: string[] };

  beforeEach(() => {
    home = mkdtempSync(join(realpathSync(tmpdir()), 'cez-projects-cli-'));
    repos = mkdtempSync(join(realpathSync(tmpdir()), 'cez-projects-cli-repos-'));
    process.env.CEZ_HOME = home;
    clearProjectProbeCache();
    const out: string[] = [];
    const err: string[] = [];
    io = { out, err, log: (l) => out.push(l), error: (l) => err.push(l) };
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.CEZ_HOME;
    else process.env.CEZ_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(repos, { recursive: true, force: true });
  });

  const run = (...args: string[]): Promise<number> =>
    runProjectsCommand(args, { defaultRoot: repos, env: {}, io });
  // `--parent` is consumed by the top-level parser and arrives as an option, not in argv.
  const runWithParent = (parent: string | undefined, ...args: string[]): Promise<number> =>
    runProjectsCommand(args, { defaultRoot: repos, env: {}, io, parent });

  const makeDir = (...segments: string[]): string => {
    const dir = join(repos, ...segments);
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  const makeRepo = (...segments: string[]): string => {
    const dir = makeDir(...segments);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    execFileSync(
      'git',
      ['-c', 'user.email=t@test', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'],
      { cwd: dir },
    );
    return dir;
  };

  describe('list', () => {
    it('is the default subcommand and prints id, status and root per project', async () => {
      const root = makeRepo('shop');
      await registerProject(root);
      expect(await run()).toBe(0);
      const listing = io.out.join('\n');
      expect(listing).toMatch(/✓ shop\s+main\s+/);
      expect(listing).toContain(root);
      expect(listing).toContain('1 project(s)');
      expect(listing).toContain(join(home, 'config.json'));
    });

    it('marks a deleted root missing and a plain folder as not a git repo', async () => {
      await registerProject(makeDir('plain'));
      const doomed = makeDir('doomed');
      await registerProject(doomed);
      rmSync(doomed, { recursive: true, force: true });
      clearProjectProbeCache();
      expect(await run('list')).toBe(0);
      const listing = io.out.join('\n');
      expect(listing).toMatch(/· plain\s+not a git repo/);
      expect(listing).toMatch(/✗ doomed\s+missing/);
    });

    it('explains the empty registry instead of printing an empty table', async () => {
      expect(await run()).toBe(0);
      expect(io.out.join('\n')).toContain('no projects registered yet');
    });

    it('pins listing to an explicit boot project while preserving default listings', async () => {
      const boot = await registerProject(makeRepo('boot'));
      await registerProject(makeRepo('other'));

      expect(await runProjectsCommand([], { defaultRoot: repos, bootProjectId: boot.id, io })).toBe(0);
      expect(io.out.join('\n')).toContain('boot');
      expect(io.out.join('\n')).not.toContain('other');

      io.out.length = 0;
      expect(await run()).toBe(0);
      expect(io.out.join('\n')).toContain('boot');
      expect(io.out.join('\n')).toContain('other');
    });
  });

  describe('add', () => {
    it('registers a folder and reports the allocated slug', async () => {
      const root = makeRepo('billing');
      expect(await run('add', root)).toBe(0);
      expect(io.out.join('\n')).toContain(`+ billing  ${root}`);
      expect((await loadWorkspaceConfig()).projects.map((p) => p.id)).toEqual(['billing']);
    });

    it('defaults to the resolved --repo/cwd root when no dir is given', async () => {
      expect(await run('add')).toBe(0);
      expect((await loadWorkspaceConfig()).projects[0]?.root).toBe(repos);
    });

    it('dedupes a symlinked spelling and says the project is already registered', async () => {
      const root = makeRepo('web');
      const link = join(repos, 'web-link');
      symlinkSync(root, link);
      await run('add', root);
      expect(await run('add', link)).toBe(0);
      expect(io.out.join('\n')).toContain('= web (already registered)');
      expect((await loadWorkspaceConfig()).projects).toHaveLength(1);
    });

    it('exits 1 on a path that is not a directory', async () => {
      const file = join(repos, 'note.txt');
      writeFileSync(file, 'x', 'utf8');
      expect(await run('add', file)).toBe(1);
      expect(io.err.join('\n')).toContain('not a directory');
      expect((await loadWorkspaceConfig()).projects).toEqual([]);
    });

    it('refuses a task worktree and $HOME, exactly like boot registration', async () => {
      const worktree = makeDir('host', '.ai', 'cezar', 'worktrees', 'abc12345');
      expect(await run('add', worktree)).toBe(1);
      expect(await run('add', homedir())).toBe(1);
      expect(io.err.join('\n')).toContain('refusing to register');
      expect((await loadWorkspaceConfig()).projects).toEqual([]);
    });
  });

  describe('remove', () => {
    it('drops the registry entry and leaves every repo file in place', async () => {
      const root = makeRepo('kept');
      writeFileSync(join(root, 'precious.txt'), 'data', 'utf8');
      const before = readdirSync(root).sort();
      const entry = await registerProject(root);
      expect(await run('remove', entry.id)).toBe(0);
      expect(io.out.join('\n')).toContain('- kept (registry entry only');
      expect((await loadWorkspaceConfig()).projects).toEqual([]);
      expect(readdirSync(root).sort()).toEqual(before);
    });

    it('exits 1 for an unknown id and for a missing id argument', async () => {
      expect(await run('remove', 'nope')).toBe(1);
      expect(io.err.join('\n')).toContain('unknown project: nope');
      expect(await run('remove')).toBe(1);
      expect(io.err.join('\n')).toContain('cezar projects remove <id>');
    });
  });

  describe('single-project mode', () => {
    it('refuses add before path validation and leaves the registry unchanged', async () => {
      const existing = await registerProject(makeRepo('existing'));

      expect(
        await runProjectsCommand(['add', join(repos, 'does-not-exist')], {
          defaultRoot: repos,
          env: { CEZ_SINGLE_PROJECT: '1' },
          io,
        }),
      ).toBe(1);
      expect(io.err).toEqual(['single-project mode is enabled; adding projects is disabled']);
      expect((await loadWorkspaceConfig()).projects.map((project) => project.id)).toEqual([existing.id]);
    });

    it.each(['remove', 'rm'])(
      'refuses %s before argument validation and leaves the registry unchanged',
      async (subcommand) => {
        const existing = await registerProject(makeRepo('existing'));

        expect(
          await runProjectsCommand([subcommand], {
            defaultRoot: repos,
            env: { CEZ_SINGLE_PROJECT: '1' },
            io,
          }),
        ).toBe(1);
        expect(io.err).toEqual(['single-project mode is enabled; removing projects is disabled']);
        expect((await loadWorkspaceConfig()).projects.map((project) => project.id)).toEqual([existing.id]);
      },
    );

    it('preserves list behavior and requires the exact value 1 to refuse mutations', async () => {
      const existing = await registerProject(makeRepo('existing'));

      expect(
        await runProjectsCommand(['list'], {
          defaultRoot: repos,
          bootProjectId: existing.id,
          env: { CEZ_SINGLE_PROJECT: '1' },
          io,
        }),
      ).toBe(0);
      expect(io.out.join('\n')).toContain('existing');

      io.out.length = 0;
      expect(
        await runProjectsCommand(['add', makeRepo('allowed')], {
          defaultRoot: repos,
          env: { CEZ_SINGLE_PROJECT: 'true' },
          io,
        }),
      ).toBe(0);
      expect((await loadWorkspaceConfig()).projects.map((project) => project.id)).toEqual(['existing', 'allowed']);
    });

    it('does not expose the registry when boot project identity is unavailable', async () => {
      await registerProject(makeRepo('hidden'));

      expect(
        await runProjectsCommand(['list'], {
          defaultRoot: repos,
          env: { CEZ_SINGLE_PROJECT: '1' },
          io,
        }),
      ).toBe(0);
      expect(io.out.join('\n')).toContain('no projects registered yet');
      expect(io.out.join('\n')).not.toContain('hidden');
    });
  });

  it('exits 1 with the usage block on an unknown subcommand', async () => {
    expect(await run('frobnicate')).toBe(1);
    expect(io.err.join('\n')).toContain('unknown projects subcommand: frobnicate');
    expect(io.err.join('\n')).toContain('cezar projects [list]');
  });

  it('documents the single-project mutation restriction in usage output', async () => {
    expect(await run('frobnicate')).toBe(1);
    expect(io.err.join('\n')).toContain('add/remove/tag/parent are unavailable when CEZ_SINGLE_PROJECT=1');
  });

  /** The terminal twin of Settings -> Projects' Tags cell. */
  describe('tag', () => {
    it('sets normalized tags, replacing the whole list', async () => {
      await run('add', makeRepo('api'));
      const id = (await loadWorkspaceConfig()).projects[0]!.id;

      expect(await run('tag', id, ' Storefront ', 'api', 'STOREFRONT')).toBe(0);
      expect((await loadWorkspaceConfig()).projects[0]!.tags).toEqual(['api', 'Storefront']);
      expect(io.out.join('\n')).toContain('[api Storefront]');

      // Replaced wholesale, never merged.
      expect(await run('tag', id, 'infra')).toBe(0);
      expect((await loadWorkspaceConfig()).projects[0]!.tags).toEqual(['infra']);
    });

    it('clears the tags when given none, storing no key at all', async () => {
      await run('add', makeRepo('api'));
      const id = (await loadWorkspaceConfig()).projects[0]!.id;
      await run('tag', id, 'infra');

      expect(await run('tag', id)).toBe(0);
      const stored = (await loadWorkspaceConfig()).projects.find((p) => p.id === id)!;
      expect(Object.keys(stored)).not.toContain('tags');
      expect(io.out.join('\n')).toContain('no tags');
    });

    it('lists the tags beside the path', async () => {
      await run('add', makeRepo('api'));
      const id = (await loadWorkspaceConfig()).projects[0]!.id;
      await run('tag', id, 'storefront');
      io.out.length = 0;

      expect(await run('list')).toBe(0);
      expect(io.out.join('\n')).toContain('[storefront]');
    });

    it('refuses an unknown id and says so', async () => {
      expect(await run('tag', 'nope', 'x')).toBe(1);
      expect(io.err.join('\n')).toContain('unknown project: nope');
    });

    it('needs an id', async () => {
      expect(await run('tag')).toBe(1);
      expect(io.err.join('\n')).toContain('cezar projects [list]');
    });
  });

  describe('nesting (spec 2026-09-29-nested-repo-projects)', () => {
    it('add --parent by folder nests the new project and says so', async () => {
      const product = makeRepo('product');
      // `api` is a reserved slug (RESERVED_PROJECT_IDS) and would allocate `api-2`, so this
      // fixture uses `svc` to keep the id assertion below exact.
      const svc = makeRepo('product', 'svc');
      expect(await run('add', product)).toBe(0);
      expect(await runWithParent(product, 'add', svc)).toBe(0);
      expect(io.out.at(-1)).toMatch(/^ {2}\+ svc {2}.*svc {2}↳ product$/);
      const stored = (await loadWorkspaceConfig()).projects.find((p) => p.id === 'svc');
      expect(stored?.parent).toBe('product');
    });

    it('add --parent on an already registered folder sets the parent (Capo re-runs it)', async () => {
      const product = makeRepo('product');
      const svc = makeRepo('product', 'svc');
      await run('add', product);
      await run('add', svc);
      expect(await runWithParent('product', 'add', svc)).toBe(0);
      expect(io.out.at(-1)).toContain('(already registered)');
      expect((await loadWorkspaceConfig()).projects.find((p) => p.id === 'svc')?.parent).toBe('product');
    });

    it('add --parent with an unknown parent fails before registering anything', async () => {
      const api = makeRepo('api');
      expect(await runWithParent('ghost', 'add', api)).toBe(1);
      expect(io.err.at(-1)).toBe('unknown parent project: ghost');
      expect((await loadWorkspaceConfig()).projects).toEqual([]);
    });

    it('add --parent without a value is a usage error', async () => {
      expect(await runWithParent('', 'add', makeRepo('api'))).toBe(1);
      expect(io.err.join('\n')).toContain('cezar projects [list]');
    });

    it('--parent on any subcommand but add is a usage error', async () => {
      await run('add', makeRepo('product'));
      expect(await runWithParent('product', 'list')).toBe(1);
      expect(await runWithParent('product', 'remove', 'product')).toBe(1);
      expect(io.err.join('\n')).toContain('--parent applies to `projects add` only');
      expect((await loadWorkspaceConfig()).projects).toHaveLength(1);
    });

    it('list keeps the id column width when nothing is nested', async () => {
      await run('add', makeRepo('product'));
      await run('add', makeRepo('zeta'));
      io.out.length = 0;
      await run('list');
      const rows = io.out.filter((line) => line.includes(repos));
      expect(rows[0]).toMatch(/^ {2}✓ product {2}main {2}/);
      expect(rows[1]).toMatch(/^ {2}✓ zeta {5}main {2}/);
    });

    it('parent sets, refuses and clears', async () => {
      await run('add', makeRepo('product'));
      await run('add', makeRepo('product', 'svc'));
      expect(await run('parent', 'svc', 'product')).toBe(0);
      expect(io.out.at(-1)).toBe('  = svc  ↳ product');
      expect(await run('parent', 'product', 'svc')).toBe(1);
      expect(io.err.at(-1)).toBe('svc is itself nested under product; nesting is one level');
      expect(await run('parent', 'svc')).toBe(0);
      expect(io.out.at(-1)).toBe('  = svc (top-level)');
      expect(await run('parent', 'ghost', 'product')).toBe(1);
      expect(io.err.at(-1)).toBe('unknown project: ghost');
    });

    it('parent is refused in single-project mode', async () => {
      const code = await runProjectsCommand(['parent', 'svc', 'product'], {
        defaultRoot: repos, env: { CEZ_SINGLE_PROJECT: '1' }, io,
      });
      expect(code).toBe(1);
    });

    it('list prints children right after their parent, marked ↳', async () => {
      await run('add', makeRepo('product'));
      await run('add', makeRepo('zeta'));
      await run('add', makeRepo('product', 'web'));
      await run('add', makeRepo('product', 'svc'));
      await run('parent', 'web', 'product');
      await run('parent', 'svc', 'product');
      io.out.length = 0;
      await run('list');
      const rows = io.out.filter((line) => line.includes(repos)).map((line) => line.trim());
      expect(rows.map((row) => row.split(/\s+/).slice(1, 3).join(' '))).toEqual([
        'product main',
        '↳ svc',
        '↳ web',
        'zeta main',
      ]);
    });
  });
});
