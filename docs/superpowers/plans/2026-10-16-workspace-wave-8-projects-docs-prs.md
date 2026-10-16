# Wave 8 implementation plan: Projects, Docs and PR resources

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch one W8 task per worker. This document authorizes planning only.

**Goal:** Match the project overview in 04 and the formatted document and comments in 07, with account-bound reads, truthful metadata and a bounded linked PR collection.

**Architecture:** Extend the existing `WorkspaceTools` config and read service. Keep links as the only relationship graph. Reuse W4's project resource frame, W6's `WorkspaceNotes` store and meeting-note refs, W7's Drive bindings and explorer, and Code's native PR records and viewer. Docs has one selection and renderer for native notes and Drive files. Resource selection never grants agent context. The overview is one paged server read, not a hub request per card. Shared client state stays environment-scoped.

**Tech stack:** TypeScript, React 19, TanStack Router, existing Tailwind/theme tokens, lucide-react, react-markdown, Effect Schema/RPC/SQL/reactivity, SQLite, vite-plus/test, @effect/vitest and react-test-renderer. Use installed dependencies. Do not introduce a document editor framework or another PR integration.

**Spec:** `docs/superpowers/specs/2026-10-14-unified-workspace-design.md`, especially A1, A7, A12 and A13; `docs/superpowers/workspace-mockups/mockup-waves/wave-map.md`, shared sections and Wave 8. Main plan: `docs/superpowers/plans/2026-10-14-unified-workspace.md:1-110,6583-6602`.

**Mockups:** `docs/superpowers/workspace-mockups/mockups/04-projects.png` and `docs/superpowers/workspace-mockups/mockups/07-meetings-notes.png`. All eight PNGs supply the six-tab strip. Authoritative corrected inventories are `mockup-waves/gap-projects-docs-prs.md:15-70` and `mockup-waves/gap-meetings-notes.md:65-74`. Both PNGs were opened as images while writing this plan. Both review files and the map's response log were read. Their historical line numbers do not override current source or the corrected map.

**Build worktree:** `C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace`, branch `qb/feat-unified-workspace`. All file paths and shell examples below are relative to that worktree unless explicitly absolute. Read current source again at dispatch because Waves 4-7 are written in parallel. Preserve B-2026-10-16-001. No product implementation, tests, server, browser, provider CLI or network operation ran while authoring this file.

## Global Constraints

The following applicable main-plan constraints apply, with the attribution rule reconciled for this review round:

- Never use an em dash (U+2014) in anything you write: code comments, docs, UI copy, commit messages. Use a comma, a full stop or a spaced hyphen.
- Run commands from the build worktree. In Git Bash, prefix each command with `cd "C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace" &&` because the shell's directory resets between calls.
- Tests: `vp test run <files>` from the package directory (`apps/server`, `apps/web`, `packages/contracts`, `packages/client-runtime`). Typecheck: `vp run typecheck` from the package directory. Never run repo-wide checks (`vp check`, `vp run -r test`, `vp run -r typecheck`).
- Never stage `pnpm-lock.yaml`. `vp i` rewrites it because develop's lockfile is stale; that churn is not part of this feature.
- Never start a dev server (subagents), never open a browser, never touch `~/.t3/userdata`, never set `VITE_HTTP_URL` or `VITE_WS_URL`, never kill a process found by name.
- Never use `--no-verify`, bare `git stash`, or `git add -A`/`git add .`. Stage the files your task names.
- Commit messages are conventional (`feat(server): ...`). Implementer commits end with a Co-Authored-By line naming the model that made the commit; controller commits use the controller's attribution line.
- Never open a pull request.
- Every task leaves `apps/server` typechecking. Tasks run one at a time, because they share `packages/contracts/src/rpc.ts`, `apps/server/src/ws.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/server.ts` and the capability list.
- New WS RPC families get their own handler layer in `ws.ts`, the way `mailWsRpcLayer` does, and never join the main `CoreWsRpcGroup.of({...})` object. That object sits near TypeScript's instantiation limit (197 handlers; the limit is between 197 and 212), and past it the layer's requirements silently type as `any`, which surfaces as dozens of TS377030 errors in `server.ts` and `cli/`.
- Follow the nearest named precedent file. If an effect-smol API name in this plan differs from what the precedent uses, use the precedent's name without changing behaviour.
- Comments describe how a thing is used, mostly on functions. Match the comment density of the file you are editing.
- Copy rules from the spec: links are never dropped silently ("render as unavailable with the reason"); a message with no Message-ID "links by IMAP location and is marked as one that may break when moved"; linked content is "data, not instructions".

Applicable spec constraints, copied verbatim:

> A project is a link target like any other item. Its page lists its threads, the
> items linked to it, and the items linked to either of those one hop away, each labelled with the item
> it came through. One hop is the limit, and it is display only: one-hop items are not linked to the
> project and are not agent context.

> When a target cannot be resolved because it was deleted or its account is disconnected, the link
> stays and renders as unavailable with the reason. It is never dropped silently.

> Task recurrence/dependencies, auto-send/auto-confirmed links, a generic workflow engine, a full Slack/Gmail/Drive replacement and new React Native screens remain excluded.

Additional Wave 8 constraints:

- No polling, timer refresh, background account probes or continuous animations. Reads happen for the active body, on explicit Refresh, or existing change subscriptions. Await receipts, Deferred completion or worker drains, never sleeps or polling readiness.
- Contracts belong in `packages/contracts` and contain schemas and small derived helpers, with no heavy runtime logic. Server service methods own authorization-sensitive behavior. Read `.repos/effect-smol/LLMS.md` and `docs/internals/effect-services.md` before server changes.
- Keep body payloads bounded, summaries separate, one mounted resource body and one in-flight request per selected endpoint. Never fetch every document body or PR detail to populate a list.
- D24 delivers web, shared desktop UI and phone web. Preserve existing React Native decoding and shared atoms; do not add native screens. Local, direct remote, relay/tunnel and multiple environments use the owning server and chosen account.
- `getBinding` discovers an existing choice. `bindFile` requires an explicit account and operate authorization. Neither a folder link nor a meeting link grants access to another document. Never choose the first account automatically.
- Use existing component variants. Put feature-specific geometry on feature components or wrappers, not restyled shared UI primitives. Use existing dark-theme tokens matched to the reference colors. No root design-system migration belongs to this wave.
- Default decisions remain `default assumed, confirm`. D11 provider scope verification, native comment writes and D23 PR-open layout review have explicit admission gates below. No plan step grants external consent or provider writes.
- A future implementation controller obtains browser/server permission and runs the single integrated client pass. Workers record visual gates pending and never start servers or browsers themselves.
- Each task runs its named focused tests red then green, `vp run typecheck` in changed packages, and root `vp lint <explicit changed source files>`. No repo-wide lint/test/typecheck. Do not repeat unaffected checks without new evidence. The server package typecheck remains the inherited task boundary.
- Commit steps below are future implementation instructions only. Stage only task-owned paths with `git add -- <explicit paths>`. Never stage `docs/internals/pulse-next-migration.json` or `pnpm-lock.yaml`. Do not stage this plan as part of product commits.

## Review Focus

1. An older client saves columns and erases a newer description or Drive root. W8-T1a's `preserves description when an old client omits it` service test and old-wire contract test pin omission versus explicit null.
2. Fifty project cards trigger fifty hubs, or merged links give every card the same count. W8-T1b's 51-project paging test, keyed totals test and fixed SQL/request budget test pin one overview request and at most three bounded SQL reads per page, with no provider HTTP.
3. A late Drive read paints the previous account's content after a switch. W8-T3a's controlled-promise interaction test and W8-T4's generation-change service test pin cancellation, identity checks and page reset.
4. Hostile document/comment content executes HTML, loads a tracking image or becomes agent instructions. W8-T4's semantic/security renderer tests and W8-T5's `comments stay outside default agent body` test pin safe rendering and unchanged note read grants.
5. Unlinking one PR association removes a second thread's association, or identical numbers on two hosts merge. W8-T7's multi-provenance collection and source-specific unlink tests pin canonical host/repository/number and retained edges.

## Interfaces and scheduling

Consume the exact names, types and paths in Wave 4's `## Canonical seams for Waves 5-11`. These are fixed planned exports, with implementation readiness checked at dispatch. `WorkspaceResourceBody.tsx` is the only live tab-body switch; `WorkspaceResourcesPanel.tsx` is frame-only. Use `WorkspaceResourceBodyProps` with independent nullable selectedItem/request and the one `useWorkspaceResources()` context from `workspaceResourceState.ts`. Its `openResource({ tab, projectId, request })` activates the shell state; do not create another Docs handoff store. Spaces pass `WorkspaceHeaderModel` through `WorkspaceEngagement.header`, and supply `WorkspaceRailItem[]` from `workspaceRailItems` rather than a ReactNode rail or duplicate header. W4's validated `view` is the single rail URL key.

| Producer      | Interface consumed by Wave 8                                                                                                                  | Required boundary                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W4-T0         | B-2026-10-16-001 baseline                                                                                                                     | Correction committed before isolated implementation dispatch. Current source includes it.                                                                                                 |
| W4-T4a, W4-T6 | `WorkspaceResourceBody.tsx` / `WorkspaceResourceBodyProps`, `workspaceResourceState.ts` context, resource frame and `WorkspaceEngagement.tsx` | Owning `EnvironmentId`, independently chosen `ProjectId`, active body and close/reopen state. Shell owns selector, frame, footer and sheet.                                               |
| W4-T4b, W4-T5 | `LinkedSection`, shared `WorkspaceItemActions` / `WorkspaceItemMenu`, project settings                                                        | Preserve confirmed/suggested/provenance, captured source endpoint and explicit actions.                                                                                                   |
| W4-T7         | isolated sample workspace fixture and eight capture recipes                                                                                   | 04/07 fixture selections, pinned clock, sample marker, no real account or writing boundary.                                                                                               |
| W5-T3         | environment-owner/Unassigned identity                                                                                                         | Owner display attribution only. It establishes no per-person authenticated comment identity or Pulse project roles.                                                                       |
| W5-T4, W7-T1  | `WorkspaceProjectConfig`, `workspaceTools.config/saveConfig`, confirmed project Drive root                                                    | Keep completion/date/root fields introduced upstream on omission. One config row, no second project model.                                                                                |
| W6-T7         | NOTES: `pulseNotes.ts`, `WorkspaceNotes`, `createWorkspaceNoteAtoms`, `workspaceNotes` web binding                                            | Bounded native text/Markdown, note identity, revision-safe read/update/delete and change stream under environment access.                                                                 |
| W6-T8         | OPENERS and meeting-note relationship handoff                                                                                                 | `provider-resource` with provider `workspace-note`; Notes & agenda carries stable note/file ref, resource project and return location. A meeting-only grant cannot read an unlinked note. |
| W7-T2         | DRIVE: `DriveApi`, `DriveService`, `DriveStore`, `createDriveAtoms`, `drive` web binding                                                      | Chosen-account metadata/read/binding, generation validation, bounded paging/filtering. Docs reuses these, never implements another explorer.                                              |
| W7-T3         | `ProjectDriveExplorer` and `openFiles.ts` exports `useOpenFiles` / `OpenFilesInput` / `OpenFiles`                                             | Files continues to own folder root/list/grid. Docs only wires its selected document entrance and supported sharing caption.                                                               |

Wave 8 owns these additional call-site types. Export selection types from `WorkspaceDocsPanel.tsx` initially; promote to shared runtime only if an admitted non-web consumer needs them. Wire data and RPC schemas still live in contracts.

```ts
import type {
  EnvironmentId,
  ProjectId,
  WorkspaceItemRef,
  WorkspaceLinkEndpoint,
} from "@t3tools/contracts";

export type WorkspaceDocRef =
  | Extract<WorkspaceItemRef, { type: "file" }>
  | (Extract<WorkspaceItemRef, { type: "provider-resource" }> & {
      provider: "workspace-note";
    });

export type WorkspaceDocSelection = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  document: WorkspaceLinkEndpoint & { ref: WorkspaceDocRef };
};

export type WorkspaceDocsPanelProps = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  selected: WorkspaceDocSelection | null;
  onSelect: (selection: WorkspaceDocSelection | null) => void;
};
```

The selection is an address, not a link or authorization proof. Adapt the shell's schema-validated `request` into this controlled panel selection for the matching environment/project. W6-T8 is required to call `useWorkspaceResources().openResource({ tab: "docs", projectId, request: noteRef })` and owns an interim native-note branch in the Docs case. W8-T3a adds file dispatch while preserving that native branch until W8-T3b replaces it. Do not route native requests through Drive or lose W6 selection while waiting for T3b. Keep the return location owned by W6-T8/router, not serialized inside document content. Resource project changes clear or restore only that environment/project's selection. The `selected` value must match both props before mounting a reader.

Execution order in this document is W8-T1a, W8-T1b, W8-T2, W8-T3a, W8-T4, W8-T3b, W8-T5, W8-T6, W8-T7, W8-T8. W8-T7 can proceed after T2 once its layout is reviewed; listing it later avoids accidental shared-file overlap. Functional prerequisites and serial predecessors remain distinct.

Acquire the global RPC/migration/context slot before changing contract exports, `rpc.ts`, `server.ts`, `ws.ts`, `RpcAuthorization.ts`, client RPC registration or migration registration. W8 RPC order is T1a -> T1b -> T5 -> T6. T4's optional structured Drive RPC also takes the same global slot after T1b and W7-T2, before T5. Config serial order is W5-T4 -> W7-T1 -> W8-T1a. Docs UI serial order is W6-T8 -> W8-T3a -> W8-T4 -> W8-T3b -> W8-T5 -> W8-T6 -> W8-T8. A declined or unadmitted branch is explicitly skipped and its serial edge spliced to the nearest admitted predecessor. It is never marked completed. No provider admission holds the global slot while awaiting consent.

Additional file slots follow the canonical map, with admitted-task splicing:

- `WorkspaceResourceBody.tsx`: W4-T4a -> W5-T7 -> W6-T8 -> W7-T3 -> W8-T3a -> W8-T7 -> W8-T8 -> W10-T1 -> W10-T4. W8-T3b changes dispatch inside WorkspaceDocsPanel and removes the interim view after T3a has preserved it through that panel.
- `ProjectTasks.tsx`: W4-T5 -> W5-T1 -> W5-T2 -> W5-T3 -> W5-T4 (config) -> W7-T1 -> W8-T1a -> W5-T5b -> W5-T7.
- `DriveFiles.tsx` is a serial-slot file: W7-T1 -> W7-T3 -> W8-T3a -> W8-T4. T3a rebases on W7's useDriveAccess/errorText exports, exporting only the reader it still needs.
- `dev/projectsMockupModule.tsx`: W4-T7 -> W8-T2. `dev/notesMockupModule.tsx`: W4-T7 -> W6-T8 -> W8-T4 -> W8-T5. Each exports `createWorkspaceMockupModule: CreateWorkspaceMockupModule`; use W4's fixed import list, not registration or another fixture mode.
- Documentation gate: by wave number, admitted only. `overview.md` / `glossary.md`: W4-T6 -> W5-T7 -> W6-T9 -> W7-T3 -> W8-T8 -> W9-T8 -> W10-T4 -> W11-T7. `docs/user/workspace-spaces.md` follows the same filtered order for tasks editing it.

## Rendered look reference

Coordinates are `[x,y,width,height]` at 1280x800 CSS px. Visual estimates were checked against the opened PNGs, not inferred from current JSX. Use W4-T7 dark fixtures, device scale 1, zoom 100%, en-GB, Africa/Johannesburg, pinned Tuesday 13 October 2026 and Segoe UI with system-ui fallback. Record actual font and OS in before/after manifests. A changed font needs reviewed rebaseline. The reference is dark; the old fidelity review's light-theme suggestion is rejected by the corrected response log. Light theme gets a separate usability smoke.

V1 passes at <=2px geometry/baseline/row-pitch error and <=1px type-size error, correct wrapping, icons, copy, state and control order. Inspect a side-by-side crop plus overlay/difference. Exclude text antialiasing from geometry measurement only. Do not exclude controls or substitute a generic screenshot assertion for service tests. Unseen states need reviewed proposed captures before acceptance.

