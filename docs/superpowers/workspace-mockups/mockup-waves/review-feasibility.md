# Review: code feasibility and plan correctness

Reviewer lens: code feasibility, dependency correctness, citations, AGENTS.md compliance, plan edit hygiene. Read-only review on 2026-10-16 against `qb/feat-unified-workspace` at `6363a7913b` plus the uncommitted B-2026-10-16-001 working tree. No servers, browsers, tests or repo-wide checks were run.

## Summary

- Wave 2/3 "shipped" claims: all 15 items checked hold against commits and code. No item is claimed shipped that is absent, and no shipped item is omitted.
- Citations: all 494 unique `path:line` citations in the seven gap reports resolve to existing files with in-range lines (scripted check). 40 were read for content; all support their claim, 3 drift by a few lines.
- Plan edit hygiene: one diff hunk (`@@ -6469,24 +6469,195 @@`) wholly inside "## Wave 2" .. before "## Surface checklist". Everything else byte-identical; `<!-- PLAN-END -->` intact at line 6677. No U+2014 in any of the files.
- Main problems: the canonical task graph is in a git-ignored file; several dependency edges are release-order coupling that chains decision-gated connectors in front of unrelated work; parallel-eligible tasks share contract/RPC/UI files with no serialization edge; a few tasks are too large for one subagent; some "every surface" items (provider turn context, RN approval card, internals/glossary docs, live-update model) are missing.

## Critical

### C1. The canonical schedule and the mockups are git-ignored, but tracked docs point at them

Evidence: `git check-ignore -v .superpowers/sdd/2026-10-14-unified-workspace/mockup-waves/wave-map.md` reports `.superpowers/sdd/.gitignore:1:*`. The tracked plan links `wave-map.md` as "the canonical deduplicated task graph, source-report crosswalk, file ownership, per-task tests, exact regions and maintainer decisions" (plan, "Later-wave planning contract"), and the Wave 4-12 outlines in the plan are titles only. Spec A13 says the PNGs under `W/mockups/` "now define the target". Neither the map, the gap reports nor the PNGs will exist in any clone, fork, PR or after the worktree is removed. AGENTS.md "Open at the core" and the plan's own role as the source of truth both break.

Fix: Before any Wave 4 dispatch, move `wave-map.md` (and either the gap reports or their section 5 task records) under `docs/superpowers/plans/` or `docs/superpowers/specs/`, and move the eight PNGs to a tracked location (for example `docs/superpowers/specs/assets/unified-workspace/`), then update the plan and A13 links. Alternatively copy each W-task record (Files, Dependencies, Decisions, Work, Test cycle) into the plan outlines so the tracked plan is self-sufficient.

## Important

### I1. Release-order coupling is written as hard dependencies, so decision-gated connectors block unrelated work

The map states "Task dependencies below name actual prerequisites" (wave-map "Wave sequence"), but several edges are not code prerequisites:

- W6-T4 (agenda UI) depends on W6-T2 (Google read-only connector, decision D07 and network-gated). W6-T1 already defines the service and due-task rows, so the agenda can be built and tested against fakes. If D07 Google is declined or delayed, Calendar and Meetings UI are blocked. Fix: W6-T4 depends on W6-T1, W6-T3, W5-T7; W6-T2 becomes additive.
- W6-T7 (native notes model) depends on W6-T1 (calendar service). Notes have no calendar data dependency. Via W8-T3 -> W6-T8 -> W6-T7 -> W6-T1 -> W5-T4, the Drive Docs tab is transitively blocked behind the calendar and the global task query. Fix: W6-T7 depends only on its migration/RPC serialization slot; W8-T3's Drive portion depends on W4-T4 and W7-T2, with the native-note entrance depending on W6-T8.
- W9-T4 depends on both W9-T2 (Slack, D18-S) and W9-T3 (Discord, D18-D), while D18 says the two are "independent confirmations". Rejecting either blocks the whole Communications UI and, through W9-T5, W10-T1 and W10-T4. Fix: W9-T4 depends on W9-T1 plus at least one accepted reader; each reader plugs into the list when present.
- W10-T1 and W10-T4 depend on W9-T5 "for pictured conversation integration". Browser and Agents are mostly existing code (`apps/web/src/components/workspace/WorkspaceToolsPanel.tsx:170` WorkspaceBrowser, `:73` agents list) and are now gated behind two new server chat connectors. Fix: depend on W4-T5/W4-T6 only; keep the 05/06 composite screenshot as a wave-gate comparison, not a task dependency.
- W5-T1 (task completion, contract/server work) depends on W4-T4 (shell resource frame). Minor in isolation, but it serializes server work behind UI work for no reason. Fix: depend on the B-2026-10-16-001 baseline.

