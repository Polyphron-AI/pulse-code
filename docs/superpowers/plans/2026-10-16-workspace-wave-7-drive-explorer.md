# Workspace Wave 7: Read-only project Drive explorer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch W7-T1, W7-T2 and W7-T3 separately. This document authorizes planning only; its implementation and capture steps remain unrun.

**Goal:** Give each resource project one explicitly designated, account-bound Drive folder and one reusable, paged, read-only explorer across Email, Communications, Tasks and Projects. Browsing never creates relationships or file bindings.

**Architecture:** Keep confirmed relationships in `WorkspaceLinks`, file/account bindings in `DriveStore`, and the nullable root designation in the existing project configuration row. Extend the current Drive GET service and environment-scoped atoms. `WorkspaceResourcesPanel` from W4-T4a owns project selection, tabs, close/reopen, scrolling and footer. W7 supplies only the Files body and the `openFiles` handoff. Existing direct-file search and reader remain available on servers without the new explorer capability. Reuse one selected resource body on desktop and in the phone Resources sheet.

**Tech Stack:** TypeScript, Effect services and Schema, SQLite, existing Google Drive v3 GET client, `effect/unstable/rpc`, `effect/unstable/reactivity`, React, existing shadcn UI primitives, lucide-react, `@effect/vitest`, `vite-plus/test`, and `react-test-renderer` for existing unit-test idioms.

**Spec:** `docs/superpowers/specs/2026-10-14-unified-workspace-design.md`, especially Files, link grants and A13. Canonical task identities, ownership and defaults are in `docs/superpowers/workspace-mockups/mockup-waves/wave-map.md`, Wave 7 and shared sections. Main plan is `docs/superpowers/plans/2026-10-14-unified-workspace.md`.

**Mockups:** `docs/superpowers/workspace-mockups/mockups/01-email-files.png`, `02-communications-files.png`, `03-tasks.png`, `04-projects.png`. Each is 1280x800. The Files body is identical across them. Read `gap-email-files.md:91-110,262-286`, `gap-communications.md:100-127,309-325`, `gap-shell.md` S4-S7, both reviews, and the wave map's Review response log before implementation.

**Build worktree:** `C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace`, branch `qb/feat-unified-workspace`. Source anchors below were inspected on 2026-10-16 at the `6363a7913b` baseline with uncommitted correction B-2026-10-16-001 present. They are starting anchors, not permission to overwrite later waves' edits. Re-read a file when its exclusive slot becomes available.

## Global Constraints

The following relevant main-plan constraints are copied verbatim. The historical attribution line is retained as a source constraint, not a statement about who wrote this plan.

- Never use an em dash (U+2014) in anything you write: code comments, docs, UI copy, commit messages. Use a comma, a full stop or a spaced hyphen.
- Run commands from the build worktree. In Git Bash, prefix each command with `cd "C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace" &&` because the shell's directory resets between calls.
- Tests: `vp test run <files>` from the package directory (`apps/server`, `apps/web`, `packages/contracts`, `packages/client-runtime`). Typecheck: `vp run typecheck` from the package directory. Never run repo-wide checks (`vp check`, `vp run -r test`, `vp run -r typecheck`).
- Never stage `pnpm-lock.yaml`. `vp i` rewrites it because develop's lockfile is stale; that churn is not part of this feature.
- Never start a dev server (subagents), never open a browser, never touch `~/.t3/userdata`, never set `VITE_HTTP_URL` or `VITE_WS_URL`, never kill a process found by name.
- Never use `--no-verify`, bare `git stash`, or `git add -A`/`git add .`. Stage the files your task names.
- Commit messages are conventional (`feat(server): ...`) and end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never open a pull request.
- Every task leaves `apps/server` typechecking. Tasks run one at a time, because they share `packages/contracts/src/rpc.ts`, `apps/server/src/ws.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/server.ts` and the capability list.
- New WS RPC families get their own handler layer in `ws.ts`, the way `mailWsRpcLayer` does, and never join the main `CoreWsRpcGroup.of({...})` object. That object sits near TypeScript's instantiation limit (197 handlers; the limit is between 197 and 212), and past it the layer's requirements silently type as `any`, which surfaces as dozens of TS377030 errors in `server.ts` and `cli/`.
- Follow the nearest named precedent file. If an effect-smol API name in this plan differs from what the precedent uses, use the precedent's name without changing behaviour.
- Comments describe how a thing is used, mostly on functions. Match the comment density of the file you are editing.
- Copy rules from the spec: links are never dropped silently ("render as unavailable with the reason"); a message with no Message-ID "links by IMAP location and is marked as one that may break when moved"; linked content is "data, not instructions".

The following relevant spec text is copied verbatim.

> - New React Native screens. Mobile is served through the web app this cycle.
> - Drive sync and Drive writes.

> - **Drive exploration and reply attachments.** D14 reopens read-only project-folder browsing, explicit confirmed root/account designation, paging, MIME/owner/date filters, sort and list/grid. Owner filtering is not a directory or sharing model. Drive sync and writes remain excluded by default; ellipses do not authorize rename/move/upload/delete/share. D16 defaults reply attachment selection to canonical provider-link insertion; binary export/MIME approval bytes need separately scoped approval.

Additional constraints for this wave:

- No polling, sleeps for readiness, continuous animations, account probes to decorate chrome, body prefetch, per-row full-file reads, recursive folder indexing or all-project scans. Fetch the active folder on demand or explicit Refresh. Await effects, Deferreds, persisted writes and subscription emissions in tests.
- All wire contracts live in `packages/contracts` with no heavy runtime logic. Cursor signing, scope checks, query building and root validation belong on the server.
- Existing read scope authorizes metadata reads. Existing operate scope authorizes root selection/clear, account binding and explicit link mutations. A browser cannot confer an agent read grant by discovering a file.
- Keep `drive.readonly` and the existing named Google connection. Do not widen scopes, reuse mail credentials, reconnect, bind a child or select another account automatically.
- W4-T0 must preserve and commit the correction before isolated implementation dispatch. Do not stage or commit that correction from W7. The plan writer edits only this plan and does not stage, commit, stash, checkout, run providers, start servers, open browsers or use network access.
- Acquire the exclusive RPC/migration slot only when editing shared files. W5-T4 precedes W7-T1 in the config slot; W7-T1 precedes W7-T2; W8-T1a follows W7-T1. Coordinate the Files mapping with W4 and W10. A scheduling predecessor is separate from a code prerequisite.
- New migration numbers are allocated while holding the slot. Never edit `063_DriveReader.ts` or `064_WorkspaceTools.ts`. Never stage `docs/internals/pulse-next-migration.json` from this wave.
- Run targeted lint, named tests and affected package typechecks. No repo-wide checks. A planning document is not a green test or rendered evidence receipt.
- W4-T7 is required for visual claims. Only the primary implementation controller runs the integrated client pass, after explicit browser/server authorization. Real accounts, packaged desktop/native, physical remote access and human pilot remain separate evidence.

## Merge Danger

**Door:** two-way

**Blast Radius:** bounded

This adds an optional read capability and nullable project configuration. Existing direct-file reads and old config saves remain supported. Rollback hides explorer UI and keeps the additive column and confirmed links. Do not roll back by deleting user relationships or account records. Each task lists its own risk.

## Review Focus

1. Root selection survives old-client settings saves, restart and another client's change, but never survives as usable authority after its confirmed link or binding changes. Pinned to `DriveService.test.ts` test `keeps a root designation separate from links and legacy settings saves` and its unlink/disconnect cases in W7-T1.
2. A cursor or late response from account A, root A, environment A or an earlier query appears under B. Pinned to `DriveService.test.ts` test `rejects a cursor after scope or connection changes`, runtime Deferred tests in W7-T2 and the deferred UI response test in W7-T3.
3. Provider search/filter/sort happens after paging, shortcuts escape the root, or ownerless shared-drive files disappear. Pinned to `DriveApi.test.ts` query assertions and scripted multi-page service tests in W7-T2.
4. Browse, sort, grid toggle or the `openFiles` handoff binds/links files or grants descendants to agents. Pinned to the no-write call-count test in W7-T2 and captured-endpoint action tests in `ProjectDriveExplorer.test.tsx` in W7-T3.
5. Four spaces drift, two resource bodies stay mounted, blue means selection, or a live sharing statement invents access. Pinned to W7-T3 cross-space behavior tests and its four V1 crops plus 390px/1024px integrated pass.

## Rendered look reference

### Files body in all four PNGs

Coordinates are CSS pixels at 1280x800, dark theme, device scale 1, zoom 100%, en-GB, Africa/Johannesburg, Tuesday `2026-10-13T10:30:00+02:00`. Pin Segoe UI on the Windows capture host with system-ui fallback and record the resolved font and OS. All geometry has a 2px acceptance tolerance; type sizes have a 1px tolerance. Review overlay/difference and side-by-side crops. Text antialiasing is excluded from geometric measurements only.

Sample colors are estimates from the PNG and corrected inventory: body `#111111`, search `#191919`, filter fill `#181818`, filter border `#292929`, row rules `#1c1c1c`, main ink `#eeeeee`, muted ink `#858585`, blue `#3474ff`, selected tab fill near `#12203b`. Use the incumbent semantic tokens. Do not add a second theme or hardcode these values per row. W4 owns any shared token corrections. The live light-theme smoke is separate from dark PNG acceptance.