### Shared frame and chrome consumed from W4

- Main left navigation `[0,0,207,800]`; project/meeting sub-rail `[207,26,52,774]`; center `[259,26,681,774]`; resource panel `[940,26,340,774]`. No extra project list column in the 04 overview. Resource content is inset 13px left/right, 314px usable width. Panel divider is 1px near `#202124`; flat backgrounds near `#080909`, `#0b0c0d`, `#101112`.
- Resource selector is at `[954,41,312,23]`, blue 13px `Folder`, SynKEK around x976/y52, small `ChevronDown`, separate `X` near x1254/y52. Six tabs run Files, Browser, Agents, Tasks, Docs, PRs. Icons are `Folder`, `Globe`, `Bot`, `ListTodo`, `FileText`, `GitPullRequest`, about 12-13px. Labels are 8-9px. Docs selected box `[1167,85,51,43]`; PRs context box `[1222,85,45,43]`. Selected fill near `#111d34`, blue near `#3269f5`, radius 13px. W8 supplies only bodies.
- Primary text near `#f2f3f5`, muted near `#777d86` or `#85888e`, card outlines near `#202124`. No pronounced shadow. Use shell tokens; do not add inline color constants as a second theme system.
- Fixture brand is Pulse Next, modes Office / Code and group Office. Live uses Pulse Code, Workspace / Code and Workspace, D25. Fixture breadcrumb SynKEK workspace becomes the selected environment display name, falling back to Workspace. Fixture sample marker `[1149,0,118,26]` is hidden live.
- Fixture header avatar `[904,42,19,19]` is MC. Live shows configured owner initials with accessible display name or hides when unset, D05. It grants no access and opens no invented profile menu.
- Footer `[940,768,340,32]` has a static blue dot, Sample project connections and Settings gear in fixtures. Live uses Connected only for supported known selected-project health, Unavailable for known failure, otherwise Connection status unavailable with neutral dot. Gear opens scoped existing project settings. No account probing or animated dot.
- Files sentence `[953,654,314,22]` is Shared with the SynKEK team. Files stay in Google Drive. in fixture 04. Live defaults to Files stay in Google Drive. D11 permits a stronger statement only with complete supporting metadata. D29 blue Marketing folder remains W7's confirmed-folder relation, never browse selection.

### PNG 04 project overview owned by W8-T1a/T1b/T2/T8

| Region         | Geometry and look                                                                                                                    | Exact fixture content and behavior                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header         | `[259,26,681,52]`, title x275/y45, 14px semibold; subtitle x275/y64, 10px muted; divider y77                                         | Projects; SynKEK · Brand & growth. Resources and MC remain W4 controls.                                                                                                                                                                                                                                                         |
| Heading        | x275/y106, 14px semibold; subtitle baseline y127, 11px muted                                                                         | Your projects; Connections, people and work in one place. Sample copy stays exact. Live subtitle may say Connections and work in one place. when no roster is supported; record D05 departure.                                                                                                                                  |
| New action     | `[831,101,93,24]`, blue fill, radius 6px, 13px Plus, 11px semibold white                                                             | + New project. Opens reviewed creation state. Cancel makes nothing. Create selects without entering Code.                                                                                                                                                                                                                       |
| Search         | `[275,149,649,30]`, dark `#141414`, radius 16px, Search at x286/y159, placeholder x304/y164, 10px muted; SlidersHorizontal x903/y159 | Find a project. Filter menu is proposed, with All projects / Drive linked / No Drive root, explicit clear, applied over server-paged results. No unexplained filter glyph.                                                                                                                                                      |
| SynKEK         | `[275,188,649,92]`, radius 9px, selected navy tint and 1px blue edge near `#24365b`                                                  | Folder x290/y211, 20x16; title x325/y213 11px semibold. Description x325/y233 10px: Brand, website and growth marketing. Metadata baseline y259 9px: Drive linked; Slack · 4 channels; 8 members. ChevronRight near x901/y212 12px.                                                                                             |
| Pulse website  | `[275,289,649,93]`, neutral fill and gray border, same insets                                                                        | Pulse website; Shared team workspace; Drive linked; Slack · 2 channels; 4 members.                                                                                                                                                                                                                                              |
| Brand studio   | `[275,391,649,93]`, neutral fill, same 9px gap and insets                                                                            | Brand studio; Shared team workspace; Drive linked; Slack · 2 channels; 4 members.                                                                                                                                                                                                                                               |
| Fixture roster | heading x275/y514 11px semibold; rows in `[275,532,649,115]`, pitch about 29px                                                       | MC / Maya Chen / Admin · Slack; LM / Leo Martins / Member · Slack; NP / Nina Patel / Member · Slack; AM / Alex Morgan / Member · Slack. 19px navy avatar, blue 8px initials, names x305 10px white, right text x924 9px gray. Live omits this entire unsupported roster under D05. W12-T6 owns a real provider-labelled roster. |

Do not stretch the cards below y484 or invent content to fill the blank center. Keep overview visible after selection. Linked rail entrance retains threads, tasks/settings, direct links and labelled one-hop discovery. Search is title plus description and uses stable server order. Live descriptions are user data, never hardcoded Shared team workspace. Direct channel counts require complete server-known confirmed links; member count requires D26 source-complete metadata and freshness. Unknown is not zero.

### PNG 07 Docs owned by W8-T3a/T4/T3b/T5/T6/T8

| Region         | Geometry and typography                                                                                                               | Exact fixture content                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity row   | `[953,145,314,23]`; blue FileText at x955/y149, 13x16; text x976/y157, 10px semibold                                                  | Launch review · Meeting notes. No Drive search/filters or picker in open-document state.                                                                                                                                              |
| Card           | `[953,178,314,345]`; fill near `#090909`, 1px outline, radius 7-8px, 16px padding, text starts x970                                   | Natural semantic content, no iframe, `<pre>` appearance, editor toolbar or caret in reading mode.                                                                                                                                     |
| Caption        | x970/y201, 8-9px muted                                                                                                                | SynKEK · Shared with 8 people. Fixture must seed supporting evidence. Native live caption is SynKEK · Environment access, with actual project name. Provider live caption uses supported metadata or Sharing information unavailable. |
| Title          | x970/y227-233, 16px semibold, 24px line height                                                                                        | Launch review · Meeting notes. One line at reference width.                                                                                                                                                                           |
| Introduction   | x970/y259-290, 10px muted, 20-21px line height                                                                                        | Our October focus is a clear product story, a faster website and campaigns that turn interest into action. Wrap after and.                                                                                                            |
| First section  | heading baseline around y324, 11px semibold; list baselines y352/y380/y409, 10px white, about 28-29px pitch                           | Launch priorities; 1. Finish the homepage and product copy.; 2. Review SEO titles and search intent.; 3. Align campaign assets with the product launch. Use a real ordered list, no task checkboxes.                                  |
| Second section | heading baseline y450, 11px semibold; paragraph y475/y496, 10px muted, 20-21px line height                                            | Review & next steps; Maya owns final approval. Leo will publish the website after Thursday's review. Wrap after after.                                                                                                                |
| Comments       | divider `[953,536,314,1]`; heading baseline y558-560, 10px semibold; avatar `[953,573,19,19]`; text x979/y581, 10px, 16px line height | Comments · 1; NP; Looks good. Let's include the new keyword targets in the product pages. Wrap before pages. No visible composer/reply/resolve action in the fixture reading state.                                                   |

W6 owns the center agenda and its exact Notes & agenda action, selected T 13 and + Schedule. The launch review meeting is SynKEK · Launch review, with a middle dot. Opening notes preserves that center, day and return location. Native content uses Markdown headings/list syntax; provider structure uses provider-supplied blocks. Never infer headings or numbering from exported plain text. Unsupported structure gets an explicit limitation and external-open path. Long docs scroll inside the resource body without moving the footer; do not shrink typography to fit.

For proposed list/loading/empty/error/edit states, retain the same content width and theme. Specify readable text: Choose a project to see documents, No documents linked, Choose a Drive connection, This document is unavailable. Its link has been kept., Retry, Read more, Back to documents, Save, Cancel and This note changed. Reload it before saving. Add account/source labels where necessary. These states require reviewed proposed captures; their wording and controls are not original PNG evidence.

### PR-open proposal for W8-T7

Only the six-tab icon/label and inactive PRs cell are original evidence. Before implementing its body, review a proposed capture with the unchanged frame, selected PRs cell, content `[953,145,314,600]`, heading Project pull requests at x953/y153 12px semibold, and source/completeness caption 10px muted. Rows are at least 56px with lifecycle icon, title, owner/repository #number, known state and a provenance line. Show Status unavailable for missing snapshots, No linked pull requests for known empty, Choose a project to see pull requests before selection and Showing loaded links when incomplete. Provide explicit Link pull request, source-specific Unlink, Open in Code and Open on host. Do not put merge/review/comment/watch controls in the collection. Existing Code detail owns those operations. Proposed list/detail/empty/error/phone captures require D23 review and are never labelled original-PNG parity.

## Tasks

Line ranges below were verified against current source. Proposed files have no current line range. Upstream-owned files will move before execution; reread them without overwriting another owner's implementation. Tests listed as new are intentionally proposed. Test snippets describe real assertions and public APIs to implement, not successful runs in this authoring session.

### Task W8-T1a: Persist bounded project descriptions in existing config

**Files:** Modify `packages/contracts/src/pulseWorkspaceTools.ts:10-15,42-67`, `apps/server/src/workspace/WorkspaceTools.ts:43-63,80-126`, `apps/web/src/components/workspace/ProjectTasks.tsx`, functions `ProjectWorkspaceSettings`, `ProjectWorkspaceSettingsForm` and `ProjectTasks`; tests `packages/contracts/src/pulseWorkspaceTools.test.ts`, `apps/server/src/workspace/WorkspaceTools.test.ts`, `apps/web/src/components/workspace/ProjectTasks.test.tsx`. Create the next-free forward description migration under `apps/server/src/persistence/Migrations/` and its test; register in `apps/server/src/persistence/Migrations.ts:1-12,158`. Current config creation is `064_WorkspaceTools.ts:1-9`, read-only precedent. Reuse `packages/client-runtime/src/state/workspaceTools.ts:1-72` and web binding without new state unless optional typing needs adjustment.

**Interfaces:** Consumes W5/W7 `WorkspaceProjectConfig` and `workspaceTools.saveConfig`, existing `WorkspaceTools.config/saveConfig`. Produces optional `description?: string | null`, max 600 UTF-16 code units on the raw decoded input, then server trim, with empty becoming null. Raw length validation precedes trimming, matching the schema string-length validator and textarea maxLength; 600 units plus surrounding spaces is rejected even if trimming would fit. Omission on save preserves storage; explicit null clears. Old-server response omission decodes. Description edits use the existing operate RPC and config change stream. No new project identity or permission.

**Depends on:** W4-T0. **Serial slot:** config and ProjectTasks.tsx after W7-T1 and before W5-T5b, following the full chain above, plus the global RPC/migration slot. This storage task does not wait for resource UI. **Blast radius:** config. **Door:** two-way; additive nullable column, preserve data on rollback.

- [ ] Add the failing service test beside the existing `layer` and `seedWorkspaceProject` in `WorkspaceTools.test.ts`:

  ```ts
  it.effect("preserves description when an old client omits it", () =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      const original = yield* tools.config(projectId);
      yield* tools.saveConfig({ ...original, description: " Brand and growth " });
      const { description: ignored, ...oldWire } = yield* tools.config(projectId);
      expect(ignored).toBe("Brand and growth");
      yield* tools.saveConfig(oldWire);
      expect((yield* tools.config(projectId)).description).toBe("Brand and growth");
      yield* tools.saveConfig({ ...oldWire, description: null });
      expect((yield* tools.config(projectId)).description).toBeNull();
    }).pipe(Effect.provide(layer)),
  );
  ```

- [ ] From `apps/server`, run `vp test run src/workspace/WorkspaceTools.test.ts`. Expected red: description absent/type failure. Add contract tests accepting old payload omission, accepting null, accepting exactly 600 UTF-16 code units, rejecting 601 units, counting one astral character as two units, and UI save/read/clear behavior. Test raw 598 units plus two surrounding spaces accepted then trimmed; raw 600 plus surrounding spaces rejected before trim. Keep upstream root/completion fields in old-wire fixtures.
- [ ] Add `description: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(600))))` to the config schema. Add a nullable `description TEXT` column using `ALTER TABLE workspace_project_config ADD COLUMN description TEXT`; choose its numeric filename only while holding the migration slot. Do not edit 064. Select it in `config`, return null for existing rows without a value and merge inside the same keyed lock before upsert:

  ```ts
  // Inside the existing Effect.gen after schema validation of raw input.
  const current = yield * config(input.projectId);
  const description =
    input.description === undefined
      ? (current.description ?? null)
      : input.description?.trim() || null;
  // Validate raw length at service entry too when called without RPC decoding.
  ```

  At service entry, reject a defined non-null raw description longer than 600 UTF-16 units before trimming, even for direct service calls without RPC decoding. Extend the existing INSERT/ON CONFLICT with description. Retain all W5/W7 fields and their omitted-key merge behavior; never rebuild a partial config from only columns/browser/description. Return the actual merged saved config. Add a maxLength 600 textarea labelled Project description to `ProjectWorkspaceSettingsForm` and send explicit null for cleared input. Existing settings callers that omit it preserve it. Read denied/deleted project and invalid browser/column checks still run.

- [ ] Test upgrade from a pre-description row, restart persistence, old-client save preservation of all upstream fields, oversize multibyte input, set/clear, deleted project, two environments and `RpcAuthorization` read versus operate scopes. Run the same server test green, contract `vp test run src/pulseWorkspaceTools.test.ts`, and web `vp test run src/components/workspace/ProjectTasks.test.tsx`. Run changed-package typechecks and targeted lint. Expected pass: bounded description survives omission and clearing affects only description.
- [ ] Surface checklist: settings and scoped project gear both edit the same config; web/desktop share form, phone web remains usable; native clients may omit the field. Codex/Claude/Cursor/Grok/OpenCode/ACP require no adapter change. Contracts optional, reverse set/clear covered, server-owned local/direct/relay/tunnel behavior and environment isolation covered. User guidance waits for W8-T8.
- [ ] Visual acceptance: W4-T7 recipe `/workspace?space=projects&fixture=04`, PNG 04 box `[275,188,649,296]`, inventory `gap-projects-docs-prs.md:31-35`. T1a alone produces storage, so card appearance remains pending T2. Gate with three exact fixture descriptions, no fabricated live values, V1; proposed description editor needs reviewed capture. Allowed live substitutions are saved descriptions plus W4 chrome only.
- [ ] Commit future implementation with explicit files: `git add -- packages/contracts/src/pulseWorkspaceTools.ts packages/contracts/src/pulseWorkspaceTools.test.ts apps/server/src/workspace/WorkspaceTools.ts apps/server/src/workspace/WorkspaceTools.test.ts apps/server/src/persistence/Migrations.ts apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/ProjectTasks.test.tsx`. Add the two exact allocated migration paths separately. Title `feat(workspace): persist project descriptions`.

### Task W8-T1b: Add one paged project overview read for cards

**Files:** Modify `packages/contracts/src/pulseWorkspaceTools.ts:42-96`, `apps/server/src/workspace/WorkspaceTools.ts:27-175`, `packages/client-runtime/src/state/workspaceTools.ts:14-72`, `packages/contracts/src/server.ts:600-630`, `apps/server/src/ws.ts:1240-1258,2000-2020`, `apps/server/src/auth/RpcAuthorization.ts:30-50`; existing `rpc.ts:1,1769` registration already spreads the family. Reuse `apps/server/src/environment/ServerEnvironment.ts:50-55` for cursor scope. Tests `WorkspaceTools.test.ts`, new `WorkspaceProjectOverview.test.ts`, `pulseWorkspaceTools.test.ts`, `workspaceTools.test.ts` in their owning directories, plus `RpcAuthorization.test.ts`. Modify `apps/server/src/server.ts` to provide `ServerEnvironmentIdentity` to the WorkspaceTools layer; extend both `WorkspaceTools.test.ts` and new `WorkspaceProjectOverview.test.ts` layers with the same explicit fake identity. Web binding at `apps/web/src/state/workspaceTools.ts:1-3` derives the added atom automatically.