### I2. Parallel-eligible tasks touch the same files with no serialization edge

The delivery contract says "Serialize shared contracts, migrations, WS/auth/server wiring and shared shell files", but the dependency lists do not encode it, so a controller reading the graph will dispatch these concurrently:

- W11-T2 and W11-T5 both depend only on W11-T1; both edit `packages/contracts/src/pulseMail.ts`, `apps/server/src/mail/MailRpc.ts` and the RPC set (`ws.ts`, `RpcAuthorization.ts`).
- W8-T5 and W8-T6 both depend on W8-T4; both edit `UI/WorkspaceDocsPanel.tsx` and both add RPCs.
- W6-T2, W6-T3 and W6-T7 all fan out from W6-T1; T2 and T7 both add RPCs, T7 adds a migration, T2 likely adds one (calendar account store).
- W9-T2 and W9-T7 are parallel after W9-T1; both add RPCs and migrations.
- W5-T6 and W5-T7 both depend on W5-T5 and both touch `UI/WorkspaceTaskRow.tsx`.
- W10-T2 depends only on W4-T6 but edits `UI/WorkspaceBrowser.tsx`, which W10-T1 creates as an extraction from `WorkspaceToolsPanel.tsx:170`. W10-T2 can run first against a file that does not exist yet.

Fix: add an explicit "serial slot" edge for every task that edits RPC wiring or migrations (one chain per wave, for example W11-T2 -> W11-T5), make W10-T2 depend on W10-T1, and make W5-T7 depend on W5-T6 or assign `WorkspaceTaskRow.tsx` to one owner.

### I3. Several units are too large for one subagent with one test cycle

- W9-T2 combines a server Slack account/secret store, explicit connection and permission check, paged channel/history/reply reads, RPC wiring, shared atoms, MCP exact reads and extraction from `apps/desktop/src/communications/RestChatAdapter.ts`. Note `packages/contracts/src/communications.ts` is the desktop IPC schema (no RPC group in `rpc.ts`), so server RPC contracts are new, not an extension. Split into: (a) server connection and secrets, (b) paged read RPC plus atoms, (c) MCP read grant. Same split for W9-T3.
- W6-T1 combines a new contract, service, migration, change stream, timezone/all-day model, due-task projection and atoms. Split contract plus storage from the change stream and atoms.
- W6-T2 is a full OAuth connector (compare `apps/server/src/drive/DriveOAuth.ts` at 286 lines for read-only Drive alone) plus recurrence normalization. Split OAuth/account lifecycle from event normalization.
- W4-T4 lifts project resolution, adds a picker, close/reopen persistence, six tabs, lazy slots and a Linked context action. Split frame/selection from Linked context.
- W5-T5 creates three components plus routes, detail, filters and creation. Split list/rail from detail/edit.

Fix: split as above, keeping the stable IDs (for example W9-T2a/b/c) so the crosswalk is not renumbered.

### I4. New linked item types are not wired into provider turn context

Linked items reach every provider through `apps/server/src/workspace/linkedItemsContext.ts`, where `provider-resource` renders with the generic label "Linked item" (`linkedItemsContext.ts:32`). Reads are type-dispatched at `apps/server/src/mcp/toolkits/workspace/handlers.ts:98` (Telegram only). W6-T3 (calendar events), W6-T8 (native notes), W9-T2/T3 (Slack/Discord messages) and W9-T7 (saved refs) list the MCP handlers but not `linkedItemsContext.ts` or `ProviderTurnStartService.ts`. Calendar events and notes will reach every provider as unlabelled "Linked item" entries.

Fix: add `apps/server/src/workspace/linkedItemsContext.ts` and its integration test (`linkedItemsTurn.integration.test.ts`) to the file sets of W6-T3, W6-T8, W9-T2 and W9-T3, with a test that each new provider string renders a type label and bounded summary.

### I5. Live update model for chat and calendar is unspecified and invites polling

AGENTS.md calls out polling and websocket volume. W9-T5 shows a live chronological stream and W9-T8 shows unread counts, but no task says how new Slack/Discord messages reach the server (Slack Events needs a public endpoint; otherwise the server polls `conversations.history`). W6-T2 says "refresh" without cadence. W9-T8 "count 3" across a channel list implies reading every channel's history to count known messages after a marker, which is per-channel fanout.

Fix: In W9-T2/T3 and W6-T2, state the refresh model explicitly: on-demand reads for the open conversation/range plus explicit Refresh, at most one bounded server-side refresh loop for the open conversation with backoff, no all-channel scan. In W9-T8, define counts only for channels whose recent page is already loaded, or show no count; add a test that opening the list issues no per-channel history request.