| Element                | Exact bounds, type and spacing                                                                                                                     | Icons, copy and state                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent frame, W4-owned | `[940,26,340,774]`, 1px left border at x939, no shadow. Header y26-78, tabs y85-128, separator y135, fixed footer y768-800. Body insets 13px.      | Header `Folder`, `SynKEK`, `ChevronDown`, `X`. Six tabs `Files`, `Browser`, `Agents`, `Tasks`, `Docs`, `PRs`. Files selected at `[947,85,52,43]`, radius13. Correct 02's pictured Browser highlight to Files under D03. W7 must not rebuild this frame.                     |
| Search                 | `[953,149,314,28]`, radius15, 10px muted text, input inset29px, room for right filter control.                                                     | `Search` 11-12px at x965/y158; `SlidersHorizontal` 10-12px at x1246/y159. Exact placeholder `Search in Drive`. Accessible description `Search names in this folder only.` No default account picker, visible submit button or permanent scope banner in this resting state. |
| Breadcrumb             | `[953,192,314,25]`, text baseline about205, 22px gap after search.                                                                                 | `Project Drive` 11px semibold at x953; `ChevronRight` 9px near x1029; `SynKEK` 11px regular at x1042. Root displays the selected folder name, not a guessed organization. Nested folders add compact breadcrumb segments and an accessible Back action.                     |
| Filters                | `[953,229,51,23]` and `[1011,229,62,23]`, radius6, 1px border, 7px gap, 11px medium text.                                                          | `Type`, `People`, each with `ChevronDown` 9px. Unselected in the fixture. Type means MIME, People means owner. Sliders opens name/date filters and Clear filters; it never opens sharing management.                                                                        |
| View buttons           | Glyphs at x1236 and1255, y235, approximately11px, 8px gap. Align with filter centers y240.                                                         | `List` blue and selected, `Grid2X2` muted. Accessible labels `List view` and `Grid view`, `aria-pressed`. No enclosing pill. Give buttons adequate transparent hit areas without changing glyph coordinates.                                                                |
| Column headings        | `[953,265,314,27]`, name x959 baseline276, date x1225 baseline276. 9px muted text, bottom rule y291.                                               | Exact visible `Name ↑` and `Modified`. Buttons expose sort state. The screenshot's order inconsistency is recorded below.                                                                                                                                                   |
| Folder rows            | `[953,292,314,42]`, then `[953,334,314,43]`, `[953,377,314,43]`, `[953,420,314,43]`. Thin lower rules, no raised cards, no resting selection fill. | `Folder` outline15px at x961; names x985, 10px semibold. `MoreHorizontal` near x1255; dates at x1241 right-aligned, 8-9px muted. Gray folders except confirmed Marketing link in blue.                                                                                      |
| Document rows          | `[953,463,314,42]`, `[953,505,314,43]`, `[953,548,314,43]`, `[953,591,314,43]`. Same rules and 43px pitch.                                         | Blue `FileText` 12x15px near x962. Names x986, 10px regular. Dates right-aligned at x1260 for documents without visible ellipsis. Menus may reveal on focus/hover or accessible touch action; no resting document ellipsis in reference.                                    |
| Sharing line           | `[953,654,314,22]`, roughly21px after final row. `UsersRound` 12px muted, text x972 baseline665, 9px muted.                                        | Marked fixture `Shared with the SynKEK team. Files stay in Google Drive.` Live default `Files stay in Google Drive.` No sharing mutation or inferred access.                                                                                                                |
| Footer, W4-owned       | `[940,768,340,32]`, top rule, static dot x953/y782, label x964 baseline786, gear x1258/y780.                                                       | Fixture `Sample project connections`. W7 contributes known availability only, without polling. Footer stays fixed while Files content scrolls.                                                                                                                              |

The exact eight fixture rows are:

| Kind       | Title                    | Modified | Confirmed project link |
| ---------- | ------------------------ | -------- | ---------------------- |
| Folder     | SEO                      | 10 Oct   | No                     |
| Folder     | Marketing                | 11 Oct   | Yes, SynKEK            |
| Folder     | Website                  | 12 Oct   | No                     |
| Folder     | Products                 | 13 Oct   | No                     |
| Google Doc | Q4 marketing strategy    | 12 Oct   | No implicit relation   |
| Google Doc | October content calendar | 11 Oct   | No implicit relation   |
| Google Doc | Brand guidelines         | 10 Oct   | No implicit relation   |
| Google Doc | Website launch checklist | 9 Oct    | No implicit relation   |

Fixture IDs must satisfy existing schemas. Use one explicitly bound SynKEK root and a separate confirmed Marketing-to-SynKEK link, as W4-T7 requires. Blue folder color is based on a confirmed relation to the resource project, with accessible text `Linked to project`. Focus, hover, opened-folder state and suggestions never produce it. Files found below the root remain browsed until explicitly linked.

### States absent from the PNGs

These are proposed states requiring reviewed captures before visual acceptance. Their reference box remains `[953,149,314,527]`; they are not original-mockup claims.

- Loading uses static `Loading files...` in the list area with `aria-busy`, no rotating spinner or shimmer. Changing scope clears earlier rows immediately.
- No root says `Choose a confirmed project folder to browse Drive.` and offers `Choose folder` for an operator. No connection says `Connect Google Drive in Settings.` Existing linked-file external opens remain usable.
- Root settings show `Project Drive folder`, `Drive connection`, `Use as project folder`, `Replace folder`, `Clear project folder`, `Cancel`, and the chosen connection's actual nickname/account. A non-operator sees the designation and an explanation rather than enabled mutations.
- An empty directory says `This folder is empty.` A filtered empty result says `No files match these filters.` with `Clear filters`. No recursive coverage claim is made.
- Disconnected, removed, unlinked or rebound roots retain their title and an explanation. Use `Reconnect this Drive connection in Settings.`, `This project folder is no longer linked.`, or `The folder connection changed. Choose the project folder again.` as appropriate. Do not silently fall back to another account, directory or project.
- Search submits on Enter and clear. Filters, sort and explicit Refresh issue a new first-page request. `Load more` exists only with a cursor. `Results may be incomplete. Refresh or open Google Drive.` accompanies provider incompleteness and partial-page limitations.
- Type options are `All types`, `Folders`, `Google Docs`, `Google Sheets`, `Google Slides`, `Other files`. Other files excludes the four preceding categories and shortcuts. People offers `Any owner`, `Owned by connected account`, and an explicit owner-email input. It does not enumerate a directory or infer sharing. Modified filter uses `Modified on or after` and `Modified before`, dates interpreted in the chosen timezone and sent as UTC bounds.
- Grid is a quiet two-column list of file tiles inside 314px, gap8px, radius6, 1px border, 12px padding. Use the same icons, names, dates, endpoint menus and selection as list. Titles wrap at most two lines with full accessible text. Review grid at 1280px and 390px before implementation acceptance.
- A shortcut row says `Shortcut, open in Google Drive`. No inline traversal, target fetch or child binding. A shared-drive file may have no individual owner; display `Owner unavailable` only where owner metadata is shown.
- Pointer hover uses a quiet accent background. Focus has a visible token-based ring. Folder blue remains independent. Touch has a visible menu button and the common long-press menu, with scroll cancelation. Never force small mobile input text that causes zoom; preserve 16px phone input sizing within a reviewed compact adaptation.
- All error states keep resource tabs, project selector, X, close/reopen and confirmed links usable. Retry is deliberate. An unavailable account never leaves previous-account results looking current.

### Sample-to-live substitutions and capture recipes

Consume the Wave 4 sample-to-live table verbatim in meaning. Live brand is `Pulse Code`, mode is `Workspace / Code`, and the breadcrumb uses the actual environment name or `Workspace`. The sample marker is hidden outside fixtures. The MC avatar uses configured environment-owner initials or is absent. The footer says `Connected` only with supported known health, `Unavailable` for a failed known source, otherwise `Connection status unavailable` with neutral dot. Its gear opens existing scoped project settings. Live Files copy is `Files stay in Google Drive.` unless complete supported provider metadata proves a more specific claim. Do not query permissions just to fill this line.

| PNG                         | W4-T7 fixture recipe                                                                                                                            | Owned comparison                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 01-email-files.png          | `/workspace?space=mail&fixture=01`, Inbox, Nina launch-review stable message after D03 correction, project `fixture-synkek`, Files, root, list. | W7-T1 `[953,192,314,185]`; W7-T2 `[953,149,314,485]`; W7-T3 `[953,149,314,527]`. Mail center stays W11-owned. |
| 02-communications-files.png | `/workspace?space=communications&fixture=02`, Slack marketing, marked sample data, same project/root/list. Select Files under D03.              | Same three boxes. Conversation remains W9-owned; lack of a real connector cannot gate synthetic Files proof.  |
| 03-tasks.png                | `/workspace?space=tasks&fixture=03`, All tasks, same project/root/list, no selected folder.                                                     | Same boxes. Do not change task rail, counters or followers from W7.                                           |
| 04-projects.png             | `/workspace?space=projects&fixture=04`, SynKEK selected, same project/root/list.                                                                | Same boxes. Do not introduce live member counts or roster to satisfy this crop.                               |

The screenshot shows `Name ↑` over a nonalphabetical sequence. Keep W4-T7's explicitly synthetic presentation rows for reference capture, and record that this does not prove sorting. Production and behavioral fixtures must honor requested provider sort. Do not add a production SynKEK order override or label a provider default as alphabetical. A maintainer must confirm this fixture-only inconsistency or approve a corrected-order rebaseline before declaring strict visual sorting parity.

