# Nested repository projects

> Status: draft
> Builds on: [Multi-project workspace](2026-07-20-multi-project-workspace.md) (registry, `/api/v1/p/:projectId` scope, sidebar groups) and the GitLab forge driver (`server/forge/gitlab.ts`).

## TLDR

A registered project can name another registered project as its `parent`. The sidebar then draws
the child **inside the parent's group** as a collapsible sub-row carrying only the child's **Git**
and **forge** (GitHub / GitLab) nav, instead of giving it a top-level group of its own. Everything
else about the child — its `/api/v1/p/<id>/…` scope, forge driver, git routes — is unchanged, so
the server gains a registry field and nothing more.

## Problem Statement

A multi-repository product (the shape Capo OM creates) is one **product repository** holding
clones of its repositories as ignored sub-folders:

```
/workspace/wellplayed            product repo: git init, no remote, branch main
  ├─ wellplayed-backend/         gitlab.com/…/wellplayed-backend (master)
  ├─ wellplayed-frontend/        gitlab.com/…/wellplayed-frontend (master)
  ├─ wellplayed-charts/          …
  └─ gitops/                     …
```

Only the product repository is registered, because that is where tasks run. The forge is picked
from a project's own `origin`, and the product repository has none — so the cockpit shows plain
git on `main` and never the repositories' merge requests, pipelines or branches. Registering each
repository as its own project fixes the forge tab but scatters one product over five top-level
sidebar groups, each offering Tasks, Skills and Workflows that do not belong there.

## Proposed Solution

- Registry entry gains an optional `parent: <project id>`.
- **One level only.** A parent must itself be top-level; a project with children cannot be given a
  parent; a project cannot be its own parent. Violations are rejected (API 400, CLI exit 1).
- **Removing a parent** clears `parent` on its children: they become ordinary top-level projects,
  nothing is lost or silently removed.
- **A dangling `parent`** (edited by hand, id no longer registered) is treated as absent when read.
- The sidebar nests children under their parent; children show **Git** and the **forge** item only.
  Tasks, Inbox, Tracker, Automations, Skills, Workflows and Settings stay with the parent.
- Other project lists (Settings → Projects, command palette, the global Tasks page's project
  labels) mark a child with its parent: `wellplayed-backend ↳ wellplayed`.

### Why this shape, and not the alternatives