**Interfaces:** `WorkspaceTools.make` unconditionally yields `ServerEnvironmentIdentity`; its layer requirements include that service. Consumes existing project projection/config, W7-T1 confirmed Drive-root designation and `workspace_links` confirmed edges. Produces `WS_METHODS.workspaceListProjectOverview = "pulse.workspace.listProjectOverview"`, optional `workspaceProjectOverview` capability, `WorkspaceTools.overview(input)`, and `workspaceTools.overview` query atom. Input `{ limit?: number; filter?: string; drive?: "all" | "linked" | "unlinked"; order?: "title"; cursor?: string }`, maximum 50. Output `{ projects: WorkspaceProjectOverview[]; nextCursor?: string; incomplete: boolean }`. Each summary has `projectId`, `title`, `description: string | null`, `driveRoot: "linked" | "none" | "unavailable"`, `channels: { count: number | null; complete: boolean; providers: readonly { provider:string; count:number; complete:boolean }[] }`, optional `members: { count: number; complete: true; source: string; observedAt: string }`. No membership field without real complete source metadata. The provider grouping is required to render Slack · 4 channels truthfully; unknown totals cannot imply a provider.

**Depends on:** W8-T1a. **Serial slot:** after T1a in global RPC/migration slot; release before T4's optional Drive registration. **Blast radius:** read. **Door:** two-way; optional read, no new storage table.