## Shared interfaces and implementation conventions

### Wave 4 inputs, consumed without redefining the shell

The wave map names `WorkspaceResourcesPanel`, the resource project, selected lazy body, `Linked context`, shared item actions and `openFiles`. It does not prescribe exported TypeScript names for their props. Consume those exact concepts and the concrete exports W4 supplies. The structural signatures below state W7's requirements; they are not a request to rename W4 exports or create another shell store.

```ts
type FilesBodyInput = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  item?: WorkspaceLinkEndpoint;
  onOpen: (ref: WorkspaceItemRef) => void;
};

type OpenFilesInput = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  folderId?: string;
  fileId?: string;
};

type OpenFiles = (input: OpenFilesInput) => void;
```

`openFiles` selects the existing Files tab, opens Resources and carries the requested folder/file without replacing the center item, selecting a different account, creating links or changing the persisted root. Reject both folderId and fileId together. It is a client navigation intent, not a new RPC or reader grant. The server validates folder reachability. An arbitrary linked folder outside the configured root offers an explicit provider open; it does not become the root. W11 owns the mail Marketing-card caller, W9 owns chat callers, W5/W8 own task/project callers. W7 owns the reusable receiving seam and its tests, without editing all four spaces.

`WorkspaceLinkEndpoint`, `WorkspaceItemRef`, `WorkspaceLinkId`, `EnvironmentId`, `ProjectId`, `workspaceItemKey` and the existing `useMailLinks` link/unlink helpers remain authoritative. W4's selected resource project is independent of `item`. Do not infer the project again from the selected mail or require an item before browsing.

### Wave 7 wire names

These new names are proposals owned by W7. Preserve existing methods and types. Consumers W8-T3a and W11-T7 can depend on these shapes without opening another account chooser implicitly.

```ts
export const WorkspaceDriveRoot = Schema.Struct({
  linkId: WorkspaceLinkId,
  connectionId: DriveConnectionId,
  fileId: DriveFileId,
});
export type WorkspaceDriveRoot = typeof WorkspaceDriveRoot.Type;

export const DriveProjectRootResult = Schema.Struct({
  root: Schema.NullOr(WorkspaceDriveRoot),
  state: Schema.Literals([
    "unconfigured",
    "available",
    "unlinked",
    "disconnected",
    "binding-changed",
    "unavailable",
  ]),
  file: Schema.optionalKey(DriveFile),
});
export type DriveProjectRootResult = typeof DriveProjectRootResult.Type;

export const DriveBrowseInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: DriveConnectionId,
  parentId: DriveFileId,
  path: Schema.Array(DriveFileId).check(Schema.isMaxLength(16)),
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  type: Schema.optionalKey(
    Schema.Literals(["folder", "document", "spreadsheet", "presentation", "other"]),
  ),
  owner: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  modifiedAfter: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
  modifiedBefore: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
  sort: Schema.Literals(["name", "modifiedTime"]),
  direction: Schema.Literals(["asc", "desc"]),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(8192))),
});
export type DriveBrowseInput = typeof DriveBrowseInput.Type;

export const DriveBrowsePage = Schema.Struct({
  files: Schema.Array(DriveFile).check(Schema.isMaxLength(50)),
  nextCursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(8192))),
  incomplete: Schema.Boolean,
  limitation: Schema.optionalKey(Schema.String),
});
export type DriveBrowsePage = typeof DriveBrowsePage.Type;
```

Add optional `driveRoot: Schema.optionalKey(Schema.NullOr(WorkspaceDriveRoot))` to the config response. Absence on old snapshots is equivalent to unconfigured for display only. Existing `saveConfig` is not the root mutator and must ignore a supplied driveRoot property. Its SQL must preserve the stored root on every old/new settings save. Root set/clear uses one dedicated operate method, validated after asynchronous metadata reads. The dedicated root result and Drive subscription are authoritative for explorer/settings root state; a cached config snapshot is not proof that a root is usable.

New RPC names are `driveGetProjectRoot: "pulse.drive.getProjectRoot"`, `driveSetProjectRoot: "pulse.drive.setProjectRoot"` and `driveListChildren: "pulse.drive.listChildren"`. Get payload is `{ projectId }`. Set payload is `{ projectId, root: WorkspaceDriveRoot | null }`. Both return `DriveProjectRootResult`. List uses `DriveBrowseInput` and returns `DriveBrowsePage`. The existing `DriveError` and `EnvironmentAuthorizationError` union remains. W7-T1 adds optional `pulseCapabilities.driveProjectRoot` for root settings; W7-T2 adds optional `pulseCapabilities.driveExplorer` for browsing. Trust either only from live config. Keep `driveRead` for older direct readers.

## Tasks

### Task W7-T1: Explicit confirmed root and account designation

**Depends on:** W4-T0 for the preserved baseline. No resource-frame or Calendar prerequisite for storage. W4-T5 supplies the final project-settings entrance, but is not a storage dependency.

**Serial slot:** After W5-T4 in the cross-wave config chain. Hold the exclusive RPC/migration slot for shared changes and `ProjectTasks.tsx` UI ownership for settings changes. Release before W8-T1a; W7-T2 follows this task. Preserve W5's completion, profile and other config fields. Do not reserve a migration number before obtaining the slot.

**Risk:** `door=two-way`, `blast_radius=bounded`. Root changes are reversible local configuration. Confirmed links and Google files survive clear, unlink, disconnect and rollback.

**Files, verified starting anchors:**

- Modify `packages/contracts/src/pulseDrive.ts:1-153`, `pulseDrive.test.ts:1-18`; `packages/contracts/src/pulseWorkspaceTools.ts:10-15,52-68`, `pulseWorkspaceTools.test.ts:1-30` for optional root decoding and legacy-save preservation.
- Modify `apps/server/src/drive/DriveStore.ts:58-143,219-257`, `DriveService.ts:10-94`, `DriveService.test.ts:1-246`, `testing/fakeDrive.ts:8-72` for root selection, generation recheck and scripted folder metadata.
- Modify `apps/server/src/workspace/WorkspaceTools.ts:43-64,82-126` and `WorkspaceTools.test.ts:1-84` for config reads and preserving a root during old saves. No new links store.
- Create one next-free `apps/server/src/persistence/Migrations/` file ending `_WorkspaceDriveRoot.ts`; modify `apps/server/src/persistence/Migrations.ts:1-80,90-233`. Read `064_WorkspaceTools.ts:1-8` as the schema precedent, without editing it.
- Modify shared wiring only as necessary: `packages/contracts/src/index.ts:1-77`, `rpc.ts:1-10,1760-1785`, `server.ts:606-631`; `apps/server/src/ws.ts:584-600,1240-1275,2005-2020`; `auth/RpcAuthorization.ts:30-50` and adjacent `RpcAuthorization.test.ts`; `packages/client-runtime/src/state/drive.ts:12-94` and `drive.test.ts:1-122`.
- Modify `apps/web/src/components/workspace/ProjectTasks.tsx:32-159`, `ProjectTasks.test.tsx`, `DriveFiles.tsx:21-34`, `mail/useMailCapabilities.ts:25-40`; create `ProjectDriveRootSettings.tsx` and `ProjectDriveRootSettings.test.tsx` beside `ProjectTasks.tsx` so W5 task edits do not absorb Drive behavior.
- `apps/web/src/state/drive.ts:1-3` and `state/workspaceTools.ts` remain factory bindings unless their inferred exports need repair. `packages/client-runtime/src/rpc/client.ts:1-409` derives unary methods; do not add a manual duplicate if inference already covers the additions. `apps/server/src/server.ts:655-666` already provides Drive's dependencies and requires no new service.

**Interfaces:** Consumes the existing confirmed `WorkspaceLinkView`, binding `DriveBinding`, named connection and project identity. Produces `WorkspaceDriveRoot`, `DriveProjectRootResult`, get/set root RPCs and `drive.projectRoot`/`drive.setProjectRoot` atoms. W4 project settings hosts `ProjectDriveRootSettings`. W7-T2 consumes the same persisted designation; W8 can inspect optional config root without treating it as a grant.

- [ ] **1. Add the red root lifecycle test through the service boundary.** Extend the existing `setup` and `testLayer` in `DriveService.test.ts`. Reuse the real OAuth fake. Add a test-only helper below `setup`, using the existing JSON encoder and SQL schema:

