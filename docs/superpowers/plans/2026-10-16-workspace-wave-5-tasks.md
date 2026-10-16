# Wave 5: Tasks list, board and resource tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax. Dispatch W5-T5a and W5-T5b separately; W5-T5 is a family, not an assignment.

**Goal:** Extend existing task identity and service into a paged global/project Tasks space, Board, and project Tasks resource body. Completion, date, area and accountable owner describe the same durable task on every subscribed client.

**Architecture:** Extend `WorkspaceTools`, its SQLite tables, separate optional RPC family, and `createWorkspaceToolsAtoms`. Keep `WorkspaceTaskId` and `{ type: "task", taskId }` unchanged. Derive completion from one designated project column. Reuse `ServerSettingsService` for environment timezone and owner display. Share rows and editor between the list, project hub and resource body. Consume Wave 4's shell without rebuilding its frame or project selector.

**Tech Stack:** TypeScript, React, TanStack Router, Effect Schema/RPC/SQL, SQLite, Effect reactivity atoms, lucide-react, existing UI primitives, `@effect/vitest`, `vite-plus/test`, `react-test-renderer`.

**Spec:** `docs/superpowers/specs/2026-10-14-unified-workspace-design.md`, including A1, A7, A12 and A13. Scheduling authority: `docs/superpowers/workspace-mockups/mockup-waves/wave-map.md`, Wave 5 and its shared sections. Main plan: `docs/superpowers/plans/2026-10-14-unified-workspace.md`, Global Constraints and Wave 5.

**Mockups:** `docs/superpowers/workspace-mockups/mockups/03-tasks.png` and `docs/superpowers/workspace-mockups/mockups/08-calendar-tasks.png`. Corrected inventory: `docs/superpowers/workspace-mockups/mockup-waves/gap-tasks-calendar.md:15-51,89-106`. Both PNGs were opened as images. Both reviews and the wave map's response log were read. The corrected targets include unbadged status filters and the LayoutGrid Board icon.

**Worktree:** `C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace`, branch `qb/feat-unified-workspace`. Source anchors were verified on 2026-10-16 at baseline `6363a7913b` plus the uncommitted B-2026-10-16-001 correction. Reread at dispatch; preserve concurrent owners' work.

## Global Constraints

Applicable main-plan constraints, copied verbatim:

- Never use an em dash (U+2014) in anything you write: code comments, docs, UI copy, commit messages. Use a comma, a full stop or a spaced hyphen.
- Run commands from the build worktree. In Git Bash, prefix each command with `cd "C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace" &&` because the shell's directory resets between calls.
- Tests: `vp test run <files>` from the package directory (`apps/server`, `apps/web`, `packages/contracts`, `packages/client-runtime`). Typecheck: `vp run typecheck` from the package directory. Never run repo-wide checks (`vp check`, `vp run -r test`, `vp run -r typecheck`).
- Never stage `pnpm-lock.yaml`. `vp i` rewrites it because develop's lockfile is stale; that churn is not part of this feature.
- Never start a dev server (subagents), never open a browser, never touch `~/.t3/userdata`, never set `VITE_HTTP_URL` or `VITE_WS_URL`, never kill a process found by name.
- Never use `--no-verify`, bare `git stash`, or `git add -A`/`git add .`. Stage the files your task names.
- Never open a pull request.
- Every task leaves `apps/server` typechecking. Tasks run one at a time, because they share `packages/contracts/src/rpc.ts`, `apps/server/src/ws.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/server.ts` and the capability list.
- New WS RPC families get their own handler layer in `ws.ts`, the way `mailWsRpcLayer` does, and never join the main `CoreWsRpcGroup.of({...})` object. That object sits near TypeScript's instantiation limit (197 handlers; the limit is between 197 and 212), and past it the layer's requirements silently type as `any`, which surfaces as dozens of TS377030 errors in `server.ts` and `cli/`.
- Follow the nearest named precedent file. If an effect-smol API name in this plan differs from what the precedent uses, use the precedent's name without changing behaviour.
- Comments describe how a thing is used, mostly on functions. Match the comment density of the file you are editing.
- Copy rules from the spec: links are never dropped silently ("render as unavailable with the reason"); a message with no Message-ID "links by IMAP location and is marked as one that may break when moved"; linked content is "data, not instructions".

Applicable spec Non-goals, copied verbatim. These remain exclusions under A13:

- New React Native screens. Mobile is served through the web app this cycle.
- Drive sync and Drive writes.
- A people and organisation directory, CRM reconciliation or SOP library.

A13 also states, verbatim: "No Pulse project roles, people/organisation directory or implied access grants are approved." And: "Missing Board, Week, PR-open, editor, recording, compact and error-state designs require reviewed proposed states, not claims that the original PNGs specify them."

Additional binding constraints:

- No polling, readiness sleeps, continuous animations, shimmer, reminder jobs, task recurrence/dependencies or universal lane migration. Await persisted results, change-stream latches or worker drains. A single next-midnight client invalidation may refresh a Today label; it sends no RPC and is cancelled on zone change/unmount.
- Contracts belong in `packages/contracts`, with schemas and small derived helpers only, no heavy runtime logic. SQL, locks and transition policy stay in `WorkspaceTools`. Read `.repos/effect-smol/LLMS.md` and `docs/internals/effect-services.md` before server Effect work.
- Never touch `~/.t3/userdata`. Tests use disposable SQL/settings and fake external boundaries. Never set `VITE_HTTP_URL` or `VITE_WS_URL`.
- Run targeted tests only. Use `vp lint` with explicit changed source/test paths and each affected package's declared `vp run typecheck`. Root Taskfile.yml exposes upstream operations, not a workspace gate; the prescribed package commands apply. Do not run repo-wide checks.
- `WorkspaceToolsWsRpcGroup` and `workspaceToolsWsRpcLayer` already isolate this family. `rpc.ts:1769` includes `PulseWorkspaceToolsRpcs`, `index.ts:77` exports it, and `client.ts:67` already registers the change stream. Do not duplicate registrations.
- Keep legacy project list/upsert/config payloads valid. Omitted metadata preserves it; explicit null clears it. Legacy changed writes increment revision without erasing new fields. New clients still decode old-server responses.
- Gate new RPCs on live optional capability `workspaceTasksV2`. Before it exists, show `Tasks need a newer server.` Preserve the legacy project task path for servers advertising only `workspaceTools`.
- Bind queries, navigation, callbacks, caches and any drag endpoints to `EnvironmentId`. Browsing and structural ownership never create a graph link/read grant. Preserve shared item actions through menu, detail, palette, existing keybinding and touch.
- Never stage `docs/internals/pulse-next-migration.json` unless separately assigned. Never alter the correction baseline. Commit only explicit files. Implementer commits end with a Co-Authored-By line naming the model that made the commit; controller commits use the controller's attribution line.
- This file is a planning handoff. Future commit steps apply only to authorized implementation. This writing pass starts no server/browser/provider/network operation and stages or commits nothing.

## Merge Danger

**Door:** one-way

**Blast Radius:** environment

Forward task migrations affect all clients of an environment. Rollback retains migrated data and disables the new capability/UI; it never drops new columns or rewrites shipped migrations. Each UI-only task below is two-way.

## Review Focus

1. Completion disagrees with a custom Board lane. W5-T1 test `derives completion from the designated column and rejects stale moves` covers designation, repeat completion, deterministic reopen and stale writes. W5-T6 adds keyboard movement through the visible menu.
2. An old title save erases date or owner. W5-T2 test `preserves metadata on legacy upsert and clears only explicitly` and W5-T3 test `keeps owner identity across display-profile changes` cover omission, null and revision invalidation.
3. Page two repeats equal-date tasks or search filters only a loaded page. W5-T4 test `enumerates equal-date summaries beyond 200 without fanout` binds cursors to filters, environment instance and dataset generation. W5-T5a tests filter-before-page.
4. Checkbox or dirty editor updates the wrong environment. W5-T5a test `completes the captured row without opening it` and W5-T5b test `retains edits after conflict and keeps the captured environment` exercise user actions and durable results.
5. Tasks center forces the resource tab or compact mode mounts two bodies. W5-T7 test `preserves Files while Tasks opens and mounts one selected resource body` plus the two-registry subscription test cover project/tab independence and cross-client refresh.

## Rendered look reference

### V1 capture and comparison

Every visual claim requires W4-T7 readiness. Use its disposable fake state, fixed `2026-10-13T10:30:00+02:00`, Africa/Johannesburg, en-GB, dark theme, 1280x 800 CSS viewport, scale 1, zoom 100%, Segoe UI on Windows with system-ui fallback. Record resolved font/OS. A changed font/host requires a reviewed rebaseline. Light theme is separate smoke.

Recipe 03: `/workspace?space=tasks&view=all&project=fixture-synkek&fixture=03`, project-scoped Project tasks, center project and resource project fixture-synkek, Files selected. The rail selection is All tasks within that project; global All tasks uses view=all with project omitted, not the 03 capture scope. Recipe 08: `/workspace?space=calendar&fixture=08`, Agenda, T13, same five tasks/project, Tasks selected. These selectors are W4-T7 dev/test-only routes, absent from production. Reset fake state per capture, clear hover/focus, await persisted result/change receipt and settled query. Keep the sample marker. No real credentials, providers or live data. W5-T5a and W5-T7 own W4-T7's existing `components/workspace/dev/tasksMockupModule.tsx` in sequence. It exports `createWorkspaceMockupModule: CreateWorkspaceMockupModule`; T5a sets readyRegions to ["center"] for 03, and T7 adds "resource" for 08. Use session.seed.tasks and session.clock directly; no separate fixture file or registration API.

Compare side-by-side crops plus an overlay/difference. Boundaries, insets, row pitch and controls must be within 2 CSS px, type sizes within 1 px, with matching copy, icon type/order, wrap/truncation and selected state. Exclude text antialiasing from geometry, not whole controls. Record D03/D25 corrections in the capture manifest. Service behavior needs its own tests.

### Palette and frame

Reference estimates: main `#090a0a`, navigation `#070808`, rail/resources `#101111`, controls `#151616`, neutral selection `#202121`, separator `#1b1d1e`, text `#f0f1f2`, muted `#85898e`, blue `#3269f4`, avatar `#101d36`. Use Wave 4 semantic tokens and existing `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border` classes. Hex values are measurement references, not a second production palette. No prominent shadow or animation is pictured.

Wave 4 owns sidebar `[0,0,207,800]`, rail container `[207,26,52,774]`, breadcrumb `[207,0,1073,26]`, header `[259,26,681,52]`, Resources `[940,26,340,774]`, selector, tabs and footer. W5 supplies rail content and wide Tasks body without a vacant list/detail column. Center insets give x 275..923; resource insets give x 953..1267.

### PNG03 Tasks rail and center

| Element          | Pixel box/baseline                           | Look, exact copy and states                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rail active      | `[215,38,35,27]`, label center 233/74        | Navy capsule radius 16, blue 13 px ListTodo; `All tasks`,9 px semibold white. No badge.                                                                                                                                                                                                                                        |
| Other filters    | icon centers 233/104,233/156; labels 126/178 | Muted 13 px Clock 3 and Check; `Open`, `Done`,9 px.52 px pitch. One selected state exposed accessibly.                                                                                                                                                                                                                         |
| Header content   | title 275/45, subtitle 275/63                | `Tasks`,13 px semibold; `A clear plan for everything that comes next.`,10 px muted. W4 supplies Resources/avatar.                                                                                                                                                                                                              |
| Heading/subtitle | `[275,97,540,39]`                            | `Project tasks`,15 px semibold at 106; `4 open · SynKEK`,10 px muted at 128. Only center open-count label. Actual global scope uses `All tasks` and true filtered open total.                                                                                                                                                  |
| Board            | `[863,101,60,24]`                            | LayoutGrid 12 px 2x 2 outline then `Board`,11 px semibold,4 px gap. Dark fill,1 px hairline,radius 7. Never Columns 2/PanelsTopLeft.                                                                                                                                                                                           |
| Search/filter    | `[275,150,648,29]`                           | Radius 15, Search 12 px at 286, `Search tasks`10 px muted; separate SlidersHorizontal button at 909. No new create button in resting fixture.                                                                                                                                                                                  |
| Rows             | `[275,191,648,295]`                          | Five 59 px rows, subtle bottom hairlines, no header/card border. Checkbox x 279,12x 12; text x 301; date right 891; owner x 901. Flexible text shrinks before trailing controls.                                                                                                                                               |
| Titles           | baselines 216,275,334,393,452                | 12 px regular white. Last muted/struck. Strike title only.                                                                                                                                                                                                                                                                     |
| Metadata         | baselines 234,293,352,411,470                | 10 px muted `SynKEK · Marketing` or `SynKEK · Website`, plain text, no badges.                                                                                                                                                                                                                                                 |
| Checkbox         | centers 220,279,338,397,456                  | Gray square radius 1-2,1 px border; last blue/white Check. Larger invisible target. Sibling title button, never nested interactive controls.                                                                                                                                                                                   |
| Date/owner       | owner `[901,211,19,19]` then 59 px pitch     | Date 10 px,58 px reserve; owner 32 px budget,19 px navy circle,8 px semibold blue initials. Use size-[19px] shrink-0 rounded-full bg-primary/15 text-[8px] font-semibold text-primary ring-1 ring-background. Single row owners do not overlap; multi-person stacks use -space-x-1 for 15 px steps. Accessible full date/name. |
| Sample footer    | `[275,499,648,24]`,baseline 513              | `Shared statuses · One accountable owner · Project followers`,10 px muted. Live default omits ` · Project followers` under D06. No inert follow control.                                                                                                                                                                       |