- [ ] In new `WorkspaceProjectOverview.test.ts`, reuse the real memory persistence and `Tools.layer` precedent from `WorkspaceTools.test.ts`. Seed through SQL in test setup, then assert the public service:

  ```ts
  it.effect("pages 51 projects with stable keyed descriptions", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO projection_projects ${sql.insert(
        Array.from({ length: 51 }, (_, index) => ({
          project_id: `overview-${String(index).padStart(2, "0")}`,
          title: `Project ${String(index).padStart(2, "0")}`,
          workspace_root: `/synthetic/${index}`,
          scripts_json: "[]",
          created_at: "2026-10-13T07:00:00Z",
          updated_at: "2026-10-13T07:00:00Z",
        })),
      )}`;
      const tools = yield* Tools.WorkspaceTools;
      const first = yield* tools.overview({ limit: 50, filter: "", order: "title" });
      expect(first.projects).toHaveLength(50);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = yield* tools.overview({
        limit: 50,
        filter: "",
        order: "title",
        cursor: first.nextCursor,
      });
      expect(second.projects.map((p) => p.projectId)).toEqual(["overview-50"]);
      expect(second.nextCursor).toBeUndefined();
      expect(first.projects[0]?.members).toBeUndefined();
    }).pipe(Effect.provide(layer)),
  );
  ```

  Import `Effect`, `Layer`, `SqlClient`, `expect/it`, `NodeCrypto`, `Tools` and memory persistence as in the current test. Provide the test environment identity through `ServerEnvironmentIdentity.of({ getEnvironmentId: Effect.succeed(EnvironmentId.make("overview-test")) })` unconditionally, matching the new WorkspaceTools.make dependency. Add that dependency to both the new overview test layer and the existing `WorkspaceTools.test.ts` layer so all current config/task tests remain runnable.

- [ ] From `apps/server`, run `vp test run src/workspace/WorkspaceProjectOverview.test.ts`. Expected red: missing `overview`. Add contract max-limit/filter/cursor tests and client RPC tests before implementation.
- [ ] Add schemas and the RPC to the existing WorkspaceTools family, with read authorization and optional capability. Use `Schema` for cursor decoding. Cursor includes version, owning server environment ID, normalized filter, drive filter, order, `sortTitle` holding the exact last `sort_title` value selected by SQLite, and `projectId` holding the last project ID. Never derive the cursor title with JavaScript toLowerCase; SQLite lower() is ASCII-only. Encode bounded JSON as base64url; reject wrong environment/filter/order or invalid cursor instead of silently restarting. It is a continuation address, never an authorization token. Cap input cursor at 2048 bytes and filter at 256 characters.
- [ ] Implement a bounded metadata read with keyset order `lower(p.title), p.project_id`, deleted projects excluded, title/description matching before LIMIT 51, and W7 root filter before paging. Use the W7 root designation rather than any linked file. Batch all selected project link keys into one second SQL query, aggregating confirmed direct channel endpoints by project key and excluding dismissed/suggested edges. At most one third read may retrieve existing source-complete metadata/root validity for the selected IDs. No loop calling `config`, `projectHub` or provider HTTP per project. New summary tables are unnecessary. The core first read follows this SQL idiom inside an Effect.gen. Use the current SqlClient fragment composition precedent:

  ```ts
  // Inside WorkspaceTools.make's Effect.gen; cursor is decoded/validated first.
  const after = cursor
    ? sql`AND (lower(p.title) > ${cursor.sortTitle}
        OR (lower(p.title) = ${cursor.sortTitle} AND p.project_id > ${cursor.projectId}))`
    : sql``;
  const rows =
    yield *
    sql<{
      projectId: ProjectId;
      title: string;
      sort_title: string;
      description: string | null;
    }>`SELECT p.project_id AS "projectId", p.title, lower(p.title) AS sort_title, c.description
    FROM projection_projects p
    LEFT JOIN workspace_project_config c ON c.project_id = p.project_id
    WHERE p.deleted_at IS NULL
      AND (instr(lower(p.title), ${filter}) > 0
        OR instr(lower(coalesce(c.description, '')), ${filter}) > 0)
      ${after}
    ORDER BY lower(p.title), p.project_id LIMIT ${limit + 1}`;
  ```

  The first page has no title/id continuation predicate, so empty titles remain eligible. Build the next cursor from the last returned row's exact `sort_title` and projectId, not the lookahead row or JavaScript folding. Add a limit-1 regression with an empty title, a non-ASCII title such as Écoles and an adjacent ASCII title; traverse all pages and assert every ID exactly once.

  Add W7's root predicate before LIMIT using its actual config field, not a guessed second root column. Classify generic provider refs only through the admitted connector's exact channel identity parser. Before W9 readers exist, unsupported channel identity/count is null/incomplete, not a guessed resourceId prefix. Fixtures provide explicit supported metadata through W4's fake boundary. `incomplete` describes the page/read completeness; count completeness is independently stated. Missing provider membership never blocks native projects.

- [ ] Add the atom with `createEnvironmentRpcQueryAtomFamily`, tag `WS_METHODS.workspaceListProjectOverview`, existing workspace change trigger and link change trigger. Invalidate on actual project projection changes too. Include every input and environment in the key. Old-server capability absence returns client project titles with metadata unavailable and no overview RPC. Do not add a timer.
- [ ] Prove per-page <=3 SQL reads using a counting wrapper at the SQL client boundary and zero Drive/Slack calls; 1 overview RPC for 50 cards; 51-row paging; equal titles; title/description filtering across pages; correct root filtering; distinct per-project channel counts; dismissed/suggested exclusion; unavailable versus zero; incomplete members omitted; changed filter invalidates cursor; cross-environment cursor rejection; disconnect/reconnect; read-only session cannot save config. Run `vp test run src/workspace/WorkspaceProjectOverview.test.ts src/workspace/WorkspaceTools.test.ts src/auth/RpcAuthorization.test.ts` in server, contract `vp test run src/pulseWorkspaceTools.test.ts`, runtime `vp test run src/state/workspaceTools.test.ts`, typechecks and targeted lint. Expected green: counts are keyed, bounded and honest.
- [ ] Surface checklist: cards/filter and later settings consume one summary, no adapter-specific UI. Web/desktop/phone web use shared runtime; native old decode is optional. All six agent families are unaffected. Read contract/capability, set/clear upstream roots, local/direct/relay/tunnel and environment-keyed caches covered. Document completeness semantics in W8-T8 only if cross-component reasoning is needed.
- [ ] Visual acceptance: fixture 04 recipe, PNG 04 `[275,188,649,296]`, gap inventory `:31-35`, V1 after T2. Exact sample metadata only from marked supported fixture evidence. Live descriptions, confirmed root availability and directly linked channel totals may differ; members require D26 complete source metadata. No fabricated roster or count. W4 chrome substitutions apply.
- [ ] Stage explicit paths named under Files, including only the actual new overview test and changed family wiring files. Command base: `git add -- packages/contracts/src/pulseWorkspaceTools.ts packages/contracts/src/pulseWorkspaceTools.test.ts packages/contracts/src/server.ts apps/server/src/server.ts apps/server/src/workspace/WorkspaceTools.ts apps/server/src/workspace/WorkspaceTools.test.ts apps/server/src/workspace/WorkspaceProjectOverview.test.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts apps/server/src/ws.ts packages/client-runtime/src/state/workspaceTools.ts packages/client-runtime/src/state/workspaceTools.test.ts`. The identity provision and both test-layer updates are required. Title `feat(workspace): read paged project summaries`.

### Task W8-T2: Build searchable project cards and explicit creation

**Files:** Modify `apps/web/src/components/workspace/ProjectsSpace.tsx:25-307`, `ProjectsNav.tsx:24-137` selection synchronization only. Reuse `apps/web/src/hooks/useNewProject.ts:75-151`, modifying it only to contain a post-create callback failure if a regression proves necessary. Create `ProjectsSpace.test.tsx` and pure `apps/web/src/components/workspace/ProjectsOverviewView.tsx`. Modify `apps/web/src/components/workspace/dev/projectsMockupModule.tsx`, exporting `createWorkspaceMockupModule: CreateWorkspaceMockupModule` and setting `readyRegions: ["center"]` for 04 only after rendering the actual overview view with fake reads/commands. Extend `ProjectsNav.test.tsx` and create proposed `apps/web/src/hooks/useNewProject.test.tsx` if callback handling changes. Consume W4's `WorkspaceHeaderModel` and data-driven `WorkspaceRailItem[]`; do not rewrite `WorkspaceEngagement` or resource selector ownership.

**Interfaces:** Consumes `workspaceTools.overview`, W4 project resource frame and current `useNewProject()` signature with `openThread:false`, `onCreated(ScopedProjectRef)`. Produces overview card selection through existing `/workspace?space=projects&environment=...&project=...`, filtered page state and explicit creation UI. Linked sub-rail uses existing project hub and settings, not a second project model.

**Depends on:** W8-T1b, W4-T6. **Serial slot:** single owner of ProjectsSpace/ProjectsNav after W4; dev/projectsMockupModule.tsx after W4-T7; no global RPC slot. **Blast radius:** navigation. **Door:** two-way.

`ProjectsOverviewView.tsx` is the pure center presentation shared by ProjectsSpace and the dev adapter. It imports contract types/pure UI, never live containers, atom bindings or dev data. Export the full props:

```ts
export interface ProjectsOverviewViewProps {
  readonly projects: readonly WorkspaceProjectOverview[];
  readonly selectedProjectId: ProjectId | null;
  readonly query: string;
  readonly driveFilter: "all" | "linked" | "unlinked";
  readonly pending: boolean;
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly roster: readonly { initials: string; name: string; roleLabel: string }[];
  readonly onQueryChange: (value: string) => void;
  readonly onSearch: () => void;
  readonly onDriveFilterChange: (value: "all" | "linked" | "unlinked") => void;
  readonly onSelect: (projectId: ProjectId) => void;
  readonly onProjectMenu: (projectId: ProjectId) => void;
  readonly onCreate: () => void;
  readonly onMore: () => void;
  readonly onRetry: () => void;
}
```

The live container passes an empty roster under D05, actual metadata and scoped callbacks. `dev/projectsMockupModule.tsx` maps W4 session seed into the same props, including supported fixture-only roster labels, and renders this view with fake commands. It returns `center`, `readyRegions: ["center"]`, settled and dispose only after real view work commits. Extend ProjectsSpace.test.tsx to render the adapter and assert its fake actions settle without live query imports; no new fixture registry or duplicate layout is allowed.

- [ ] Start `ProjectsSpace.test.tsx` with react-test-renderer and scoped router/entity/query/command mocks following `ProjectsNav.test.tsx:1-125`. Render the real ProjectsSpace with two local and one remote project; supply `workspaceTools.overview` responses through the query boundary. Include this behavior assertion after setup, not a static markup check:

  ```ts
  await act(() => { view = create(<ProjectsSpace />); });
  const search = view.root.findByProps({ "aria-label": "Find a project" });
  await act(() => search.props.onChange({ target: { value: "growth" } }));
  const card = view.root.findByProps({ "aria-label": "Select SynKEK" });
  await act(() => card.props.onClick());
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace", search: {
      space: "projects", environment: "remote", project: "synkek",
    },
  });
  expect(view.root.findByProps({ "aria-label": "Your projects" })).toBeDefined();
  expect(mocks.link).not.toHaveBeenCalled();
  ```

  Define `mocks` via `vi.hoisted`, using the existing router mock conventions. Make overview query inputs observable and return title/description-filtered fixture pages. Test rendered results as well as the selected route. Test actual atom filtering separately in T1b, so a UI mock cannot falsely establish server paging correctness.

- [ ] In `apps/web`, run `vp test run src/components/workspace/ProjectsSpace.test.tsx src/components/workspace/ProjectsNav.test.tsx`. Expected red: Find a project/Your projects absent and current create opens Code.
- [ ] Keep one overview center when a project is selected. Use W4 rail's Projects/Linked selection to reach the existing threads, tasks/settings, direct/related hub content. Keep A12's searchable dropdown. Replace current list/detail overview split only in the shell's supplied center slot. Draw cards with feature-local styles matching the rendered reference; one accessible primary selection button per card, shared item menu wrapping without nested buttons. Title/description search and root filter go into the overview query before paging; append More projects only when cursor exists. Search submit/reset cancels stale pages, no unbounded project fanout. Provide No projects yet and No matching projects distinctly. Put create input in a reviewed dialog/panel, not permanently above cards.
- [ ] Preserve creation recovery by invoking the shipped hook once. The intended call is concrete:

  ```ts
  const created = await create({
    environmentId,
    name: name.trim(),
    github: null,
    openThread: false,
    onCreated: async (ref) => {
      setCreatedProject(ref);
      await navigate({
        to: "/workspace",
        search: {
          space: "projects",
          environment: ref.environmentId,
          project: ref.projectId,
        },
      });
    },
  });
  if (created) {
    setName("");
    setCreateOpen(false);
  }
  ```

  `createdProject` is local recovery state set before navigation. If navigation/refresh fails after successful create, display Project created. Open project to continue. Retry only navigation against that ref; disable a second create submission. Retain name on genuine pre-create failure. `useNewProject` already treats waitForProject/open-thread failure as successful creation; contain onCreated rejection consistently if necessary. Do not add request IDs to the project creation protocol in this task.

- [ ] Test description/title matches, no matches, empty, next page and reset; root filters; real unavailable metadata; card/dropdown/resource target agreement; resource-only project changes do not change selected center item; create/cancel; double submit; failed create retains text; post-create selection failure creates once and recovers existing ref; no Code draft; right-click, keyboard and long-press shared project actions; one-hop discovery never links. Run named UI tests green, affected typechecks and targeted lint. Expected green: overview remains after selection and explicit create stays in Workspace.
- [ ] Surface checklist: project card/menu/detail/Linked, palette and existing keybindings use shared actions; web/desktop/phone web covered; RN no screen change. Providers Codex/Claude/Cursor/Grok/OpenCode/ACP keep existing start-thread behavior and no automatic run on selection. No new contracts. Reverse selection/reset/create-cancel covered. Connections use captured environment, reconnect retains selection. Docs update at T8.
- [ ] Visual acceptance: W4-T7 `/workspace?space=projects&fixture=04`, PNG 04 `[207,26,733,458]` and card box `[275,188,649,296]`; inventory `gap-projects-docs-prs.md:27-36`. Match Your projects, search, + New project, three card bounds/pitch/insets, selected SynKEK and dropdown agreement under V1. Live project names/descriptions and supported metadata differ only as listed. Omit live unsupported roster and adjust live subtitle explicitly under D05. Review empty/filter/create/error/long-name captures and 1024/390 adaptations.
- [ ] `git add -- apps/web/src/components/workspace/ProjectsSpace.tsx apps/web/src/components/workspace/ProjectsSpace.test.tsx apps/web/src/components/workspace/ProjectsNav.tsx apps/web/src/components/workspace/ProjectsNav.test.tsx apps/web/src/components/workspace/ProjectsOverviewView.tsx apps/web/src/components/workspace/dev/projectsMockupModule.tsx`. If the recovery regression changes the hook, add only `apps/web/src/hooks/useNewProject.ts` and `apps/web/src/hooks/useNewProject.test.tsx`. Title `feat(web): show searchable project cards`.

### Task W8-T3a: Add the Docs list and account-bound Drive reader

**Files:** Create `apps/web/src/components/workspace/WorkspaceDocsPanel.tsx` and `.test.tsx`. Modify `DriveFiles.tsx:20-32,171-354` and `DriveFiles.test.tsx:1-185` to share the account/binding/read controller with the inline card. Consume `packages/client-runtime/src/state/drive.ts:14-94`, `apps/web/src/state/drive.ts` and W7 additions without adding another account state. Modify `apps/web/src/components/workspace/WorkspaceResourceBody.tsx` only in its Docs case, and extend `WorkspaceResourcesPanel.test.tsx` to cover the switch. Create pure `apps/web/src/components/workspace/WorkspaceDocsReadingView.tsx`. Retain W6's `meetings/WorkspaceNoteView.tsx` and its test until T3b. No frame-file mapping edits. Reuse `workspaceLinks` and `WorkspaceItemActions/Menu`. No server contract change is required for plain-text reading.

**Interfaces:** Consumes W4-T4a resource project and active Docs body; W7-T2 `drive.binding`, `drive.connections`, `drive.bind`, `drive.read`, existing file identity parser `workspaceItemFromUrl`. Produces the `WorkspaceDocSelection` and `WorkspaceDocsPanelProps` types above, plus exported `DriveReader` with optional `renderContent?: (result: DriveReadResult, text: string) => ReactNode`. Omitted callback retains the existing modal plain reader. The callback changes rendering only; binding, permission and generation checks remain shared. Direct confirmed links and one-hop discovery remain separately labelled.

**Depends on:** W4-T4a, W7-T3; preserve W6-T8's admitted note branch as a serial predecessor. **Serial slot:** Docs UI after W6-T8, body switch after W7-T3, DriveFiles.tsx after W7-T3. Native-note implementation is not rebuilt here; a held W6 branch is explicitly spliced out. No Calendar storage dependency. **Blast radius:** reader. **Door:** two-way.

The pure card in `WorkspaceDocsReadingView.tsx` exports this full props contract, without importing live note/Drive controllers or dev files:

```ts
export interface WorkspaceDocsReadingViewProps {
  readonly title: string;
  readonly caption: string;
  readonly content: ReactNode;
  readonly overflowAction?: ReactNode;
  readonly comments?: ReactNode;
}
```

It renders the identity row and card, one explicit h1 title outside content, and optional separate comments region. Live Docs supplies a safe body from WorkspaceDocContent or its intermediate plain text; the notes adapter supplies the same safe renderer and fake-backed comments through these props. Only the shell chooses which tab body owns the view. Test no duplicate title/chrome in bound reading state.

- [ ] Create panel interaction tests using the existing `DriveFiles.test.tsx` React/mocks setup, extended to return explicit project linked-file data and no native note capability. Add a small exported candidate selector only if it is used by the actual panel; test the panel through selection/read actions. Pin stable identity independently with this contract test in the panel test file:

  ```ts
  import { workspaceItemFromUrl, workspaceItemKey } from "@t3tools/contracts";
  it("uses one Drive identity for paste and search", () => {
    const pasted = workspaceItemFromUrl("https://docs.google.com/document/d/launch-notes/edit");
    const searched = { type: "file", provider: "google-drive", fileId: "launch-notes" } as const;
    expect(pasted).toEqual(searched);
    expect(workspaceItemKey(pasted!)).toBe(workspaceItemKey(searched));
  });
  ```

  The red test is the following interaction extension to the existing reader test harness. Change its render from modal `DriveFileAccess` to exported `DriveReader` in inline mode and keep the controlled read promise:

  ```ts
  await act(() => {
    renderer = create(<DriveReader environmentId={environmentId} fileId="file"
      renderContent={(_result, text) => <article>{text}</article>} />);
  });
  expect(mocks.bind).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  const readButton = renderer.root.findAllByType("button")
    .find((node) => node.props.children === "Read file")!;
  await act(() => readButton.props.onClick());
  expect(renderer.root.findByType("article").children.join("")).toContain("First page text");
  const moreButton = renderer.root.findAllByType("button")
    .find((node) => node.props.children === "Read more")!;
  await act(() => moreButton.props.onClick());
  const text = renderer.root.findByType("article").children.join("");
  expect(text).toContain("First page text");
  expect(text).toContain("Second page text");
  ```

  Seed `mocks.read` with two real `DriveReadResult` pages, text First page text / Second page text and a first-page cursor, using the existing generation-change test shape. Do not mock the reader itself.

- [ ] From `apps/web`, run `vp test run src/components/workspace/WorkspaceDocsPanel.test.tsx src/components/workspace/DriveFiles.test.tsx src/components/workspace/WorkspaceResourcesPanel.test.tsx`. Expected red: inline reader export/selection unavailable. The identity test is expected already green and protects reuse of current parsing.
- [ ] In the sole body switch's Docs case, route Drive files into WorkspaceDocsPanel and adapt request to controlled selection. Keep W6 native requests dispatched to its existing WorkspaceNoteView through the panel's temporary native branch, with its existing note read and return behavior intact. Test opening the same native note after T3a and after T4, before T3b. No native request mounts a Drive reader.
- [ ] Export/reuse the existing DriveReader/DriveReaderContent behavior instead of copying it. Add rendering callback with `renderContent ? renderContent(result, text) : <pre>{text}</pre>` at the existing result position, passing the accumulated body text rather than only the last page. Keep explicit first read/account choice. Read more appends only when file/account/environment/generation still match; reset body, pagination and errors on any identity/binding change, including subscription-driven rebind. Preserve original modal behavior for all existing callers. In Docs inline mode, show the connection chooser and Read file only while unbound or unread. Never auto-read. After a successful bound read for the current file/account/environment/generation, render only the callback output and one overflow action, Open in Google Drive; Read more may appear only when continuation exists. Hide the connection chooser, Use this connection, Read file, duplicate h3 file title and standalone provider link. Reset to the unread/connection state on binding or generation change. Add a post-read final-page test asserting all those reader controls are absent and only the overflow provider action remains.
- [ ] Implement the Docs list from confirmed project file links and labelled hub discovery, capped by existing link/hub bounds with visible incomplete notice. Show folders/unsupported MIME as explanatory metadata rows until metadata identifies them; do not issue one read per row to classify them. Read metadata/body only on selected open, use W7 chosen connection, and show Unsupported document type. Open in Google Drive. when unsupported. Bind only after explicit account selection and operate authorization; an existing binding can be read under read authorization. Opening discovery reads through the human's account authority, never creates a project/source link or agent grant. Shared item actions use the captured document ref, separate Link to project/current item choices and source-specific unlink.
- [ ] In `WorkspaceDocsReadingView`, render the identity row, caption, and an explicit `<h1>` document title outside the body renderer at 16px/24px, x970/y233 within the 07 card. Render the plain-text intermediate body below it at the exact 07 bounds. Both native and Drive readers use this title-producing view; test one h1 with the document title. List mode includes Back to documents only when a document is selected; proposed list action controls may be grouped under the identity row's menu so the fixture reading state remains unchanged. Older servers without Drive read show provider-open fallback, no bind/read RPC. Do not put new Docs-only parsing in `useWorkspaceItemOpener` if W6 already supplied the route entrance; consume it.
- [ ] Add controlled-promise tests for project/account/environment switch during binding/read/more, stale page suppressed, reconnect/retry, selected unsupported MIME, no first-account selection, unbound read cannot happen, explicit bind precedes read, pasted/search same identity, bounded continuation, unlink from another client removes only that edge and retains selected unavailable reason, discovery creates zero links, only confirmed/removable source chips go to Start thread. Run named tests green, web/runtime typechecks as applicable and targeted lint. Expected pass: one shared read controller, one selected file, no account leakage.
- [ ] Surface checklist: Docs list, file/document menu, detail header and W6 opener use stable refs; shared palette/keybindings/long-press actions remain. Web/desktop/phone web inline reads use server Drive; native untouched. All provider families use unchanged confirmed-link grant path, no implicit context. Contracts unchanged; reverse Back/link/unlink/relink and connect/disconnect covered. Local/direct/relay/tunnel and environment switching use the same atoms. Guidance at T8.
- [ ] Visual acceptance: W4-T7 `/workspace?space=meetings&fixture=07`, PNG 07 `[953,145,314,378]`, inventory `gap-projects-docs-prs.md:48-58`. Identity row, selected Docs tab, width/insets match V1. Plain text is explicitly intermediate and cannot pass final formatting. Allowed live substitutions are real chosen file and supported access wording plus W4 chrome. Review list/loading/unbound/error/unsupported/More/Back and 390px states; the existing W6 native meeting handoff remains functional throughout T3a/T4 and is replaced only by T3b.
- [ ] `git add -- apps/web/src/components/workspace/WorkspaceDocsPanel.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.test.tsx apps/web/src/components/workspace/DriveFiles.tsx apps/web/src/components/workspace/DriveFiles.test.tsx apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.test.tsx apps/web/src/components/workspace/WorkspaceDocsReadingView.tsx`. Title `feat(web): read linked documents in resources`.

### Task W8-T4: Render safe formatted documents and notes

**Files:** Create `apps/web/src/components/workspace/WorkspaceDocContent.tsx` and `.test.tsx`. Modify T3a's proposed `WorkspaceDocsPanel.tsx` / tests and `DriveFiles.tsx` rendering callback. Conditional structured Drive branch modifies `packages/contracts/src/pulseDrive.ts:35-47,79-153`, `apps/server/src/drive/DriveApi.ts:1-208`, `DriveService.ts:82-153`, `packages/client-runtime/src/state/drive.ts:14-94`, optional capability in `packages/contracts/src/server.ts:600-630`, thin Drive layer `apps/server/src/ws.ts:1258-1275,2000-2020`, read authorization at `RpcAuthorization.ts:30-50`, export registration in `packages/contracts/src/index.ts` if not already exported. Tests `pulseDrive.test.ts`, `DriveService.test.ts`, `testing/fakeDrive.ts`, runtime `state/drive.test.ts`, `RpcAuthorization.test.ts`. Modify `apps/web/src/components/workspace/dev/notesMockupModule.tsx` after W6-T8, exporting the existing `createWorkspaceMockupModule: CreateWorkspaceMockupModule`. Keep `readyRegions: ["resource"]`, remove only `07.docs-format` from incompleteRegions after the shared formatted reading view works, and retain `07.docs-comments` until T5. Native edit consumes W6 NOTES methods, with no duplicate note table or RPC.

**Interfaces:** Consumes `DriveReadResult` and T3a `DriveReader` callback, W6 bounded Markdown and revision-safe note methods when admitted. Produces `WorkspaceDocContent({ content })`, with content `{ format:"markdown"; text:string } | { format:"blocks"; blocks:readonly WorkspaceDocBlock[] }`. Optional provider branch produces schema `WorkspaceDocBlock` in `pulseDrive.ts`, optional `driveDocumentRead` capability and `pulse.drive.readDocument` with bound fileId/cursor input. Result `{ connectionId; file; blocks; nextCursor?; incomplete; limitation? }`; each block is heading level 2/3, paragraph or ordered-list. Plain `drive.readFile` and MCP text reads remain unchanged.

**Depends on:** W8-T3a. Native edit is exercised after W6-T7 and T3b; it never gates Drive reading or the renderer. **Serial slot:** Docs UI and DriveFiles.tsx after T3a, before T3b; dev/notesMockupModule.tsx after W6-T8 and before T5; optional Drive RPC acquires global slot after T1b and W7-T2. **Blast radius:** content. **Door:** two-way; additive optional read, external edits stay external.

- [ ] Add this failing semantic test with actual React renderer imports. The fixture content is independently transcribed from 07:

  ```tsx
  import { act } from "react";
  import { create, type ReactTestRenderer } from "react-test-renderer";
  import { expect, it } from "vite-plus/test";
  import { WorkspaceDocContent } from "./WorkspaceDocContent";

  it("renders the launch priorities as a real ordered list", async () => {
    let view!: ReactTestRenderer;
    await act(() => {
      view = create(
        <WorkspaceDocContent
          content={{
            format: "markdown",
            text: "## Launch priorities\n\n1. Finish the homepage and product copy.\n2. Review SEO titles and search intent.\n3. Align campaign assets with the product launch.\n\n## Review & next steps\n\nMaya owns final approval. Leo will publish the website after Thursday's review.",
          }}
        />,
      );
    });
    expect(view.root.findAllByType("h2").map((node) => node.children.join(""))).toEqual([
      "Launch priorities",
      "Review & next steps",
    ]);
    expect(
      view.root
        .findByType("ol")
        .findAllByType("li")
        .map((node) => node.children.join("")),
    ).toEqual([
      "Finish the homepage and product copy.",
      "Review SEO titles and search intent.",
      "Align campaign assets with the product launch.",
    ]);
    expect(view.root.findAllByType("pre")).toHaveLength(0);
    await act(() => view.unmount());
  });
  ```

- [ ] In `apps/web`, run `vp test run src/components/workspace/WorkspaceDocContent.test.tsx`. Expected red: missing renderer. Add a body test starting with `# X` and assert text X survives without a second card h1; `unwrapDisallowed` preserves its text. Keep the explicit card h1 in WorkspaceDocsReadingView outside Markdown. Add tests with `<script>`, `<img src=https://tracker.example.test/pixel>`, Markdown images, javascript/data/file URLs, hostile comment delimiters and unsupported blocks. Assert no script/iframe/img/dangerouslySetInnerHTML and no network side effect. Assert safe link activation through existing normalized external opener with `noopener`, never hidden local-file access.
- [ ] Reuse installed react-markdown directly for bounded native Markdown. Do not reuse ChatMarkdown's agent attachments, task mutations, filesystem context, image gallery or streaming UI. Implement the minimum renderer:

  ```tsx
  import ReactMarkdown from "react-markdown";
  import { normalizeLinkUrl } from "@t3tools/contracts";
  import type { WorkspaceDocBlock } from "@t3tools/contracts";

  type Content =
    | { format: "markdown"; text: string }
    | { format: "blocks"; blocks: readonly WorkspaceDocBlock[] };

  export function WorkspaceDocContent({ content }: { content: Content }) {
    return (
      <div className="text-[10px] leading-[21px] text-muted-foreground [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:text-[11px] [&_h3]:font-semibold [&_li]:mb-2 [&_li]:text-foreground [&_ol]:list-decimal [&_ol]:pl-3 [&_ul]:list-disc [&_ul]:pl-3 [&_a]:underline">
        {content.format === "markdown" ? (
          <ReactMarkdown
            skipHtml
            unwrapDisallowed
            allowedElements={["p", "h2", "h3", "ol", "ul", "li", "strong", "em", "a", "br", "code"]}
            urlTransform={(url) => normalizeLinkUrl(url) ?? ""}
            components={{
              a: ({ href, children }) =>
                href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ) : (
                  <span>{children}</span>
                ),
            }}
          >
            {content.text}
          </ReactMarkdown>
        ) : (
          content.blocks.map((block, index) => {
            if (block.type === "heading")
              return block.level === 2 ? (
                <h2 key={index}>{block.text}</h2>
              ) : (
                <h3 key={index}>{block.text}</h3>
              );
            if (block.type === "ordered-list")
              return (
                <ol key={index}>
                  {block.items.map((text, item) => (
                    <li key={item}>{text}</li>
                  ))}
                </ol>
              );
            return <p key={index}>{block.text}</p>;
          })
        )}
      </div>
    );
  }
  ```

  If the provider branch is unadmitted, define the same renderer block type locally until its schema is needed on the wire; do not export a fake server capability. For links, use the existing safe opener component if needed for desktop policy rather than introducing a second navigation implementation. Disable embedded content, raw HTML and interactive task checkboxes. Add feature-local typography mapping: paragraphs 10px/21px muted, headings 11px semibold, real list items with 28-29px baseline pitch, card title in parent 16px/24px. Use the exact 07 fixture with 16px padding, 345px natural card height. Longer content scrolls without forced fixture height or clipping.