```ts
const projectId = ProjectId.make("drive-project");
const rootLinkId = "wl_00000000-0000-0000-0000-000000000001";
const seedRootLink = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const project = { type: "project" as const, projectId };
  const file = { type: "file" as const, provider: "google-drive" as const, fileId: "root" };
  const ordered = [project, file].sort((a, b) =>
    workspaceItemKey(a).localeCompare(workspaceItemKey(b)),
  );
  const a = ordered[0]!;
  const b = ordered[1]!;
  yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Drive project','/synthetic','[]','2026-10-13T08:30:00Z','2026-10-13T08:30:00Z')`;
  yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) VALUES(${rootLinkId},${workspaceItemKey(a)},${workspaceItemKey(b)},${encodeJson(a)},${encodeJson(b)},'confirmed',${encodeJson({ type: "user" })},'2026-10-13T08:30:00Z','2026-10-13T08:30:00Z')`;
});

it.effect("keeps a root designation separate from links and legacy settings saves", () =>
  Effect.gen(function* () {
    const { fake, oauth, service, connection, signIn } = yield* setup;
    const sign = yield* signIn;
    yield* oauth.complete(sign.flow.flowId, sign.returned.href);
    yield* seedRootLink;
    fake.state.mimeType = "application/vnd.google-apps.folder";
    yield* service.bindFile({ connectionId: connection.id, fileId: "root" });
    const root = { linkId: rootLinkId, connectionId: connection.id, fileId: "root" };
    expect((yield* service.setProjectRoot({ projectId, root })).state).toBe("available");
    const sql = yield* SqlClient.SqlClient;
    expect(yield* sql`SELECT link_id FROM workspace_links`).toHaveLength(1);
    const tools = yield* Tools.make;
    yield* tools.saveConfig({ projectId, taskColumns: ["To do", "Done"], browserThreadId: null });
    expect((yield* service.getProjectRoot({ projectId })).root).toEqual(root);
    expect((yield* Tools.make.pipe(Effect.flatMap((t) => t.config(projectId)))).driveRoot).toEqual(
      root,
    );
    yield* service.setProjectRoot({ projectId, root: null });
    expect((yield* service.getProjectRoot({ projectId })).state).toBe("unconfigured");
    expect(yield* sql`SELECT link_id FROM workspace_links WHERE status='confirmed'`).toHaveLength(
      1,
    );
  }).pipe(Effect.scoped, Effect.provide(testLayer())),
);
```

Import `ProjectId`, `workspaceItemKey` and `* as Tools` using existing import conventions. The fixture inserts only disposable in-memory rows. Add cases using the same helper for a suggested/dismissed/foreign-project link, non-folder metadata, missing binding, mismatched binding, a deleted project and a removed connection. Error kinds must remain existing typed Drive errors. Prove rejected mutations leave config, bindings and relationships unchanged.

- [ ] **2. Run the red tests.** From `apps/server`, run `vp test run src/drive/DriveService.test.ts src/workspace/WorkspaceTools.test.ts`. Expected failure is the missing `setProjectRoot`/`getProjectRoot` behavior, not a fixture SQL failure. From `packages/contracts`, add and run `vp test run src/pulseDrive.test.ts src/pulseWorkspaceTools.test.ts` to prove an old config without driveRoot still decodes and explicit null decodes. Update exact RPC-count tests for the admitted methods without deleting their read-only prohibitions.

- [ ] **3. Allocate and add the forward migration.** While holding the slot, run this PowerShell from the worktree root. Retain the resulting literal path in the task record and commit file list.

```powershell
$lastDriveMigration = Get-ChildItem -LiteralPath apps/server/src/persistence/Migrations -File |
  Where-Object { $_.Name -match '^\d+_' } |
  ForEach-Object { [int]($_.Name.Split('_')[0]) } |
  Measure-Object -Maximum
$driveRootMigration = 'apps/server/src/persistence/Migrations/{0:D3}_WorkspaceDriveRoot.ts' -f ([int]$lastDriveMigration.Maximum + 1)
Write-Output $driveRootMigration
```

The file contains:

```ts
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE workspace_project_config ADD COLUMN drive_root_json TEXT`;
});
```

Register its actual numeric key in `Migrations.ts`. No backfill chooses folders. Existing projects decode null. The old `saveConfig` INSERT/UPDATE retains its existing columns, preserving the new column on conflict. Add a select/decode of the optional JSON in `WorkspaceTools.config`; import the shared schema, do not parse unvalidated JSON. After saveConfig writes and announces, return `yield* config(input.projectId)` instead of spreading input, so an ignored caller-supplied driveRoot cannot appear as a successful root change in the response. Test that forged-property case as well as omitted legacy fields.

- [ ] **4. Implement the root state and dedicated setter without adding a relationship graph.** Add root get/save methods inside `DriveStore.make`, reusing `safe`, `mutate`, `get`, `binding`, the SQL client and Drive change counter. Root reads first require a nondeleted project. Query `workspace_project_config`, exact link ID and endpoint keys, the bound file and connection. Compare both unordered endpoints through `workspaceItemKey`; accept only `status='confirmed'`. A missing link, changed binding or disconnected connection returns the corresponding state while preserving the designation. A missing project fails not-found. A corrupt JSON record fails unavailable, never resets silently.

Use `Schema.fromJsonString(WorkspaceDriveRoot)` for storage. A clear writes SQL null and emits after commit, without calling Google, unlinking or unbinding anything. To initialize a config row, use default task columns and browserThreadId only in the INSERT branch; the conflict branch updates only drive_root_json. Thus W5 and W8 fields survive.

```ts
yield *
  sql`INSERT INTO workspace_project_config(project_id,columns_json,browser_thread_id,drive_root_json) VALUES(${projectId},${encodeJson(["To do", "In progress", "Done"])},NULL,${rootJson}) ON CONFLICT(project_id) DO UPDATE SET drive_root_json=excluded.drive_root_json`;
```

`DriveService.setProjectRoot` verifies an existing same-connection binding, obtains that account's token, calls `api.file` through `observe`, and requires `application/vnd.google-apps.folder`. It never calls `bindFile`. Pass the captured connection generation to the store save; inside its serialized transaction recheck project, link, binding and generation immediately before the write. Clear needs no connected account. Reusing the same designation is idempotent. Replace is explicit and preserves the old designation on failure.

Add an HTTP Deferred gate in the fake for metadata. Disconnect or rebind while that request is blocked, release it, and assert a conflict with no saved new root. Reconnect the same named identity remains possible; a different identity still requires a new connection under the existing OAuth behavior. Never auto-rebind the root.

- [ ] **5. Wire optional RPCs and shared state.** Put the two new methods into `PulseDriveRpcs` and the existing `DriveWsRpcGroup.toLayer`, not CoreWsRpcGroup. Map get to read scope and set to operate scope. Preserve the existing Drive family and layers. Add optional `driveProjectRoot` to the capability schema, live server response and capability hook. Root settings trust this live flag. Leave `driveExplorer` false/absent until W7-T2 ships the complete root/list set. Test decoding absent flags and assert no root RPC is called by older-server settings.

Add the following factory entries with current runtime helpers:

```ts
projectRoot: createEnvironmentRpcQueryAtomFamily(runtime, {
  label: "drive:projectRoot",
  tag: WS_METHODS.driveGetProjectRoot,
  refreshTrigger,
  staleTimeMs: 30000,
}),
setProjectRoot: createEnvironmentRpcCommand(runtime, {
  label: "drive:setProjectRoot",
  tag: WS_METHODS.driveSetProjectRoot,
  scheduler,
  concurrency,
}),
```

Use the existing Drive subscription for cross-client root mutations. `staleTimeMs` is cache freshness, not a periodic timer. In the runtime test, mount `atoms.projectRoot`, mutate fake root state, emit the Drive change counter, await a Latch on the new value and assert updated root. Test that another environment's same project ID cannot supply data. Link-removal invalidation is completed in the explorer by the existing workspace-link subscription in W7-T3, not by a new background watcher.

- [ ] **6. Add the project-root settings section.** Export the existing `useDriveAccess` and `errorText` helpers from `DriveFiles.tsx` and reuse them in the new settings component. Mount `ProjectDriveRootSettings` in `ProjectWorkspaceSettings`, below existing fields, consuming the dedicated root atom. Show only confirmed direct project-folder candidates and the explicit saved binding. Missing metadata is not a folder candidate until the user explicitly chooses a connection and verifies/binds it through the existing bind action. A suggested or one-hop folder needs ordinary explicit linking first. List truncation must say more links may exist and retain the existing Link to search path; do not scan all project links.

Choose, replace and clear require operate scope. Cancel writes nothing. Keep the chosen account visible in settings, without introducing an account selector into the resting explorer. Keep settings root actions gated by live driveProjectRoot; on old servers offer existing direct-file tools. Candidate links use the existing link subscription; when the root relation disappears or changes status, refresh dedicated root state so an open settings form cannot keep claiming available. Test selecting a candidate, cancellation, a failed replace retaining the prior root, clear with a disconnected account, deleted project, and another-client root subscription update. Do not reset unsaved task columns when root state changes.

- [ ] **7. Run green verification.** In `apps/server`: `vp test run src/drive/DriveService.test.ts src/workspace/WorkspaceTools.test.ts src/auth/RpcAuthorization.test.ts`. In `packages/contracts`: `vp test run src/pulseDrive.test.ts src/pulseWorkspaceTools.test.ts`. In `packages/client-runtime`: `vp test run src/state/drive.test.ts src/state/workspaceTools.test.ts`. In `apps/web`: `vp test run src/components/workspace/ProjectDriveRootSettings.test.tsx src/components/workspace/ProjectTasks.test.tsx src/components/workspace/DriveFiles.test.tsx`. Expected all pass, with rejected calls issuing no unrelated Google or link writes. Run `vp run typecheck` in each affected package, including `apps/server`, then root `vp lint` with only the changed TypeScript file paths as arguments. Record exact exits.

- [ ] **8. Complete the surface and visual checks for this task.** Entry points are scoped project settings and W4's footer gear, with the same choose/replace/clear actions reachable by keyboard and touch. Web and desktop share this form; mobile receives compatible optional contracts and responsive web, no native screen. Codex, Claude, Cursor, Grok, OpenCode, Antigravity and configured ACP providers get no new descendant read grant or adapter code. Contracts retain old decode/save compatibility. Reverse paths are choose/replace/clear, unlink/relink and disconnect/reconnect. Test local/direct/relay/tunnel transport fixtures through environment RPC state, without client filesystem or hardcoded origins. User docs are in W7-T3's gate. Visual acceptance uses all four recipes, box `[953,192,314,185]`, root breadcrumb and confirmed Marketing icon, with no opened-folder fill. Only real root/account/confirmed-link substitutions and W4 chrome substitutions are allowed. Settings states require their proposed capture review.

- [ ] **9. Commit only this task's files when implementation is authorized.** Use the exact staged list below, dropping a listed file only when it was not changed. Replace the migration variable with its resolved path in the task record, never a glob. Do not stage other waves' hunks from a shared file.

```powershell
git add -- packages/contracts/src/pulseDrive.ts packages/contracts/src/pulseDrive.test.ts packages/contracts/src/pulseWorkspaceTools.ts packages/contracts/src/pulseWorkspaceTools.test.ts packages/contracts/src/index.ts packages/contracts/src/rpc.ts packages/contracts/src/server.ts apps/server/src/drive/DriveStore.ts apps/server/src/drive/DriveService.ts apps/server/src/drive/DriveService.test.ts apps/server/src/drive/testing/fakeDrive.ts apps/server/src/workspace/WorkspaceTools.ts apps/server/src/workspace/WorkspaceTools.test.ts apps/server/src/persistence/Migrations.ts apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts packages/client-runtime/src/state/drive.ts packages/client-runtime/src/state/drive.test.ts apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/ProjectTasks.test.tsx apps/web/src/components/workspace/ProjectDriveRootSettings.tsx apps/web/src/components/workspace/ProjectDriveRootSettings.test.tsx apps/web/src/components/workspace/DriveFiles.tsx apps/web/src/components/workspace/mail/useMailCapabilities.ts
git add -- "$driveRootMigration"
git diff --cached --check
git commit -m "feat(workspace): designate a confirmed project Drive folder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task W7-T2: Paged child reads, scoped search and metadata filters