Exact fixture records, in this order, with only the final task completed:

| Title                           | Area      | dueOn      | Date copy | Initials |
| ------------------------------- | --------- | ---------- | --------- | -------- |
| Approve homepage copy           | Marketing | 2026-10-13 | Today     | MC       |
| Review October keyword plan     | Website   | 2026-10-16 | 16 Oct    | LM       |
| Prepare product launch assets   | Marketing | 2026-10-16 | 16 Oct    | NP       |
| Publish campaign landing page   | Website   | 2026-10-16 | 16 Oct    | AM       |
| Share weekly performance report | Marketing | 2026-10-16 | 16 Oct    | MC       |

MC/LM/NP/AM are fixture presentation values, never production assignee IDs.

### PNG08 Tasks resource body

| Element              | Pixel box/baseline            | Look, exact copy and states                                                                                                                                          |
| -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks tile, W4-owned | `[1112,85,52,43]`             | Blue ListTodo and 9 px `Tasks`,radius 13. Preserve Files/Browser/Agents/Tasks/Docs/PRs order.                                                                        |
| Heading/subtitle     | `[953,149,314,36]`            | `Project tasks`,13 px semibold at 158; `SynKEK · 4 open`,10 px muted at 179. Subtitle order differs from center. No card border.                                     |
| Rows                 | `[953,197,314,291]`           | Five 59 px rows; separators 252,311,370,429,488. Checkbox x 957 centers 223,282,341,400,459. Titles x 979 baselines 219,278,337,396,455,11 px; metadata 10 px below. |
| Date/owner           | date right 1237,avatar x 1245 | Today then four 16 Oct;19 px navy circles/8 px initials. Reserve trailing columns before truncating text. Full title accessible. Same records/order/state as 03.     |
| Resting controls     | within `[953,149,314,339]`    | No search, Board, create or collaboration footer. Real additional pages get Load more below the rows.                                                                |

Calendar center belongs to Wave 6, including Schedule, dates, Video icons and events. Files body in 03 belongs to Wave 7. Do not force Tasks tab on central Tasks entry. Do not make these modules prerequisites for W5 service work.

### Proposed and live states

Filter popup, project picker, editor/create, Board, empty/error/read-only/old-server and compact states need separately reviewed proposed captures. Neither PNG specifies their full design.

Quiet hover fill, existing focus ring, static loading text, and affected-control pending states apply. Exact fallback copy: `No tasks yet.`, `No matching tasks.`, `Clear filters`, `Tasks need a newer server.`, `Choose a project to see its tasks.`, `This task is unavailable. Its links have been kept.` Failed writes retain confirmed state and draft. Announce saving/errors. No offline write queue.

Proposed Board shares heading/search, uses reversible `List` toggle, configured ordered lanes/empty lanes/counts, and project groups for global scope. Keyboard/touch `Move to column` comes first. Drag is optional, outside minimum delivery. Detail is an inline pane on wide Tasks and a Back-returning pane/sheet on phone, preserving originating calendar/date/resource choice.

At 390 px use W4's one pane plus Resources sheet;44 px targets, readable title/date, wrapping metadata, no page overflow. At 1024 px use its intermediate container. Preserve query/view/pages/scroll/focus/dirty draft through detail/Back. At 1280 restore original bounds.

Consume Wave 4 substitutions: sample Pulse Next/Office/Code/Office group; live Pulse Code/Workspace/Code/Workspace group. Breadcrumb uses actual environment name, fallback Workspace. Hide sample marker live. Header MC becomes configured owner initials/name, hidden unset. Footer uses only known health, `Connected`, `Unavailable`, or neutral `Connection status unavailable`; gear opens captured project settings. Files sentence defaults `Files stay in Google Drive.` W5 does not reproduce this chrome.

Allowed W5 live substitutions: actual project/task titles, dates/area, exact filtered open total, configured owner initials or Me/Unassigned, and no followers promise. No fixture coworkers, collaborator counts or provider grants live.

## Interfaces and serialization

Keep exactly one WorkspaceResourceBody instance. It may stay mounted while CSS-hidden under Linked context or compact layouts. While hidden it starts no timers, polling or animations, and portaled UI must respect the hidden state.

Wave 4's "Canonical seams for Waves 5-11" section freezes these exports and paths, all under apps/web/src/components/workspace unless stated otherwise. Reuse them exactly; a mismatch at dispatch is a dependency defect, not permission to invent another shell API.

| Producer  | Named interface and path                                                                                                           | W5 consumption                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W4-T0     | B-2026-10-16-001                                                                                                                   | Committed baseline SHA and correction tests.                                                                                                                                           |
| W4-T1     | workspaceNavigation.ts: WorkspaceSearch, parseWorkspaceSearch, workspaceViews                                                      | view all/open/done is the single status rail key. Project scopes the same view; taskLayout list/board and bounded filters are independent axes.                                        |
| W4-T2     | WorkspaceViewRail.tsx: WorkspaceRailItem, workspaceRailItems                                                                       | Shell renders data-driven task entries and selected view. T5a clears their unavailableReason under the registry slot; no ReactNode rail prop.                                          |
| W4-T3     | WorkspaceHeader.tsx: WorkspaceHeaderModel; WorkspaceEngagement.tsx                                                                 | Pass header: WorkspaceHeaderModel through WorkspaceEngagement.header, layout="full" and children. Render no second module header or breadcrumb.                                        |
| W4-T4a    | WorkspaceResourceBody.tsx: WorkspaceResourceBodyProps; workspaceResourceState.ts: WorkspaceResourcesContext, useWorkspaceResources | T7 replaces only the Tasks case. Props include environmentId, projectId, selectedItem: WorkspaceLinkEndpoint or null, request: WorkspaceItemRef or null, onOpen. No local body switch. |
| W4-T4b/T5 | Linked context, WorkspaceItemActions, WorkspaceItemMenu                                                                            | Captured task endpoint/environment; structural owner separately from graph links; palette/keybinding/touch paths.                                                                      |
| W4-T6     | WorkspaceEngagement compact shell                                                                                                  | One pane/sheet, retained project/tab, single mount on resize.                                                                                                                          |
| W4-T7     | dev/workspaceMockupFixtures.ts: CreateWorkspaceMockupModule, WorkspaceMockupSession; dev/tasksMockupModule.tsx                     | Existing adapter consumes typed seed and clock, supplies actual pure presentation with fake reads/commands and reports readyRegions.                                                   |

Produced schema/type names in `pulseWorkspaceTools.ts`, with Effect types inferred from `.Type`:

- `WorkspaceTaskTransition`: `{ id: WorkspaceTaskId; expectedRevision: number; change: { type: "completion"; completed: boolean } | { type: "column"; column: string } }`.
- Existing `WorkspaceTask` gains optional-key revision/done/dueOn/areaLabel/owner. New server responses always populate them; old response decoding still works. Owner is `"environment-owner" | null`. `WorkspaceTaskSummary` requires those fields and adds projectTitle.
- Existing `WorkspaceProjectConfig` gains optional-key `completedColumn: string | null` and revision. `WorkspaceProjectConfigSave` accepts old fields plus optional expectedRevision/completedColumn/confirmCompletionChanges. Designation changes require revision and affected-count confirmation; old saves preserve designation.
- `WorkspaceTaskPatch`: `{ id; expectedRevision; title?: string; column?: string; dueOn?: string | null; areaLabel?: string | null; owner?: "environment-owner" | null }`. A combined edit is one transaction; column uses the same transition policy. Never submit a stale full-task spread.
- `WorkspaceTaskQuery`: `{ projectId?: ProjectId; state?: "all" | "open" | "done"; text?: string; dueFrom?: string; dueTo?: string; owner?: "all" | "environment-owner" | "unassigned"; limit?: number; cursor?: string }`. Default 50,max 100.
- `WorkspaceTaskPage`: `{ tasks: readonly WorkspaceTaskSummary[]; openTotal: number; total: number; nextCursor: string | null; projects: readonly WorkspaceProjectConfig[]; laneTotals: readonly { projectId: ProjectId; column: string; total: number }[] }`. Counts cover all matches. Project configs/lane totals are bounded to this page's projects plus explicitly scoped project even empty. No hidden all-project config fetch.
- Method keys workspaceTransitionTask/workspacePatchTask/workspaceQueryTasks map to pulse.workspace.transitionTask/patchTask/queryTasks. Service methods transitionTask/patchTask/queryTasks live on WorkspaceTools, using WorkspaceToolsError. Atom commands/query share current scheduler/change subscription.
- ServerSettings adds workspaceDisplayTimeZone string or null and workspaceOwnerProfile `{ displayName: string; initials: string } | null`, with old-settings decode defaults. Effective server timezone is materialized once from host; profile grants no authorization.
- Web components TasksSpace, TasksSpaceView, WorkspaceTaskRow, WorkspaceTaskEditor, TaskBoard, ProjectTasksResource and ProjectTasksResourceView. Task rail data lives only in workspaceRailItems; no TasksNav component. Row has density `"list" | "resource"` and captures EnvironmentId; it never resolves resource project.

Serial chains: ProjectTasks.tsx W4-T5 -> W5-T1 -> W5-T2 -> W5-T3 -> W5-T4 (config) -> W7-T1 -> W8-T1a -> W5-T5b -> W5-T7. Body switch W4-T4a -> W5-T7 -> W6-T8 -> W7-T3 -> W8-T3a -> W8-T7 -> W8-T8 -> W10-T1 -> W10-T4, with admitted-task splicing. Docs gates by wave number, admitted only: W4-T6 -> W5-T7 -> W6-T9 -> W7-T3 -> W8-T8 -> W9-T8 -> W10-T4 -> W11-T7. Parser/rail registry W4-T1/T2 -> W4-T6 where applicable -> W5-T5a -> W6-T4 -> W6-T5 -> W11-T3; splice other admitted extensions before dispatch. RPC/migrations W5-T1 -> T2 -> T3 -> T4; row/UI W5-T5a -> T5b -> T6 -> T7. Cross-wave config W5-T4 -> W7-T1 -> W8-T1a. Acquire global RPC/migration/context slot before touching registrations/ws/auth/server/settings; UI ownership is exclusive per file. Release slots during decision/capture waits. T5a waits for W4-T6; service tasks do not.

Allocate each forward migration number only while holding its slot. From repo root, compute exact file path and retain that variable for its commit:

```powershell
$nextMigrationId = 1 + ((Get-ChildItem -LiteralPath apps/server/src/persistence/Migrations -File |
  Where-Object Name -Match '^\d+_' |
  ForEach-Object { [int]($_.Name.Split('_')[0]) } | Measure-Object -Maximum).Maximum)
$completionMigration = 'apps/server/src/persistence/Migrations/{0:D3}_WorkspaceTaskCompletion.ts' -f $nextMigrationId
```

Later tasks rerun this allocation with `$metadataMigration`/WorkspaceTaskMetadata.ts, `$ownerMigration`/WorkspaceTaskOwner.ts, `$queryMigration`/WorkspaceTaskQuery.ts. These are resolved exact paths, not reserved 065-068. Register static import/entry following M064. Migration tests have stable filenames below. Never rewrite 064.

## Tasks

### Task W5-T1: Completion semantics and revision-safe moves

**Files:**

- Modify `packages/contracts/src/pulseWorkspaceTools.ts:7-29,44-96`; create `packages/contracts/src/pulseWorkspaceTools.test.ts`.
- Modify `apps/server/src/workspace/WorkspaceTools.ts:17-175`, `WorkspaceTools.test.ts:1-84` in that directory; allocate `$completionMigration`, modify `apps/server/src/persistence/Migrations.ts:1-17,82-155`; create `apps/server/src/persistence/WorkspaceTaskMigrations.test.ts`. Read-only precedent `Migrations/064_WorkspaceTools.ts:1-10`.
- Modify `apps/server/src/ws.ts:1240-1256`, `apps/server/src/auth/RpcAuthorization.ts:30-38`, `RpcAuthorization.test.ts:20-67`; `packages/client-runtime/src/state/workspaceTools.ts:11-72` and its test `:1-113`.
- Modify `packages/contracts/src/server.ts` to decode optional pulseCapabilities.workspaceTasksV2 and `apps/web/src/components/workspace/mail/useMailCapabilities.ts:22-40` to expose its live-only boolean now; advertisement remains T4-owned.
- Modify `apps/web/src/components/workspace/ProjectTasks.tsx:34-142` and its test `:1-101` for completed-column designation, preserving Browser setting. Read live pulseCapabilities.workspaceTasksV2 before any new controls or RPC; absent/false/cached-only capability retains the existing upsert/config editor and hides new designation/completion/metadata controls. T1-T3 retain that guard before T4 publishes the aggregate capability.