- [ ] Complete `dev/notesMockupModule.tsx` with the actual pure WorkspaceDocsReadingView and WorkspaceDocContent, fake note reads and commands, and session settled/dispose behavior. Preserve W6's native branch until T3b; the fixture adapter can exercise the formatted view before live native dispatch transfers. Clear only format incompleteness, leaving comments visibly incomplete. Extend WorkspaceDocContent.test.tsx with an adapter render/readiness assertion using the shared view and fake session, proving resource readiness is retained and only 07.docs-format clears.
- [ ] Before admitting structured Google reads, the controller verifies the specific Google Docs `documents.get` operation and existing `drive.readonly` scope support against official API documentation and the approved connection. This authoring task performed no network lookup. If unsupported or new consent is needed, keep provider structure explicitly unavailable and keep bounded plain reading/external open. Native Markdown renderer still ships. Do not guess formatting from text or introduce HTML parsing.
- [ ] For admitted provider structure, add schemas for bounded plain text blocks and optional read RPC in existing Drive family. Decode only required Docs JSON paragraph/heading/list fields. Map namedStyleType and provider list properties to blocks, with explicit limitation for tables, embedded objects, footnotes, unsupported list styles and inline formatting. Do not fetch embedded images. Cap source at 256KiB, response at 30KB serialized, each page at 100 blocks and 24KB text; cut UTF-8 only on code point boundaries. Continuation binds file ID, connection ID/generation and document revision so a changed document requires restart instead of combining revisions. Recheck binding/generation after the provider call. A disconnected/rebound file cannot return another account's content. Existing `DriveService.observe`, OAuth and bound read path remain authoritative.
- [ ] Add fake HTTP JSON to `makeFakeDrive` for an exact provider heading/list fixture and a malformed/oversized response. Extend the real `DriveService.test.ts` setup, not a fake service. This focused assertion drives the new boundary after sign-in/bind using its existing `setup/signIn` helpers and one matching OAuth flow:

  ```ts
  const ready = yield * setup;
  const authorization = yield * ready.signIn;
  yield * ready.oauth.complete(authorization.flow.flowId, authorization.returned.href);
  yield * ready.service.bindFile({ connectionId: ready.connection.id, fileId: "file-one" });
  const document = yield * ready.service.readDocument({ fileId: "file-one" });
  expect(document.blocks.find((block) => block.type === "ordered-list")).toEqual({
    type: "ordered-list",
    items: [
      "Finish the homepage and product copy.",
      "Review SEO titles and search intent.",
      "Align campaign assets with the product launch.",
    ],
  });
  expect(
    ready.fake.calls
      .filter((call) => call.url.hostname === "docs.googleapis.com")
      .every((call) => call.method === "GET"),
  ).toBe(true);
  ```

  Add rebind-in-flight, UTF-8 boundary, source cap, malformed cursor, revision change, old-server fallback and unsupported MIME tests. Keep `drive.readFile` and workspace MCP reader tests green without adding comments to their default text result.

- [ ] Native edit integration uses W6's note revision and explicit Edit/Save/Cancel in a reviewed state. Send original revision with save; conflict retains the user's draft and offers reload/copy, never last-write-wins. Cancel discards only local edit; Drive Edit opens provider. Do not add a rich-text toolbar to the original fixture.
- [ ] Run web `vp test run src/components/workspace/WorkspaceDocContent.test.tsx src/components/workspace/WorkspaceDocsPanel.test.tsx src/components/workspace/DriveFiles.test.tsx`; admitted provider branch also runs server `vp test run src/drive/DriveService.test.ts src/auth/RpcAuthorization.test.ts src/mcp/toolkits/workspace/handlers.test.ts`, contracts `vp test run src/pulseDrive.test.ts`, runtime `vp test run src/state/drive.test.ts`. Expected green: semantic structure/safe links, bounded pages, stale account data rejected, legacy text callers unchanged. Run affected package/server typechecks and targeted lint.
- [ ] Surface checklist: shared renderer used for every admitted Docs entrance, detail/menu/keyboard/touch edit uses W6 operations. Web/desktop/phone web safe rendering; RN optional wire fields remain compatible. Codex/Claude/Cursor/Grok/OpenCode/ACP keep plain-text MCP reads and data boundaries. Contracts optional, edit/cancel/save/revision conflict covered, connection/rebind/local/remote/relay/tunnel covered. Documentation at T8.
- [ ] Visual acceptance: W4-T7 fixture 07, PNG 07 `[953,178,314,345]`, inventory `gap-projects-docs-prs.md:55-61`. Match title, introduction wrap, heading baselines, three ordered priorities and final paragraph under V1; no monospace `<pre>`. Live content and explicit unsupported-structure notices may differ; W4 chrome applies. Review overflow/edit/conflict/unsupported structure and compact states separately.
- [ ] Stage the exact admitted files: renderer/panel/reader and their tests always; structured-read contracts/API/service/fake/atom/auth/capability files only when that branch was admitted. Explicit renderer command `git add -- apps/web/src/components/workspace/WorkspaceDocContent.tsx apps/web/src/components/workspace/WorkspaceDocContent.test.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.test.tsx apps/web/src/components/workspace/DriveFiles.tsx apps/web/src/components/workspace/DriveFiles.test.tsx apps/web/src/components/workspace/dev/notesMockupModule.tsx`. Title `feat(workspace): render safe document structure`.

### Task W8-T3b: Connect native notes to the shared Docs panel

**Files:** Modify proposed `WorkspaceDocsPanel.tsx` and `.test.tsx`; consume W6's proposed `packages/contracts/src/pulseNotes.ts`, `packages/client-runtime/src/state/workspaceNotes.ts`, `apps/web/src/state/workspaceNotes.ts`, `apps/server/src/workspace/WorkspaceNotes.ts`. Modify only the narrow consumer branch of `useWorkspaceItemOpener.ts:31-89` if W6's existing entrance needs its final Docs dispatch. Create `apps/web/src/components/workspace/WorkspaceDocsHandoff.test.tsx` to drive the actual W6 Notes & agenda action and W4 Docs context together. Delete `apps/web/src/components/workspace/meetings/WorkspaceNoteView.tsx` and `apps/web/src/components/workspace/meetings/WorkspaceNoteView.test.tsx` after repointing every W6 caller to WorkspaceDocsPanel native dispatch; these deletions are task-owned Files and staged explicitly below. No Calendar storage edits or Drive account state.

**Interfaces:** Consumes W6-T8 Notes & agenda stable `WorkspaceItemRef` and chosen project, W6 NOTES read/update/revision methods and return route. Produces native dispatch in T3a `WorkspaceDocSelection`, using `provider:"workspace-note"` and exact W6 resourceId. Drive keeps `{ type:"file",provider:"google-drive",fileId }` identity. No new note URL/id scheme.

**Depends on:** W8-T3a, W6-T8; rendering integration follows W8-T4. **Serial slot:** Docs UI after T4. **Blast radius:** navigation. **Door:** two-way. If native notes are unadmitted, record skipped and leave Drive usable.

- [ ] Extend panel interaction mocks with the actual W6 note atom response and capabilities. Add a controlled native-note read and prove it never creates Drive queries. The boundary assertion uses the selection type already exported by T3a:

  ```tsx
  const native: WorkspaceDocSelection = {
    environmentId: EnvironmentId.make("remote"),
    projectId: ProjectId.make("synkek"),
    document: {
      title: "Launch review · Meeting notes",
      ref: {
        type: "provider-resource",
        provider: "workspace-note",
        resourceId: "note-launch-review",
      },
    },
  };
  await act(() => {
    view = create(
      <WorkspaceDocsPanel
        environmentId={native.environmentId}
        projectId={native.projectId}
        selected={native}
        onSelect={onSelect}
      />,
    );
  });
  expect(view.root.findByType("h1").children.join("")).toBe("Launch review · Meeting notes");
  expect(mocks.driveRead).not.toHaveBeenCalled();
  expect(mocks.driveBind).not.toHaveBeenCalled();
  ```

  Seed the actual note read result with W6 revision/body fields. The resourceId literal is fixture data only; production reuses W6's ID constructor and parser.

- [ ] Run web `vp test run src/components/workspace/WorkspaceDocsPanel.test.tsx src/components/workspace/WorkspaceDocsHandoff.test.tsx`. Expected red: native dispatch unavailable. Add meeting action/back assertions to the new handoff integration test before modifying the opener.
- [ ] Branch on a schema-validated native reference before mounting any Drive reader. Consume W6's `createWorkspaceNoteAtoms(runtime)` factory via its `workspaceNotes` binding in the owning environment and render its bounded Markdown with `WorkspaceDocContent`. Require selected environment/project match; deleted or unauthorized note shows its retained reference and unavailable reason. Native selection has no Google dependency. Use W6 owner/project-note relationships and per-note read grants, not meeting title matching.
- [ ] Resolve the context hook at the top level of the opener component/hook, then use openResource in its existing action callback:

  ```ts
  const { openResource } = useWorkspaceResources();
  openResource({ tab: "docs", projectId, request: noteRef });
  ```

  The Docs adapter maps request to `WorkspaceDocSelection` after validating scope and reading its title, using local onSelect only for the panel list. Replace the interim WorkspaceNoteView branch and its callers with WorkspaceDocsPanel native dispatch, then delete the interim view/test. Check no imports remain and retain native action/read/back tests in WorkspaceDocsHandoff. W4 owns activating Docs and remembering resource selection; W6 owns carrying/restoring meeting/day/Upcoming route. Do not navigate away from the Meetings center to open Code. For a direct native note URL without a chosen project, use W6's owning-project resolution or explicit project choice. Do not pick another project just because it is first in the dropdown. Resource project switches suppress in-flight results; switching back can restore only that project's ref.

- [ ] Verify Notes & agenda -> same native note -> Back preserves selected day/meeting/Upcoming; direct note route; note deletion; resource-project/environment switches during read; Drive and native selections do not collide; note edits conflict safely through W6 revision; plain-note intermediate state disappears only when T4 is available; no link or agent run on open; native read independent of disconnected Google. Run `vp test run src/components/workspace/WorkspaceDocsPanel.test.tsx src/components/workspace/WorkspaceDocsHandoff.test.tsx` green, web typecheck/server boundary typecheck and targeted lint.
- [ ] Surface checklist: meeting action, direct ref, document menu, detail/palette/keybindings/long-press reuse W4/W6 entrances. Web/desktop/phone web share selection; RN no new screen or shape beyond W6 schema. All provider adapters keep W6 confirmed-resource grants, no adapter branches. Reverse Back/edit-cancel/delete-unavailable covered. Local/direct/relay/tunnel and multi-environment isolation covered. W8-T8 closes note user guidance and Wave 6 visual dependency.
- [ ] Visual acceptance: fixture 07 `/workspace?space=meetings&fixture=07`, PNG 07 `[953,145,314,378]`, inventory `gap-projects-docs-prs.md:48-58`. Notes & agenda opens the exact launch-review ref with Docs selected, title/card unchanged and no account picker for native notes. V1 plus allowed real note title/body and Environment access caption, W4 chrome. Deleted/conflict/direct-route states are reviewed proposals.
- [ ] `git add -- apps/web/src/components/workspace/WorkspaceDocsPanel.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.test.tsx apps/web/src/components/workspace/WorkspaceDocsHandoff.test.tsx apps/web/src/components/workspace/meetings/WorkspaceNoteView.tsx apps/web/src/components/workspace/meetings/WorkspaceNoteView.test.tsx`. Stage the two deleted files with this exact command after repointing W6 callers. Add `apps/web/src/components/workspace/useWorkspaceItemOpener.ts` and its existing focused test only if changed, never W6 service/storage ownership. Title `feat(web): open meeting notes in shared Docs`.

### Task W8-T5: Add native note comments with explicit author semantics

**Files:** Extend W6's proposed `packages/contracts/src/pulseNotes.ts`, `apps/server/src/workspace/WorkspaceNotes.ts`, `packages/client-runtime/src/state/workspaceNotes.ts`, and their adjacent tests; modify T3a `WorkspaceDocsPanel.tsx` / tests. Add `apps/server/src/workspace/WorkspaceNoteComments.test.ts` for the service boundary. A forward comments migration and test under `apps/server/src/persistence/Migrations/` are allocated under the slot, with `Migrations.ts:1-12,158` registration. Modify the W6 Notes RPC family layer in `ws.ts`, optional capability in `packages/contracts/src/server.ts:600-630`, `RpcAuthorization.ts:30-50` and its tests. Existing `apps/server/src/workspace/linkedItemsContext.ts` and `linkedItemsTurn.integration.test.ts` gain only focused default-body regression assertions if needed; hold the global context slot for that test edit. Do not change `ProviderTurnStartService.ts:1052` unless a regression demonstrates actual integration drift. Modify `apps/web/src/components/workspace/dev/notesMockupModule.tsx` after T4, keeping its `createWorkspaceMockupModule: CreateWorkspaceMockupModule` export and `readyRegions: ["resource"]`; remove `07.docs-comments` from incompleteRegions only after fake-backed comments render and settle. Retain any unrelated incomplete subregions.

**Interfaces:** Consumes W6 `WorkspaceNotes` note identity/read grants/revisions/change stream and W5-T3 environment-owner identity. Produces `WorkspaceNoteComment` schema `{ id; noteId; body; author:{ kind:"environment-owner"; displayName?:string }; createdAt; deleted?:boolean }`, read RPC `pulse.notes.listComments({ noteId; cursor?; limit? })` and corresponding shared query atom. Result `{ comments; nextCursor?; total?:number; complete:boolean }`, max 50 rows/page and 30KB response. Body max 2000 characters. Optional `workspaceNoteComments` capability; absent means Comments unavailable on this server. Live owner attribution is explicit and never claims a separately authenticated coworker.

**Depends on:** W6-T7, W8-T4, W5-T3. **Serial slot:** global RPC/migrations after T1b and admitted T4; Docs UI after T3b; dev/notesMockupModule.tsx after T4. **Blast radius:** notes. **Door:** two-way; additive table and read, tombstone on admitted deletion.

**Admission:** D11/D05 are default assumed for reading and attribution. Native create/delete requires explicit confirmation before adding mutations or a composer. The PNG establishes reading only. If no live native comment producer or create/delete approval exists, record the native comment write branch held; empty live comments and marked fixtures are honest, but native write acceptance is not complete. Do not implement a sample-only production author store.

- [ ] Add contract tests that accept a real environment-owner author, reject a fake Pulse role field as an author mechanism, bound body/page sizes, distinguish no `total` from total zero and decode old notes without comments. Then add service tests to `WorkspaceNoteComments.test.ts` using the actual W6 memory-service setup. The setup creates one note through W6's public create method and supplies its ID. The body of the page test is concrete against the new method:

  ```ts
  const first = yield * notes.listComments({ noteId: note.id, limit: 1 });
  expect(first.comments.map((comment) => comment.body)).toEqual([
    "Looks good. Let's include the new keyword targets in the product pages.",
  ]);
  expect(first.nextCursor).toEqual(expect.any(String));
  const second =
    yield * notes.listComments({ noteId: note.id, limit: 1, cursor: first.nextCursor });
  expect(second.comments.map((comment) => comment.body)).toEqual(["Publish after review."]);
  expect(second.nextCursor).toBeUndefined();
  expect(second.total).toBe(2);
  ```

  Seed two persisted rows in test setup only, through the allocated comments table. Use explicit timestamps/IDs for stable order. Do not write through a private production helper. If mutations are admitted, create these comments through the public mutation instead and retain separate migration restart coverage.

