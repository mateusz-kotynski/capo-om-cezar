# Nested Repository Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A registered Cezar project can be nested under another (`parent`), and the sidebar shows such children inside the parent's group with only their Git and forge (GitHub/GitLab) nav; Capo OM registers a product's repositories that way.

**Architecture:** One optional registry field (`parent`) with one validation function in `workspace/projects.ts`, exposed through `PATCH /api/v1/projects/:id`, the `cezar projects` CLI (`add --parent`, `parent`), and the projects list. Children stay ordinary projects with their own `/api/v1/p/<id>` scope, so no git/forge route changes. The web sidebar splits the list into top-level groups and per-parent children, rendered by a new `ProjectRepos` component. Capo OM passes `--parent` when it registers repositories and task worktrees, falling back to a plain `add` on a Cezar without the flag.

**Tech Stack:** TypeScript (Node 20, ESM), zod, Hono, vitest; React 19 + Testing Library; POSIX sh + Python 3 (Capo OM, unittest).

**Spec:** `.ai/specs/2026-09-29-nested-repo-projects.md` (fork `mateusz-kotynski/capo-om-cezar`, branch `feat/nested-repo-projects`).

## Global Constraints

- Registry schema rules (AGENTS.md): every field optional with `.catch`, `.passthrough()` kept, writes only through `mergeWriteWorkspaceConfig`, keys mutated in place, cleared keys **deleted** (never stored as `null`/`''`).
- API shapes: schema in `packages/contract/src/*.ts` first; request validation as route middleware (already `jsonZodValidator(updateProjectInputSchema)`); additive fields documented in `BACKWARD_COMPATIBILITY.md`.
- `parent` ids match `PROJECT_ID_RE` = `/^[a-z0-9][a-z0-9-]{0,63}$/`.
- One nesting level. Error strings, verbatim:
  - `unknown parent project: <ref>`
  - `a project cannot be its own parent`
  - `<parent> is itself nested under <grandparent>; nesting is one level`
  - `<id> has nested projects; it cannot be nested itself`