**Interfaces:** Consumes WorkspaceTools, keyed serial executor, task identity, separate WS family and changes. Produces WorkspaceTaskTransition, WorkspaceProjectConfigSave, transitionTask and revision-aware config/task responses. Old config/upsert remain valid. Publish aggregate workspaceTasksV2 only after T4.

**Depends on:** W4-T0; W4-T5 must release ProjectTasks.tsx before T1 takes that file. **Serial slot:** global RPC/migrations and the canonical ProjectTasks.tsx chain above. Backend work does not require a rendered shell. **blast_radius:** environment. **door:** one-way.

- [ ] Add this red test in WorkspaceTools.test.ts, which already defines seedWorkspaceProject and layer. Add WorkspaceTaskId import for branded IDs where required by the new schema.

```ts
it.effect("derives completion from the designated column and rejects stale moves", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const created = yield* tools.upsertTask({ projectId, title: "Review launch", column: "To do" });
    const done = yield* tools.transitionTask({
      id: created.id,
      expectedRevision: created.revision!,
      change: { type: "completion", completed: true },
    });
    expect(done.column).toBe("Done");
    expect(done.done).toBe(true);
    const repeated = yield* tools.transitionTask({
      id: created.id,
      expectedRevision: created.revision!,
      change: { type: "completion", completed: true },
    });
    expect(repeated.revision).toBe(done.revision);
    const stale = yield* tools
      .transitionTask({
        id: created.id,
        expectedRevision: created.revision!,
        change: { type: "column", column: "In progress" },
      })
      .pipe(Effect.flip);
    expect(stale.kind).toBe("conflict");
    const reopened = yield* tools.transitionTask({
      id: created.id,
      expectedRevision: done.revision!,
      change: { type: "completion", completed: false },
    });
    expect(reopened.column).toBe("To do");
    expect(reopened.done).toBe(false);
  }).pipe(Effect.provide(layer)),
);
```

- [ ] Add contract tests decoding old four-field task, three-field config and upsert; reject negative revision and invalid transition unions. Migration tests create pre-upgrade tables: missing config gets default Done; exact default columns get Done; custom `["Backlog","Done"]` stays undesignated. Test custom completion choice, at least one open lane, used-column protection, affected-count confirmation and immutable project ownership.
- [ ] From apps/server run `vp test run src/workspace/WorkspaceTools.test.ts src/persistence/WorkspaceTaskMigrations.test.ts`; from packages/contracts run `vp test run src/pulseWorkspaceTools.test.ts`. Expected red: missing transitionTask/new schemas or failed migration assertions, not unrelated setup failure.
- [ ] Allocate/register the completion migration. Its body follows the current Effect SQL idiom:

```ts
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE workspace_tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE workspace_project_config ADD COLUMN completed_column TEXT`;
  yield* sql`ALTER TABLE workspace_project_config ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`;
  yield* sql`UPDATE workspace_project_config SET completed_column='Done'
    WHERE json(columns_json)=json('["To do","In progress","Done"]')`;
});
```

- [ ] Add transition schema with existing Column/NonNegativeInt, Schema.Union and literal type tags. Added response fields use optionalKey so old-server decoding survives. config() distinguishes no row from a custom row with null designation. No row returns default columns/Done/revision 0; custom null stays null. Every task read derives `done = completedColumn !== null && column === completedColumn`.
- [ ] Implement transition under the existing project lock and SQL transaction. Resolve project from ID, then reread current task/config inside the lock. Reject unavailable project/task and unconfigured targets. An already-satisfied desired transition returns current without revision/announcement. Otherwise enforce expectedRevision. Reopen selects first configured non-completed column. This is the core inside the lock, with current/settings supplied by those reads:

```ts
const target =
  input.change.type === "column"
    ? input.change.column
    : input.change.completed
      ? settings.completedColumn
      : settings.taskColumns.find((name) => name !== settings.completedColumn);
if (!target || !settings.taskColumns.includes(target))
  return yield * fail("invalid-input", "Choose a completed column in project workspace settings.");
if (current.column === target) return current;
if (current.revision !== input.expectedRevision)
  return yield * fail("conflict", "This task changed on another client. Reload before saving.");
yield *
  sql`UPDATE workspace_tasks SET column_name=${target},revision=revision+1
  WHERE id=${input.id} AND deleted=0 AND revision=${input.expectedRevision}`;
return yield * getTask(input.id);
```

Require designated completion for checkbox requests, including reopen; a column move still works before designation. Announce once after transaction commit, before releasing lock; none on rollback/no-op. Legacy changed upsert increments revision and touches only title/column. Exact stable-ID retry returns unchanged existing task. Delete increments revision and retains tombstone/links; no resurrection.

- [ ] Extend saveConfig under project lock. Omitted designation preserves it. Explicit designation change requires expectedRevision; validate member/open lane and count tasks whose derived completion changes. Conflict message includes affected count until confirmCompletionChanges true. Recheck revision/count on confirmation. Bump config revision and affected task revisions atomically. Old Browser-only saves preserve new fields. Add `Completed column`, `Not designated`, affected-count confirmation/Cancel in settings, outside resting PNG.
- [ ] Add ProjectTasks.test.tsx coverage with workspaceTools true and workspaceTasksV2 absent/false/cached-only: legacy upsert/config works and no new task method is called. Capability projection is introduced here before any new control; T4 advertises it only after all methods exist.
- [ ] Wire `[WS_METHODS.workspaceTransitionTask]: tools.transitionTask` in the existing family and map operate scope. Add its atom command using existing scheduler/concurrency. Extend RpcTest authorization cases for denied read-only write and allowed operate write. Extend existing atom fixture with two registries and a SubscriptionRef/Latch: publish after persisted transition; latch opens only when second registry sees new revision. No sleeps/polling.
- [ ] Rerun red commands; apps/server `vp test run src/auth/RpcAuthorization.test.ts`; packages/client-runtime `vp test run src/state/workspaceTools.test.ts`; apps/web `vp test run src/components/workspace/ProjectTasks.test.tsx`. Expected green for legacy/config/migration/stale/idempotent/subscription cases. Run targeted lint on this task's modified paths and affected-package typechecks, including server.
- [ ] Surface checklist: settings and existing task UI share service; web/desktop/phone expose designation/Cancel; RN gets additive decode compatibility only. Codex, Claude, Cursor, Grok, OpenCode and configured ACP retain current task linked-reader identity, no new autonomous mutation tool. Contracts additive. Complete/reopen and designation/clear are reversible. Local/direct/relay/tunnel share authenticated service; environments have separate locks/counters. W5-T7 updates user docs.
- [ ] Visual acceptance after W4-T7:03 `[275,191,648,295]`,08 `[953,197,314,291]`, inventory 43-49,89-100. Only final task checked/struck, four open in both, completion/reopen changes same record, no new resting controls. V1 applies. Live substitutions: real title/state, D05 owner, W4 chrome. Review proposed designation confirmation separately.
- [ ] Commit explicit files plus resolved migration:

```powershell
git add -- packages/contracts/src/server.ts apps/web/src/components/workspace/mail/useMailCapabilities.ts packages/contracts/src/pulseWorkspaceTools.ts packages/contracts/src/pulseWorkspaceTools.test.ts apps/server/src/workspace/WorkspaceTools.ts apps/server/src/workspace/WorkspaceTools.test.ts apps/server/src/persistence/Migrations.ts $completionMigration apps/server/src/persistence/WorkspaceTaskMigrations.test.ts apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts packages/client-runtime/src/state/workspaceTools.ts packages/client-runtime/src/state/workspaceTools.test.ts apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/ProjectTasks.test.tsx
git commit -m "feat(workspace): add revision-safe task completion"
```

### Task W5-T2: Date-only due dates, area and display timezone

**Files:** Modify `packages/contracts/src/pulseWorkspaceTools.ts:16-29,44-96` and test created T1; `apps/server/src/workspace/WorkspaceTools.ts:24-163` and test; allocate `$metadataMigration`, register `Migrations.ts:1-155`, extend WorkspaceTaskMigrations.test.ts; `apps/server/src/ws.ts:1240-1256`, `auth/RpcAuthorization.ts:30-38` and test; `packages/client-runtime/src/state/workspaceTools.ts:29-72`; `apps/web/src/components/workspace/ProjectTasks.tsx:263-353` and test. Modify `packages/contracts/src/settings.ts:1196-1205,1576-1600` and `settings.test.ts:1-30`, `apps/server/src/serverSettings.ts:713-805` and its test fixture `:1-65`, `apps/web/src/components/settings/SettingsPanels.tsx:2166-2240`. Create `packages/client-runtime/src/state/workspaceTaskDates.ts` and `.test.ts`, export subpath in `packages/client-runtime/package.json`; create web `components/workspace/WorkspaceDisplaySettings.tsx` and `.test.tsx`.

**Interfaces:** Consumes revisions/transitions and ServerSettingsService `serverSettings.ts:242-280`, existing scoped settings update/config subscription. Produces WorkspaceTaskDueOn, WorkspaceTaskPatch, workspacePatchTask, patchTask, workspaceDisplayTimeZone and `formatWorkspaceTaskDueOn(dueOn, now, timeZone, locale)` returning `{ label, fullDate, overdue } | null`. No new settings store/RPC.

**Depends on:** W5-T1. **Serial slot:** predecessor T1, global RPC/migrations/settings and ProjectTasks.tsx. **blast_radius:** environment. **door:** one-way.

- [ ] Add this red service test using existing seed/layer:

```ts
it.effect("preserves metadata on legacy upsert and clears only explicitly", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const task = yield* tools.upsertTask({ projectId, title: "Launch", column: "To do" });
    const dated = yield* tools.patchTask({
      id: task.id,
      expectedRevision: task.revision!,
      dueOn: "2026-10-16",
      areaLabel: "Marketing",
    });
    const legacy = yield* tools.upsertTask({
      id: task.id,
      projectId,
      title: "Launch review",
      column: "To do",
    });
    expect(legacy.dueOn).toBe("2026-10-16");
    expect(legacy.areaLabel).toBe("Marketing");
    expect(legacy.revision).toBeGreaterThan(dated.revision!);
    const cleared = yield* tools.patchTask({
      id: task.id,
      expectedRevision: legacy.revision!,
      dueOn: null,
      areaLabel: null,
    });
    expect(cleared.dueOn).toBeNull();
    const restarted = yield* Tools.make;
    expect((yield* restarted.getTask(task.id)).areaLabel).toBeNull();
  }).pipe(Effect.provide(layer)),
);
```

- [ ] Contract tests accept 2024-02-29; reject 2026-02-29,2026-02-30,month 00,year 0000,timestamps. Omitted patch keys remain absent; null clear succeeds. Formatter tests inject instants on both sides of Johannesburg midnight and New York DST changes, current/different year and null date. Stored dueOn never shifts. Settings tests reopen disposable settings after host-zone change; saved explicit zone wins.
- [ ] Run apps/server `vp test run src/workspace/WorkspaceTools.test.ts src/persistence/WorkspaceTaskMigrations.test.ts`; packages/contracts `vp test run src/pulseWorkspaceTools.test.ts src/settings.test.ts`; packages/client-runtime `vp test run src/state/workspaceTaskDates.test.ts`. Expected red: missing patch/date fields/formatter.
- [ ] Migration adds nullable due_on/area_label. Update all read projections and new insert responses. Use this small schema predicate, not UTC midnight storage:

```ts
const isGregorianDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
};
export const WorkspaceTaskDueOn = Schema.String.check(Schema.makeFilter(isGregorianDate));
```

Area is trimmed 1-120 characters or explicit null; editor blank becomes null. Invalid dates fail validation. Add patch schema optional keys and operate scope/thin handler/serial atom command. Also add optional dueOn/areaLabel fields to WorkspaceTaskUpsert for atomic creation. Existing clients still send the old shape. On insertion use supplied metadata, default null; on update preserve omitted keys. Add a service test creating all metadata in one acknowledged upsert so T5b never needs create-then-patch. Within the project lock/revision transaction merge presence explicitly:

```ts
const dueOn = input.dueOn === undefined ? current.dueOn : input.dueOn;
const areaLabel =
  input.areaLabel === undefined ? current.areaLabel : (input.areaLabel?.trim() ?? null);