**Depends on:** W7-T1. No Google account connection is needed for fake-boundary tests. Real-account consent and scope sufficiency remain separate admission evidence for live reads.

**Serial slot:** W7-T1 precedes this task in the RPC/migration chain. Hold the exclusive slot while adding method/schema/capability/auth wiring. No new migration is expected. Do not edit W6 or W9 connector files.

**Risk:** `door=two-way`, `blast_radius=bounded`. Metadata queries are read-only; cursor invalidation or a capability rollback affects navigation, not file contents.

**Files, verified starting anchors:**

- Modify `packages/contracts/src/pulseDrive.ts:27-42,74-153`, `pulseDrive.test.ts`; optional capability at `server.ts:606-631`, existing aggregate at `rpc.ts:1-10,1760-1785`, exports at `index.ts:1-77`.
- Modify `apps/server/src/drive/DriveApi.ts:9-40,43-112,131-158`, `DriveService.ts:10-94`, `DriveStore.ts:219-257` plus W7-T1 additions only as required. Create `apps/server/src/drive/DriveApi.test.ts`. Extend `DriveService.test.ts:1-246` and `testing/fakeDrive.ts:8-72` with per-request scripts and Deferred gates. Do not fetch bodies to implement listings.
- Modify `apps/server/src/ws.ts:1257-1274,2005-2020`, `auth/RpcAuthorization.ts:38-49`, adjacent auth tests, `packages/client-runtime/src/state/drive.ts:12-94` and `drive.test.ts`. `rpc/client.ts` and `server.ts` need changes only if inferred wiring or existing layer requirements demand them.

**Interfaces:** Consumes `WorkspaceDriveRoot` and current root/binding state. Produces `DriveBrowseInput`, `DriveBrowsePage`, `driveListChildren`, `drive.listChildren`. Extend `DriveFile` with optional structured `owners: readonly { displayName?: string; emailAddress?: string; me?: boolean }[]`, `parents: readonly string[]`, `driveId?: string`, and shortcut metadata only as decoded from provider metadata. Retain the legacy owner string. New optional metadata must be bounded and old payloads still decode. `path` contains the folder IDs after the root, ending in parentId; root listing has `path: []` and parentId equal to root.fileId. No arbitrary ancestry or recursive search is implied.

- [ ] **1. Add a red API test with the actual HTTP-shaped fake.** Add `state.listRequests` scripts to `makeFakeDrive`; each script supplies status, files, nextPageToken and incompleteSearch. Support explicit response blocking with Effect Deferreds for tests, not a timer. Preserve current search/body/OAuth fake behavior for existing tests. The request list already records every URL and method.

```ts
it.effect("filters and sorts the folder query before requesting a page", () =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    yield* api.listChildren("synthetic-token", {
      parentId: "root",
      query: "Nina's \\ plan",
      type: "document",
      owner: "owner@example.test",
      modifiedAfter: "2026-10-10T00:00:00Z",
      sort: "modifiedTime",
      direction: "desc",
      limit: 20,
      pageToken: "second-provider-page",
    });
    const call = fake.calls.at(-1)!;
    expect(call.method).toBe("GET");
    expect(call.url.searchParams.get("q")).toBe(
      "trashed = false and 'root' in parents and name contains 'Nina\\'s \\\\ plan' and mimeType = 'application/vnd.google-apps.document' and 'owner@example.test' in owners and modifiedTime >= '2026-10-10T00:00:00Z'",
    );
    expect(call.url.searchParams.get("orderBy")).toBe("folder,modifiedTime desc,name");
    expect(call.url.searchParams.get("pageToken")).toBe("second-provider-page");
    expect(call.url.searchParams.get("pageSize")).toBe("20");
    expect(call.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(call.url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
    expect(call.url.searchParams.get("fields")).not.toContain("permissions");
  }),
);
```

The expected string deliberately proves single-quote and backslash escaping. Add MIME exclusion, me-owner, date range and invalid date/owner cases. Run from `apps/server`: `vp test run src/drive/DriveApi.test.ts`. Expected failure is absent listChildren/query behavior.

- [ ] **2. Add a red multi-page service test.** Extend the W7-T1 fixture with a valid chosen root. Script root metadata, a 20-item first page and a second page with duplicate names and ownerless shared-drive metadata. Assert a bounded first response, nonempty nextCursor, continuation without duplicate file identities in the rendered collection, and empty-list success. Call again after changing any connection, project, parent, path, query, filter, sort, direction or limit while reusing its cursor and assert invalid-input/conflict before a Google list call. A raw Google page token must not be accepted as a client cursor.

Use this pattern for the root-change case in the existing service describe block:

```ts
const input = {
  projectId,
  connectionId: connection.id,
  parentId: "root",
  path: [],
  sort: "name" as const,
  direction: "asc" as const,
  limit: 20,
};
const first = yield * service.listChildren(input);
expect(first.nextCursor).toBeDefined();
const before = fake.calls.length;
yield * service.setProjectRoot({ projectId, root: null });
const error =
  yield * service.listChildren({ ...input, cursor: first.nextCursor! }).pipe(Effect.flip);
expect(error.kind).toMatch(/conflict|connection-required/);
expect(fake.calls).toHaveLength(before);
```

Also prove path reachability, shortcut refusal, provider 401/403/404, malformed metadata, incompleteSearch with and without a next page, duplicate/cyclic path, a >16-depth path, and a root deleted during a request. Run `vp test run src/drive/DriveService.test.ts` in `apps/server`; expected red is missing listChildren.

- [ ] **3. Implement bounded GET listing at the existing API boundary.** Keep query building in `DriveApi.ts` beside search. Reuse its request/json/metadata helpers, 15-second error bound and `observe` health mapping. Add fixed MIME lookup and one escaping function, never concatenate unvalidated order or filter operators.

```ts
const quote = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
const mimeByType = {
  folder: "application/vnd.google-apps.folder",
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
} as const;
const clauses = ["trashed = false", `${quote(input.parentId)} in parents`];
if (input.query?.trim()) clauses.push(`name contains ${quote(input.query.trim())}`);
if (input.type && input.type !== "other") {
  clauses.push(`mimeType = ${quote(mimeByType[input.type])}`);
}
if (input.type === "other") {
  for (const mime of Object.values(mimeByType)) clauses.push(`mimeType != ${quote(mime)}`);
  clauses.push("mimeType != 'application/vnd.google-apps.shortcut'");
}
if (input.owner) clauses.push(`${quote(input.owner)} in owners`);
if (input.modifiedAfter) clauses.push(`modifiedTime >= ${quote(input.modifiedAfter)}`);
if (input.modifiedBefore) clauses.push(`modifiedTime < ${quote(input.modifiedBefore)}`);
const orderBy =
  input.sort === "name"
    ? `folder,name ${input.direction}`
    : `folder,modifiedTime ${input.direction},name`;
```

Validate owner as `me` or a single bounded email at the service boundary, validate RFC3339 date bounds and after < before, enforce max50 limit and a bounded provider token. Request `nextPageToken,incompleteSearch,files(id,name,mimeType,trashed,modifiedTime,size,owners(displayName,emailAddress,me),parents,driveId,shortcutDetails(targetId,targetMimeType))`. Bound strings and owners, reject oversized/invalid response pages rather than silently truncating and losing rows. Do not add `permissions`, body content or exports. All fields are optional on old metadata except the existing required file identity fields.

Folder URLs use `https://drive.google.com/drive/folders/ID`; native Docs/Sheets/Slides can use canonical provider URLs by MIME. Preserve the file ref identity. Only construct HTTPS Google URLs from validated IDs. A shortcut opens its own provider link and is never dereferenced by this service.