- [ ] From `apps/server`, run `vp test run src/workspace/WorkspaceNoteComments.test.ts`. Expected red: listComments/schema/table absent. Add the renderer interaction test before the UI change: one page yields Comments · 1, plain comment text beside initials, no composer when writes unconfirmed; denied capability yields an explanation instead of zero.
- [ ] Add the minimal comments table keyed by comment ID and note ID, with index `(note_id, created_at, id)`. Reference W6 note identity; do not add a user table, role column, project membership or ACL. List requires the same current note-read authorization and retained/deleted-note semantics as W6. Cursor binds note/environment and last timestamp/id. The SQL read follows this bounded form inside the existing service:

  ```ts
  const rows =
    yield *
    sql<{
      id: string;
      noteId: string;
      body: string;
      createdAt: string;
      ownerName: string | null;
    }>`SELECT id, note_id AS "noteId", body, created_at AS "createdAt",
      owner_name AS "ownerName" FROM workspace_note_comments
      WHERE note_id = ${noteId} AND deleted_at IS NULL
        AND (created_at > ${afterTime} OR (created_at = ${afterTime} AND id > ${afterId}))
      ORDER BY created_at, id LIMIT ${limit + 1}`;
  ```

  Reuse W6 note availability/read-grant validation before the query. Supply total only from an exact bounded metadata/count read with the same authorization and deletion predicate; never use loaded page length as full count. Keep server-author attribution and safe bounded text, not arbitrary author JSON from the client. Reuse Notes change stream, one active comments query and explicit More/Refresh. Read revocation clears visible content; comments stay source-labelled Native note.

- [ ] If create/delete is affirmatively admitted, extend the same family with `pulse.notes.createComment({ requestId,noteId,body })` and `pulse.notes.deleteComment({ requestId,noteId,commentId })`, operate authorization, UUID idempotency/fingerprint and tombstones. The server obtains environment-owner attribution; clients never supply a person/role. Same request/same body returns one durable comment; changed body with same request conflicts. Delete only a comment on that note under existing authority. Acknowledge once persistence commits, announce on the existing change stream and do not auto-retry ambiguous writes. Test retry/restart/delete/revocation and two-client update. Keep fixture read state composer-free; mutation affordance is a reviewed proposed state. If unconfirmed, add no mutation RPC, write capability or inert add-comment button.
- [ ] Add `comments stay outside default agent body` to Notes/MCP integration tests. A note read still returns only its bounded body and limitation; comment contents are not appended to `workspace_read_item` or per-turn linked summaries. Reading a comment explicitly later would require a separate approved tool contract. Test hostile comment content renders as text and cannot escape the context block. All configured providers share the W6 note reader, so one boundary assertion plus existing turn integration covers Codex/Claude/Cursor/Grok/OpenCode/ACP routing.
- [ ] Render `Comments · N` only for known total, otherwise Comments or Comments · Showing N. Show More comments when cursor exists, No comments only for a complete empty read, and Comments unavailable with Retry for failure. Use 19px avatar and owner accessible name; absent owner name uses Environment owner, never NP live. Fixture NP belongs only to the non-writing `dev/notesMockupModule.tsx` adapter now owned by this task. Render the exact sample comment through WorkspaceDocsReadingView and the same pure comments presentation, with fake read/commands and no production sample imports; then clear `07.docs-comments` incompleteness. Extend WorkspaceDocsPanel.test.tsx with an adapter render/readiness assertion that the exact comment appears, fake work settles, no live query runs and only this remaining subregion clears. Separate native and provider sources so changing selected document cannot combine their pages.
- [ ] Run server `vp test run src/workspace/WorkspaceNoteComments.test.ts src/workspace/WorkspaceNotes.test.ts src/auth/RpcAuthorization.test.ts src/mcp/toolkits/workspace/handlers.test.ts src/workspace/linkedItemsTurn.integration.test.ts`; contracts `vp test run src/pulseNotes.test.ts`; runtime `vp test run src/state/workspaceNotes.test.ts`; web `vp test run src/components/workspace/WorkspaceDocsPanel.test.tsx`. Run admitted backend tests for exact page/count agreement, empty/unavailable, restart, deleted note, mismatched note cursor, revoked future reads, two subscribers receiving one committed change and no body inclusion. Expected green: source-correct bounded comments; writes only if admitted. A W6 file not yet created is a dependency, not a passed test. Run affected typechecks and targeted lint.
- [ ] Surface checklist: comment read is reachable from any native Docs entrance; optional mutations have accessible header/menu/keyboard/touch parity only after approval. Web/desktop/phone web covered; native optional decode retained without new screen. All provider families use unchanged body grants. Read/operate contracts explicit; optional create/delete and retry, otherwise read/More/Back reverse states covered. Server owns comments across local/direct/relay/tunnel, keyed by environment and note. User explanation at T8 identifies actual attribution.
- [ ] Visual acceptance: W4-T7 fixture 07, PNG 07 `[953,536,314,74]`, inventory `gap-meetings-notes.md:73-74`. Divider y536, Comments · 1 baseline, NP 19px fixture avatar and exact two-line text pass V1. Live author/count/body and explicit Environment owner wording substitute under D05/D11, W4 chrome applies. Missing write approval or native producer remains a recorded live departure. Review pagination/empty/denied and any admitted composer/delete state.
- [ ] Stage explicit admitted paths: `git add -- packages/contracts/src/pulseNotes.ts packages/contracts/src/pulseNotes.test.ts packages/contracts/src/server.ts apps/server/src/workspace/WorkspaceNotes.ts apps/server/src/workspace/WorkspaceNotes.test.ts apps/server/src/workspace/WorkspaceNoteComments.test.ts apps/server/src/persistence/Migrations.ts apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts packages/client-runtime/src/state/workspaceNotes.ts packages/client-runtime/src/state/workspaceNotes.test.ts apps/web/src/components/workspace/WorkspaceDocsPanel.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.test.tsx apps/web/src/components/workspace/dev/notesMockupModule.tsx`. Add the two allocated migration filenames explicitly, and only changed focused integration test paths. Title `feat(workspace): read native note comments`.

### Task W8-T6: Read supported provider comments and sharing metadata

**Files:** Modify `packages/contracts/src/pulseDrive.ts:35-47,79-153`, `apps/server/src/drive/DriveApi.ts:1-208`, `DriveService.ts:20-153`, `DriveStore.ts:67-257` only if a binding recheck helper is needed, `packages/client-runtime/src/state/drive.ts:14-94`, T3a Docs panel/tests. Extend `DriveService.test.ts`, `testing/fakeDrive.ts`, `pulseDrive.test.ts`, runtime `state/drive.test.ts`. Optional capabilities/auth/thin handlers in `packages/contracts/src/server.ts:600-630`, `apps/server/src/auth/RpcAuthorization.ts:30-50`, `apps/server/src/ws.ts:1258-1275,2000-2020`; `RpcAuthorization.test.ts`. Modify W7's proposed `ProjectDriveExplorer.tsx` sharing-caption consumer and `ProjectDriveExplorer.test.tsx` only, under its file slot. No explorer mechanics or OAuth scope expansion.

**Interfaces:** Consumes W7-T2 account-bound DRIVE, T4 safe text rendering and structure fallback. Produces optional `driveCommentsRead` and `driveSharingRead` capabilities, `pulse.drive.listComments({ fileId,cursor?,limit? })` and `pulse.drive.sharing({ fileId })`, service methods and shared `drive.comments/sharing` queries. Comments result `{ connectionId,fileId,comments,nextCursor?,total?,complete }`, max 50/page, 30KB serialized, 2000 characters/comment with explicit truncation. Sharing result `{ state:"known"|"incomplete"|"unavailable"; peopleCount?:number; limitation?:string; observedAt?:string }`. No write endpoint.

**Depends on:** W8-T4, W7-T2. **Serial slot:** after admitted W8-T5 in global RPC and Docs UI chain; splice skipped T5 explicitly. **Blast radius:** provider. **Door:** two-way. **Admission:** verify Google operation/scope/API sufficiency under D11 before implementing this provider branch. Release slot while waiting. A denied or missing scope blocks this parity only.

- [ ] Controller checks official read API documentation for Drive comments.list and files permission metadata under the already approved account, including fields, paging and shared-drive limits. Record operation, existing scopes and complete-count limitations before coding. No new OAuth consent is implied. If unavailable, keep Comments unavailable and Sharing information unavailable; do not add new scopes, auto-connect or block native notes/other tabs. Real-account checks remain distinct from fake HTTP tests.
- [ ] Extend `makeFakeDrive` state with bounded comment pages and permission variants. Reuse the real DriveService test setup. Add this red service test after a matching sign-in/bind, with fake state seeded to two pages and unsupported group membership:

  ```ts
  const ready = yield * setup;
  const authorization = yield * ready.signIn;
  yield * ready.oauth.complete(authorization.flow.flowId, authorization.returned.href);
  yield * ready.service.bindFile({ connectionId: ready.connection.id, fileId: "file-one" });
  const page = yield * ready.service.listComments({ fileId: "file-one", limit: 1 });
  expect(page.comments[0]?.body).toBe("Looks good.");
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(page.total).toBeUndefined();
  const sharing = yield * ready.service.sharing({ fileId: "file-one" });
  expect(sharing.state).toBe("incomplete");
  expect(sharing.peopleCount).toBeUndefined();
  expect(
    ready.fake.calls
      .filter((call) => call.url.pathname.includes("/comments"))
      .every((call) => call.method === "GET"),
  ).toBe(true);
  ```

  Add the HTTP fake state fields and responses before the test so failure is missing service behavior, not an unrelated fixture exception. Test provider 403/404 separately from a valid zero-comment response.

- [ ] From `apps/server`, run `vp test run src/drive/DriveService.test.ts`. Expected red: absent listComments/sharing methods. Add UI tests that keep unknown counts absent and separate provider author/source labels before rendering changes.
- [ ] Add read-only schemas/RPC/capabilities to the existing Drive family and read authorization map. Use one file binding and access-token generation capture for the whole request. Verify the same binding and generation after response. Decode provider JSON with Schema, take only stable ID, plain content, deleted state and bounded author display identity. Use plain `content`, never execute `htmlContent`. Unknown author label is Unknown author. Do not add reply/resolve/create/delete/share mutations. Treat deleted/unavailable comments explicitly, not as a claimed complete zero.
- [ ] Bound provider tokens inside an opaque cursor that also binds file/account/generation. One page per explicit open/More/Refresh, no while-loop draining all pages. Unsupported total stays absent even on a short page unless the API establishes complete metadata. Partial body text gets a limitation, not silent truncation. A local loaded-page count can say Showing N comments; it is not total N.
- [ ] For sharing, do not count a group/domain/anyone permission as one person or expand group rosters. Report a people count only when the approved API gives complete applicable individual permissions and the exact count's semantics are justified. A linked folder, file owner, meeting avatars or project roster cannot establish a sharing count. Unknown/inherited/incomplete membership returns incomplete without peopleCount. Render Environment access for native notes; provider caption Sharing information unavailable unless supported. Keep Files stay in Google Drive. as the W7 live fallback. Fixture-only Shared with 8 people and SynKEK team require W4 evidence and never escape fixture mode.
- [ ] Add tests for zero/one/two pages, continuation bound to file/account, unknown author, deleted comment, malformed response, byte/UTF-8 limits, scope denial, individual/group/domain/inherited/anyone sharing, explicit freshness, no write HTTP methods, account/project switch while requests are pending and disconnect revocation. Run `vp test run src/drive/DriveService.test.ts src/auth/RpcAuthorization.test.ts` in server, contracts `vp test run src/pulseDrive.test.ts`, runtime `vp test run src/state/drive.test.ts`, web `vp test run src/components/workspace/WorkspaceDocsPanel.test.tsx` plus W7's named sharing consumer test if changed. Expected green: one bounded page, no fabricated permission/count, no write. Run affected typechecks and targeted lint.
- [ ] Surface checklist: Docs/provider-open/comment read and Files caption share source/account truth; menus/detail/palette/keybinding/touch do not gain provider writes. Web/desktop/phone web work server-side; RN optional fields decode. No agent adapter changes, comments stay out of default content for all provider families. Optional contracts/capabilities and read scope tested. Back/More/retry/connect/disconnect covered. Local/direct/relay/tunnel and multiple account/environment isolation covered. Guidance at T8.
- [ ] Visual acceptance: W4-T7 recipe 07, PNG 07 `[953,197,314,413]`, and fixture 04 `[953,654,314,22]`; inventories `gap-projects-docs-prs.md:56-64` and `gap-meetings-notes.md:73-74`. Caption, separate divider/count/avatar/comment geometry match V1 when supported. Allowed live substitutions are actual provider authors/body and complete counts, or unavailable/incomplete caption. W4 chrome applies. Do not count held API support as full parity; review unavailable/error/partial-page states.
- [ ] Explicit staged file list: `git add -- packages/contracts/src/pulseDrive.ts packages/contracts/src/pulseDrive.test.ts packages/contracts/src/server.ts apps/server/src/drive/DriveApi.ts apps/server/src/drive/DriveService.ts apps/server/src/drive/DriveService.test.ts apps/server/src/drive/testing/fakeDrive.ts apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts packages/client-runtime/src/state/drive.ts packages/client-runtime/src/state/drive.test.ts apps/web/src/components/workspace/WorkspaceDocsPanel.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.test.tsx`. Add `DriveStore.ts` and W7 sharing consumer/test only if changed and admitted. Title `feat(drive): read document comments and sharing metadata`.

### Task W8-T7: Compose linked project PRs and reuse Code detail

**Files:** Create `packages/client-runtime/src/projectPullRequests.ts` and `.test.ts`, export its subpath in `packages/client-runtime/package.json`. Create `apps/web/src/components/workspace/WorkspacePullRequestsPanel.tsx` and `.test.tsx`. Reuse `ThreadWorkspaceLinks.tsx:27-115`, `apps/web/src/hooks/usePullRequestLinking.ts:32-104`, `apps/web/src/components/chat/ThreadDetailsPrRow.tsx:74` and `components/pullRequest/PullRequestDetailPanel.tsx:418-480` through existing open/detail paths. Reuse `packages/shared/src/threadPullRequests.ts:19-85`, `packages/shared/src/changeRequestUrl.ts:40-80` and `apps/web/src/lib/openPullRequestLink.ts:98-156`. Do not modify these primitives unless a focused compatibility regression needs a shared fix; their existing tests then belong to the task. Modify `apps/web/src/components/workspace/WorkspaceResourceBody.tsx` only in its PRs case and extend `WorkspaceResourcesPanel.test.tsx`. New collection is runtime code, not a contracts helper.

**Interfaces:** Consumes W4-T5 shared actions, W8-T2 selected project, environment-filtered loaded thread shells, confirmed direct project URL links and confirmed direct thread links. Produces `collectProjectPullRequests({ environmentId,projectId,threads,projectLinks,threadsComplete,linksComplete,linkMode })` returning `{ entries,incomplete }`; entry has canonical `key`, `url`, `reference?:ThreadPullRequestLink`, `provenance: readonly ({type:"thread";threadId;title;url}|{type:"project-link";linkId})[]`. `linkMode` is the actual existing `threadPullRequestLinkMode` result, `multiple`, `single` or `unsupported`. Preserve original URL for each native unlink even when display identity normalizes. Helper accepts a narrow typed shell projection containing environment/project/id/title and optional pullRequests/linkedPullRequest. Collection is at most 100 display rows and 30 owned/explicitly linked loaded source threads; return incomplete when bounded or upstream incomplete. No new PR record or link table.

**Depends on:** W4-T5, W8-T2. **Serial slot:** own new collection/panel files; take WorkspaceResourceBody.tsx after W8-T3a, before W8-T8. Acquire any other shared primitive slot only for a proven compatibility fix. **Blast radius:** links. **Door:** two-way. **Admission:** D23 requires a reviewed proposed PR-open layout before body implementation; helper/service tests can be prepared independently.