```

Apply title/column/metadata together, validating column via T1; increment once only on change, announce after commit. Old upsert does not write metadata on update. No calendar event/scheduler row.

- [ ] Add workspaceDisplayTimeZone to ServerSettings with decoding default null; patch accepts validated IANA string or null reset. Schema filter uses Intl.DateTimeFormat try/catch. On trusted settings load/reset resolve host `Intl.DateTimeFormat().resolvedOptions().timeZone`, fallback UTC, materialize/persist once through existing atomic settings write. Never rewrite malformed settings. Never choose phone/browser timezone. Existing `applyServerSettingsPatch` spreads ordinary fields; no new settings merge framework is needed.
- [ ] Mount WorkspaceDisplaySettings inside GeneralSettingsPanel for one selected environment only, using existing useSettingsScope/useScopedSettings/useUpdateScopedSettings. Label `Workspace timezone`; show IANA value, Save/Reset/error, disable without operate/live support. No project override or multi-environment fanout. Current scopedSettings.ts:39 derives server keys from schema fields. Existing server-config subscription distributes zone edits.
- [ ] Formatter obtains today with Intl formatToParts in supplied zone and compares canonical strings. Other dates format as civil dates with timeZone UTC, preserving the day; include year when different from display year. Full date/overdue meaning is accessible, null means no invented date. Add one next-midnight local label invalidation and resume/zone-change refresh, no RPC timer and no coupling to selected Calendar date.
- [ ] Existing editor gains due/area via patch and expected revision. Keep dirty input on subscription refresh; T5b later extracts it. Test clears/failure/conflict and timezone read-only settings. Rerun red commands plus apps/server `vp test run src/serverSettings.test.ts src/auth/RpcAuthorization.test.ts` and apps/web `vp test run src/components/workspace/ProjectTasks.test.tsx src/components/workspace/WorkspaceDisplaySettings.test.tsx`. Expected green; targeted lint and affected-package typechecks including server.
- [ ] Surface checklist: settings/task detail/future resource share patch/formatter. Web/desktop/phone use one environment zone; RN additive fields decode. All configured providers retain linked task reads; due date starts no agent/job. Set/clear/reset reverse states. Local/direct/relay/tunnel and environment isolation use existing settings authority. T7 documents date-only meaning/timezone.
- [ ] Visual acceptance after W4-T7:03 `[301,207,619,264]`,08 `[979,210,288,265]`, inventory 45-48,97-100. Today first then 16 Oct, area lines and right alignment, V1. Live substitutions: real dueOn/area/zone and W4 chrome. Review editor/settings separately.
- [ ] Commit only:

```powershell
git add -- packages/contracts/src/pulseWorkspaceTools.ts packages/contracts/src/pulseWorkspaceTools.test.ts packages/contracts/src/settings.ts packages/contracts/src/settings.test.ts apps/server/src/workspace/WorkspaceTools.ts apps/server/src/workspace/WorkspaceTools.test.ts apps/server/src/persistence/Migrations.ts $metadataMigration apps/server/src/persistence/WorkspaceTaskMigrations.test.ts apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts apps/server/src/serverSettings.ts apps/server/src/serverSettings.test.ts packages/client-runtime/src/state/workspaceTools.ts packages/client-runtime/src/state/workspaceTaskDates.ts packages/client-runtime/src/state/workspaceTaskDates.test.ts packages/client-runtime/package.json apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/ProjectTasks.test.tsx apps/web/src/components/workspace/WorkspaceDisplaySettings.tsx apps/web/src/components/workspace/WorkspaceDisplaySettings.test.tsx apps/web/src/components/settings/SettingsPanels.tsx
git commit -m "feat(workspace): add date-only task metadata and timezone"
```

### Task W5-T3: Environment owner display profile

**Files:** Modify `packages/contracts/src/pulseWorkspaceTools.ts:16-29` and test, `packages/contracts/src/settings.ts:1196-1205,1576-1600` and test; `apps/server/src/workspace/WorkspaceTools.ts:130-154` and test; allocate `$ownerMigration`, register `Migrations.ts:1-155`, extend WorkspaceTaskMigrations.test.ts; `apps/web/src/components/workspace/ProjectTasks.tsx:263-353` and test; extend WorkspaceDisplaySettings.tsx/test from T2 and `apps/server/src/serverSettings.test.ts:1-65`. Read `packages/shared/src/serverSettings.ts:268-342` to retain existing field-merge semantics, no change required there. No second directory/store.

**Interfaces:** Consumes patchTask, ServerSettingsService and its config stream. Produces `WorkspaceTaskOwner = Schema.NullOr(Schema.Literal("environment-owner"))`, optional owner response/patch field and workspaceOwnerProfile setting. Task identity remains stable after display rename. Owner display is not an authenticated session identity.

**Depends on:** W5-T2. **Serial slot:** predecessor T2; global contract/migration/settings slot plus existing editor/display settings. **blast_radius:** environment. **door:** one-way.

- [ ] Add contract rejects for arbitrary coworker/provider IDs and bounded display profile. Add service red test for new default, clear/reassign and old-save preservation:

```ts
it.effect("defaults new tasks to owner and preserves explicit unassignment", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const task = yield* tools.upsertTask({ projectId, title: "Review", column: "To do" });
    expect(task.owner).toBe("environment-owner");
    const cleared = yield* tools.patchTask({
      id: task.id,
      expectedRevision: task.revision!,
      owner: null,
    });
    expect(cleared.owner).toBeNull();
    const legacy = yield* tools.upsertTask({
      id: task.id,
      projectId,
      title: "Review again",
      column: "To do",
    });
    expect(legacy.owner).toBeNull();
    const assigned = yield* tools.patchTask({
      id: task.id,
      expectedRevision: legacy.revision!,
      owner: "environment-owner",
    });
    expect(assigned.owner).toBe("environment-owner");
  }).pipe(Effect.provide(layer)),
);
```

- [ ] Add `keeps owner identity across display-profile changes` in serverSettings.test.ts using existing makeServerSettingsLayer fixture: update profile from Maya/MC to Alex/AL; the task owner literal/id and revision remain unchanged while two subscribed config clients receive the new profile. Use subscribeChanges acquired before read and Deferred, not the test layer's empty stream. Add migration seed before new migration, assert all legacy owner values null.
- [ ] Run packages/contracts `vp test run src/pulseWorkspaceTools.test.ts src/settings.test.ts`; apps/server `vp test run src/workspace/WorkspaceTools.test.ts src/persistence/WorkspaceTaskMigrations.test.ts src/serverSettings.test.ts`. Expected red: owner missing and new defaults absent.
- [ ] Migration adds nullable owner; legacy rows stay null. Add optional owner to WorkspaceTaskUpsert for atomic create, default environment-owner only when omitted on insertion. Existing-ID upsert preserves omitted owner; explicit null clears. Patch obeys the same presence/revision rules. Concrete migration/schema code:

```ts
yield *
  sql`ALTER TABLE workspace_tasks ADD COLUMN owner TEXT
  CHECK(owner IS NULL OR owner='environment-owner')`;
```

```ts
export const WorkspaceTaskOwner = Schema.NullOr(Schema.Literal("environment-owner"));
const owner =
  input.owner === undefined ? (existing ? existing.owner : "environment-owner") : input.owner;
```

The second expression belongs inside upsert after resolving existing task, not in contracts. Update getTask/list/upsert/patch responses. Do not derive owner from display name, logged-in client, provider attendee or connection roster.

- [ ] Add nullable workspaceOwnerProfile to ServerSettings with decoding default null and patch. Validate trimmed displayName 1-80 and initials 1-3 visible letters/digits, reject control characters. Since nested deepMerge would retain omitted keys, accept only complete profile object or null. No partial identity patch. Existing normal settings stream supplies display values; no task-row profile requests. Operate scope already protects serverUpdateSettings at RpcAuthorization.ts:150.
- [ ] Extend WorkspaceDisplaySettings with `Environment owner`, name/initials, Save/Clear. Copy explains display label only. Task editor select offers `Me` and `Unassigned`, default new Me, legacy Unassigned. Full accessible owner name comes from configured profile, fallback `Me`; unassigned uses muted UserRound/label without invented initials. Reserve 19 px circle geometry. Fixture-only coworkers stay in fake presentation mapping outside production schema. Add operate denial, reset and two-environment UI tests.
- [ ] Rerun red commands and apps/web `vp test run src/components/workspace/ProjectTasks.test.tsx src/components/workspace/WorkspaceDisplaySettings.test.tsx`; expected green. Targeted lint/typechecks for contracts/server/web; no new runtime registration is needed for ordinary settings fields.
- [ ] Surface checklist: task creation/detail/settings share owner model, web/desktop/phone see same label, RN can decode null/optional. No provider-specific assignee adapters for Codex/Claude/Cursor/Grok/OpenCode/ACP. Contract rejects external identities. Assign/unassign and profile save/clear work. All connection modes retain environment authorization, profile creates no read grant. T7 documents owner limitation.
- [ ] Visual acceptance after W4-T7:03 `[901,211,19,255]`,08 `[1245,213,19,255]`, inventory 48-51,97-100. Five aligned 19 px initials, fixture MC/LM/NP/AM/MC only marked. Live configured initials/Me/Unassigned plus W4 chrome, no directory/roles/followers. V1 applies; proposed profile editor reviewed separately.
- [ ] Commit only:

```powershell
git add -- packages/contracts/src/pulseWorkspaceTools.ts packages/contracts/src/pulseWorkspaceTools.test.ts packages/contracts/src/settings.ts packages/contracts/src/settings.test.ts apps/server/src/workspace/WorkspaceTools.ts apps/server/src/workspace/WorkspaceTools.test.ts apps/server/src/persistence/Migrations.ts $ownerMigration apps/server/src/persistence/WorkspaceTaskMigrations.test.ts apps/server/src/serverSettings.test.ts apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/ProjectTasks.test.tsx apps/web/src/components/workspace/WorkspaceDisplaySettings.tsx apps/web/src/components/workspace/WorkspaceDisplaySettings.test.tsx
git commit -m "feat(workspace): add environment owner task assignment"
```

### Task W5-T4: Paged all-task summaries and the open total

**Files:** Modify `packages/contracts/src/pulseWorkspaceTools.ts:44-96` and its new test; `packages/contracts/src/server.ts:603-632`; `apps/server/src/workspace/WorkspaceTools.ts:49-79,120-129` and its test; allocate `$queryMigration`, register `Migrations.ts:1-155`; `apps/server/src/ws.ts:1240-1256,2003-2020`, `apps/server/src/auth/RpcAuthorization.ts:30-38` and test; `packages/client-runtime/src/state/workspaceTools.ts:29-48` and test; `apps/web/src/components/workspace/mail/useMailCapabilities.ts:22-40`. Create `apps/server/src/workspace/WorkspaceTaskQuery.test.ts` and `WorkspaceTaskRpc.test.ts`. Read `packages/contracts/src/rpc.ts:1,1769`, `index.ts:77`, `packages/client-runtime/src/rpc/client.ts:49-70` without redundant registration edits.

**Interfaces:** Consumes task metadata, designated completion, live projects and existing environment stream. Produces WorkspaceTaskQuery/Page/Summary, queryTasks service/atom, workspaceQueryTasks RPC and optional `ServerConfig.pulseCapabilities.workspaceTasksV2`. Retains old listTasks, including its incomplete flag. Exposes server summary data to Wave 6's due-task projection through the same WorkspaceTools service, not another task store.

**Depends on:** W5-T2, W5-T3. **Serial slot:** predecessor T3; global RPC/migration slot. Release config ownership to W7-T1, then W8-T1a. **blast_radius:** environment. **door:** one-way.

- [ ] Create WorkspaceTaskQuery.test.ts using the same NodeCrypto/SqlitePersistenceMemory/Tools layer as WorkspaceTools.test.ts. Seed two active projects and one deleted project directly in disposable SQL; seed 250 tasks across the active projects, equal dueOn values and duplicate titles, plus a task on the deleted project. This is a concrete core test after seeding:

```ts
const seen: string[] = [];
let cursor: string | undefined;
for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
  const page = yield * tools.queryTasks({ state: "all", limit: 37, ...(cursor ? { cursor } : {}) });
  expect(page.tasks.length).toBeLessThanOrEqual(37);
  expect(page.total).toBe(250);
  expect(page.openTotal).toBe(200);
  seen.push(...page.tasks.map((task) => task.id));
  if (page.nextCursor === null) break;
  cursor = page.nextCursor;
}
expect(seen).toHaveLength(250);
expect(new Set(seen).size).toBe(250);
const filtered = yield * tools.queryTasks({ text: "keyword", state: "open", limit: 1 });
expect(filtered.total).toBe(1);
expect(filtered.tasks[0]?.title).toBe("Review keyword plan");
const first = yield * tools.queryTasks({ state: "all", limit: 1 });
expect(
  (
    yield *
    tools.queryTasks({ state: "done", limit: 1, cursor: first.nextCursor! }).pipe(Effect.flip)
  ).kind,
).toBe("invalid-input");
```

Define the seed deterministically: indices 0..249, every fifth in Done, one index 1 title Review keyword plan, others Review launch, IDs formed as wskt_00000000-0000-0000-0000-${index.toString(16).padStart(12,"0")}, decoded with WorkspaceTaskId, all due 2026-10-16. Assign alternating active project IDs. Use `sql.insert` as WorkspaceTools.test.ts:68 does. Add a deleted project's row with a different ID. Thus counts above are independently known, not recomputed from service output.

- [ ] Add cases for null-date ordering, literal `%`/`_` search, area/title/project search, owner and inclusive date bounds, invalid bounds, zero/missing project, Done with null designation, stable tie order, foreign-environment/restarted cursor, generation change and empty explicitly scoped project configs. Old list still reports incomplete at 201. Use public RPC test for read authorization/operate denial, and two separate SQL layers with same task IDs to prove isolation.
- [ ] Run apps/server `vp test run src/workspace/WorkspaceTaskQuery.test.ts src/workspace/WorkspaceTaskRpc.test.ts src/workspace/WorkspaceTools.test.ts`; packages/contracts `vp test run src/pulseWorkspaceTools.test.ts`. Expected red: missing query schemas/method. The task's test name is `enumerates equal-date summaries beyond 200 without fanout`.
- [ ] Define validated bounded query/page schemas. Normalize text trim/max 240, state all default, owner all default, limit 50/max 100, cursor max 8192; dates use T2 schema and dueFrom <= dueTo. Filter before LIMIT. Explicit null-date tasks do not match a date-bound filter. Project title search may join projection_projects, no per-row fetch.
- [ ] Add SQL indexes `(deleted,due_on,project_id,id)` and `(project_id,deleted,column_name,due_on,id)` in the forward migration; inspect EXPLAIN QUERY PLAN in a targeted test for project/date query. Do not claim an index makes arbitrary substring search indexed. Bounded summaries and lazy pages control response size.
- [ ] Implement one transaction per query with a task/project/config join, a filtered aggregate, and a bounded grouped lane/config read for represented projects. Use SQL parameter interpolation and `sql.and`/`sql.in` helpers from the installed SqlClient types; never interpolate raw user text into unsafe SQL. SQL shape for the base projection and completion is:

```sql
SELECT t.id,t.project_id AS projectId,p.title AS projectTitle,t.title,
       t.column_name AS "column",t.revision,t.due_on AS dueOn,t.area_label AS areaLabel,t.owner,
       CASE WHEN t.column_name=CASE WHEN c.project_id IS NULL THEN 'Done'
         ELSE c.completed_column END THEN 1 ELSE 0 END AS done