Sorting is provider-side for the complete query before pagination. Do not add `id` to Google orderBy, where it is not a supported key. Preserve provider token order for ties, deduplicate accumulated rows by file ID and reset on explicit Refresh. The endpoint is not a transactional snapshot of a changing Drive. Test repeatable ties against the scripted boundary and disclose incompleteness when the provider reports it, without claiming an immutable listing.

- [ ] **4. Bind reads and cursors to the current project scope.** Read the root designation from the existing config row through DriveStore, never accept a client-supplied root as authority. Validate the confirmed link, saved binding, same account and nondeleted project before any provider request and again before returning. Obtain one token/generation for the request. Fetch root metadata and each supplied folder's metadata along the path; every folder must be nontrashed, have folder MIME and name the preceding folder in parents. Reject cycles and shortcuts. For shared-drive folders with insufficient parent metadata, show unsupported/unavailable and an external open rather than guessing ancestry. Work is bounded to root + at most 16 path metadata reads and one page; cache only metadata needed for the active request/session and never scan descendants.

Use a process-local random signing key and authenticated, expiring opaque cursors. A cursor contains a version, provider page token, expiry, connection generation, root identity and normalized browse fingerprint. Bind project, connection, parent, path, normalized query, MIME/owner/date filters, sort, direction and limit. Do not expose access tokens, credentials or server paths. Verify its signature and bounded JSON before using its provider token. Use `effect/DateTime` for the clock and existing Node crypto primitives for HMAC; keep all of it server-side. Expiry is ten minutes. After a server restart, return conflict and let Refresh restart page1. There is no persistent cursor table or generic pagination service.

Recheck after the GET so unlink, root replacement, account rebind/disconnect and deletion cannot return stale data. A 401 updates current-generation connection health; a 403 is a sanitized unavailable/permission explanation without alternate-account retries; a 404 retains the relationship with unavailable copy. Do not emit root/link changes as a side effect of a browse.

- [ ] **5. Extend the optional RPC and runtime command.** Map `driveListChildren` to read scope in the existing Drive RPC layer. Advertise optional `driveExplorer: true` only when all three new methods exist. Keep old `driveRead` behavior intact. Add `driveExplorer` to the live capability hook. Use command-based browsing, so only the active folder submits work:

```ts
listChildren: createEnvironmentRpcCommand(runtime, {
  label: "drive:listChildren",
  tag: WS_METHODS.driveListChildren,
  scheduler,
  concurrency,
}),
```

Serialize per environment using the existing scheduler, with one active visible request and request-generation suppression on the caller. Do not issue a query for every row. In the runtime test, use a Deferred response to switch scope mid-flight and prove results remain attached to their original environment/input. Test both new and old server capability snapshots. Use the existing Latch/SubscriptionRef test pattern for changes; no readiness loops.

- [ ] **6. Run green and bound the cost.** In `apps/server`: `vp test run src/drive/DriveApi.test.ts src/drive/DriveService.test.ts src/auth/RpcAuthorization.test.ts`. In `packages/contracts`: `vp test run src/pulseDrive.test.ts src/pulseWorkspaceTools.test.ts`. In `packages/client-runtime`: `vp test run src/state/drive.test.ts`. Expected all pass. Assert root-level listing uses bounded metadata + one list call, no `/export`, `alt=media`, bind, link or writes; extra pages do not fetch file bodies. Unknown owners do not trigger per-row owner queries. Run affected package `vp run typecheck`, including `apps/server`, and targeted root `vp lint` on the changed TS paths.

- [ ] **7. Complete this task's surface and visual checks.** Entry points consume one public read method for list, search, filter, sort, Refresh and pagination, including future picker mode. Web/desktop/phone use the same environment command; RN can decode optional metadata without a new screen. All configured providers retain the existing per-file linked read grant; no adapter or MCP toolkit gains directory traversal. Contracts retain old file payloads and methods. Reverse paths clear filter, reset sort, back to parent, clear root, disconnect/reconnect and restart an expired cursor. Exercise local/direct/relay/tunnel and multi-environment fake sessions. Docs are deferred only to this wave's W7-T3 gate. Visual acceptance uses all four recipes, `[953,149,314,485]`, exact fixture rows/dates/filter labels and metadata-only reads. Real names/dates/MIME/owners/paged counts are the only data substitutions, plus W4 chrome. Sorting behavior must pass independently of the sample ordering conflict.

- [ ] **8. Commit the bounded reader changes when authorized.** Explicit list, excluding unchanged files and other owners' hunks:

```powershell
git add -- packages/contracts/src/pulseDrive.ts packages/contracts/src/pulseDrive.test.ts packages/contracts/src/index.ts packages/contracts/src/rpc.ts packages/contracts/src/server.ts apps/server/src/drive/DriveApi.ts apps/server/src/drive/DriveApi.test.ts apps/server/src/drive/DriveService.ts apps/server/src/drive/DriveStore.ts apps/server/src/drive/DriveService.test.ts apps/server/src/drive/testing/fakeDrive.ts apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts packages/client-runtime/src/state/drive.ts packages/client-runtime/src/state/drive.test.ts apps/web/src/components/workspace/mail/useMailCapabilities.ts
git diff --cached --check
git commit -m "feat(drive): browse bounded project folder pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task W7-T3: One explorer component across spaces and wave gate

**Depends on:** W7-T2 and W4-T6. Visual acceptance also requires W4-T7. Consume the resource frame and `openFiles` handoff by the wave-map names. The Calendar, Slack/Discord and formatted Docs branches are not code prerequisites for this body.

**Serial slot:** Exclusive ownership of `WorkspaceToolsPanel.tsx` and the Files branch of W4's `WorkspaceResourcesPanel.tsx` while wiring. Coordinate with W4 and W10, which also extract Browser/Agents from that file. No shared RPC slot is needed unless a real integration defect requires a narrow fix. Gate and fixes stay within W7 scope; return a shared-shell defect to its owner.

**Risk:** `door=two-way`, `blast_radius=bounded`. Existing direct-file fallbacks remain; the new view can be hidden through optional capability without losing links or files.

**Files, verified starting anchors:**

- Create `apps/web/src/components/workspace/ProjectDriveExplorer.tsx`, `ProjectDriveExplorer.test.tsx`, and adjacent `ProjectDriveExplorer.fixtures.ts` for W4-T7's dev/test-only factory registration. Fixture implementation must use the W4 loader's existing exclusion rules, never a production import.
- Modify `apps/web/src/components/workspace/DriveFiles.tsx:34-169,170-354`, `DriveFiles.test.tsx:1-197` only for reader reuse and exported hooks where necessary. Preserve standalone `DriveSearch` and existing reader capability behavior.
- Modify `WorkspaceToolsPanel.tsx:28-75,109-140` and `WorkspaceToolsPanel.test.tsx:1-175` at the Files body seam. Consume W4-created `WorkspaceResourcesPanel.tsx`, selected project and `openFiles` exports. Their future line numbers cannot be verified before W4 lands; inspect those concrete exports at dispatch, do not assume a second project selector.
- Reuse `WorkspaceItemActions.tsx:1-575`, `mail/useMailLinks.ts:22-57`, `useWorkspaceItemOpener.ts:34-81`, `mail/linkedItems.ts:1-171` and `WorkspaceItemRef` helpers without rewriting them. If `openFiles` lives in a W4 file, modify only its Files-intent branch in the serial slot. W11/W9/W5/W8 own individual space callers.
- Modify `docs/user/google-drive.md:1-13`, `docs/internals/overview.md:1-20`, `docs/internals/glossary.md:6-20`. Update existing sections, not a new file catalog. W4 owns the definition of resource frame; W7 owns Drive root.

**Interfaces:** Consumes FilesBodyInput from W4, `drive.projectRoot`, `drive.listChildren`, existing config/connection/link change subscriptions, and WorkspaceDriveRoot. Produces `ProjectDriveExplorer`, the receiving `openFiles` behavior, stable file endpoints for shared actions and a narrow future picker callback. Export this component-local type for W11; it is not a wire schema or a new shell type:

```ts
export type ProjectDriveExplorerProps = FilesBodyInput & {
  requested?: Pick<OpenFilesInput, "folderId" | "fileId">;
} & (
    | { mode?: "browse"; onChoose?: never; onCancel?: never }
    | {
        mode: "pick";
        onChoose: (choice: { endpoint: WorkspaceLinkEndpoint; connectionId: string }) => void;
        onCancel: () => void;
      }
  );
```

The default mode is browse. Picking requires both callbacks. Call onChoose only after an explicit choose; W11 owns canonical URL insertion and approval text. Selection alone neither binds nor links. W7 does not implement email attachment approval or binary transfer.

- [ ] **1. Review proposed missing states before CSS work.** Use the reference and state specifications above to review root selection, nested/back, empty, error, filter, grid and phone adaptations with the primary implementation controller. Preserve the supplied composition. Record any accepted change in the capture manifest. An unseen state is not covered just because it fits the reference box. Read the current W4 component and existing tokens immediately before implementation.

- [ ] **2. Add a red action-driven explorer test.** Follow `DriveFiles.test.tsx` with ReactTestRenderer and mocked state commands. Use actual component state transitions and assert requests and visible state, not static markup snapshots. Add `mocks.root`, `mocks.listChildren`, `mocks.bind`, `mocks.link`, and a list script returning folder metadata with parents. Stub UI primitives consistently. In the test module, define accessible-action lookup once:

```tsx
const button = (label: string) =>
  renderer!.root
    .findAllByType("button")
    .find((node) => node.props["aria-label"] === label || node.props.children === label)!;