- CLI editing commands refuse under `CEZ_SINGLE_PROJECT=1` with `SINGLE_PROJECT_EDIT_ERROR`.
- Run vitest through npm (`npm test -- <path>`), never `npx vitest`.
- Cezar validation before the PR: `npm run typecheck && npm test && npm run test:unit && npm run build`.
- Capo OM: any change under `plugins/capo-om/` bumps the version (`python3 scripts/version.py bump`) with a `CHANGELOG.md` entry; `python3 -m unittest discover -s tests` must pass before each commit.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Removing a parent** (API DELETE or `cezar projects remove`) must leave its children registered and top-level, not dangling — pinned in Task 1 (`removeProject`) and Task 2 (DELETE).
2. **A hand-edited `parent` naming an unregistered id** must read as top-level (the sidebar would otherwise drop the child entirely, since it only renders children under an existing group) — pinned in Task 1 (`listProjects`) and Task 4 (sidebar renders an orphan as a group).
3. **`add --parent` on an already registered folder** must set the parent rather than fail, because Capo re-runs registration on every product command — pinned in Task 3.
4. **An old Cezar without `--parent`** must still end up with the repository registered (Capo's fallback) — pinned in Task 5.
5. **Collapsing the child you are standing in** must work (the toggle default must be computed against the child's own anchor, not the parent's) — pinned in Task 4.

---

### Task 1: Registry `parent` field and validation

**Files:**
- Modify: `packages/cezar/src/workspace/config.ts:42-70` (`workspaceProjectSchema`)
- Modify: `packages/cezar/src/workspace/projects.ts` (new exports after `normalizeProjectTags`; `listProjects`; `removeProject`)
- Test: `packages/cezar/src/workspace/projects.test.ts`

**Interfaces:**
- Produces:
  - `projectParentError(projects: readonly Pick<WorkspaceProject, 'id' | 'parent'>[], id: string, parentId: string): string | null`
  - `class ProjectParentError extends Error`
  - `setProjectParent(id: string, parentId: string | null): Promise<WorkspaceProject | undefined>` — `undefined` for an unknown `id`; throws `ProjectParentError` for an invalid parent.
  - `findProjectId(ref: string): Promise<string | undefined>` — a registry id, or a folder whose realpath is a registered root.
  - `WorkspaceProject.parent?: string` (and therefore `ProjectListEntry.parent?: string`).

- [ ] **Step 1: Write the failing tests** — append inside `describe('workspace projects', …)` in `projects.test.ts`, and add `findProjectId, ProjectParentError, setProjectParent` to the import from `./projects.ts`:

```ts
  describe('parent (spec 2026-09-29-nested-repo-projects)', () => {
    const three = async () => {
      const product = await registerProject(makeRepo('product'));
      const api = await registerProject(makeRepo('product', 'api'));
      const web = await registerProject(makeRepo('product', 'web'));
      return { product, api, web };
    };

    it('sets, lists and clears a parent', async () => {
      const { product, api } = await three();
      expect((await setProjectParent(api.id, product.id))?.parent).toBe(product.id);
      expect((await listProjects()).find((p) => p.id === api.id)?.parent).toBe(product.id);
      await setProjectParent(api.id, null);
      const stored = (await loadWorkspaceConfig()).projects.find((p) => p.id === api.id)!;
      expect('parent' in stored).toBe(false);
    });

    it('returns undefined for an unknown id and writes nothing for it', async () => {
      const { product } = await three();
      expect(await setProjectParent('nope', product.id)).toBeUndefined();
    });

    it('refuses an unknown parent, itself, a nested parent, and nesting a parent', async () => {
      const { product, api, web } = await three();
      await expect(setProjectParent(api.id, 'ghost')).rejects.toThrow('unknown parent project: ghost');
      await expect(setProjectParent(api.id, api.id)).rejects.toThrow('a project cannot be its own parent');
      await setProjectParent(api.id, product.id);
      await expect(setProjectParent(web.id, api.id)).rejects.toThrow(
        `${api.id} is itself nested under ${product.id}; nesting is one level`,
      );
      await expect(setProjectParent(product.id, web.id)).rejects.toThrow(
        `${product.id} has nested projects; it cannot be nested itself`,
      );
      await expect(setProjectParent(web.id, 'ghost')).rejects.toBeInstanceOf(ProjectParentError);
      expect((await loadWorkspaceConfig()).projects.find((p) => p.id === web.id)?.parent).toBeUndefined();
    });

    it('removing a parent makes its children top-level', async () => {
      const { product, api, web } = await three();
      await setProjectParent(api.id, product.id);
      await setProjectParent(web.id, product.id);
      await removeProject(product.id);
      const stored = (await loadWorkspaceConfig()).projects;
      expect(stored.map((p) => p.id)).toEqual([api.id, web.id]);
      expect(stored.every((p) => !('parent' in p))).toBe(true);
    });

    it('lists a parent naming an unregistered id as top-level', async () => {
      const { api } = await three();
      await mergeWriteWorkspaceConfig((config) => {
        config.projects.find((p) => p.id === api.id)!.parent = 'gone';
      });
      expect((await listProjects()).find((p) => p.id === api.id)?.parent).toBeUndefined();
    });

    it('degrades a malformed stored parent to top-level on load', async () => {
      const { api } = await three();
      await mergeWriteWorkspaceConfig((config) => {
        (config.projects.find((p) => p.id === api.id) as Record<string, unknown>).parent = 'Not A Slug!';
      });
      expect((await loadWorkspaceConfig()).projects.find((p) => p.id === api.id)?.parent).toBeUndefined();
    });

    it('finds a project by id or by folder', async () => {
      const { product } = await three();
      expect(await findProjectId(product.id)).toBe(product.id);
      expect(await findProjectId(`${product.root}/`)).toBe(product.id);
      expect(await findProjectId(join(repos, 'nowhere'))).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- packages/cezar/src/workspace/projects.test.ts -t parent`
Expected: FAIL — `setProjectParent` / `findProjectId` / `ProjectParentError` are not exported.

- [ ] **Step 3: Add the schema field** — in `config.ts`, inside `workspaceProjectSchema`'s object, after the `tags` field:

```ts
    /** Registry id of the project this one is shown under — one level (spec
     *  2026-09-29-nested-repo-projects). Absent = top-level; the writers delete the key rather than
     *  storing an empty value, and a malformed value degrades to top-level. */
    parent: z.string().regex(PROJECT_ID_RE).optional().catch(undefined),
```

- [ ] **Step 4: Implement the registry functions** — in `projects.ts`, after `normalizeProjectTags`:

```ts
/**
 * Why `id` cannot be nested under `parentId`, or null when it can (spec
 * 2026-09-29-nested-repo-projects). One level only: the parent must be top-level, and a project
 * that already has children cannot be nested itself. A parent's own `parent` that names no
 * registered project is dangling and counts as top-level, exactly as `listProjects` reports it.
 */
export function projectParentError(
  projects: readonly Pick<WorkspaceProject, 'id' | 'parent'>[],
  id: string,
  parentId: string,
): string | null {
  if (parentId === id) return 'a project cannot be its own parent';
  const parent = projects.find((project) => project.id === parentId);
  if (!parent) return `unknown parent project: ${parentId}`;
  if (parent.parent && projects.some((project) => project.id === parent.parent)) {
    return `${parentId} is itself nested under ${parent.parent}; nesting is one level`;
  }
  if (projects.some((project) => project.parent === id)) {
    return `${id} has nested projects; it cannot be nested itself`;
  }
  return null;
}

/** An invalid `parent` — the message is the user-facing reason (`projectParentError`). */
export class ProjectParentError extends Error {}

/**
 * Nest `id` under `parentId`, or make it top-level again with `null`. `undefined` for an unknown
 * `id`; throws `ProjectParentError` (and writes nothing) for a parent `projectParentError` refuses.
 */
export async function setProjectParent(
  id: string,
  parentId: string | null,
): Promise<WorkspaceProject | undefined> {
  let updated: WorkspaceProject | undefined;
  let refusal = null as string | null;
  await mergeWriteWorkspaceConfig((config) => {
    const entry = config.projects.find((project) => project.id === id);
    if (!entry) return;
    if (parentId === null) {
      delete entry.parent;
    } else {
      refusal = projectParentError(config.projects, id, parentId);
      if (refusal) return;
      entry.parent = parentId;
    }
    updated = entry;
  });
  if (refusal) throw new ProjectParentError(refusal);
  return updated;
}

/** A registry id for `ref`: the id itself, or the project whose root is `ref`'s realpath. */
export async function findProjectId(ref: string): Promise<string | undefined> {
  const { projects } = await loadWorkspaceConfig();
  if (projects.some((project) => project.id === ref)) return ref;
  const root = await normalizeRoot(ref);
  return projects.find((project) => project.root === root)?.id;
}
```

Make sure `loadWorkspaceConfig` is imported from `./config.ts` in `projects.ts` (add it to the existing import if missing).

- [ ] **Step 5: Drop dangling parents on read** — replace the body of `listProjects`:

```ts
export async function listProjects(selector?: ProjectListSelector): Promise<ProjectListEntry[]> {
  const config = await loadWorkspaceConfig();
  const ids = new Set(config.projects.map((project) => project.id));
  const projects = selector
    ? config.projects.filter((project) => project.id === selector.projectId)
    : config.projects;
  return Promise.all(
    projects.map(async ({ parent, ...project }) => ({
      ...project,
      // A parent that is no longer registered reads as top-level, so the child stays reachable.
      ...(parent && ids.has(parent) ? { parent } : {}),
      ...(await probeRoot(project.root)),
    })),
  );
}
```

- [ ] **Step 6: Un-nest children on removal** — in `removeProject`, inside the mutator after `config.projects = next;`:

```ts
    // Children of a removed parent become top-level rather than pointing at nothing.
    if (removed) for (const project of next) if (project.parent === id) delete project.parent;
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- packages/cezar/src/workspace/`
Expected: PASS (new `parent` cases and all existing workspace tests).

- [ ] **Step 8: Commit**

```bash
git add packages/cezar/src/workspace/config.ts packages/cezar/src/workspace/projects.ts packages/cezar/src/workspace/projects.test.ts
git commit -m "feat(workspace): optional parent on registry entries, one nesting level"
```

---

### Task 2: Contract + `PATCH`/`DELETE` API

**Files:**
- Modify: `packages/contract/src/projects.ts` (`projectListEntrySchema`, `updateProjectInputSchema`)
- Modify: `packages/cezar/src/server/server.ts` (`.patch('/projects/:projectId', …)`, ~line 2645)
- Modify: `BACKWARD_COMPATIBILITY.md` (projects GET shape + PATCH body, line ~42; `config.json` projects fields, line ~239)
- Test: `packages/cezar/src/server/projects-api.test.ts`

**Interfaces:**
- Consumes: `projectParentError` (Task 1); `removeProject` already un-nests (Task 1).
- Produces: `PATCH /api/v1/projects/:id` body `{ parent?: string | null }`; `ProjectListEntry.parent?: string` on the wire.

- [ ] **Step 1: Write the failing tests** — inside the `PATCH /api/v1/projects/:projectId` describe (it has a `patch(id, body)` helper) add:

```ts
    it('nests a project under another and un-nests it with null (spec 2026-09-29)', async () => {
      const parent = await registerProject(otherRoot);
      const childRoot = mkdtempSync(join(realpathSync(tmpdir()), 'cez-projects-child-'));
      try {
        const child = await registerProject(childRoot);
        const set = await patch(child.id, { parent: parent.id });
        expect(set.status).toBe(200);
        expect(set.body.project.parent).toBe(parent.id);
        expect((await getProjects()).projects.find((p) => p.id === child.id)?.parent).toBe(parent.id);

        const cleared = await patch(child.id, { parent: null });
        expect(cleared.status).toBe(200);
        expect(cleared.body.project.parent).toBeUndefined();
      } finally {
        rmSync(childRoot, { recursive: true, force: true });
      }
    });

    it('400s an invalid parent and changes nothing else in the same body', async () => {
      const other = await registerProject(otherRoot);
      const res = await apiRequest(makeApp(), `/api/v1/projects/${other.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parent: other.id, maxParallel: 3 }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'a project cannot be its own parent' });
      const stored = (await loadWorkspaceConfig()).projects.find((p) => p.id === other.id)!;
      expect(stored.parent).toBeUndefined();
      expect(stored.maxParallel).toBeUndefined();
    });