FROM workspace_tasks t
JOIN projection_projects p ON p.project_id=t.project_id AND p.deleted_at IS NULL
LEFT JOIN workspace_project_config c ON c.project_id=t.project_id
WHERE t.deleted=0
ORDER BY (t.due_on IS NULL),t.due_on,t.project_id,t.id
LIMIT :limitPlusOne
```

Append validated predicates before ORDER/LIMIT. Convert SQLite done integer to boolean. Use the same filtered relation for total/openTotal and lane totals. openTotal includes every active filter, including state; Done therefore has 0 open. Do not add rail counts or derive totals from loaded rows. Page configs/lane counts include only represented projects and explicit scope, capped by page size. For a global Board, load project groups as their task pages arrive, with honest Load more. Never promise all empty global projects.

- [ ] Implement keyset cursor from the exact sort tuple, normalized query fingerprint, per-service random instance token and change generation. Cursor schema parses bounded base 64url JSON; input is never SQL. Reject different filters, environment instance, malformed version and changed generation. Clients restart pagination after change rather than concatenate unstable pages. Sort ties include project/id. Same snapshot has no gaps/duplicates. One grouped count query supplies lanes; never call listTasks once per project.
- [ ] Add queryTasks atom family with existing changes refreshTrigger/staleTime. Mounting list/resource with same normalized environment/query shares it. Add request-count test: opening global Tasks sends one queryTasks and one shared change subscription, zero project listTasks calls. A change invalidates active queries; obsolete cursor pages clear before reload. Include two-environment late-response test and reconnect refresh using session generation, no polling.
- [ ] Extend existing family handler/auth read map. Advertise workspaceTasksV2 only now, after transition/patch/query are wired. Retain T1's live-only useMailCapabilities projection for this optional boolean; no new cached-capability shortcut. Test old ServerConfig decode and ensure absent/false capability sends no new methods. No new subscription tag is needed.
- [ ] Rerun red commands and apps/server `vp test run src/auth/RpcAuthorization.test.ts`; packages/client-runtime `vp test run src/state/workspaceTools.test.ts`; expected green including bounded query/request counts, scopes and isolation. Targeted lint/typechecks in contracts/server/runtime/web, including server's existing family inference.
- [ ] Surface checklist: list/resource/Board and future Calendar share server summaries; web/desktop/phone use typed RPC, RN old decode remains valid. Codex/Claude/Cursor/Grok/OpenCode/ACP retain existing exact-task reader, no all-task discovery read grant. Contracts additive, filtered queries reversible by clear, old project lists preserved. Test local/direct/relay/tunnel at fake transport boundary and environment isolation; physical remote proof remains at gate. T7 updates the 200-row user limitation.
- [ ] Visual acceptance after W4-T7:03 `[207,38,716,141]`, inventory 36-42. Unbadged All tasks/Open/Done; only `4 open · SynKEK` subtitle, search/filter data correct. V1; actual project/filtered open total and W4 chrome allowed live. Server task itself adds no new resting UI.
- [ ] Commit only:

```powershell
git add -- packages/contracts/src/pulseWorkspaceTools.ts packages/contracts/src/pulseWorkspaceTools.test.ts packages/contracts/src/server.ts apps/server/src/workspace/WorkspaceTools.ts apps/server/src/workspace/WorkspaceTools.test.ts apps/server/src/workspace/WorkspaceTaskQuery.test.ts apps/server/src/workspace/WorkspaceTaskRpc.test.ts apps/server/src/persistence/Migrations.ts $queryMigration apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts packages/client-runtime/src/state/workspaceTools.ts packages/client-runtime/src/state/workspaceTools.test.ts apps/web/src/components/workspace/mail/useMailCapabilities.ts
git commit -m "feat(workspace): query paged task summaries without project fanout"
```

### Task W5-T5a: Tasks list, status rail and scope filters

**Files:** Create `apps/web/src/components/workspace/TasksSpace.tsx`, `TasksSpaceView.tsx`, `WorkspaceTaskRow.tsx`, `TasksSpace.test.tsx`, `WorkspaceTaskRow.test.tsx`, `dev/tasksMockupModule.test.tsx`. Modify W4-T7's existing `dev/tasksMockupModule.tsx` and W4's `workspaceNavigation.ts`, `workspaceNavigation.test.ts`, `WorkspaceViewRail.tsx`, `WorkspaceNavigationView.test.tsx` under their serial slots. Modify `apps/web/src/routes/_chat.workspace.tsx:8-75`, `-_chat.workspace.test.ts:1-65`, `apps/web/src/components/CommandPalette.tsx` in the Wave 4 destination/action entries. Verified file length 3680; reread its final Wave 4 entries rather than claiming current tasks entries exist. Consume W4 components by names in Interfaces. No shell ownership transfer.

**Interfaces:** Consumes queryTasks, workspaceTasksV2, formatWorkspaceTaskDueOn, owner profile, WorkspaceSearch/parseWorkspaceSearch, WorkspaceEngagement with layout="full"/children/header: WorkspaceHeaderModel, workspaceRailItems and shared actions. Produces TasksSpace, pure TasksSpaceView, WorkspaceTaskRow and independent query URL fields `taskLayout`, `taskText`, `taskDueFrom`, `taskDueTo`, `taskOwner`; project/environment/item remain existing fields. Consume view all/open/done from W4; add no parallel status key. TasksSpaceView takes environmentId, projectId or null, view, taskLayout, normalized filters, page/status/error, ownerProfile/timeZone/now, selection/pending state and onOpen/onTransition/onFilter/onLoadMore/onLayout callbacks. TasksSpace binds real atoms to this pure view; the dev adapter imports only TasksSpaceView and shared pure row code.

**Depends on:** W5-T4, W4-T6. **Serial slot:** first row/UI unit, then T5b. Acquire ROUTES/CommandPalette slot after W4 owner releases. Adapter slot follows W4-T7 -> W5-T5a -> W5-T7. T5a publishes readyRegions: ["center"] for 03 only. **blast_radius:** client. **door:** two-way.

- [ ] Add the parser test to workspaceNavigation.test.ts using its canonical import; keep the route re-export integration case in -_chat.workspace.test.ts:

```ts
it("retains valid task scope and drops unknown filters", () => {
  expect(
    parseWorkspaceSearch({
      space: "tasks",
      environment: "remote",
      project: "p",
      view: "open",
      taskLayout: "list",
      taskText: "launch",
      taskOwner: "unassigned",
    }),
  ).toMatchObject({
    space: "tasks",
    environment: "remote",
    project: "p",
    view: "open",
    taskLayout: "list",
    taskText: "launch",
    taskOwner: "unassigned",
  });
  expect(
    parseWorkspaceSearch({ space: "tasks", view: "bad", taskOwner: "Maya" }),
  ).not.toHaveProperty("taskOwner");
});
```

- [ ] In WorkspaceTaskRow.test.tsx use React act/create and mock only the serial command boundary/session, following ProjectTasks.test.tsx's existing viable renderer. Export WorkspaceTaskRow with task/density/environmentId/onOpen/ownerProfile/now/timeZone/canOperate, completedColumn: string | null, workspaceTasksV2: boolean, pending and injected onTransition inputs. completedColumn is the configured completed-lane name, not a boolean; task.done is the completion boolean. Live containers bind useAtomCommand behind workspaceTasksV2; the pure row invokes the captured typed command. This matches its null check and project-config lookup. Test user-visible completion through returned confirmed data, not a static markup/prop snapshot. Concrete interaction core, after rendering the fixture with onOpen spy and command returning the updated task:

```tsx
const checkbox = renderer.root.findByProps({ "aria-label": "Complete Approve homepage copy" });
await act(async () => checkbox.props.onChange({ target: { checked: true } }));
expect(open).not.toHaveBeenCalled();
expect(command).toHaveBeenCalledWith({
  environmentId: EnvironmentId.make("remote"),
  input: {
    id: task.id,
    expectedRevision: task.revision,
    change: { type: "completion", completed: true },
  },
});
await act(async () =>
  renderer.root.findByProps({ "aria-label": "Open Approve homepage copy" }).props.onClick(),
);
expect(open).toHaveBeenCalledWith({ type: "task", taskId: task.id });
```

Define task with WorkspaceTaskId.make and the exact first fixture title. Define renderer/open/command in the test setup with explicit cleanup, as ProjectTasks.test.tsx does; fixture task includes required summary data from T4. Test is named `completes the captured row without opening it`.

- [ ] Add TasksSpace interaction tests with fake query response, a stateful fake durable command boundary and real owned components: search finds a record on a later server page, not loaded-page filtering; Open/Done alter RPC query and Clear resets cursor; project/owner/date filters apply before paging. Test row selection, no tasks versus no matches/error/old-server/read-only, query error Retry, Load more, environment switch discarding late pages and no link writes. Assert resulting visible titles/count and command result, not only callback wiring.
- [ ] Run apps/web `vp test run src/components/workspace/workspaceNavigation.test.ts src/components/workspace/WorkspaceNavigationView.test.tsx src/routes/-_chat.workspace.test.ts src/components/workspace/TasksSpace.test.tsx src/components/workspace/WorkspaceTaskRow.test.tsx src/components/workspace/dev/tasksMockupModule.test.tsx`. Expected red: missing Tasks components/route/query behavior.
- [ ] Extend parseWorkspaceSearch/WorkspaceSearch in components/workspace/workspaceNavigation.ts and its test narrowly, retaining the route re-exports. Validate enum/date/text bounds, drop task-only keys outside Tasks, preserve environment/project/item and old Office/mail/projects URLs. BeforeLoad admits tasks. Render TasksSpace in the existing route switch. Reuse W4 destination command, rather than register a duplicate palette action or new arbitrary keybinding. Scope selection changes URL/query but never resource project/tab or graph links.
- [ ] Implement controlled row content with semantic token classes. This is the structural JSX; production command handling wraps only the checkbox and retains the existing item menu:

```tsx
<li className="flex min-h-[59px] items-center border-b border-border gap-2">
  <input
    type="checkbox"
    aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`}
    checked={task.done}
    disabled={!workspaceTasksV2 || !canOperate || pending || completedColumn === null}
    onChange={(event) => void setCompleted(event.target.checked)}
  />
  <button
    type="button"
    aria-label={`Open ${task.title}`}
    className="min-w-0 flex-1 text-left"
    onClick={() => onOpen({ type: "task", taskId: task.id })}
  >
    <span
      className={task.done ? "block truncate text-muted-foreground line-through" : "block truncate"}
    >
      {task.title}
    </span>
    <span className="block truncate text-[10px] text-muted-foreground">
      {task.projectTitle}
      {task.areaLabel ? ` · ${task.areaLabel}` : ""}
    </span>
  </button>
  {due ? (
    <time
      dateTime={task.dueOn!}
      title={due.fullDate}
      className="shrink-0 text-[10px] text-muted-foreground"
    >
      {due.label}
    </time>
  ) : null}
  <span
    className="flex size-[19px] shrink-0 items-center justify-center rounded-full bg-primary/15 text-[8px] font-semibold text-primary ring-1 ring-background"
    aria-label={ownerLabel}
  >
    {ownerInitials}
  </span>
</li>
```

SetCompleted captures ID/environment/revision at invocation, sends desired state, disables the affected control, displays failure and retains confirmed checked state on failure. Wait for service result/subscription; never optimistically alter count independently. No designation shows a helpful settings action from the control explanation. Style checkbox 12 px with 44 px hit target on phone, text size 12 px list/11 px resource, date and owner reserves matching reference. Reuse W4 tokens for avatar/action fills. Native UI primitives own their variants; do not restyle generic Button/Input with a feature skin.