it("browses root and back without binding or linking a child", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => {
    renderer = create(
      <ProjectDriveExplorer
        environmentId={environmentId}
        projectId={ProjectId.make("project-drive")}
        onOpen={mocks.open}
      />,
    );
  });
  expect(mocks.listChildren).toHaveBeenLastCalledWith({
    environmentId,
    input: {
      projectId: ProjectId.make("project-drive"),
      connectionId: mocks.root.connectionId,
      parentId: mocks.root.fileId,
      path: [],
      sort: "name",
      direction: "asc",
      limit: 20,
    },
  });
  await act(async () => {
    button("Open folder Marketing").props.onClick();
  });
  expect(mocks.listChildren.mock.calls.at(-1)![0].input).toMatchObject({
    parentId: "marketing",
    path: ["marketing"],
  });
  await act(async () => {
    button("Back to SynKEK").props.onClick();
  });
  expect(mocks.listChildren.mock.calls.at(-1)![0].input.parentId).toBe(mocks.root.fileId);
  expect(mocks.bind).not.toHaveBeenCalled();
  expect(mocks.link).not.toHaveBeenCalled();
});
```

Test setup must seed a valid connected root and first-page Marketing folder. Add a distinct deferred test: start an old page, update environment/project/root before resolving it, return the old page and assert its text never appears, old cursor is cleared and no new selection/link was made. Use a manually resolved Promise inside `act`, never sleeps or a polling helper.

- [ ] **3. Run red.** From `apps/web`, `vp test run src/components/workspace/ProjectDriveExplorer.test.tsx src/components/workspace/WorkspaceToolsPanel.test.tsx`. Expected red is the absent explorer or absent Files routing. A missing W4 dependency is a dispatch error, not permission to recreate the shell.

- [ ] **4. Implement the single body and scoped request lifecycle.** Export `ProjectDriveExplorer` with FilesBodyInput. The host mounts it keyed by environment/project. Root, query, filters, sort and path form a request scope. On scope change immediately clear earlier rows/error/cursor, reset selection when it no longer belongs, and invalidate any old epoch. Start one command for the visible folder and ignore stale completions. Switching tabs or closing the sheet unmounts its request owner. A list/grid toggle reuses metadata and selection without another request.

Use the existing command/result pattern:

```tsx
const list = useAtomCommand(drive.listChildren, { reportFailure: false });
const epoch = useRef(0);
const load = async (input: DriveBrowseInput, append: boolean) => {
  const request = ++epoch.current;
  setBusy(true);
  setError(null);
  const response = await list({ environmentId, input });
  if (request !== epoch.current) return;
  setBusy(false);
  if (response._tag === "Failure") {
    setError(errorText(response));
    return;
  }
  setPage(response.value);
  setFiles((previous) => {
    const values = append ? [...previous, ...response.value.files] : response.value.files;
    return [...new Map(values.map((file) => [file.id, file])).values()];
  });
};
useEffect(
  () => () => {
    epoch.current++;
  },
  [],
);
```

Keep load function dependencies correct and do not create an effect loop through a fresh input object each render. A scope-change path resets rows before load, including on a failed request. Load more is disabled during any in-flight request. Coalesce pending scope changes to the latest visible query instead of queueing obsolete folder requests. After at most 200 accumulated metadata rows, replace further accumulation with an explicit next-page/reset affordance that preserves folder/filter identity; review that state. Do not mount hundreds of body readers or unbounded DOM rows.

Root change notifications use Drive's shared change subscription. Confirmed project-link data uses the existing link atoms and their change stream. A link or binding invalidation clears rows and requests fresh root status; it never makes a timer. Do not infer a new root from the first remaining linked folder. Avoid remounting or refetching every resource tool when Files changes.

- [ ] **5. Render the exact resting geometry and useful controls.** Fit the 314px inner width using tokens, not page-level fixed positioning. Root frame provides the scroll height and fixed footer. Search is a pill with scope description accessible through `aria-describedby`; Enter submits trimmed name text, clear resets page1, typing alone performs no network work. Type/People/date changes reset cursor. Name/Modified headers change server sort and expose aria-sort. Root and nested breadcrumb buttons change the actual path; Back restores the previous folder's scroll/selection where retained. Do not change persisted root on navigation.

Use an ordinary semantic list or table without a heavyweight tree-grid dependency. Folder and file titles truncate accessibly. Confirmed linked folders use the blue `Folder`; others stay muted. Use stable file IDs as keys, not row indexes or names. Dates use the pinned timezone/locale in fixtures and the configured display timezone live. Keep row pitch 43px and name/date/action columns aligned. Folder overflow is always visible in the fixture; document overflow can reveal on focus/hover with a touch control. List/grid renders the same endpoint actions and selected identity.

Sliders opens the proposed bounded filters, with owner semantics and date validation specified above. Reset and Cancel are explicit. No provider directory query or sharing count. Loading/error/empty and unsupported-shortcut copy follow the state list. Never place development terms, cursor internals or connection generations in product copy.

- [ ] **6. Route read-only actions through existing bindings and links.** Rows expose `Open in Google Drive`, `Copy link`, `Link to project`, `Unlink from project` when already confirmed, and shared Start thread/Add to project/Start project/Start automation actions where supported. Only explicit actions write Pulse state. Rename, move, upload, delete, share and sync are absent. A keyboard menu and visible touch button expose the same captured endpoint as right-click and detail actions.

Opening a folder browses. Opening a document can reuse the existing `DriveFileAccess` reader or hand its stable ref to the existing opener; it must not bind it on click. An unbound read displays the existing explicit connection choice. `Link to project` captures environment, project, file and connection, explicitly verifies/binds through the existing bind command, then links using the existing helper. If binding fails, no link is created; if linking fails, show the retained chosen binding honestly. Unlink uses the captured relation ID, preserving origin for relink. A root unlink makes the explorer unavailable but keeps the designation visible for clear/replace.

For an item-specific link menu, capture the original item before opening the menu. Switching selection or resource project while an action is pending must not retarget it. `WorkspaceItemMenu` remains the common item action UI. Starting work and its cancellation follow the existing flow; merely opening Files, reading a document, choosing grid or invoking `openFiles` starts no provider turn.

- [ ] **7. Integrate the receiving handoff, fallback and fixture factory.** Replace only the Files body mapping with the new explorer when live `driveExplorer` is true and W4 has a resource project. No project yields W4's chooser explanation. An old server with driveRead retains the current linked-file list, DriveSearch and explicit reader. A server without either supports existing external provider links and an honest unavailable explanation. No new explorer RPC is issued before live capability readiness or after a downgrade, even if a cached config says true.

Implement `openFiles` by setting W4's existing resource project/tab/open state and passing a requested folder/file to this one body. Validate folder intent through the server's ancestry path before showing it; when no valid path is supplied, use a bounded metadata ancestry resolution toward the root with the same depth/cycle/shortcut policy, or offer external open. Never start an unbounded recursive search to locate a clicked folder. A file intent can focus an already loaded row or open the existing explicit reader; it does not require scanning all pages. Test same-root, outside-root, deleted target, unavailable connection and unchanged center/draft state.

Expose an explicit picker mode callback for W11 without adding mail behavior now. The non-picking explorer has no `Attach` button. Picker cancel invokes no bind/link/send. Choice returns the stable endpoint and selected connection only; W11 performs any approved binding and inserts a visible canonical URL. Do not infer binary attachment support from this callback.

Register the module-local fixture factory with W4-T7's existing test-only loader. Seed the exact eight rows and dates, same confirmed Marketing relation in 01-04, neutral list selection, explicit root binding and marked sample sharing text. Keep production entry points unable to import sample factories. Do not edit the shared fixture file concurrently with other module owners.

- [ ] **8. Add the remaining action-driven tests and run green.** Cover all four host spaces against the same explorer export, no selected center item, root/nested/back, Enter search and clear, MIME/owner/date filters, Modified sort across a second page, duplicate IDs, grid preserving actions/selection, explicit Refresh, incomplete/empty states, and touch menu scroll cancelation. Assert file counts and actual command inputs, not class names alone.

Prove blue Marketing appears only for a confirmed direct resource-project link; a suggested link, focus, hover or current-folder state does not qualify. For the explicit link action, open a row menu, switch project/item, complete the command and assert the captured endpoints, then unlink/relink and inspect origin preservation through the existing link service test. Include old-server/downgrade tests asserting zero explorer RPC calls, reader tests proving explicit chosen-account behavior, late-response suppression, and close/reopen with one mounted body. Readonly sessions must browse but cannot set root/bind/link.

Run in `apps/web`: `vp test run src/components/workspace/ProjectDriveExplorer.test.tsx src/components/workspace/ProjectDriveRootSettings.test.tsx src/components/workspace/DriveFiles.test.tsx src/components/workspace/WorkspaceToolsPanel.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx`. Run `vp run typecheck` in `apps/web` and `apps/server`, plus targeted root `vp lint` with only changed TS/TSX paths. Expected all pass. If a shared-shell test changes because of another wave, coordinate the owner rather than deleting its assertions.

- [ ] **9. Complete the surface checklist.** Entry points cover Files tab, footer settings, `openFiles`, row right-click, detail/header menu, command palette, existing keybindings and touch/long-press paths from W4's shared actions. Web, desktop and phone web use one component; desktop external open uses the requesting client's shell. Existing RN consumers decode the new optional fields; no native screen. Codex, Claude, Cursor, Grok, OpenCode, Antigravity and configured ACP adapters retain existing explicit per-file read behavior, with no implicit root/descendant grant. Contracts, capability absence and read/operate scopes agree. Reverse paths are back/root, filter clear, list/grid, settings cancel/clear, close/reopen, link/unlink/relink and connect/disconnect/reconnect. Local/direct/relay/tunnel, two environments with identical project/file IDs and another-client root updates have explicit fake-boundary cases. Docs and rendered proof are in the gate below.

- [ ] **10. Run the wave documentation and visual gate below before this task is complete.** This is W7-T3's gate, not a fourth dispatchable task. No screenshot-only pass substitutes for W7-T1/T2 behavior tests.

- [ ] **11. Commit only the integrated body and docs after the gate and authorized evidence collection.** Stage explicitly, excluding unchanged files and other owners' hunks:

```powershell
git add -- apps/web/src/components/workspace/ProjectDriveExplorer.tsx apps/web/src/components/workspace/ProjectDriveExplorer.test.tsx apps/web/src/components/workspace/ProjectDriveExplorer.fixtures.ts apps/web/src/components/workspace/DriveFiles.tsx apps/web/src/components/workspace/DriveFiles.test.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.test.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.tsx docs/user/google-drive.md docs/internals/overview.md docs/internals/glossary.md
git diff --cached --check
git commit -m "feat(web): share the project Drive explorer across workspace spaces" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If W4 locates `openFiles` in another file, obtain its serial slot and record the exact additional path before staging that file. Do not stage unrelated W4/W10 work or a whole working-tree diff. Screenshots and manifests use the repository's evidence policy and producer-owned output paths, never fabricated receipts or casual tracked asset folders.