- [ ] Before the body edit, review the proposed PR-open list/empty/error/detail handoff/phone captures described above. Record the approved proposal reference and departures. No original PNG provides PR-body pixels. Selecting a PR must not auto-link it, create a thread, start a provider, watch it or invoke a host mutation.
- [ ] Add this complete helper test. It supplies real contract-shaped native records and two independent source threads:

  ```ts
  import {
    EnvironmentId,
    ProjectId,
    ThreadId,
    type ThreadPullRequestLink,
  } from "@t3tools/contracts";
  import { expect, it } from "vite-plus/test";
  import { collectProjectPullRequests } from "./projectPullRequests.ts";

  const environmentId = EnvironmentId.make("remote");
  const projectId = ProjectId.make("synkek");
  const pr = (host: string): ThreadPullRequestLink => ({
    host,
    repository: "synkek/site",
    number: 42,
    url: `https://${host}/synkek/site/pull/42`,
    source: "manual",
    linkedAt: "2026-10-13T07:00:00Z",
    snapshot: null,
    stack: null,
  });
  it("deduplicates native PRs while preserving source threads and host identity", () => {
    const result = collectProjectPullRequests({
      environmentId,
      projectId,
      threadsComplete: true,
      linksComplete: true,
      linkMode: "multiple",
      projectLinks: [],
      threads: [
        {
          environmentId,
          projectId,
          id: ThreadId.make("a"),
          title: "Design",
          pullRequests: [pr("github.com")],
        },
        {
          environmentId,
          projectId,
          id: ThreadId.make("b"),
          title: "Build",
          pullRequests: [pr("github.com"), pr("github.enterprise.test")],
        },
      ],
    });
    expect(result.entries).toHaveLength(2);
    expect(
      result.entries
        .find((entry) => entry.key === "github.com/synkek/site#42")
        ?.provenance.map((edge) => edge.type),
    ).toEqual(["thread", "thread"]);
    expect(result.incomplete).toBe(false);
  });
  ```

  The manual source literal is verified at `threadPullRequest.ts:34-40`. Do not add a new source enum for this collection.

- [ ] From `packages/client-runtime`, run `vp test run src/projectPullRequests.test.ts`. Expected red: missing helper. Add tests for direct URL plus native duplicate, removal of only one edge, legacy single link fallback, stack-dismissed exclusion, same host/repo/number under URL variations, Forgejo authority/port, GitLab nested paths, deleted/unloaded source and cross-environment filtering.
- [ ] Implement with `visibleThreadPullRequests`, `legacyThreadPullRequestKey`, `threadPullRequestKeyOf` and `parseChangeRequestUrl`. Start from owned or explicitly project-linked loaded threads only. One-hop discovered threads are not owned/directly linked sources. Filter environment before collecting. Include only confirmed project URL links recognized by the existing parser. Do not guess arbitrary URL hosts. Group by the existing canonical key, retaining every unique provenance edge; do not collapse unlink authority into a single synthetic ID. A direct URL with no snapshot is useful and says Status unavailable. Absent new multi-link capability follows `usePullRequestLinking` legacy mode; cached arrays cannot override a downgraded capability. Stack-dismissed entries never reappear through legacy fallback when a modern array establishes dismissal.
- [ ] Compose from bounded loaded shells plus one confirmed project link read. No per-thread hub or PR-detail fanout, repository-wide browse or polling. When the shell list/link collection is incomplete, show Showing loaded links and no claim of complete project count. An explicitly linked but unloaded thread remains an unavailable provenance row or a bounded explicit load action, never a silent complete omission. This task intentionally chooses an honest partial collection over introducing a new server collection RPC; if maintainers require full completeness, return that expansion to planning rather than quietly adding it.
- [ ] Wire the PRs case only in WorkspaceResourceBody.tsx to the new panel with WorkspaceResourceBodyProps scope, selectedItem and request; retain every other case. Exercise the real switch in WorkspaceResourcesPanel.test.tsx before releasing its slot.
- [ ] Use current shared row and open path. `resolvePullRequestPreviewTarget` identifies a supported same-environment Code `PullRequestRef`; open existing Code detail or show external fallback when auth/capability/checkout is missing. Do not squeeze the full detail viewer into a 314px collection or clone it. `usePullRequestLinking(environmentId).changeLink(scopeThreadRef(environmentId, sourceThreadId), edge.url, false)` removes the selected native source only. Generic project URL unlink uses `workspaceLinks.unlink` with that edge's link ID. If several sources exist, menu labels identify which source is removed. Relink preserves generic link origin and existing native compatibility. Watch remains an explicit source-thread Code action.
- [ ] Add interaction tests exercising real panel -> chosen provenance unlink command -> updated loaded data -> remaining row. Test direct URL plus two thread sources and legacy mode separately. Assert selection emits no link/mutation/provider run; disconnected source has usable external link; one environment auth failure does not fall back to another environment's credentials. Retain Code thread open/unlink tests and viewer behavior. Run runtime `vp test run src/projectPullRequests.test.ts`, web `vp test run src/components/workspace/WorkspacePullRequestsPanel.test.tsx src/components/workspace/WorkspaceResourcesPanel.test.tsx src/lib/openPullRequestLink.test.ts` and any changed `ThreadWorkspaceLinks`/hook/detail focused tests. Expected green: all provenance survives, only chosen edge removed, missing snapshot honest. Run affected typechecks and targeted lint.
- [ ] Surface checklist: PR resource row/menu, Open in Code, external open and source-specific unlink share Code behavior; header/palette/keybinding/long-press actions remain consistent. Web/desktop/phone web collection, existing RN contracts unchanged. Codex/Claude/Cursor/Grok/OpenCode/ACP selection never starts a run. No new server contract; legacy/multiple linking capabilities honored. Unlink/relink/back and disconnected/deleted source states covered. Environment/provider-host/auth capture covers local/direct/relay/tunnel. Definition/user explanation at T8.
- [ ] Visual acceptance: W4-T7 fixtures 01-08 tab strips, original PNG context `[1222,85,45,43]`, inventory `gap-projects-docs-prs.md:66-70`. Icon/label/order/selected PR treatment pass V1. Compare body only to the reviewed proposed capture; actual titles/state/provenance may substitute, unknown checks stay unavailable. Include 390px source menu and return to Docs without losing center selection. No original-body parity claim.
- [ ] `git add -- packages/client-runtime/src/projectPullRequests.ts packages/client-runtime/src/projectPullRequests.test.ts packages/client-runtime/package.json apps/web/src/components/workspace/WorkspacePullRequestsPanel.tsx apps/web/src/components/workspace/WorkspacePullRequestsPanel.test.tsx apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.test.tsx`. Add only actually changed shared primitive/hook/tests explicitly after review. Title `feat(workspace): show linked project pull requests`.

### Task W8-T8: Gate truthful metadata and project/Docs/PR integration

**Files:** Modify `ProjectsSpace.tsx:25-307` only for final metadata/roster policy, proposed `WorkspaceDocsPanel.tsx`, `WorkspacePullRequestsPanel.tsx` and their tests; narrow integration fixes to the Docs/PRs cases in `apps/web/src/components/workspace/WorkspaceResourceBody.tsx`, and `WorkspaceResourcesPanel.test.tsx`; never choose bodies in WorkspaceResourcesPanel.tsx or WorkspaceToolsPanel.tsx. Create `apps/web/src/components/workspace/WorkspaceResources.integration.test.tsx`. Update `docs/user/workspace-spaces.md:53-67`; review/update `docs/internals/overview.md:7-38` and `docs/internals/glossary.md:6-20,50-56`. Reuse W4 fixture entry, without importing fixtures into production. The transferred adapters are owned explicitly by T2/T4/T5; T8 verifies their readiness without editing W4's registry or inventing registration. Return adapter repairs to the owning task and slot with the exact paths above.

**Interfaces:** Consumes W8 overview/cards/Docs/PRs, W7-T3 Files, W4 six-tab selected-body mapping and all admitted W8 native/provider branches. Produces integrated supported bodies and explicit unavailable states, accepted user guidance and one `project PR collection` definition. Preserve upstream definitions for resource frame, workspace note and Drive root; do not redefine them inconsistently.

**Depends on:** W8-T2, W8-T4, W8-T7, W7-T3 plus each admitted W8-T3b/T5/T6 branch. **Serial slot:** Docs UI after T6 or nearest admitted predecessor; take WorkspaceResourceBody.tsx after W8-T7 and before W10-T1 for Docs/PRs integration fixes, plus the admitted documentation gate after W7-T3 and before W9-T8. No global RPC slot unless a proven integration defect requires it. **Blast radius:** workspace. **Door:** two-way. W12-T6 roster and W12-T8 followers remain held and are not prerequisites.

- [ ] Write the integrated test before wiring. Use a stateful fake RPC transport/existing query runtime with a real selected-body component and controlled promise completions. Drive the visible project card -> Docs -> PRs -> Files -> Docs -> close/reopen sequence. Assert one mounted body and no body fetch for inactive tabs. The core action/assertion pattern is:

  ```ts
  const tab = (name: string) =>
    view.root
      .findAllByProps({ role: "tab" })
      .find((node) => node.props["aria-label"] === name || node.children.includes(name))!;
  await act(() => tab("Docs").props.onClick());
  expect(view.root.findAllByProps({ "aria-label": "Docs resource" })).toHaveLength(1);
  await act(() => tab("PRs").props.onClick());
  expect(view.root.findAllByProps({ "aria-label": "Docs resource" })).toHaveLength(0);
  expect(view.root.findAllByProps({ "aria-label": "PRs resource" })).toHaveLength(1);
  expect(rpcCalls.filter((call) => call.tag === "pulse.drive.readFile")).toHaveLength(0);
  ```

  Seed PRs as direct URL/no snapshot and Docs as native for this exact case, so zero Drive reads is an independent expectation. Include a separate selected Drive case that reads once only after the user's explicit open. Use the actual upstream tab labels/locators at dispatch; do not introduce new tabs just to fit a test.

- [ ] From `apps/web`, run `vp test run src/components/workspace/WorkspaceResources.integration.test.tsx`. Expected red: integrated body lifecycle or metadata policy wrong. T3a/T7 have already installed their cases; missing upstream cases are a dispatch defect, not a reason to choose bodies in the frame. Add live/sample assertions: no production sample marker or fixture coworkers; no Admin/Member role claim; unknown member count omitted; no followers promise; unknown sharing does not say 8 people/team; fixture keeps its exact supported sample evidence.
- [ ] Verify and repair lazy Docs/PR cases only in WorkspaceResourceBody.tsx with WorkspaceResourceBodyProps environment/project, nullable selectedItem and request; use the shared context handoff for navigation. Keep Browser/Agents/Tasks/Files owners intact. Missing capabilities render supported explanation/external fallback. Header/resources/sheet use the same state and mount exactly once. Native owner access wording and provider metadata rules are consistent across cards, Docs comments and Files caption. Do not probe accounts to populate footer or counts. Keep project center/meeting/day selection through account errors, doc/PR open/back, explicit resource-project changes and close/reopen.
- [ ] Exercise shared item actions through row menu, detail/header, command palette, existing shortcuts and touch/long-press. Assert captured source endpoint survives changing resource project before confirming an action. Confirm link/unlink/relink, create/cancel, edit/save/cancel/conflict, read/More/Back, connect/disconnect and unavailable/deleted source. Suggestions/discovery remain display-only until explicit confirmation. Start thread leaves removable chips and starts no provider before send. Scope unchanged across Codex, Claude, Cursor, Grok, OpenCode and configured ACP providers.
- [ ] Add reconnect/compatibility matrix cases with fake transport boundaries: old server lacks overview/structured read/comments; read-only session cannot bind/save/write; direct/relay/tunnel descriptors use the same environment IDs; environment switch while native/Drive/comment/PR reads are pending; connection failure retains references and selected center; remote update invalidates config/links through existing stream once without timer. Prove inactive tabs issue zero reads, overview is one paged call, comments/doc bodies are lazy and bounded. Phone web and desktop wrapper share components; existing RN contracts decode absent optional additions. No new native screen or new desktop IPC call is needed.
- [ ] Update user guidance only for admitted behavior. Suggested shipped-product prose:

  ```md
  Choose a project in Projects to see its resources while keeping the project overview open.
  Use Linked to return to the project's threads and related work. Related items do not give
  agents access until you link them directly.

  Docs reads linked documents. Choose a Drive connection before reading a Drive file.
  Meeting notes use your environment's access. Saving a note checks that another edit has
  not replaced the version you opened. Drive editing opens on Google.

  Project pull requests collect the links already attached to the project and its threads.
  A pull request can have several sources. Unlink removes the source you choose. Open in
  Code uses the existing review view; opening a link does not start an agent.
  ```

  Include comment attribution/read limitations only for admitted branches. Replace old description of stacked context tools where W4/W8 changed the workflow; do not append contradictory guidance. Keep contributor tooling/source paths out of user docs.

- [ ] Review `overview.md` against the actual final implementation. Add/rewrite only the durable reason: project PR collection composes existing native associations and direct URL links, preserves provenance, and makes completeness explicit; it does not infer repository-wide context. Keep optional capability negotiation and owning environment constraints aligned with existing PR compatibility. If current text already covers these constraints, record a concrete no-change reason in the implementation receipt rather than append a feature catalog. Add glossary row `Project PR collection | A bounded view of pull requests linked directly to a project or associated with its owned or explicitly linked threads. It keeps each association's provenance; discovery and repository browsing do not create links.` Check W6 workspace note and W7 Drive root definitions once; link existing definitions rather than duplicate them.
- [ ] Run focused web gate `vp test run src/components/workspace/WorkspaceResourcesPanel.test.tsx src/components/workspace/WorkspaceResources.integration.test.tsx src/components/workspace/ProjectsSpace.test.tsx src/components/workspace/ProjectsNav.test.tsx src/components/workspace/WorkspaceDocsPanel.test.tsx src/components/workspace/WorkspaceDocContent.test.tsx src/components/workspace/WorkspacePullRequestsPanel.test.tsx src/components/workspace/DriveFiles.test.tsx`. Run runtime `vp test run src/projectPullRequests.test.ts src/state/workspaceTools.test.ts src/state/drive.test.ts` and admitted native `src/state/workspaceNotes.test.ts`. Rerun only backend contract/service tests whose inputs changed during integration. Run affected package typechecks plus inherited server typecheck and exact changed-file lint. Expected pass: no stale cross-environment content, no inactive-body reads, no unsupported claims. Record actual commands/exits; do not call planned commands passed.
- [ ] Visual acceptance: future primary controller, after explicit browser/server authorization, reads `test-t3-app` and runs one integrated real-client pass after all admitted changes. W4-T7 captures `/workspace?space=projects&fixture=04` and `/workspace?space=meetings&fixture=07` at 1280x800 under V1. Capture project `[275,188,649,459]`, Docs `[953,145,314,465]`, and full `[207,26,1073,774]` composition. Compare overlays/crops with both PNGs, then 1024px compact and 390px phone sheet and a separate light theme smoke. Check footer fixed, one body, focus returns to Resources after sheet close, selected center stays visible and long names/content remain usable. Batch repairs and rerun affected cases only. Original screenshot proof and service proof are both required; no fixture count or viewport proves a real account/device.
- [ ] Record 04 live departures D05/D06/D26 and 07 sharing/author departures D10/D11 separately from fixture parity. PR body is approved proposed design only. Record synthetic fixture, real Google account, packaged desktop, existing native decoding, physical other-device local/direct/relay/tunnel access and human pilot as distinct outcomes, with unrun where unwitnessed. W6's final formatted-note visual dependency closes only after T3b/T4 and admitted comments pass; held comments remain a named incomplete portion, not a complete Wave 6/8 claim.
- [ ] Surface checklist: all entry points and reverse actions above; web/desktop/phone web and RN compatibility decision; all providers reuse link/context semantics; optional read contracts and operate denials; all connection modes and environment isolation; user/internals/glossary gate complete or concrete no-change reason. Native roster/followers, provider writes, audio/recordings and new PR mutations stay outside this wave.
- [ ] Stage only changed integration/policy/docs files: `git add -- apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.test.tsx apps/web/src/components/workspace/WorkspaceResources.integration.test.tsx apps/web/src/components/workspace/ProjectsSpace.tsx apps/web/src/components/workspace/ProjectsSpace.test.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.tsx apps/web/src/components/workspace/WorkspaceDocsPanel.test.tsx apps/web/src/components/workspace/WorkspacePullRequestsPanel.tsx apps/web/src/components/workspace/WorkspacePullRequestsPanel.test.tsx docs/user/workspace-spaces.md docs/internals/overview.md docs/internals/glossary.md`. Omit unchanged paths. Adapter changes return to T2/T4/T5 and their explicit paths and serial slots; no unlisted fixture or registry files are staged by this gate. Never stage lockfile, migration ledger, unrelated owners' work or PR-only captures. Title `feat(workspace): integrate project document and PR resources`.