- [ ] TasksSpace uses one paged query family, all/status state, scope from URL and a separate selected task ref. Search form submit/clear updates query once; no network per keystroke or timer. Filter popup offers project, due bounds, owner, Apply/Cancel/Clear. Main scope and resource scope remain independent. Render exact heading/search/Board resting control. Until T6, Board action explains pending availability in development rather than claiming a working Board. Preserve current creation access through project hub/action menu; T5b adds unified creation. Do not add an unpictured prominent create button to fixture.
- [ ] Update workspaceRailItems.tasks with the three unbadged ListTodo/Clock3/Check choices; clear unavailableReason only after each view works. The shell renders WorkspaceViewRail, selected from view. Pass title/subtitle/environmentLabel/spaceLabel via WorkspaceEngagement.header and render TasksSpaceView as children with layout="full". On phone keep loaded query/pages/scroll in the mounted list controller while detail opens; Back restores focus to the originating task. Proposed filter/empty/error/compact captures need review.
- [ ] Modify dev/tasksMockupModule.tsx to export createWorkspaceMockupModule: CreateWorkspaceMockupModule. Map session.seed.tasks to five strict WorkspaceTaskSummary records with deterministic wskt_ UUIDs, areaLabel, dueOn, owner and completion from completed; assigneeDisplayId maps only to injected row avatar presentation via session.seed.people. Never map coworker IDs into owner. Both 03/08 use those same seed objects. Render actual TasksSpaceView with the session clock and in-memory read/command state, record mutations through session.record, and expose settled/dispose. Set readyRegions: ["center"] now; T7 adds resource. Keep the adapter free of live containers, credentials and connection state. Production task schema still accepts only environment-owner/null. Test exact titles/date/count/final completion, and absence of production sample entry. Do not add coworker identity fields to RPCs to satisfy PNGs.
- [ ] Rerun red command, then targeted lint and web/server typecheck. Expected green. Service/atom fixtures prove filter-before-page and scope; manual screenshot acceptance remains unrun until authorized primary pass.
- [ ] Surface checklist: direct URL, rail, palette and shared keybinding/touch menu agree. Web/desktop/phone share rows; RN compatibility only, no native screen. All providers use same stable task endpoint in shared actions, no adapter-specific list. Contracts already T4, no new transport. Filter/clear, select/Back and complete/reopen reverse states. Local/direct/relay/tunnel and multienvironment keys/captured writes covered. T7 owns user docs.
- [ ] Visual acceptance: W4-T7 recipe 03 `[207,26,733,495]`, inventory 32-51. Five 59 px rows, unbadged rail, exact 4 open/search/Board/metadata, separate checkbox/title actions. Resource Files stays selected. V1; actual titles/metadata/count, D05 owner, D06 footer and W4 chrome are live substitutions.1024/390 are reviewed adaptations, not original pixel targets.
- [ ] Commit only:

```powershell
git add -- apps/web/src/components/workspace/workspaceNavigation.ts apps/web/src/components/workspace/workspaceNavigation.test.ts apps/web/src/components/workspace/WorkspaceViewRail.tsx apps/web/src/components/workspace/WorkspaceNavigationView.test.tsx apps/web/src/components/workspace/TasksSpace.tsx apps/web/src/components/workspace/TasksSpaceView.tsx apps/web/src/components/workspace/WorkspaceTaskRow.tsx apps/web/src/components/workspace/TasksSpace.test.tsx apps/web/src/components/workspace/WorkspaceTaskRow.test.tsx apps/web/src/components/workspace/dev/tasksMockupModule.tsx apps/web/src/components/workspace/dev/tasksMockupModule.test.tsx apps/web/src/routes/_chat.workspace.tsx apps/web/src/routes/-_chat.workspace.test.ts apps/web/src/components/CommandPalette.tsx
git commit -m "feat(web): add scoped tasks list and status filters"
```

### Task W5-T5b: Task detail, creation and revision-safe editing

**Files:** Create `apps/web/src/components/workspace/WorkspaceTaskEditor.tsx` and `.test.tsx`. Modify TasksSpace.tsx/TasksSpace.test.tsx/WorkspaceTaskRow.tsx from T5a; existing `apps/web/src/components/workspace/ProjectTasks.tsx:143-353`, `ProjectTasks.test.tsx:1-101`, `useWorkspaceItemOpener.ts:22-51`, `useWorkspaceItemOpener.test.ts:1-16`. Read `WorkspaceItemActions.tsx:139-326`, `ProjectsSpace.tsx:34-57,236-245`, `mail/linkedItems.ts` task title/ref helpers. Modify `apps/web/src/routes/-_chat.workspace.test.ts:1-65` for legacy/new task URLs only if required. Item icon and pulseLinks identity need no schema change.

**Interfaces:** Consumes upsertTask for stable-ID creation, patchTask for existing edits, transitionTask for checkbox, existing task/config queries, WorkspaceItemActions/Menu and useWorkspaceItemOpener. Produces WorkspaceTaskEditor shared by center/hub/resource, opening stable task refs with explicit environment. Use `task: WorkspaceTaskSummary | null` for create/edit mode and explicit project/config inputs. Existing ProjectTasks can adapt its task response using already available project title, without another row request.

**Depends on:** W5-T5a. **Serial slot:** predecessor T5a; row/editor/ProjectTasks and opener ownership. If a missing create field from T2/T3 is found, acquire global slot for that bounded correction before editing contracts; do not bypass atomic service creation in UI. **blast_radius:** client. **door:** two-way.

- [ ] Write a user-action test named `retains edits after conflict and keeps the captured environment`. Use the existing act/create test conventions. Mock query transport/session and a durable fake command boundary, not WorkspaceTaskEditor. Start with task revision 3; type a new title, another client advances durable revision 4, submit; return WorkspaceToolsError conflict, then inspect visible error and retained input. Core submit assertion:

```tsx
await act(async () =>
  renderer.root
    .findByProps({ "aria-label": "Task title" })
    .props.onChange({ target: { value: "My unsaved launch title" } }),
);
await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
expect(patch).toHaveBeenCalledWith({
  environmentId: EnvironmentId.make("remote"),
  input: {
    id: task.id,
    expectedRevision: 3,
    title: "My unsaved launch title",
  },
});
expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
  "My unsaved launch title",
);
expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
  "changed on another client",
);
```

Define mocked patch return with `Cause.fail(new WorkspaceToolsError({ kind: "conflict", message: "This task changed on another client. Reload before saving." }))`. Renderer setup and cleanup follow ProjectTasks.test.tsx:1-54. Test a target environment change while save is pending using Deferred; its captured write cannot move to the new environment and its result cannot replace the new editor.

- [ ] Add an absent/false/cached-only workspaceTasksV2 branch test: project hub retains the legacy upsert editor, can save a title with only the old payload, and sends zero patchTask/transitionTask/queryTasks calls. Reconnect to an old server immediately disables new controls. Also add create/cancel, stable-ID failure/retry, explicit date/area/owner clear, title trimming/validation, read-only, delete/links retained, deleted target and unavailable direct URL cases. Assert Cancel creates nothing; successful create appears in query. Exercise task menu Start thread then Cancel and confirm no thread/link. Exercise actual shared item action confirm in existing WorkspaceItemActions.test.tsx for stable task source plus structural owning project. Add phone Back restoration of query/view/pages/scroll/focus with dirty-draft confirmation.
- [ ] Run apps/web `vp test run src/components/workspace/WorkspaceTaskEditor.test.tsx src/components/workspace/ProjectTasks.test.tsx src/components/workspace/TasksSpace.test.tsx src/components/workspace/useWorkspaceItemOpener.test.ts src/routes/-_chat.workspace.test.ts src/components/workspace/WorkspaceItemActions.test.tsx`. Expected red for shared editor/metadata/conflict handling or new opener behavior.
- [ ] Extract the existing TaskEditor rather than duplicate its CRUD/menu logic. Editor labels `Task title`, `Task column`, `Area`, `Due date`, `Owner`; actions `Save task`, `Delete task`, `Close task`. Create mode labels New task title and Add task, with Cancel. Use the existing field/button primitives. The new state is reviewed separately; no new control enters the resting original fixture. Menu provides `New task`; keep project hub's existing Add task entrance and project settings available.
- [ ] Initialize draft and expectedRevision once per environment/task identity, not on every query refresh. Do not key editor by title/column/revision as ProjectTasks.tsx:263 currently does. Save exact edited fields, null for explicit clears, one atomic patch. A dirty refresh shows `This task changed on another client.` with Reload/Keep editing. Reload requires explicit discard confirmation. Keep editing does not silently update expectedRevision. Failed saves retain draft and last confirmed data; deleted target never becomes create mode.
- [ ] Implementation core in the shared editor's submit handler:

```ts
const capturedEnvironment = environmentId;
const input = {
  id: task.id,
  expectedRevision,
  ...(title.trim() !== initial.title ? { title: title.trim() } : {}),
  ...(column !== initial.column ? { column } : {}),
  ...((dueOn || null) !== initial.dueOn ? { dueOn: dueOn || null } : {}),
  ...((areaLabel.trim() || null) !== initial.areaLabel
    ? { areaLabel: areaLabel.trim() || null }
    : {}),
  ...(owner !== initial.owner ? { owner } : {}),
};
if (Object.keys(input).length === 2) return onClose();
setBusy(true);
setError(null);
const result = await patch({ environmentId: capturedEnvironment, input });
if (!active.current) return;
setBusy(false);
if (result._tag === "Failure") setError(workspaceToolsError(result));
else {
  setExpectedRevision(result.value.revision!);
  setDirty(false);
  onSaved(result.value);
}
```

Snapshot initial normalized editable fields alongside expectedRevision on load, successful save and explicit Reload. Compare draft to that snapshot, never to a newly refreshed server row. Active ref resets/cleans up with editor identity; key parent by environment/task ID. Field set and title/column/date/owner validation use the shared service. Create uses a captured `wskt_${randomUUID()}` retained across retry, atomic upsert with optional metadata from T2/T3, resetting ID only after acknowledged success or explicit fresh create. No two-call create-then-patch partial save.

- [ ] Read live pulseCapabilities.workspaceTasksV2 at every existing project entrance. Only true enables WorkspaceTaskEditor patch/transition/query and new row controls. Absent/false/cached-only keeps the legacy upsert editor and old payload with no extension RPC. Replace the modern project hub editor with WorkspaceTaskEditor and shared row/adaptor only inside that capability branch. Keep old `/workspace?space=projects&environment=...&item=...` functional. `useWorkspaceItemOpener` sends new task refs to Tasks when live workspaceTasksV2 exists, otherwise legacy Projects; preserve exact ref/environment. Direct new Tasks URL loads by ID even if current filters exclude it; Back returns to original list. Resource-origin editing is local to resource sheet/pane and does not change Calendar space/date. Keep W4 Linked context endpoint updated separately from resource project.
- [ ] Preserve WorkspaceItemMenu/Actions with item `{ ref: { type: "task", taskId }, title }` and structural project passed as existing confirmed context. Do not write a graph link when selecting/creating/editing/completing a task. Deletion keeps current links and unavailable reason. Existing Start project/thread/automation/palette/keybinding/touch paths retain captured endpoint; no new provider-specific action system.
- [ ] Rerun the red command; expected green for edits/retry/deleted/direct URL/Back/source capture. Run targeted lint and web/server typechecks. No product-browser claim until gate.
- [ ] Surface checklist: list, project hub, menu/palette/keybinding/touch and later resource share editor/service; web/desktop/phone same, RN additive compatibility only. Codex/Claude/Cursor/Grok/OpenCode/ACP get existing task context/read path; user task edits do not run provider turns. No new contracts. Create/cancel, edit/close, complete/reopen and delete/unavailable all explicit. Capture environments across direct/relay/tunnel and navigation. T7 documents accepted editing flow.
- [ ] Visual acceptance: recipe 03 `[275,191,648,295]`, inventory 43-51, resting rows unchanged under V1. Proposed editor/create/dirty/conflict/phone return captures require review before acceptance. Allowed live substitutions: actual fields and D05 owner plus W4 chrome. Do not claim PNG defines editor dimensions.
- [ ] Commit only:

```powershell
git add -- apps/web/src/components/workspace/WorkspaceTaskEditor.tsx apps/web/src/components/workspace/WorkspaceTaskEditor.test.tsx apps/web/src/components/workspace/TasksSpace.tsx apps/web/src/components/workspace/TasksSpace.test.tsx apps/web/src/components/workspace/WorkspaceTaskRow.tsx apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/ProjectTasks.test.tsx apps/web/src/components/workspace/useWorkspaceItemOpener.ts apps/web/src/components/workspace/useWorkspaceItemOpener.test.ts apps/web/src/routes/-_chat.workspace.test.ts apps/web/src/components/workspace/WorkspaceItemActions.test.tsx
git commit -m "feat(web): share revision-safe task creation and editing"
```

### Task W5-T6: Board using configured project columns

**Files:** Create `apps/web/src/components/workspace/TaskBoard.tsx` and `.test.tsx`; modify TasksSpace.tsx/test, WorkspaceTaskRow.tsx/test from T5a/T5b. Consume T4 page configs/laneTotals and T1 transition; no new server/RPC/migration/rank table. No drag library addition.

**Interfaces:** Consumes WorkspaceTaskPage with project configurations and lane totals, same normalized filters/ordering/query as list, transitionTask, shared editor/item actions. Produces TaskBoard, reversible list/board view and accessible Move to column. Global groups keep each project's vocabulary. No universal columns or cross-project task movement.

**Depends on:** W5-T5b. **Serial slot:** predecessor T5b, shared TasksSpace/row files. **blast_radius:** client. **door:** two-way.