```

Inside the `DELETE` describe (it has a `del(id)` helper) add:

```ts
    it('leaves a removed parent’s children registered and top-level', async () => {
      const parent = await registerProject(otherRoot);
      const childRoot = mkdtempSync(join(realpathSync(tmpdir()), 'cez-projects-child-'));
      try {
        const child = await registerProject(childRoot);
        await mergeWriteWorkspaceConfig((config) => {
          config.projects.find((p) => p.id === child.id)!.parent = parent.id;
        });
        expect((await del(parent.id)).status).toBe(200);
        const listed = await registeredProjects();
        expect(listed.map((p) => p.id)).toContain(child.id);
        expect(listed.find((p) => p.id === child.id)?.parent).toBeUndefined();
      } finally {
        rmSync(childRoot, { recursive: true, force: true });
      }
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- packages/cezar/src/server/projects-api.test.ts -t parent`
Expected: FAIL — the PATCH body `{parent}` is refused with 400 by the refine (`specify maxParallel or tags`). (The DELETE case may already pass through Task 1's `removeProject` — keep it as a guard.)

- [ ] **Step 3: Extend the contract** — in `packages/contract/src/projects.ts`:

In `projectListEntrySchema`, after `tags`:

```ts
  /** Registry id of the project this one is shown under (spec 2026-09-29-nested-repo-projects).
   *  Omitted for a top-level project, and for one whose stored parent is no longer registered. */
  parent: z.string().optional(),
```

Replace `updateProjectInputSchema` with:

```ts
export const updateProjectInputSchema = z
  .object({
    maxParallel: z.number().int().min(1).max(16).nullable().optional(),
    tags: z
      .array(z.string().trim().min(1).max(PROJECT_TAG_MAX_LENGTH))
      .max(PROJECT_TAGS_MAX)
      .nullable()
      .optional(),
    /** Nest under this registry id; `null` makes the project top-level again. */
    parent: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable().optional(),
  })
  .refine(
    (body) => body.maxParallel !== undefined || body.tags !== undefined || body.parent !== undefined,
    'specify maxParallel, tags or parent',
  );
```

Then `grep -rn "specify maxParallel or tags" packages` and update any test expecting the old message to `specify maxParallel, tags or parent`.

- [ ] **Step 4: Apply `parent` in the PATCH route** — in `server.ts`, add `projectParentError` to the import from `../workspace/projects.ts`. In the PATCH handler change `const { maxParallel, tags } = parsed.data;` to `const { maxParallel, tags, parent } = parsed.data;`, declare `let parentRefusal = null as string | null;` next to `let updated`, and make the mutator start with the parent check and end with the parent write:

```ts
        await mergeWriteWorkspaceConfig((config) => {
          const entry = config.projects.find((p) => p.id === id);
          if (!entry) return; // lost a race with a concurrent remove — answered below
          // Validated before ANY key is applied, so a refused parent leaves the whole body unapplied.
          if (parent) {
            parentRefusal = projectParentError(config.projects, id, parent);
            if (parentRefusal) return;
          }
          // … existing maxParallel and tags blocks unchanged …
          if (parent !== undefined) {
            if (parent === null) delete entry.parent;
            else entry.parent = parent;
          }
          updated = entry;
        });
```

After the `try/catch` around the merge-write, before the `if (!updated)` 404:

```ts
      if (parentRefusal) return c.json({ error: parentRefusal }, 400);
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- packages/cezar/src/server/projects-api.test.ts packages/cezar/src/server/contract-parity`
Expected: PASS. If a contract-parity/typed-bodies test flags the new 400 branch, follow its message (AGENTS.md: fix the source, never widen the schema).

- [ ] **Step 6: Document the additive field** — in `BACKWARD_COMPATIBILITY.md`:
  - Line ~42, the projects GET shape: add `parent?` to the entry list and this sentence after the `tags?` explanation: "`parent?` (spec `.ai/specs/2026-09-29-nested-repo-projects.md`) is the registry id this project is shown under, one level deep — omitted for a top-level project and for one whose stored parent is no longer registered, so an old consumer that ignores it sees every project as before." In the PATCH sentence change the body to `{maxParallel?: 1..16 | null, tags?: string[] | null, parent?: <id> | null}` and add: "an invalid `parent` (unknown, itself, a nested parent, or a project that has children) answers 400 with nothing applied; removing a parent makes its children top-level."
  - Line ~239, `projects[]` fields: add `parent?` to `{id, root, name, addedAt, lastOpenedAt, source, maxParallel?, tags?, parent?}` with "— `parent?` nests the entry under another, one level; absent means top-level".

- [ ] **Step 7: Commit**

```bash
git add packages/contract/src/projects.ts packages/cezar/src/server/server.ts packages/cezar/src/server/projects-api.test.ts BACKWARD_COMPATIBILITY.md
git commit -m "feat(api): PATCH /projects/:id sets or clears parent"
```

---

### Task 3: `cezar projects` CLI — `add --parent`, `parent`, nested `list`

**Files:**
- Modify: `packages/cezar/src/workspace/projects-cli.ts`
- Modify: `BACKWARD_COMPATIBILITY.md` (line ~20, `cezar projects` subcommands)
- Test: `packages/cezar/src/workspace/projects-cli.test.ts`

**Interfaces:**
- Consumes: `findProjectId`, `setProjectParent`, `ProjectParentError` (Task 1).
- Produces: `cezar projects add [<dir>] [--parent <id|dir>]` (output `  + <id>  <root>  ↳ <parent>` / `  = <id> (already registered)  <root>  ↳ <parent>`), `cezar projects parent <id> [<id|dir>]`. Capo parses `^\s*[+=]\s+(\S+)` — the id stays the first token.

- [ ] **Step 1: Write the failing tests** — append inside `describe('cezar projects CLI', …)` (helpers `run`, `makeRepo`, `io` exist):

```ts
  describe('nesting (spec 2026-09-29-nested-repo-projects)', () => {
    it('add --parent by folder nests the new project and says so', async () => {
      const product = makeRepo('product');
      const api = makeRepo('product', 'api');
      expect(await run('add', product)).toBe(0);
      expect(await run('add', api, '--parent', product)).toBe(0);
      expect(io.out.at(-1)).toMatch(/^ {2}\+ api {2}.*api {2}↳ product$/);
      const stored = (await loadWorkspaceConfig()).projects.find((p) => p.id === 'api');
      expect(stored?.parent).toBe('product');
    });

    it('add --parent on an already registered folder sets the parent (Capo re-runs it)', async () => {
      const product = makeRepo('product');
      const api = makeRepo('product', 'api');
      await run('add', product);
      await run('add', api);
      expect(await run('add', '--parent', 'product', api)).toBe(0);
      expect(io.out.at(-1)).toContain('(already registered)');
      expect((await loadWorkspaceConfig()).projects.find((p) => p.id === 'api')?.parent).toBe('product');
    });

    it('add --parent with an unknown parent fails before registering anything', async () => {
      const api = makeRepo('api');
      expect(await run('add', api, '--parent', 'ghost')).toBe(1);
      expect(io.err.at(-1)).toBe('unknown parent project: ghost');
      expect((await loadWorkspaceConfig()).projects).toEqual([]);
    });

    it('add --parent without a value is a usage error', async () => {
      expect(await run('add', makeRepo('api'), '--parent')).toBe(1);
    });

    it('parent sets, refuses and clears', async () => {
      await run('add', makeRepo('product'));
      await run('add', makeRepo('product', 'api'));
      expect(await run('parent', 'api', 'product')).toBe(0);
      expect(io.out.at(-1)).toBe('  = api  ↳ product');
      expect(await run('parent', 'product', 'api')).toBe(1);
      expect(io.err.at(-1)).toBe('api is itself nested under product; nesting is one level');
      expect(await run('parent', 'api')).toBe(0);
      expect(io.out.at(-1)).toBe('  = api (top-level)');
      expect(await run('parent', 'ghost', 'product')).toBe(1);
      expect(io.err.at(-1)).toBe('unknown project: ghost');
    });

    it('parent is refused in single-project mode', async () => {
      const code = await runProjectsCommand(['parent', 'api', 'product'], {
        defaultRoot: repos, env: { CEZ_SINGLE_PROJECT: '1' }, io,
      });
      expect(code).toBe(1);
    });

    it('list prints children right after their parent, marked ↳', async () => {
      await run('add', makeRepo('product'));
      await run('add', makeRepo('zeta'));
      await run('add', makeRepo('product', 'web'));
      await run('add', makeRepo('product', 'api'));
      await run('parent', 'web', 'product');
      await run('parent', 'api', 'product');
      io.out.length = 0;
      await run('list');
      const rows = io.out.filter((line) => line.includes(repos)).map((line) => line.trim());
      expect(rows.map((row) => row.split(/\s+/).slice(1, 3).join(' '))).toEqual([
        'product main',
        '↳ api',
        '↳ web',
        'zeta main',
      ]);
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- packages/cezar/src/workspace/projects-cli.test.ts -t nesting`
Expected: FAIL — `--parent` is taken as the folder (`not a directory: …/--parent`), `parent` is an unknown subcommand.

- [ ] **Step 3: Implement** — in `projects-cli.ts`:

Imports: add `findProjectId, ProjectParentError, setProjectParent` to the `./projects.ts` import.

USAGE: replace the `add` line and add the `parent` command:

```ts
  cezar projects add [<dir>] [--parent <id|dir>]
                               register a folder (default: --repo, else cwd), optionally nested
  cezar projects remove <id>   drop a registry entry (the repo is untouched)
  cezar projects tag <id> [<tag>…]
                               set the grouping tags of a project (none clears them)
  cezar projects parent <id> [<id|dir>]
                               show a project under another in the sidebar (none makes it top-level)

  add/remove/tag/parent are unavailable when CEZ_SINGLE_PROJECT=1`;
```

Dispatch — replace the `add` case and add `parent`:

```ts
    case 'add': {
      if (singleProject) {
        io.error(SINGLE_PROJECT_ADD_ERROR);
        return 1;
      }
      const flag = rest.indexOf('--parent');
      const parentRef = flag === -1 ? undefined : rest[flag + 1];
      if (flag !== -1 && !parentRef) {
        io.error(USAGE);
        return 1;
      }
      const positional = flag === -1 ? rest : rest.filter((_, i) => i !== flag && i !== flag + 1);
      return addCommand(positional[0] ? resolve(positional[0]) : opts.defaultRoot, io, parentRef);
    }
```

```ts
    case 'parent':
      if (singleProject) {
        io.error(SINGLE_PROJECT_EDIT_ERROR);
        return 1;
      }
      return parentCommand(rest[0], rest[1], io);
```

`addCommand` — new signature `addCommand(root: string, io: ProjectsCommandIo, parentRef?: string)`; after the `shouldRegisterProject` guard and before `const known = …`:

```ts
  // Resolved BEFORE registering, so an unknown parent leaves the registry untouched.
  const parentId = parentRef === undefined ? undefined : await findProjectId(parentRef);
  if (parentRef !== undefined && parentId === undefined) {
    io.error(`unknown parent project: ${parentRef}`);
    return 1;
  }
```

and replace the final `io.log(…)`/`return 0` with:

```ts
  let nested = '';
  if (parentId !== undefined) {
    try {
      await setProjectParent(entry.id, parentId);
      nested = `  ↳ ${parentId}`;
    } catch (err) {
      if (!(err instanceof ProjectParentError)) throw err;
      io.error(`${err.message} (${entry.id} is registered, top-level)`);
      return 1;
    }
  }
  io.log(
    (known.has(entry.id) ? `  = ${entry.id} (already registered)  ${entry.root}` : `  + ${entry.id}  ${entry.root}`) +
      nested,
  );
  return 0;
```

New command, after `tagCommand`:

```ts
/**
 * `cezar projects parent <id> [<id|dir>]` — nest a project under another (spec
 * 2026-09-29-nested-repo-projects), or make it top-level again when no parent is named.
 */
async function parentCommand(
  id: string | undefined,
  parentRef: string | undefined,
  io: ProjectsCommandIo,
): Promise<number> {
  if (!id) {
    io.error(USAGE);
    return 1;
  }
  let parentId: string | null = null;
  if (parentRef !== undefined) {
    const found = await findProjectId(parentRef);
    if (found === undefined) {
      io.error(`unknown parent project: ${parentRef}`);
      return 1;
    }
    parentId = found;
  }
  try {
    if (!(await setProjectParent(id, parentId))) {
      io.error(`unknown project: ${id}`);
      return 1;
    }
  } catch (err) {
    if (!(err instanceof ProjectParentError)) throw err;
    io.error(err.message);
    return 1;
  }
  io.log(parentId === null ? `  = ${id} (top-level)` : `  = ${id}  ↳ ${parentId}`);
  return 0;
}
```

`listCommand` — nest before printing. Add this helper above `listCommand`:

```ts
/** Registry order for top-level projects, each followed by its children sorted by name. */
function nestedRows<T extends { id: string; name: string; parent?: string }>(
  projects: T[],
): { project: T; child: boolean }[] {
  const ids = new Set(projects.map((project) => project.id));
  const rows: { project: T; child: boolean }[] = [];
  for (const project of projects) {
    if (project.parent && ids.has(project.parent)) continue;
    rows.push({ project, child: false });
    const children = projects
      .filter((child) => child.parent === project.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) rows.push({ project: child, child: true });
  }
  return rows;
}
```

and change the print loop to:

```ts
  for (const { project, child } of nestedRows(projects)) {
    const label = statusLabel(project).padEnd(labelWidth);
    const tags = project.tags?.length ? `  [${project.tags.join(' ')}]` : '';
    // A child is marked in the id column itself, so the columns after it still line up.
    const id = child ? `↳ ${project.id}` : project.id;
    io.log(`  ${statusMark(project.status)} ${id.padEnd(idWidth + 2)}  ${label}  ${project.root}${tags}`);
  }
```

(Keep the existing comment about tags above `tags`.)

- [ ] **Step 4: Run the tests**

Run: `npm test -- packages/cezar/src/workspace/projects-cli.test.ts`
Expected: PASS. If an existing `list` test pins exact column spacing, update its expectation for the two extra id-column characters (`idWidth + 2`).

- [ ] **Step 5: Document** — `BACKWARD_COMPATIBILITY.md` line ~20: `list` (the default), `add`, `remove`/`rm`, `tag`, `parent`. Append: "`add` accepts `--parent <id|dir>` (additive: an `add` without it behaves exactly as before; its `+`/`=` line gains a trailing `  ↳ <parent>` only when the flag is given). `parent <id> [<id|dir>]` nests a project under another, or makes it top-level when no parent is named."

- [ ] **Step 6: Commit**

```bash
git add packages/cezar/src/workspace/projects-cli.ts packages/cezar/src/workspace/projects-cli.test.ts BACKWARD_COMPATIBILITY.md
git commit -m "feat(cli): cezar projects add --parent and projects parent"
```

---

### Task 4: Sidebar — children inside the parent's group

**Files:**
- Create: `packages/web/src/components/project-repos.tsx`
- Modify: `packages/web/src/components/project-groups.tsx` (`useSidebarCollapse.toggle`, `ProjectGroups`, `ProjectGroup` props + body)
- Test: `packages/web/src/components/project-groups.test.tsx`

**Interfaces:**
- Consumes: `ProjectListEntry.parent?: string` (Task 2, via `@open-mercato/cezar-api-client`, which re-exports the contract).
- Produces: `ProjectRepos({ repos, scopedProjectId, activeTo, collapsed, onToggle, onNavigate })`; `toggle(projectId: string, anchorId?: string | null)`.

- [ ] **Step 1: Write the failing tests** — append inside `describe('ProjectGroups', …)`:

```ts
  describe('nested repositories (spec 2026-09-29-nested-repo-projects)', () => {
    const repoRow = (id: string) =>
      document.querySelector(`[data-slot="project-repo"][data-project="${id}"]`) as HTMLElement | null
    const nested = () => [
      project(),
      project({ id: 'shop', name: 'shop', lastOpenedAt: '2026-07-19T00:00:00.000Z' }),
      project({ id: 'web', name: 'web', parent: 'cezar', forge: undefined, branch: 'master' }),
      project({ id: 'api', name: 'api', parent: 'cezar', forge: 'gitlab', branch: 'master' }),
    ]

    it('draws children inside the parent group, sorted, collapsed, with no group of their own', async () => {
      serve({ '/api/v1/p/cezar/runs': [] })
      renderGroups(nested())

      await waitFor(() => expect(repoRow('api')).not.toBeNull())
      expect(group('api')).toBeNull()
      expect(group('web')).toBeNull()
      const rows = Array.from(group('cezar').querySelectorAll('[data-slot="project-repo"]'))
      expect(rows.map((row) => row.getAttribute('data-project'))).toEqual(['api', 'web'])
      const api = repoRow('api')!
      expect(within(api).getByRole('button', { name: 'Expand api' }).getAttribute('aria-expanded')).toBe('false')
      expect(api.querySelector('[data-slot="project-repo-header"]')?.getAttribute('href')).toBe('/p/api/git')
      // Children never fetch runs: tasks run from the parent.
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/p/api/'))).toBe(false)
    })

    it('an expanded child carries only Git and its forge, labelled by kind', async () => {
      serve({ '/api/v1/p/cezar/runs': [] })
      renderGroups(nested())

      await waitFor(() => expect(repoRow('api')).not.toBeNull())
      fireEvent.click(within(repoRow('api')!).getByRole('button', { name: 'Expand api' }))
      const apiNav = within(repoRow('api')!).getByRole('navigation', { name: 'api navigation' })
      expect(within(apiNav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        ['Git', '/p/api/git'],
        ['GitLab', '/p/api/github'],
      ])
      fireEvent.click(within(repoRow('web')!).getByRole('button', { name: 'Expand web' }))
      const webNav = within(repoRow('web')!).getByRole('navigation', { name: 'web navigation' })
      expect(within(webNav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Git'])
    })

    it('standing in a child opens its parent and itself, lights its tab, and can still collapse it', async () => {
      serve({ '/api/v1/p/cezar/runs': [] })
      renderGroups(nested(), '/p/api/git')

      await waitFor(() => expect(repoRow('api')).not.toBeNull())
      expect(disclosure('cezar').getAttribute('aria-expanded')).toBe('true')
      expect(group('cezar').hasAttribute('data-active')).toBe(false)
      expect(repoRow('api')!.hasAttribute('data-active')).toBe(true)
      const apiNav = within(repoRow('api')!).getByRole('navigation', { name: 'api navigation' })
      expect(within(apiNav).getByRole('link', { current: 'page' }).textContent).toBe('Git')

      fireEvent.click(within(repoRow('api')!).getByRole('button', { name: 'Collapse api' }))
      expect(within(repoRow('api')!).queryByRole('navigation')).toBeNull()
    })

    it('draws a child whose parent is not listed as a group of its own', async () => {
      serve({ '/api/v1/p/cezar/runs': [] })
      renderGroups([project(), project({ id: 'lost', name: 'lost', parent: 'gone' })])
      await waitFor(() => expect(group('lost')).not.toBeNull())
      expect(repoRow('lost')).toBeNull()
    })

    it('reorders only top-level groups', async () => {
      serve({ '/api/v1/p/cezar/runs': [] })
      renderGroups(nested())
      await waitFor(() => expect(repoRow('api')).not.toBeNull())
      const tops = Array.from(document.querySelectorAll('[data-slot="project-group"]'))
      expect(tops.map((el) => el.getAttribute('data-project'))).toEqual(['cezar', 'shop'])
      expect(grip('cezar')?.getAttribute('aria-label')).toContain('of 2')
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- packages/web/src/components/project-groups.test.tsx -t "nested repositories"`
Expected: FAIL — children render as top-level groups; no `project-repo` rows exist. (If `grip`'s aria-label wording differs from `… of 2`, read `ProjectGrip` and assert its actual position text.)

- [ ] **Step 3: Create `project-repos.tsx`**

```tsx
import { ChevronDownIcon } from 'lucide-react'

import type { ProjectListEntry } from '@open-mercato/cezar-api-client'
import { visibleNavItems } from '@/components/nav-items'
import { Link, scopeTo } from '@/lib/project-router'
import { isProjectCollapsed, type SidebarCollapsed } from '@/lib/sidebar-collapse'
import { cn } from '@/lib/utils'

/**
 * The repositories nested under a project (spec 2026-09-29-nested-repo-projects): a multi-repo
 * product's clones, each a registered project of its own with its own `/p/<id>` scope, shown
 * inside the product's group instead of as groups of their own.
 *
 * A child carries only its Git and forge tabs. Tasks, Skills, Workflows and Settings belong to
 * the product it is nested under — that is where tasks run — so the child neither lists nor
 * fetches runs.
 */
const REPO_NAV = new Set(['/git', '/github'])

export function ProjectRepos({
  repos,
  scopedProjectId,
  activeTo,
  collapsed,
  onToggle,
  onNavigate,
}: {
  repos: ProjectListEntry[]
  /** The project the URL names — a child is open by default only while you stand in it. */
  scopedProjectId: string | null
  /** The `to` of the nav item that owns the current URL. */
  activeTo: string | null
  collapsed: SidebarCollapsed
  /** Takes the anchor its default is computed against: the child's own scope, not the parent's. */
  onToggle: (projectId: string, anchorId: string | null) => void
  onNavigate?: () => void
}) {
  return (
    <div data-slot="project-repos" className="mt-1">
      <div className="px-2.5 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-soft-foreground">
        Repositories
      </div>
      {repos.map((repo) => {
        const shut = isProjectCollapsed(collapsed, repo.id, scopedProjectId)
        const inScope = repo.id === scopedProjectId
        const bodyId = `project-repo-${repo.id}`
        return (
          <div key={repo.id} data-slot="project-repo" data-project={repo.id} data-active={inScope ? '' : undefined}>
            <div className={cn('flex items-center rounded-md transition-colors hover:bg-muted', inScope && 'bg-muted')}>
              <button
                type="button"
                onClick={() => onToggle(repo.id, scopedProjectId)}
                aria-expanded={!shut}
                aria-controls={bodyId}
                aria-label={`${shut ? 'Expand' : 'Collapse'} ${repo.name}`}
                data-slot="project-repo-disclosure"
                className="flex h-11 w-[22px] shrink-0 items-center justify-center rounded-md md:h-[30px]"
              >
                <ChevronDownIcon
                  className={cn('size-3 shrink-0 text-muted-foreground transition-transform', shut && '-rotate-90')}
                  aria-hidden="true"
                />
              </button>
              <Link
                to={scopeTo(repo.id, '/git')}
                onClick={onNavigate}
                aria-current={inScope ? 'true' : undefined}
                data-slot="project-repo-header"
                className="flex h-11 min-w-0 flex-1 items-center gap-2 pr-2 text-[13px] font-medium md:h-[30px]"
              >
                <span className="truncate">{repo.name}</span>
                {repo.branch ? (
                  <span className="ml-auto max-w-[80px] truncate font-mono text-[10.5px] font-medium text-soft-foreground">
                    {repo.branch}
                  </span>
                ) : null}
              </Link>
            </div>
            {shut ? null : (
              <nav id={bodyId} aria-label={`${repo.name} navigation`} className="ml-[11px] border-l border-border pl-2">
                {visibleNavItems({ forge: repo.forge !== undefined, forgeKind: repo.forge })
                  .filter((item) => REPO_NAV.has(item.to))
                  .map((item) => {
                    const Icon = item.icon
                    const isActive = inScope && item.to === activeTo
                    return (
                      <Link
                        key={item.to}
                        to={scopeTo(repo.id, item.to)}
                        onClick={onNavigate}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-[30px]',
                          isActive && 'bg-muted font-semibold text-foreground',
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                        {item.label}
                      </Link>
                    )
                  })}
              </nav>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Let the toggle take its anchor** — in `useSidebarCollapse`:

```ts
  const toggle = React.useCallback(
    // `anchorId` is what an unstored entry's default is computed against — the groups use the
    // active project, a nested repository its own scope (see `ProjectRepos`).
    (projectId: string, anchorId: string | null = activeProjectId) => {
      write({
        ...latest.current,
        [projectId]: !isProjectCollapsed(latest.current, projectId, anchorId),
      })
    },
    [activeProjectId, write],
  )
```

`ProjectGroup`'s `onToggle` prop type stays `(projectId: string) => void`-compatible; widen it to `(projectId: string, anchorId?: string | null) => void`.

- [ ] **Step 5: Split top-level from children in `ProjectGroups`** — after `const scopedProjectId = pathnameProjectId(pathname)`:

```ts
  // Nested repositories (spec 2026-09-29-nested-repo-projects) are drawn inside their parent's
  // group, never as groups of their own. The server already drops a parent that is no longer
  // registered; checking again here means a stale list can never make a project vanish — an
  // orphan is simply a group.
  const { topLevel, childrenOf } = React.useMemo(() => {
    const ids = new Set(projects.map((entry) => entry.id))
    const children = new Map<string, ProjectListEntry[]>()
    const tops: ProjectListEntry[] = []
    for (const entry of projects) {
      if (entry.parent && ids.has(entry.parent)) {
        children.set(entry.parent, [...(children.get(entry.parent) ?? []), entry])
      } else {
        tops.push(entry)
      }
    }
    for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return { topLevel: tops, childrenOf: children }
  }, [projects])
  // Standing in a nested repository keeps its parent's group open.
  const groupScopeId =
    projects.find((entry) => entry.id === scopedProjectId)?.parent ?? scopedProjectId
```

Change `const collapseAnchorId = scopedProjectId ?? bootProjectId` to `const collapseAnchorId = groupScopeId ?? bootProjectId`, and in the `ordered` memo use `orderProjects(topLevel, order)` with deps `[topLevel, order]`.

In `groups = ordered.map(…)` add three props to `<ProjectGroup …>`:

```tsx
      repos={childrenOf.get(project.id) ?? []}
      scopedProjectId={scopedProjectId}
      collapsedMap={collapsed}
```

- [ ] **Step 6: Render the children in `ProjectGroup`** — add the props to its destructuring and type:

```ts
  /** Registered projects nested under this one (spec 2026-09-29-nested-repo-projects). */
  repos: ProjectListEntry[]
  scopedProjectId: string | null
  collapsedMap: SidebarCollapsed
```

(import `type SidebarCollapsed` from `@/lib/sidebar-collapse` and `ProjectRepos` from `@/components/project-repos`), and right after the closing `</nav>` in the body:

```tsx
          {repos.length > 0 ? (
            <ProjectRepos
              repos={repos}
              scopedProjectId={scopedProjectId}
              activeTo={activeTo}
              collapsed={collapsedMap}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ) : null}
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- packages/web/src/components/`
Expected: PASS (new cases and every existing sidebar test — none of them sets `parent`, so their groups are unchanged).

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add packages/web/src/components/project-repos.tsx packages/web/src/components/project-groups.tsx packages/web/src/components/project-groups.test.tsx
git commit -m "feat(web): nested repositories inside their parent's sidebar group"
```

---

### Task 5: Capo OM — register repositories and worktrees with `--parent`

Repository: `/home/mateo/capo-om`, branch `feat/cezar-register-child-repos` (already holds the uncommitted `register_repos` helper and its test from option A).

**Files:**
- Modify: `deploy/docker/capo-cezar.sh` (`register_repos`)
- Modify: `plugins/capo-om/scripts/capo.py` (`cezar_register`, its caller in `cmd_dispatch`)
- Modify: `tests/test_docker.py`, `tests/test_capo.py:751-773`
- Modify: `CHANGELOG.md`, version files via `scripts/version.py bump`

**Interfaces:**
- Consumes: `cezar projects add <dir> --parent <dir>` (Task 3); an older Cezar exits 1 on it (`not a directory: …/--parent`).
- Produces: `cezar_register(path: Path, parent: Path) -> str | None`.

- [ ] **Step 1: Update the failing tests**

`tests/test_docker.py`, in `test_product_commands_register_each_recorded_repository_in_cezar`, change the expected calls to:

```python
            self.assertEqual([f"projects add {product}/backend --parent {product}",
                              f"projects add {product}/frontend --parent {product}"],
                             (tmp / "calls").read_text().splitlines())
```

and add a fallback test right after it:

```python
    @unittest.skipUnless(shutil.which("sh") and shutil.which("jq"), "needs sh and jq")
    def test_register_repos_falls_back_to_a_plain_add_on_a_cezar_without_parent(self):
        helper = (DOCKER / "capo-cezar.sh").read_text()
        function = re.search(r"^register_repos\(\) \{\n.*?^\}\n", helper, re.M | re.S).group(0)
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            product = tmp / "product"
            (product / ".capo").mkdir(parents=True)
            (product / ".capo" / "workspace.json").write_text(json.dumps({"repositories": [{"path": "backend"}]}))
            (product / "backend" / ".git").mkdir(parents=True)
            bin_dir = tmp / "bin"
            bin_dir.mkdir()
            cezar = bin_dir / "cezar"  # an older Cezar: --parent is taken as the folder and fails
            cezar.write_text(f'#!/bin/sh\necho "$*" >> "{tmp}/calls"\ncase "$*" in *--parent*) exit 1;; esac\n')
            cezar.chmod(0o755)
            env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
            proc = subprocess.run(["sh", "-c", f"set -eu\n{function}register_repos \"$1\"\n", "sh", str(product)],
                                  capture_output=True, text=True, env=env)
            self.assertEqual(0, proc.returncode, proc.stderr)
            self.assertEqual([f"projects add {product}/backend --parent {product}",
                              f"projects add {product}/backend"], (tmp / "calls").read_text().splitlines())
```

`tests/test_capo.py`, in `test_in_a_cezar_task_each_worktree_becomes_a_cezar_project_until_cleanup`, change the expectation to:

```python
        self.assertEqual([f"projects add {wt} --parent {self.root}"], log.read_text().splitlines())
```

and add after that test:

```python
    def test_a_cezar_without_parent_still_registers_the_worktree(self):
        bindir = Path(self._tmp.name) / "bin"
        log = Path(self._tmp.name) / "cezar.log"
        (bindir / "cezar").write_text(
            f'#!/bin/sh\necho "$@" >> "{log}"\n'
            'case "$*" in *--parent*) exit 1;; esac\n'
            'echo "  + $(basename "$3")  $3"\n')
        (bindir / "cezar").chmod(0o755)
        self.split([{"repo": "backend", "brief": "x"}])
        os.environ["CEZ_TASK_ID"] = "task-1"
        try:
            part = capo.cmd_dispatch(self.root, "PROJ-421", "backend", "agent-1")
        finally:
            os.environ.pop("CEZ_TASK_ID")
        wt = self.root / ".worktrees" / "proj-421-backend"
        self.assertEqual("proj-421-backend", part["cezarProject"])
        self.assertEqual([f"projects add {wt} --parent {self.root}", f"projects add {wt}"],
                         log.read_text().splitlines())
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m unittest tests.test_docker tests.test_capo 2>&1 | tail -5`
Expected: FAIL on the three changed/new expectations (calls carry no `--parent`).

- [ ] **Step 3: Implement**

`deploy/docker/capo-cezar.sh`, `register_repos` — replace the comment and the loop body line:

```sh
# Cezar picks a project's forge (GitHub, GitLab) from its own origin remote. The product repository
# has none, so each repository Capo records in it is registered as a Cezar project nested under the
# product: its merge requests, pipelines and branches show up inside the product's sidebar group.
# A Cezar without `--parent` refuses the flag; the plain add still registers the repository.
register_repos() {
  manifest="$1/.capo/workspace.json"
  [ -f "$manifest" ] || return 0
  jq -r '.repositories[]?.path // empty' "$manifest" | while read -r path; do
    [ -d "$1/$path/.git" ] || continue
    cezar projects add "$1/$path" --parent "$1" >/dev/null 2>&1 || cezar projects add "$1/$path" >/dev/null
  done
}
```

`plugins/capo-om/scripts/capo.py`:

```python
def cezar_register(path: Path, parent: Path) -> str | None:
    """Register a part's worktree as a Cezar project, nested under the product, when Capo runs in a
    Cezar task; the project id. A Cezar without `--parent` gets a plain, top-level registration."""
    if not os.environ.get("CEZ_TASK_ID"):
        return None
    out = cezar_projects("add", str(path), "--parent", str(parent)) or cezar_projects("add", str(path))
    match = re.search(r"^\s*[+=]\s+(\S+)", out or "", re.M)  # "  + <id>  <root>" or "  = <id> (already registered)"
    return match.group(1) if match else None
```

and in `cmd_dispatch`: `project = cezar_register(path, root)`.

- [ ] **Step 4: Run the tests**

Run: `python3 -m unittest discover -s tests 2>&1 | tail -3`
Expected: `OK`.

- [ ] **Step 5: Bump the version and log the change**

Run: `python3 scripts/version.py bump` (patch: 0.22.0 → 0.22.1)
Then add at the top of `CHANGELOG.md` under the new `## 0.22.1` heading the bump created (or create it):

```markdown
- **A product's repositories appear inside the product in Cezar.** Cezar picks a project's forge from its own remote, and the product repository has none, so its GitLab merge requests and pipelines were never shown.
  - `capo-cezar new-product`, `product` and `add-local` register each repository recorded in `.capo/workspace.json` as a Cezar project nested under the product (`cezar projects add <repo> --parent <product>`); Cezar shows it inside the product's sidebar group with its Git and GitLab tabs.
  - In a Cezar task, `capo dispatch` nests the part's worktree under the product the same way.
  - A Cezar without `--parent` still gets every repository registered, top-level.
```

Run: `python3 scripts/version.py check && python3 -m unittest discover -s tests 2>&1 | tail -2`
Expected: check passes, `OK`.

- [ ] **Step 6: Commit**

```bash
git add deploy/docker/capo-cezar.sh plugins/capo-om/scripts/capo.py tests/test_docker.py tests/test_capo.py CHANGELOG.md VERSION plugins/capo-om
git commit -m "feat(cezar): register a product's repositories nested under it"
```

---

### Task 6: Validate, publish, and verify end to end

**Files:** none new.

- [ ] **Step 1: Full Cezar gate** (fork, `feat/nested-repo-projects`)

Run: `npm run typecheck && npm test && npm run test:unit && npm run build`
Expected: all green. Fix anything red in the task that owns it before continuing.

- [ ] **Step 2: Push both branches and open the PRs**

```bash
cd /home/mateo/capo-om-cezar && git push -u origin feat/nested-repo-projects
gh pr create --repo mateusz-kotynski/capo-om-cezar --base main --head feat/nested-repo-projects \
  --title "Nested repository projects" --body "<summary + spec link + test evidence>"
cd /home/mateo/capo-om && git push -u origin feat/cezar-register-child-repos
gh pr create --repo mateusz-kotynski/capo-om --base main --head feat/cezar-register-child-repos \
  --title "Register a product's repositories nested under it in Cezar" --body "<summary + depends on the Cezar PR>"
```

(`--repo` on the fork is required: without it `gh` targets the upstream `open-mercato/cezar`.) Do not merge — the user approves merges.

- [ ] **Step 3: Rebuild the container from the branch**

```bash
cd /home/mateo/capo-om && scripts/cezar-docker.sh cezar-source fork https://github.com/mateusz-kotynski/capo-om-cezar.git feat/nested-repo-projects
```

Expected: ends with `Cockpit: http://127.0.0.1:4321`.

- [ ] **Step 4: Nest the wellplayed repositories** (they are already registered top-level from option A)

```bash
docker exec -u node capo-cezar-cezar-1 sh -c 'for r in wellplayed-backend wellplayed-frontend wellplayed-charts gitops; do cezar projects parent $r wellplayed; done; cezar projects list'
```

Expected: the four listed as `↳ …` under `wellplayed`.

- [ ] **Step 5: Verify in a browser** (playwright-browser skill) at http://127.0.0.1:4321: the *wellplayed* group lists the four repositories under **Repositories**, none has a top-level group, expanding `wellplayed-backend` shows **Git** and **GitLab**, and its GitLab page lists the open merge requests (e.g. !145 WP-548). Save screenshots to the scratchpad and report them.