- **Nesting by path containment** (a project whose root lies inside another's is its child) needs
  no configuration, but the not-git `/workspace` project would swallow every project, and task
  worktrees registered under a product would nest whether wanted or not. Explicit is predictable.
- **Reading Capo's `.capo/workspace.json`** would make Cezar depend on another tool's file format.
  Capo sets `parent` through the CLI instead (see *Capo OM integration*).
- **A new sub-scope** (`/p/<product>/repos/<repo>/…`) would duplicate every git and forge route.
  A child already *is* a project with its own scope; only its presentation changes.

## Data Model

`~/.cezar/config.json`, `workspaceProjectSchema` (`packages/cezar/src/workspace/config.ts`):

```ts
/** Registry id of the project this one is shown under (one level). Absent = top-level. */
parent: z.string().regex(PROJECT_ID_RE).optional().catch(undefined),
```

`.catch(undefined)` so a malformed value degrades to top-level rather than failing the load;
`.passthrough()` already preserves it for older readers. No migration: absent means top-level,
which is every existing entry.

`ProjectListEntry` (contract `packages/contract/src/projects.ts`) gains the same optional
`parent: z.string().optional()`, emitted only when the named parent is registered.

## API Contracts

- `GET /api/v1/projects` — entries carry `parent` when set.
- `POST /api/v1/projects` (`registerProjectSchema`) — optional `parent` (id). Applied after the
  registration; an invalid parent fails the call with 400 and leaves the registry unchanged.
- `PATCH /api/v1/projects/:projectId` (`updateProjectInputSchema`) — optional `parent`: an id sets
  it, `null` clears it. Same validation.
- `DELETE /api/v1/projects/:projectId` — additionally clears `parent` on the removed project's
  children, in the same registry write.

Validation lives in one function in `workspace/projects.ts`, `validateProjectParent(entries, id,
parent)`, used by the API, the CLI and `registerProject`:

| Case | Result |
| --- | --- |
| parent id not registered | error `unknown parent project: <id>` |
| parent == id | error `a project cannot be its own parent` |
| parent has a parent | error `<parent> is itself nested under <x>; nesting is one level` |
| id already has children | error `<id> has nested projects; it cannot be nested itself` |

### CLI

- `cezar projects add [<dir>] [--parent <id|dir>]` — `--parent` accepts a registry id or a folder
  (resolved through the registry by realpath: Capo knows the product folder, not its id). Output
  unchanged apart from a trailing `↳ <parent>` on the `+`/`=` line.
- `cezar projects parent <id> [<id|dir>]` — set the parent, or clear it when omitted; mirrors
  `cezar projects tag`. Unavailable under `CEZ_SINGLE_PROJECT=1` like the other editing commands.
- `cezar projects list` — children listed right after their parent, indented, with `↳`.
- Re-running `add --parent` on an already registered folder sets the parent (idempotent), so a
  script can run it on every start.

## UI/UX

### Sidebar (`packages/web/src/components/project-groups.tsx`)

- `orderProjects` / drag-and-drop order apply to **top-level** projects only; children follow their
  parent, ordered by name.
- Inside the parent's group, after the parent's own nav, a **Repositories** section lists the
  children. Each child row: name, current branch, forge icon; collapsible (collapse state keyed by
  child id in the existing `sidebar-collapse` store), collapsed by default.
- An expanded child shows the nav items `Git` (`/p/<child>/git`) and the forge item
  (`/p/<child>/github`, labelled GitLab for a GitLab forge). Forge availability comes from the
  child's `forge` field in the projects list, exactly as for a top-level group.
- The active child is expanded automatically when the URL is inside its scope.
- With exactly one top-level project plus children, the grouped sidebar is used (the flat sidebar
  has nowhere to put children). The existing rule counts top-level projects plus children, so no
  change is needed there beyond counting all registry entries as it does today.

### Other surfaces

Settings → Projects, the command palette's project entries and the global Tasks page show a
child as `<name> ↳ <parent name>`. Settings gains no parent editor in this change (CLI/API only).

## Capo OM integration (capo-om repository, separate PR)

- `deploy/docker/capo-cezar.sh`: `register_repos` runs `cezar projects add <repo> --parent <product>`
  for each repository recorded in `.capo/workspace.json`, after the product is registered
  (`new-product`, `product`, `add-local`).
- `plugins/capo-om/scripts/capo.py` `cezar_register`: a part's worktree is registered with
  `--parent <product root>`, so it appears under the product while the part is in flight;
  `capo cleanup` already removes it.
- Backward compatibility: when `cezar projects add … --parent …` fails (a Cezar without this
  feature), retry without `--parent` — the repository is still registered, top-level.

## Testing

Cezar:
- `workspace/projects.test.ts`: parent round-trips; each validation case; removing a parent clears
  its children's `parent`; a dangling parent reads as absent.
- `workspace/projects-cli.test.ts`: `add --parent` by id and by folder; `parent` set/clear;
  `list` ordering and `↳`.
- Server: `POST`/`PATCH` accept and validate `parent`; `DELETE` clears children; contract parity
  test covers the new field.
- Web: `project-groups` test — a child renders inside its parent's group with only Git and forge
  items, not as a top-level group; ordering applies to top-level only.

Capo OM: `register_repos` passes `--parent`; `cezar_register` passes `--parent` and falls back
without it.

End to end: rebuild the Docker image from the fork, register the wellplayed repositories under
the product, and check in a browser that the four repositories appear under *wellplayed* with
working Git and GitLab pages.

## Out of scope

- Launching a task directly in a child (tasks run from the parent).
- Editing the parent from the Settings UI.
- More than one nesting level.