- [ ] Add TaskBoard interaction test with two project configs: `["Backlog","Review","Released"]`, completed Released, and `["Queued","Doing","Done"]`, completed Done. Give first project an empty Review lane. Render real Board using fake typed page and durable command boundary. Test name `moves by keyboard through configured lanes and preserves filters`. Core action/assertion:

```tsx
const move = renderer.root.findByProps({ "aria-label": "Move Review launch to column" });
await act(async () => move.props.onChange({ target: { value: "Released" } }));
expect(transition).toHaveBeenCalledWith({
  environmentId,
  input: {
    id: task.id,
    expectedRevision: task.revision,
    change: { type: "column", column: "Released" },
  },
});
expect(durableTask.column).toBe("Released");
expect(durableTask.done).toBe(true);
```

The fake boundary applies the same fixture service transition and publishes its new result to the rendered page; do not only mutate a test variable. Await its acknowledged Deferred before visible lane/count assertions. Test reopens into first open lane, preserves custom lane order/empty lane, filtered lane totals are full filtered totals, and no task changes owning project.

- [ ] Add failed/stale movement retaining old lane and error, two projects with same-named lanes, null completion designation, keyboard/select/touch action, no operate permission, Load more and switching back to list retaining search/filter/selection. No drag required for these tests.
- [ ] Run apps/web `vp test run src/components/workspace/TaskBoard.test.tsx src/components/workspace/TasksSpace.test.tsx src/components/workspace/WorkspaceTaskRow.test.tsx`. Expected red: missing Board/grouped lanes/view switch.
- [ ] Implement Board from existing page data. Group by projectId, use each config.taskColumns in order, including empty lanes in loaded/scoped projects. Filter task summaries by project+column within each group. Show exact laneTotals separately from currently loaded count; if more remain say `N loaded of M` and Load more, never imply a complete board from one page. Global query pages introduce project groups without fetching every project's tasks/config.
- [ ] Minimal rendering core inside project group:

```tsx
<section aria-label={`${projectTitle} board`}>
  <h2>{projectTitle}</h2>
  <div className="flex gap-3 overflow-x-auto">
    {config.taskColumns.map((column) => (
      <section
        key={column}
        aria-label={`${projectTitle}: ${column}`}
        className="w-60 shrink-0 rounded-lg border border-border p-3"
      >
        <h3>
          {column} · {laneTotal(column)}
        </h3>
        {tasks
          .filter((task) => task.column === column)
          .map((task) => (
            <TaskBoardCard
              key={task.id}
              task={task}
              environmentId={environmentId}
              columns={config.taskColumns}
              onOpen={onOpen}
            />
          ))}
      </section>
    ))}
  </div>
</section>
```

TaskBoardCard stays in TaskBoard.tsx, reuses shared metadata/actions/editor and renders a labelled select `Move {title} to column`. Movement calls the same revision transition. Error is next to card, no optimistic relocation on failure. Keyboard/touch control precedes any optional future drag; any later drag payload must include environmentId/projectId/taskId/revision and reject another project/environment.

- [ ] Board toggle uses exact LayoutGrid/Board resting geometry. In Board state show List and preserve normalized URL filters/scope; neither switch resets resource project/tab. No universal Done name. Proposed Board styling uses inherited colors, static lane borders/radius 8 and 12 px gaps. Review its proposed 1280/390 captures before acceptance; original PNG covers only toggle.
- [ ] Rerun red command, expected green; targeted lint and web/server typechecks. Completion service tests from T1 remain valid without another backend model.
- [ ] Surface checklist: Board button, existing menu and detail/checkbox share transitions; web/desktop/phone use keyboard/touch Move, RN no new screen. All providers use existing stable task refs; no provider code. No contracts changed. List/Board and complete/reopen/move back are reversible. Every card captures environment; direct/relay/tunnel same service and no cross-project moves. T7 documents Board/column designation.
- [ ] Visual acceptance after W4-T7:03 toggle `[863,101,60,24]`, inventory 41-51. LayoutGrid 2x 2 then Board, correct size/order under V1. Proposed Board body must be separately reviewed for configured groups/empty lanes/filter/paging/error/phone states. Live substitutions only actual project lanes/titles/counts in that proposed state, plus W4 chrome.
- [ ] Commit only:

```powershell
git add -- apps/web/src/components/workspace/TaskBoard.tsx apps/web/src/components/workspace/TaskBoard.test.tsx apps/web/src/components/workspace/TasksSpace.tsx apps/web/src/components/workspace/TasksSpace.test.tsx apps/web/src/components/workspace/WorkspaceTaskRow.tsx apps/web/src/components/workspace/WorkspaceTaskRow.test.tsx
git commit -m "feat(web): add board with configured project task columns"
```

### Task W5-T7: Shared project Tasks resource body and wave gate

**Files:** Create `apps/web/src/components/workspace/ProjectTasksResource.tsx` and `.test.tsx`; modify `WorkspaceTaskRow.tsx`/test, `WorkspaceResourceBody.tsx` only at its Tasks case and `WorkspaceResourcesPanel.test.tsx`, `ProjectTasks.tsx:143-353`/test if needed for final reuse. W4-T4a owns the resource frame. Install only the Tasks case of WorkspaceResourceBody, consuming WorkspaceResourceBodyProps unchanged; no frame or project selector edits. Create pure ProjectTasksResourceView.tsx and modify dev/tasksMockupModule.tsx plus dev/tasksMockupModule.test.tsx to add readyRegions "resource" for 08 while retaining "center" for 03. Extend `packages/client-runtime/src/state/workspaceTools.test.ts:82-113` with integrated two-registry task refresh; create `apps/web/src/components/workspace/TasksIntegration.test.tsx`. Modify `docs/user/workspace-tools.md:1-15`, `docs/internals/overview.md:1-126` only for changed durable constraints, `docs/internals/glossary.md`, in the existing Workspace and conversation table, for the date-only task definition. Review `docs/user/workspace-spaces.md` for existing Tasks entry accuracy; update its relevant section only if Wave 4's version needs it.

**Interfaces:** Consumes W4 independent EnvironmentId/ProjectId/tab, one selected body, queryTasks/state all/project filter, WorkspaceTaskRow density resource, shared editor, existing resource onOpen callback and changes. Produces ProjectTasksResource with exact project open count and same records/actions as center/hub. Mount no query when no project, tab inactive or capability unavailable. W5-T7 is the map's wave gate, not an extra dispatch ID.

**Depends on:** W5-T6, W4-T6. Visual gate additionally requires W4-T7 fixture readiness. Full 08 Calendar composition is captured when Wave 6 exists; its missing center does not block service/resource behavior proof. **Serial slot:** predecessor T6; WorkspaceResourceBody.tsx after W4-T4a and before W6-T8 on the canonical chain. Docs gates serialize by admitted wave number, with W5-T7 after W4-T6 and before W6-T9. **blast_radius:** client. **door:** two-way.

- [ ] Add ProjectTasksResource interaction test with a real query controller/row/editor and disposable fake RPC state. Initial project SynKEK, five tasks/four open, chosen tool Files. Open Tasks without altering Calendar selected date; complete first task, await mutation/result subscription and assert visible subtitle 3 open and checked title in both resource and another subscribed list registry. Reopen returns 4. No setTimeout or waitFor polling. Use existing atom Latch test pattern for delivery milestone.
- [ ] Add this complete subscription test in workspaceTools.test.ts using that file's existing imports, TARGET and makeTestRuntime. It proves both mounted query consumers refresh from one persisted-change signal. Retain the additional real mutation/service test above so a fake stream alone does not establish completion correctness.

```ts
it.effect("refreshes task totals in two subscribed client registries", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      let openTotal = 4;
      const client = {
        [WS_METHODS.workspaceSubscribeChanges]: () =>
          SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0)),
        [WS_METHODS.workspaceQueryTasks]: () =>
          Effect.sync(() => ({
            tasks: [],
            openTotal,
            total: 5,
            nextCursor: null,
            projects: [],
            laneTotals: [],
          })),
      } as unknown as WsRpcProtocolClient;
      const first = yield* makeTestRuntime(client);
      const second = yield* makeTestRuntime(client);
      const firstQuery = first.atoms.queryTasks({
        environmentId: TARGET.environmentId,
        input: { projectId: importProjectId.make("project"), state: "all", limit: 50 },
      });
      const secondQuery = second.atoms.queryTasks({
        environmentId: TARGET.environmentId,
        input: { projectId: importProjectId.make("project"), state: "all", limit: 50 },
      });
      const unmountFirst = first.registry.mount(firstQuery);
      const unmountSecond = second.registry.mount(secondQuery);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          unmountFirst();
          unmountSecond();
        }),
      );
      const initial = yield* Effect.promise(() => executeAtomQuery(second.registry, secondQuery));
      expect(AsyncResult.isSuccess(initial) && initial.value.openTotal).toBe(4);
      yield* Effect.promise(() => executeAtomQuery(first.registry, firstQuery));
      const firstUpdated = Latch.makeUnsafe();
      const secondUpdated = Latch.makeUnsafe();
      const stopFirst = first.registry.subscribe(firstQuery, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.openTotal === 3)
          firstUpdated.openUnsafe();
      });
      const stopSecond = second.registry.subscribe(secondQuery, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.openTotal === 3)
          secondUpdated.openUnsafe();
      });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          stopFirst();
          stopSecond();
        }),
      );
      openTotal = 3;
      yield* SubscriptionRef.set(counter, 1);
      yield* firstUpdated.await;
      yield* secondUpdated.await;
    }),
  ),
);
```

The empty tasks array isolates count invalidation in this atom test; the resource/service fixture above supplies all five actual rows. Do not use this atom-only fixture for visual evidence.

- [ ] Add TasksIntegration test `preserves Files while Tasks opens and mounts one selected resource body`. Render W4's actual integration seam, not an invented shell. Readable core using its shared state after initial setup:

```ts
await act(async () => openDestination("tasks"));
expect(selectedResourceTool()).toBe("files");
expect(selectedResourceProject()).toBe(projectId);
await act(async () => chooseResourceTool("tasks"));
expect(activeTaskBodies()).toBe(1);
expect(queryRequests.filter((call) => call.method === "pulse.workspace.queryTasks")).toHaveLength(
  1,
);
await act(async () => resizeToCompactWithSheetOpen());
expect(activeTaskBodies()).toBe(1);
expect(activeChangesSubscriptions()).toBe(1);
```

Implement these named test helpers locally as wrappers over actual renderer menu/resize-observer callbacks and fake RPC request/subscription counters, following WorkspaceEngagement.test.tsx and WorkspaceResourcesPanel.test.tsx. They must not directly assign selected-tool state. Observe resulting selected body/project in actual rendered controls. These helpers are test-local, not new product APIs.

- [ ] Cover zero/ambiguous resource projects, explicit selection retained across center changes, deleted project/task, environment change with late response, old capability/read-only, failed completion with retained count, detail close/Back keeping Calendar/date, close/reopen Resources and Load more. Multiple related projects must show W4's chooser rather than choosing the first. One sheet query/body across 1279/1280 transition. No graph writes from tab/project selection.
- [ ] Run apps/web `vp test run src/components/workspace/dev/tasksMockupModule.test.tsx src/components/workspace/ProjectTasksResource.test.tsx src/components/workspace/TasksIntegration.test.tsx src/components/workspace/WorkspaceResourcesPanel.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx src/components/workspace/ProjectTasks.test.tsx`; packages/client-runtime `vp test run src/state/workspaceTools.test.ts`. Expected red: missing body/mount/count/refresh integration.
- [ ] Implement selected-project body without independent project resolution. Minimal query/render inside ProjectTasksResource uses the existing hook and shared rows:

```tsx
const query = useEnvironmentQuery(
  projectId !== null && available
    ? workspaceTools.queryTasks({ environmentId, input: { projectId, state: "all", limit: 50 } })
    : null,
);
return projectId === null ? (
  <p>Choose a project to see its tasks.</p>
) : (
  <section aria-label="Project tasks" className="min-w-0">
    <h2 className="text-[13px] font-semibold">Project tasks</h2>
    <p className="mt-1 text-[10px] text-muted-foreground">
      {projectTitle} · {query.data?.openTotal ?? 0} open
    </p>
    <ul className="mt-3">
      {query.data?.tasks.map((task) => {
        const completedColumn =
          query.data.projects.find((config) => config.projectId === task.projectId)
            ?.completedColumn ?? null;
        return (
          <WorkspaceTaskRow
            key={task.id}
            environmentId={environmentId}
            task={task}
            density="resource"
            onOpen={openTaskDetail}
            ownerProfile={ownerProfile}
            timeZone={timeZone}
            now={now}
            canOperate={canOperate}
            completedColumn={completedColumn}
            workspaceTasksV2={available}
            pending={pendingTaskIds.has(task.id)}
            onTransition={transitionTask}
          />
        );
      })}
    </ul>
  </section>
);
```

Before rendering the count, branch for unavailable capability, initial pending, error and missing project. Never render 0 from absent/error data. Keep last confirmed count with a status on connection loss; disable writes. Zero is shown only after successful empty query. Implement query cursor/Load more below rows. Resolve per-task completedColumn from page.projects, since this body owns one project. Row due/owner comes from existing shared environment settings, not per-row queries.