### I6. Mobile React Native approval card is an affected surface for manual replies

The RN app renders mail approvals at `apps/mobile/src/features/threads/MailSendApprovalCard.tsx` (thread detail). W11-T5 adds a manual reply that uses the same exact-send approval with an "explicitly chosen/created owning thread", and W11-T6 reuses the web card. Neither names the RN card or `packages/client-runtime/src/mail/mailApprovals.ts`. D24 says "no new React Native screens", which is right, but existing RN screens still have to decode and display the new approval content.

Fix: add the RN card and `client-runtime` approvals state to W11-T5's file set and test cycle (old and new approval shapes decode; manual reply approval appears and can be approved/declined from the RN card).

### I7. Docs surface: internals and glossary are never scheduled

AGENTS.md "Hit every surface" requires architecture changes in `docs/internals/` and new vocabulary in `docs/internals/glossary.md`. The map schedules only `docs/user/*` updates. New concepts include resource frame/Resources, saved items/Later, known-message read marker, workspace note, calendar event identity, Drive root designation and project PR collection; new server services include WorkspaceCalendar, WorkspaceNotes, WorkspaceSavedItems and server Slack/Discord readers.

Fix: add `docs/internals/glossary.md` and a `docs/internals/` page update to the wave-gate task of each wave (W4-T6, W5-T7, W6-T9, W7-T3, W8-T8, W9-T8, W10-T4, W11-T7).

### I8. Wave 4 is planned on an uncommitted baseline

Every W4 task depends on "B-2026-10-16-001 baseline", which is uncommitted: 13 modified files plus untracked `apps/web/src/components/workspace/ProjectsNav.test.tsx` and `WorkspaceEngagement.test.tsx` (git status). Any subagent dispatched with worktree isolation, or any branch operation, loses it. The plan's Wave 3b section says "Preserve these edits" but no task commits them.

Fix: add a W4-T0 (or a precondition in the Wave 4 detailed plan) to commit B-2026-10-16-001, including the two untracked tests, before W4-T1 dispatch.

## Minor

### M1. Citation line drift

- wave-map line 13: `WorkspaceEngagement.tsx:93` is cited as the sheet mount; line 93 renders the aside child, the `<Sheet>` is at `:96`. The aside at `:90` is correct for `w-80` (320px).
- wave-map line 14: `WorkspaceToolsPanel.tsx:72` for the Files/Agents lists; the filters are at `:73`/`:74`.
- gap-projects-docs-prs line 98 cites `WorkspaceEngagement.tsx:89` for the disabled Links/Projects/Browser/Files/Agents buttons; those are in `EmptyContext` at `:110`-`:118`.
- plan Wave 2 item 9 cites `apps/server/src/telegram/TelegramService.ts:41` as "paired bot reads"; that line is the `make` service constructor (with the `poll` option). Acceptable as a service anchor; say "service at" rather than "reads at".

Fix: update the line numbers when the files are moved per C1.

### M2. Unmarked new directory

W9-T8 names `apps/server/src/communications read-marker service/store` without "proposed"; `apps/server/src/communications/` does not exist (W9-T2/T3 mark their files proposed). Fix: mark it proposed.

### M3. Communications scope approaches a full chat client

W9 schedules channels, history, threaded replies, groups, unread markers, Later, a composer and two server connectors. Each is bounded, but together they edge toward the "full Slack" AGENTS.md calls scope creep. Fix: record a cut order for Wave 9 (for example W9-T8 read markers first, then W9-T3 Discord) so the wave can ship at the link-model core.

### M4. W11-T1 preview fetch should name the IMAP mechanism

"Bounded preview" without "full MIME per row" is right; name the mechanism (partial `BODY.PEEK[TEXT]<0.N>` in the same FETCH as headers at `apps/server/src/mail/MailImapRead.ts:283`) so the implementer does not add a second round trip per message.

### M5. W8-T1 defers its own design decision

"Add a batch overview read only if projections are insufficient" leaves the RPC shape undecided inside the task, so the test cycle cannot be fixed in advance. Fix: decide in the Wave 8 detailed plan whether a batch read exists, and make it a separate unit if so.

### M6. W9-T6 plus action has no picker yet

W9-T6 "Plus inserts explicit supported links" precedes W11-T7, which introduces the explorer picker mode. Fix: W9-T6 either uses paste-only link insertion or depends on a picker-mode extraction moved earlier into W7-T3.

## Verified claims (evidence)

Wave 2 and 3 rewrite, each checked against commit file lists and code:

| Claim                                             | Evidence                                                                                                                                              | Result |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| W2.1 layout shipped narrower in 7a854e84d7        | `git show 7a854e84d7:.../WorkspaceEngagement.tsx` lines 82, 97, 101: `w-72` aside, `xl:hidden` sheet                                                  | True   |
| W2.2 conversations in aca4ca0022                  | commit adds `apps/server/src/mail/MailConversations.ts`, `MailConversationList.tsx`                                                                   | True   |
| W2.3 Start thread in 7a854e84d7                   | `packages/contracts/src/pulseLinks.ts:159`; `WorkspaceItemActions.tsx:141`, `:261`                                                                    | True   |
| W2.4 Start/Add to project                         | `pulseLinks.ts:160`-`:161`; `WorkspaceItemActions.tsx:232`, `:389`                                                                                    | True   |
| W2.5 Draft reply in aca4ca0022, provider explicit | commit adds `MailDraftReply.tsx`, `059_MailSentLinks.ts`; provider gate copy at `MailDraftReply.tsx:101`                                              | True   |
| W2.6 project hubs                                 | 7a854e84d7 adds `ProjectsSpace.tsx` and `pulseLinksProjectHub` RPC                                                                                    | True   |
| W2.7 Drive pasted links in 7a854e84d7             | `workspaceItemFromUrl` at `pulseLinks.ts:104`; `git log -S docs.google.com` returns 7a854e84d7                                                        | True   |
| W2.8 Office Communications replaced, narrower     | 7a854e84d7 strips email from `CommunicationsWorkspace.tsx`; `docs/user/workspace-spaces.md` edited in 7a854e84d7 and 6363a7913b                       | True   |
| W2.9 Telegram bot, personal login retired         | cb6caf3748 deletes `apps/desktop/src/communications/TelegramAdapter.ts`; no teleproto in `apps/desktop/package.json`; read at `handlers.ts:98`-`:103` | True   |
| W3.1 suggestions, max three                       | `apps/server/src/textGeneration/TextGenerationPrompts.ts:31` (`isMaxLength(3)`), `:48`                                                                | True   |
| W3.2 Drive search narrower                        | e88d4c1e76 adds `DriveApi.ts`, `DriveOAuth.ts`, `DriveFiles.tsx`                                                                                      | True   |
| W3.3 automation in 688a34d99f                     | commit adds `WorkspaceAutomation.ts`, `WorkspaceAutomationEditor.tsx`                                                                                 | True   |
| W3.4 Browser with web fallback                    | `git show 688a34d99f:.../WorkspaceToolsPanel.tsx` line 218 `openExternal`, 227 "Open in new tab"                                                      | True   |
| W3.5 basic tasks narrower                         | `packages/contracts/src/pulseWorkspaceTools.ts:16` (id/project/title/column only)                                                                     | True   |
| W3.6 pilot cut, unrun                             | `docs/internals/pulse-next-migration.json` "human usability pilot remain unrun; pilot protocol prepared only"                                         | True   |

Wave-map citations read: `WorkspaceToolsPanel.tsx:55`, `pulseWorkspaceTools.ts:10`/`:16`, `handlers.ts:73`/`:127`, `TelegramService.ts:41` all support their claims. Gap report citations read and confirmed include `pulseLinks.ts:43`, `:75`, `:131`; `office.ts:25`, `:91`; `ProviderTurnStartService.ts:1051`; `MailImapRead.ts:155`; `pulseMail.ts:308`; `MailSendService.ts:422`; `DriveFiles.tsx:170`; `AppSidebarLayout.tsx:92`; `MailSpace.tsx:132`; `MailNav.tsx:24`; `linkedItemsContext.ts:108`; `openPreviewSession.ts:44`; `useNewProject.ts:122`; `OfficeWorkspace.tsx:18`, `:145`; `OfficePanel.tsx:43`; `WorkspaceTools.ts:43`, `:100`, `:152`; `ws.ts:1240`; `RpcAuthorization.ts:30`; `WorkspaceLinks.ts:187`; `ProjectTasks.tsx:226`; `useWorkspaceItemOpener.ts:44`; `RestChatAdapter.ts:510`.

Architecture checks that passed: no task puts runtime logic in contracts; status indicators are specified static (W10-T4, W12-T4); W5-T4 replaces per-project fanout with one paged query; D24 keeps phone on responsive web with native-compatible contracts; reverse states are named per task (complete/reopen, set/clear root, save/remove, read/unread, unassign, connect/disconnect, close/reopen); desktop-only behaviors (W9-T6 send, W12-T4 capture) carry an explicit web/remote fallback or publication path.