### Capability and registration file ownership

These are explicit parts of the owning tasks above, not an eleventh task. Current `apps/web/src/components/workspace/mail/useMailCapabilities.ts`, function `useMailCapabilities`, trusts only a live server config and exposes `pulseCapabilities.workspaceTools/driveRead`. Extend that same hook with optional `workspaceProjectOverview` in T1b, `driveDocumentRead` in admitted T4, `workspaceNoteComments` in admitted T5, and `driveCommentsRead/driveSharingRead` in admitted T6. Do not trust cached capability truth after a downgrade. Extend the focused test file created by W7-T1 and extended by W7-T2, `apps/web/src/components/workspace/mail/useMailCapabilities.test.tsx` with live/cached/absent and environment-switch cases. Each task adds those two exact paths to its explicit staging list and runs `vp test run src/components/workspace/mail/useMailCapabilities.test.tsx` from web. A false/absent capability must issue zero unsupported RPCs.

T4's admitted structured-read commit additionally names these exact files: `packages/contracts/src/pulseDrive.ts`, `packages/contracts/src/pulseDrive.test.ts`, `packages/contracts/src/server.ts`, `apps/server/src/drive/DriveApi.ts`, `apps/server/src/drive/DriveService.ts`, `apps/server/src/drive/DriveService.test.ts`, `apps/server/src/drive/testing/fakeDrive.ts`, `apps/server/src/ws.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/auth/RpcAuthorization.test.ts`, `packages/client-runtime/src/state/drive.ts`, `packages/client-runtime/src/state/drive.test.ts`. Existing `index.ts` and `rpc.ts` already spread the Drive exports/family; modify and explicitly stage those two paths only if actual new export/tag compilation requires it. T5 reuses W6's exported Notes family and subscription tag. New read methods do not need a second family or new subscription registration. Preserve existing `packages/client-runtime/src/rpc/client.ts` tags unless an actual additional stream is introduced; none is planned here.

For the T4 typed result, the wire schema is concrete and belongs in `pulseDrive.ts` only when admitted:

```ts
export const WorkspaceDocBlock = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("paragraph"),
    text: Schema.String.check(Schema.isMaxLength(24000)),
  }),
  Schema.Struct({
    type: Schema.Literal("heading"),
    level: Schema.Literals([2, 3]),
    text: Schema.String.check(Schema.isMaxLength(600)),
  }),
  Schema.Struct({
    type: Schema.Literal("ordered-list"),
    items: Schema.Array(Schema.String.check(Schema.isMaxLength(2000))).check(
      Schema.isMaxLength(50),
    ),
  }),
]);
export type WorkspaceDocBlock = typeof WorkspaceDocBlock.Type;
```

The service enforces the overall 24KB text/30KB serialized page bounds in addition to these per-field bounds. A single oversized paragraph can continue as paragraphs with an explicit continuation marker; never invent heading/list breaks. A list longer than the supported limit reports a limitation or carries provider numbering in a reviewed continuation schema rather than silently restarting at 1. T8 panel wrappers expose `aria-label="Docs resource"` and `aria-label="PRs resource"` on their owning sections; these are accessible names for existing bodies, not additional UI controls.

## Self-review

This file contains all ten dispatchable Wave 8 IDs, including split T1a/T1b and T3a/T3b. T1 and T3 remain non-dispatchable family names. T4 precedes T3b to respect the Docs UI serial chain. The final gate is W8-T8, not an extra implementation task. The plan's opening frontier is T1a once W4-T0/W7-T1 config ownership is ready, and T3a independently once W4-T4a/W7-T3 and its admitted W6-T8 serial predecessor are ready. There is no permission to dispatch or execute in this writing assignment.

### Decisions assumed

| ID  | Planning default carried into this wave                                                       | Consequence                                                                                      |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| D01 | Projects landing, searchable dropdown, six-destination shell, resources open/close/reopen     | Cards keep overview visible and consume W4 state.                                                |
| D02 | Resource project independent of selected item, explicit Linked context                        | Browsing Docs/PRs creates no context link.                                                       |
| D03 | Marked fixture sample identities/counts only, corrected tab/body selections                   | Fixture/live truth remains separate.                                                             |
| D05 | Environment-owner/Unassigned, no people directory/Pulse roles                                 | Live roster omitted; comment author cannot claim an authenticated coworker. W12-T6 remains held. |
| D06 | No live followers promise                                                                     | No follower control/footer model introduced. W12-T8 held.                                        |
| D10 | One native bounded Markdown note and safe renderer, provider edits external                   | Revision-aware native edit and shared Docs selection; no rich collaboration editor.              |
| D11 | Supported read-only provider comments/sharing, owner attribution, writes separately confirmed | Provider scope admission and native create/delete remain explicit. Unknown count is not zero.    |
| D14 | Explicit confirmed root/account, read-only explorer                                           | Summary/root truth comes from W7; Docs adds no file management.                                  |
| D23 | Bounded linked PR collection reusing Code records/viewer                                      | No new PR table/integration; PR-open body requires reviewed proposal before implementation.      |
| D24 | Web, shared desktop, phone web; native compatibility only                                     | Separate real-device/account/package/pilot evidence, no inferred parity.                         |
| D25 | Pulse Code / Workspace live, original brand/mode in marked fixture                            | Keep W4 substitutions and record copy departure.                                                 |
| D26 | Member count only from complete supported source metadata with freshness                      | Omit unsupported counts, no roster/provider fanout.                                              |
| D28 | Exact W6 fixture subtitles/day navigation and middle-dot launch review                        | W8 does not alter agenda/date controls while opening notes.                                      |
| D29 | Blue Marketing is confirmed project-folder link                                               | Retain W7 Files meaning while integrating bodies.                                                |

All defaults are assumed for planning and remain maintainer-confirmable. No affirmative Wave 12 choice, external consent, write operation or browser permission was inferred.

### Verified current code and deviations from older reports

- Current `WorkspaceProjectConfig` has only projectId/taskColumns/browserThreadId at `pulseWorkspaceTools.ts:10-15`; optional description/root/completion fields are upstream future interfaces, not currently shipped. The storage plan preserves those fields after upstream admission.
- Current config migration is 064, not a guessed 060/061. Allocate new forward numbers at execution while holding the slot, because W5-W7 register migrations first. This is the deliberate exception to a prewritten numeric migration path.
- Current ProjectsSpace has a split list/detail and calls `useNewProject` without `openThread:false`. The hook already supports that option and successful-create recovery at `useNewProject.ts:75-151`; reuse it. Its callback precedes waitForProject and can reject, so the plan captures created ref before navigation rather than retrying creation.
- `pulse.links.listMany` merges results at `pulseLinks.ts:252-275`; it cannot supply keyed card totals. T1b chooses a separate paged overview now, resolving B-M5 rather than deferring the decision.
- Current selected Files/Agents queries in `WorkspaceToolsPanel.tsx:72-73` are item-scoped. W4/W7 lift resource project selection; W8 consumes that work rather than copying the existing project chooser.
- Current `DriveApi.content` exports Google documents as plain text at `DriveApi.ts:147-207`, and `DriveReadResult` has only text/truncation at `pulseDrive.ts:35-47`. Formatted provider blocks/comments are proposed optional reads, not available APIs. Native Markdown does not need Google support.
- Actual PR detail lives at `apps/web/src/components/pullRequest/PullRequestDetailPanel.tsx:418`, not directly under components. Existing helpers already normalize Forgejo ports and host/repository identity. Reuse them instead of a new URL parser or GitHub-only key.
- No `graphify-out/graph.json` exists. Source inspection was used without generating a graph because the user restricted writes to this file. Current uncommitted shell correction and other writers' files remain untouched.

### Open issues and acceptance limits

1. Waves 4-7 are parallel plans, not available compiled interfaces in the inspected tree. Wave 4 supplies exact shell names, types and paths; W6 supplies createWorkspaceNoteAtoms and its note contract. At dispatch, confirm those admitted implementations and rerun focused typechecks without renaming the contracts. An incompatible wire need goes to the producing owner; do not create another notes store, root field or resource selector.
2. D23 PR-open proposal review is required before implementing its body. The original tab geometry can be accepted independently. No PR-body acceptance was claimed here.
3. Structured Google Docs operation/scope support, comments and permission-count semantics remain unverified offline. T4/T6 provider parity needs that check and any explicit consent decision. Native notes, plain Drive reading and other tabs can proceed without it.
4. Native comment create/delete is unconfirmed, and no live native comment producer exists in current source. The plan separates read capability from optional writes and does not claim a populated live comment feed from fixture rows. The controller must confirm a producer/write lifecycle or record that portion held. Provider comment reads are independent.
5. The PNGs' four roster rows, member counts and sharing phrases are not proof of live identity or access. Default live omission/environment wording is intentional and must appear in the acceptance manifest. W12 roster/follower expansion remains held.
6. Exact future migration numbers and upstream proposed-file line ranges cannot be fixed while serial owners are still planning. Current existing ranges are verified; future paths are marked proposed and numeric allocation is explicitly gated. Preserve every upstream config field and optional old-client behavior.
7. Browser/server capture permission, real accounts, packaged desktop/native, physical remote device and pilot were not requested for this authoring task and remain unrun. This is an executable planning handoff, not implementation or rendered acceptance evidence.

## Surfaced gaps

Pending acceptance belongs to named gates, not hidden follow-up work: D23 proposed PR body, D11 provider scope/count support and native comment write/producer decision, upstream interface reconciliation, and the primary controller's authorized V1 client pass. No product code, other plan, tracker, Git index or live data was changed by this assignment.

## Review response log

Plan fix round 1 at HEAD ba035b52c3, responding to `.superpowers/sdd/2026-10-14-unified-workspace/plan-reviews/review-w7-w8.md` and the W7/W8 rows in `review-cross-wave.md`. Wave 4's canonical section and corrected wave-map serial chains define the shell contracts. This log records plan repairs, not passing implementation or visual evidence.

| Finding                      | Response                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| review-w7-w8/I1              | W8 extends useMailCapabilities.test.tsx created by W7-T1 and extended by W7-T2. The capability ownership section names its exact path, command and per-task staging obligation.                                                                                                                                                       |
| review-w7-w8/I4              | T1a consistently bounds raw input at 600 UTF-16 code units before server trim. Tests cover 600/601 units, astral characters and surrounding spaces, matching textarea maxLength.                                                                                                                                                      |
| review-w7-w8/I5              | T1b selects SQLite lower(p.title) AS sort_title and copies that exact value into the cursor. First page omits the continuation predicate; limit-1 empty-title/non-ASCII regressions assert no skips or duplicates.                                                                                                                    |
| review-w7-w8/I6              | WorkspaceTools.make requires ServerEnvironmentIdentity unconditionally. Files and git add include server layer provision and both explicit test-layer updates.                                                                                                                                                                        |
| review-w7-w8/I7              | T3a declares renderContent(result, text), passes accumulated text, and tests two-page reads retaining both pages.                                                                                                                                                                                                                     |
| review-w7-w8/I8              | Inline Docs retains explicit first read and connection choice. Successful current-generation reads hide chooser/buttons/duplicate file title/standalone provider link, leaving body and one overflow provider action, plus continuation only when needed. Tests pin final-page chrome absence.                                        |
| review-w7-w8/I9              | T3a's pure reading view produces the explicit card h1 outside Markdown; T3b consumes it. T4 uses unwrapDisallowed and tests # X retains X without adding another h1.                                                                                                                                                                  |
| review-w7-w8/I10             | The exact implementer/controller attribution sentence replaces both the fixed Claude line and historical override.                                                                                                                                                                                                                    |
| review-w7-w8/M6              | ProjectTasks anchors use function names; useMailCapabilities uses its function name instead of the invalid line range.                                                                                                                                                                                                                |
| review-w7-w8/M7              | DriveFiles.tsx has an explicit W7-T1 -> W7-T3 -> W8-T3a -> W8-T4 slot; T3a preserves existing helper exports while exporting the reader.                                                                                                                                                                                              |
| review-w7-w8/M9              | W4 remains an explicit dependency. W8 consumes the frame and edits only the sole body switch, avoiding guessed frame mappings.                                                                                                                                                                                                        |
| review-cross-wave/R1, C1     | T2 owns dev/projectsMockupModule.tsx, readyRegions center for 04. T4/T5 own dev/notesMockupModule.tsx after W6, retaining readyRegions resource and removing only 07.docs-format then 07.docs-comments. Every adapter path is listed in owning Files/git add, using createWorkspaceMockupModule and declared pure presentation props. |
| review-cross-wave/R2, C2     | T3a/T7/T8 list and stage WorkspaceResourceBody.tsx for their Docs/PRs cases. The canonical switch chain is explicit; resource-frame files never choose bodies.                                                                                                                                                                        |
| review-cross-wave/R3, I1     | W8 consumes W4's context openResource and nullable request, plus W7's named openFiles.ts exports for Files navigation. No parallel selection store or bespoke shell handoff is introduced.                                                                                                                                            |
| review-cross-wave/R4, I1, I6 | Docs UI begins at W6-T8. T3a/T4 preserve W6's native branch and handoff until T3b; tests exercise native opening before replacement.                                                                                                                                                                                                  |
| review-cross-wave/R7, I5     | T3b repoints W6 callers to WorkspaceDocsPanel native dispatch, then deletes meetings/WorkspaceNoteView.tsx and its test. Both deleted paths are in Files and git add; the retained handoff tests cover read/back behavior.                                                                                                            |
| review-cross-wave/R9, M4     | The sole body switch supplies WorkspaceResourceBodyProps with request and nullable selectedItem, matching W7. No optional item alias is introduced.                                                                                                                                                                                   |
| review-cross-wave/R10, I7    | W7 owns Drive pick mode. W8 consumes the same explorer; W11's reuse-only responsibility is recorded in the W7 response, with no duplicate picker work here.                                                                                                                                                                           |
| review-cross-wave/R11, M1    | Every note-factory reference uses W6's createWorkspaceNoteAtoms.                                                                                                                                                                                                                                                                      |
| review-cross-wave/R13, M3    | The full ProjectTasks.tsx chain places W8-T1a after W7-T1 and before W5-T5b, preserving earlier W4/W5 edits.                                                                                                                                                                                                                          |
| review-cross-wave/M5         | T8 takes the admitted docs gate after W7-T3 and before W9-T8; shared user docs use the same filtered order.                                                                                                                                                                                                                           |

W7 owns paired-review I2/I3 and M1-M5/M8; its response log records each repair. Other-wave/MAP writes remain outside this two-file assignment. No finding is rejected. Provider admission, native comment producer/write approval, D23 proposal review and future authorized client evidence remain separate implementation gates.

Document-only verification for this fix round:

```powershell
python 'C:/Users/qblaa/.codex/plugins/cache/product-ops-skill/product-ops/5.9.0/skills/product-ops/scripts/prose_lint.py' --root . docs/superpowers/plans/2026-10-16-workspace-wave-7-drive-explorer.md docs/superpowers/plans/2026-10-16-workspace-wave-8-projects-docs-prs.md
git diff --check -- docs/superpowers/plans/2026-10-16-workspace-wave-7-drive-explorer.md docs/superpowers/plans/2026-10-16-workspace-wave-8-projects-docs-prs.md
& 'C:/Program Files/Git/usr/bin/grep.exe' -n ([string][char]0x2014) -- docs/superpowers/plans/2026-10-16-workspace-wave-7-drive-explorer.md docs/superpowers/plans/2026-10-16-workspace-wave-8-projects-docs-prs.md
```

Results: prose lint exit 0, clean for both eligible files; scoped diff check exit 0, no whitespace findings; grep exit 1, no em-dash matches. A read-only inline Python contract check also passed for review-ID coverage, exact attribution, owning Files/git add paths, body/adapter contracts and balanced fences. No implementation tests, servers, browsers, repo-wide checks, staging or commits ran. Concurrent implementation files were left untouched.