- [ ] ProjectTasksResource maps real query/status/commands into ProjectTasksResourceView. Pure props are environmentId, projectId, projectTitle, page/status/error, ownerProfile/timeZone/now, pending/capability/scope state and onOpen/onTransition/onLoadMore. The adapter imports only this View and TasksSpaceView, supplies the same seed-backed state, and sets readyRegions: ["center", "resource"]. Its behavioral test completes/reopens a task, awaits settled(), checks both presentations and reset/dispose, and confirms zero external calls.
- [ ] In WorkspaceResourceBody.tsx replace only case "tasks" with ProjectTasksResource, passing W4's chosen scope, selectedItem, request and onOpen. Project resolution is W4-owned; do not reintroduce it here. Resource tasks open shared editor locally, preserving center route/date and resource choice. Menus keep stable task source; Linked context can select task without changing resource project. Same service/atom invalidation updates center/hub after resource edits.
- [ ] Surface checklist: resource tab and center/hub menu/detail/palette/keybinding/touch paths agree. Web/shared desktop and responsive phone delivered; RN contract/shared runtime remains compatible, new native screens excluded. Codex/Claude/Cursor/Grok/OpenCode/configured ACP retain exact linked-task reader/context and existing user-confirmed Start actions, no autonomous grants. Contracts already extended/gated. Complete/reopen, edit/cancel, assign/unassign, close/reopen, link/unlink/relink and unavailable/deleted behavior covered. Local/direct/relay/tunnel share typed RPC; two-client and two-environment fake tests pass. Real physical-device verification remains separate.

#### Wave gate documentation and focused verification

- [ ] Rewrite the existing task paragraph in docs/user/workspace-tools.md to cover Tasks/global/project scope, List/Board, designated completed column, completion/reopen, date-only due/area, Me/Unassigned, environment timezone, paged lists and unavailable deleted links. Keep shipped-product voice and existing automations explanation. Remove the stale 200-record limitation for the new Tasks path while explaining old-server fallback where useful. Do not describe source files/testing tools to users. Update workspace-spaces only if its Tasks entrance guidance is inaccurate.
- [ ] Review docs/internals/overview.md for the cross-client constraint that completion derives from configured column and date-only values never become UTC instants/jobs. Add only that durable constraint with a source link if absent; otherwise record the exact existing paragraph as no-change reason in implementation evidence. Do not append field catalogs/control flow. Add one glossary entry: `Date-only task due date | A Gregorian calendar date attached to a workspace task, with no time or scheduled job. The environment display timezone determines Today; it does not change the stored date.` Do not redefine Resource frame, calendar occurrence, workspace note or other waves' vocabulary.
- [ ] Run the complete focused set once after integration, from each owning package:

```text
packages/contracts:
vp test run src/pulseWorkspaceTools.test.ts src/settings.test.ts
apps/server:
vp test run src/workspace/WorkspaceTools.test.ts src/workspace/WorkspaceTaskQuery.test.ts src/workspace/WorkspaceTaskRpc.test.ts src/persistence/WorkspaceTaskMigrations.test.ts src/auth/RpcAuthorization.test.ts src/serverSettings.test.ts
packages/client-runtime:
vp test run src/state/workspaceTools.test.ts src/state/workspaceTaskDates.test.ts
apps/web:
vp test run src/components/workspace/workspaceNavigation.test.ts src/components/workspace/WorkspaceNavigationView.test.tsx src/routes/-_chat.workspace.test.ts src/components/workspace/ProjectTasks.test.tsx src/components/workspace/WorkspaceTaskRow.test.tsx src/components/workspace/WorkspaceTaskEditor.test.tsx src/components/workspace/TasksSpace.test.tsx src/components/workspace/TaskBoard.test.tsx src/components/workspace/ProjectTasksResource.test.tsx src/components/workspace/TasksIntegration.test.tsx src/components/workspace/WorkspaceResourcesPanel.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx src/components/workspace/WorkspaceItemActions.test.tsx src/components/workspace/useWorkspaceItemOpener.test.ts src/components/workspace/WorkspaceDisplaySettings.test.tsx src/components/workspace/dev/tasksMockupModule.test.tsx
```

Expected all pass. Run targeted lint for the explicit changed source/test paths and package-local typecheck in contracts/shared-runtime/server/web; no repo-wide gate. If settings restore/export paths are discovered to enumerate keys and omit new settings, repair/test the owning existing helper under slot before accepting, rather than adding a second profile store.

- [ ] The primary implementation controller runs one integrated real-client pass only after browser/server permission, using test-t 3-app. Subagents launch no server/browser. Compare 03 center and 08 resource at 1280x 800 using W4-T7 recipes/V1; additionally inspect 1024 and 390. Demo search/filter/clear, detail/edit/cancel, complete/reopen in resource, second subscribed client refresh, custom Board Move/Back, resource project choice, Files retained on central Tasks, old-server unavailable, read-only and environment switch. Inspect once, batch repairs, recheck affected cases once. Capture recipe 08 with Wave 6 center when available, recording pending composite proof separately if not.
- [ ] Visual acceptance under V1:08 `[953,149,314,339]`, inventory 89-100. Heading Project tasks, SynKEK · 4 open, five 59 px rows, final checked/struck, 19 px avatars.03 Files remains selected. Allowed live substitutions real chosen project/tasks, Me/Unassigned and W4 chrome. No extra resting search/create/Board/footer. Compare crop/overlay and record numeric geometry/type deviations; do not call a screenshot fixture real-account/native/remote acceptance.
- [ ] Record outcomes separately: synthetic service/transport tests; marked visual fixtures; light-theme smoke; packaged desktop; existing native compatibility; local versus physical other-device direct/relay/tunnel; human pilot. Missing real accounts, physical device and pilot remain unrun, never inferred from viewport or local HTTP. Preserve still-unavailable evidence explicitly.
- [ ] Commit only wave gate ownership, including docs actually changed:

```powershell
git add -- apps/web/src/components/workspace/ProjectTasksResourceView.tsx apps/web/src/components/workspace/dev/tasksMockupModule.tsx apps/web/src/components/workspace/dev/tasksMockupModule.test.tsx apps/web/src/components/workspace/ProjectTasksResource.tsx apps/web/src/components/workspace/ProjectTasksResource.test.tsx apps/web/src/components/workspace/WorkspaceTaskRow.tsx apps/web/src/components/workspace/WorkspaceTaskRow.test.tsx apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.test.tsx apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/ProjectTasks.test.tsx apps/web/src/components/workspace/TasksIntegration.test.tsx packages/client-runtime/src/state/workspaceTools.test.ts docs/user/workspace-tools.md docs/internals/overview.md docs/internals/glossary.md
git commit -m "feat(web): share project task resources across workspace views"
```

If workspace-spaces.md required an edit, stage that exact path separately. Do not stage other waves' edits to shared docs; inspect hunks and serialize with owners. Do not commit screenshot-only evidence assets unless repository policy explicitly owns them; retain capture artifact pointers through the controller's existing evidence workflow.

## Self-review

Eight dispatchable tasks are present: W5-T1, T2, T3, T4, T5a, T5b, T6 and T7. T7 contains the documentation/verification/visual wave gate. No non-dispatchable T5 parent or extra W5 task ID was introduced.

| Decision | Default assumed for planning                                             | Effect                                                                              |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| D01      | Six destinations; Workspace/Code retained; Projects landing              | Consume W4 routing/nav, preserve legacy task URLs.                                  |
| D02      | Independent resource project and separate Linked context                 | No implicit linking/project changes on task navigation.                             |
| D03      | Sample labels/people/counts only in isolated marked fixtures             | 03 Files and 08 Tasks selected; same five task records.                             |
| D04      | Global/project list, Board, date-only due/area and designated completion | All W5 tasks use existing IDs/custom columns; no recurrence/dependencies/reminders. |
| D05      | Me/environment-owner and Unassigned                                      | No directory/roles/provider assignees. Named coworkers are fixture-only.            |
| D06      | Followers omitted live                                                   | Record footer departure; optional W12-T8 remains held.                              |
| D24      | Web/shared desktop/phone web, native-compatible contracts                | No new RN screens; environment/old-server/connection-mode checks.                   |
| D25      | Live Pulse Code and Workspace/Code; sample Pulse Next/Office             | Use W4 chrome substitution, no rebrand.                                             |

Defaults remain maintainer-confirmable planning assumptions, not execution consent. No broader account/collaboration expansion is admitted.

Current-code clarifications and unresolved evidence:

- Current task schema has no revision/done/metadata; current ProjectTasks editor is local and keyed by changing title/column. This plan changes that shared root rather than adding another task identity. Existing test title mentions stale edits, but current service has no revision predicate; T1 adds the actual proof.
- ServerSettingsService already owns environment persistence/notifications and serverUpdateSettings requires operate. It is suitable for timezone/profile; no new singleton workspace preference table is needed. The map's candidate TOOLS migration for preferences is narrowed accordingly. Task metadata migrations remain necessary.
- Wave 4 now defines the canonical exported types and paths. W5 uses WorkspaceHeaderModel, workspaceRailItems, WorkspaceResourceBodyProps, the context handoff and existing tasks adapter exactly.
- Board/editor/filter/compact/error designs are unpictured. Proposed direction/states are specified, but their reviewed captures remain open. Full 08 center composition awaits Wave 6; W5 does not claim Calendar delivered.
- Production uses only environment-owner/null. Exact fixture coworkers require W4-T7's presentation mapping, not wire/model expansion. D06 sample followers footer remains an explicit live departure.
- New migration numbers must be allocated in the exclusive slot. M064 is current last task migration, not a reservation of later IDs. The correction baseline and other writers' files must remain intact.
- The original planning pass recorded no graphify-out graph; graph generation is outside this two-plan revision. Source reading was used. Design context was read from pinned PNGs/spec/current code; no design launcher/network operation ran under this brief.
- This planning pass ran no product tests, typechecks, servers, browser, provider CLI, network, staging or commits. Source inspection and plan-format checks are not implementation or acceptance receipts. Real-account, packaged desktop/native, physical remote-device and human pilot evidence remains unavailable/unrun.

## Review response log

Round 1, 2026-10-16. Applied review-w5-w6 and every review-cross-wave reconciliation row involving W5. Only this plan and the Wave 6 plan are edited by this pass; implementation, staging and commits remain outside this assignment.

| Finding               | Response and owning task                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-W5-1                | Capture 03 uses center project fixture-synkek, Project tasks and 4 open. Global scope omits project. Both use view=all under W4's closed vocabulary.                                                                                      |
| I-W5-2; cross R8 / I4 | T5a consumes view all/open/done. Only independent taskLayout and bounded filter fields extend the canonical parser and its tests.                                                                                                         |
| I-W5-3                | T1-T3 keep new controls capability-gated before aggregate publication in T4; T5b tests absent/false/cached-only capability and retains legacy upsert with zero new RPCs.                                                                  |
| M-W5-1                | T5b test and submit code send only id, expectedRevision and edited keys. Unchanged values are omitted and explicit clears use null.                                                                                                       |
| M-W5-2                | T5a declares completedColumn: string or null, matching WorkspaceProjectConfig.completedColumn, row null check and T7 lookup. The requested boolean type is disputed because it contradicts the producer; task.done supplies that boolean. |
| M-W5-3                | T4 seeds schema-valid wskt_ UUIDs; adapter maps W4 display seed IDs deterministically into branded task IDs.                                                                                                                              |
| M-W5-4                | Corrected opener test to 1-16 and capability hook to 22-40; glossary insertion targets the Workspace and conversation table.                                                                                                              |
| M-W5-5                | Owner size, fill, text, ring and stack overlap are explicit; generator snippets use yield*.                                                                                                                                               |
| cross R1 / C1         | T5a/T7 list and stage dev/tasksMockupModule.tsx and its behavioral test. Existing createWorkspaceMockupModule publishes center then resource readiness. Separate fixture files are removed.                                               |
| cross R2 / C2         | T7 lists/stages the Tasks case of WorkspaceResourceBody.tsx; frame stays W4-owned and the canonical chain precedes W6-T8.                                                                                                                 |
| cross R5 / I2         | Spaces pass WorkspaceHeaderModel via WorkspaceEngagement.header with layout full and children.                                                                                                                                            |
| cross R6 / I3         | T5a updates workspaceRailItems and clears unavailableReason under its file slot. No TasksNav or ReactNode rail contract.                                                                                                                  |
| cross R12 / M2        | Adapter consumes areaLabel/dueOn/owner and display-only assigneeDisplayId from W4; coworker IDs never become live owners.                                                                                                                 |
| cross R13 / M3        | T1 waits for W4-T5 to release ProjectTasks.tsx; full config/UI chain is stated before dispatch.                                                                                                                                           |
| cross M5              | T7 docs gate follows W4-T6 and precedes W6-T9, by admitted wave number.                                                                                                                                                                   |
| Attribution           | Both plans carry the exact implementer/controller attribution sentence in Global Constraints.                                                                                                                                             |

The literal request in I-W5-1 for a separate global view value conflicts with W4's canonical all/open/done vocabulary. This plan keeps project scope independent of status and adds no fourth rail view. Product tests and rendered acceptance remain future implementer checks; this revision verifies plan consistency only.