## Wave gate task, owned by W7-T3

- [ ] Update the existing `docs/user/google-drive.md` with how to choose a confirmed project folder and account, replace/clear it, browse/search this folder, use filters and open provider links. Explain that browsing does not link files or give agents access, People means owner, and disconnect/unlink preserves files and links. Keep existing connection/consent and file-reader guidance. Distinguish older account-wide Link to search from the scoped explorer search. State that uploads/edits/sharing remain in Google Drive without listing every button.
- [ ] Review `docs/internals/overview.md` for the cross-component constraint: a Drive root is navigation configuration over a confirmed relation and explicit binding, not a descendant agent grant; all reads and cursors remain environment/account scoped. Add one concise paragraph only if the existing text does not already express it, otherwise record a specific no-change reason in the completion evidence.
- [ ] Add or update one glossary row in `docs/internals/glossary.md`: `Drive root | The explicitly designated, confirmed project-folder link and chosen Drive connection used for browsing. It grants no access to unlinked descendants.` Keep `Workspace root` meaning the filesystem directory. Coordinate W4's resource-frame term and do not duplicate it.
- [ ] Run the focused commands from all three tasks. Re-run only failures or tests affected by integration repairs. Check changed files for U+2014, `git diff --check`, old-server optional decoding, legacy config-save preservation, get/list read versus set/bind/link operate, and the no-body/no-write request-count assertions. Do not run the repository-wide suite. Record exact commands, exits and remaining unrun checks.
- [ ] The primary implementation controller obtains explicit browser/server authorization, uses `test-t3-app` once after integration, and captures all four W4-T7 fixture recipes at 1280x800. Settle through fixture/service receipts, clear focus/hover and pending work, and record project/tab/ref, root/account, clock, timezone, locale, font, OS, theme and selected view. Do not load credentials or live userdata. Capture before/after and overlay/difference crops for `[953,149,314,527]`; also inspect W7-T1 and W7-T2 sub-boxes. No UI implementation subagent launches a server or browser.
- [ ] Pass only when the body has matching search/breadcrumb/filter/header spacing, all eight exact fixture rows/dates, 43px pitch, blue confirmed Marketing, correct Files selection in 01-04 and the fixture sharing line at y655. Frame widths/footer/tab placement remain W4's responsibility. Allowed live substitutions are actual project/root/account/file names, MIME/owner/date/paged counts, confirmed linked-folder emphasis and `Files stay in Google Drive.`, plus W4's chrome table. No unsupported team claim, count, account or access role qualifies as a substitution. Record the fixture sorting inconsistency disposition explicitly.
- [ ] In the same authorized pass, capture 1024px and 390x844 states. Open Resources before selecting an item; traverse a folder, Back, filter, grid, menu, close and reopen. Check no page overflow, one mounted body across resizing, input focus/keyboard, scrolling/footer, selected project and center draft preservation. Review proposed grid/empty/error/root-settings captures. Batch defects once, then confirm only affected cases.
- [ ] Record responsive web, packaged desktop, native compatibility, actual remote device, live account and pilot as separate outcomes. Local/direct/relay/tunnel fake tests prove RPC isolation, not physical-device access. Without real credentials or permission, mark those acceptance items unrun. Default-wave completion must not claim live-account or remote acceptance from synthetic screenshots.

## Self-review and handoff

### Decisions assumed

All listed defaults are **default assumed, confirm**, not consent to connect accounts or perform provider operations.

| Decision | Assumption in this plan                                                                                                                                                                                                     | Boundary                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D14      | Read-only folder explorer; one confirmed project-folder relation plus explicit account; set/replace/clear; MIME/owner/date filters; server sort; list/grid. Search is names within the current folder's immediate children. | No recursive index, implicit binding, shortcut traversal, Drive sync or Drive writes.                       |
| D11      | Live sharing sentence is `Files stay in Google Drive.`                                                                                                                                                                      | No permissions fetch, team inference, role or sharing mutation.                                             |
| D03      | Marked sample fixtures own sample identities; 02 selects Files.                                                                                                                                                             | No fixture names/connection claims leak live; file listing order conflict is separately disclosed.          |
| D29      | Blue Marketing means confirmed direct folder link to the resource project, with accessible Linked to project text.                                                                                                          | Hover, focus, selection, opened folder and suggestion never imply confirmation.                             |
| D02      | Resource project and Linked context remain separate.                                                                                                                                                                        | Browse/project choice changes navigation only, never the selected item's relationships.                     |
| D24      | Web, shared desktop, responsive phone web; native-compatible optional contracts.                                                                                                                                            | No new RN screens; real-account/packaged/physical-device/pilot claims remain separate.                      |
| D25      | Consume W4's live Pulse Code/Workspace terminology and sample chrome mapping.                                                                                                                                               | W7 does not rebrand or reconstruct shell chrome.                                                            |
| D16      | The future picker returns a stable provider file choice for canonical-link insertion.                                                                                                                                       | W11 owns visible URL insertion and exact-send approval; no binary upload/export/attachment transport in W7. |

### Code findings and deviations

- Current `WorkspaceToolsPanel` has only selected-item linked files at lines72 and109-140 and a Browser-local project choice at55-71. It has no project explorer. Do not integrate W7 against that temporary project inference after W4 supplies the resource project.
- Current DriveFile binding is globally keyed by file ID within an environment, not by project. Root designation therefore records the explicit connection and fails honestly on a mismatched rebind. This plan preserves that shared reader model and adds no second binding table.
- Current Drive search discards nextPageToken and reports only incomplete, and the reader already has generation checks. Extend the existing API/service with listChildren; preserve account-wide search for Link to and suggestions. No new OAuth connector or body reader is justified.
- Root storage uses the existing project-config row, while dedicated Drive root RPCs and the Drive change counter own root mutations. This avoids treating old full-config saves as root clears and avoids a WorkspaceTools/DriveService dependency cycle. Optional config root is a snapshot; the dedicated root state is authoritative. No parallel relationship graph is introduced.
- `openFiles` and `WorkspaceResourcesPanel` are named in the map, but their exported TypeScript props are not yet present in the inspected source. This document states structural requirements and consumes the parallel W4 export at dispatch. Do not invent a second shell, rename W4's interfaces or overwrite its file while it is in flight.
- All four PNGs show nonalphabetical folders/documents despite `Name ↑`. No existing D-ID resolves this. Preserve the marked presentation reference and meaningful production sorting, and obtain a recorded fixture-only exception or reviewed corrected-order capture before a strict sorting-parity claim. This is an unresolved source inconsistency, not an excuse for fake production sorting.
- No graphify graph exists in this worktree. Building one would write outside the single-file authorization, so code inspection used direct source and `rg`. No runtime graph or network lookup was used.

### Open evidence and admission issues

The next migration number and W4 export locations can be resolved only under their implementation slots. W4-T0/W4-T6/W4-T7 and W5-T4 are future prerequisites, not completed by this document. Provider API/scope sufficiency and shared-drive behavior have been inspected only through existing source, not a live account. Future implementation must verify supported GET fields/order and account grants before live admission without silently expanding consent. Grid, filter, root-settings, unavailable and compact states require reviewed proposed captures. The Name-arrow fixture inconsistency needs the recorded disposition above.

No selected Pulse bug or ticket was supplied; ticket grouping or tracker writes are not applicable. ProductOps Build with Ponytail full and the supplied writer contract guided reuse and task boundaries. No code, tracker, server, browser, provider, network, staging or commit operation was performed while authoring this plan. Only this plan file is owned by the writer. Implementation checks and visual acceptance are unrun.
