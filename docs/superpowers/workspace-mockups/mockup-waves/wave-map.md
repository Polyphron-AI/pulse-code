# Unified workspace mockup wave map

Status: planning handoff, 2026-10-16. Baseline is `6363a7913b` plus the existing uncommitted shell correction B-2026-10-16-001. W means `docs/superpowers/workspace-mockups`, the tracked reference bundle. Originals remain under `.superpowers/sdd/2026-10-14-unified-workspace`. Mockup references below resolve under `W/mockups/`; report references resolve under `W/mockup-waves/gap-<name>.md`. Every source task reference points to section 5 unless another section is named.

The maintainer now schedules the missing look and function against the original eight SynKEK Office PNGs. This map contains 64 default-path planning tasks in Waves 4-11 and 10 conditional units in Wave 12. It prepares later detailed plans, not code execution, provider consent, external sending or publication authority. Every default-dependent unit is marked **default assumed, confirm**. A held task requires an affirmative choice; a recommended conservative default does not unblock its broader alternative.

## Evidence and current baseline

All seven gap reports, the audit, required spec and plan sections, AGENTS.md, history and all eight PNGs were inspected locally. The gap reports retain exhaustive typography/copy/state inventories and their source findings; future implementers read the relevant report and open the named PNG themselves. This map does not replace those inventories. No browser, server, network, provider CLI or product tests ran for this planning task.

Verified here by source reading:

- Current persistent 320px context and exclusive aside/sheet mount are at `apps/web/src/components/workspace/WorkspaceEngagement.tsx:91` and `apps/web/src/components/workspace/WorkspaceEngagement.tsx:95`. This is the correction baseline, not target resource parity.
- Current resource project resolution and selected-item Files/Agents lists are at `apps/web/src/components/workspace/WorkspaceToolsPanel.tsx:55`, `apps/web/src/components/workspace/WorkspaceToolsPanel.tsx:72` and `apps/web/src/components/workspace/WorkspaceToolsPanel.tsx:73`. Reuse these seams.
- Existing task fields are title/column/identity at `packages/contracts/src/pulseWorkspaceTools.ts:16`; config is at `packages/contracts/src/pulseWorkspaceTools.ts:10`. The global task work extends them.
- Workspace reads first resolve linked access at `apps/server/src/mcp/toolkits/workspace/handlers.ts:73`; URL reading returns metadata at `apps/server/src/mcp/toolkits/workspace/handlers.ts:127`. Generic provider-resource identity alone is not an implemented reader.
- Shipped checkpoints are `7a854e84d7`, `aca4ca0022`, `cb6caf3748`, `e416061ade`, `e88d4c1e76`, `688a34d99f`, repair `9705b53cbf`, and completion documentation `6363a7913b`. This inclusive sequence contains Waves 2 and 3; it does not establish full mockup acceptance. The audit and ledger retain unrun real-account/native/other-device/pilot gates.

All task descriptions below are proposed future behavior, files and tests. They are not claims of currently shipped implementations. Any current-state claim inherited only from an analyst remains that report's source finding, not a new runtime verification here.

## Ownership and deduplication

The shell owns the right resource frame, shared project selection, tab strip, selected-body mounting, footer and responsive container. Module owners own the contents and queries of Files, Browser, Agents, Tasks, Docs and PRs. A module may wire its body into the existing slot; it does not rebuild the frame or introduce its own project selector.

Source labels resolve exactly as follows: shell is `gap-shell.md`; tasks-calendar is `gap-tasks-calendar.md`; meetings is `gap-meetings-notes.md`; projects is `gap-projects-docs-prs.md`; email-files is `gap-email-files.md`; communications is `gap-communications.md`; browser-agents is `gap-browser-agents.md`. Section numbers and original local task IDs remain the source anchors.

One event identity/range service serves Calendar and Meetings. One workspace-note store and one Docs renderer serve meeting notes and native Docs. One project explorer serves all spaces and the reply picker. One saved-key collection serves Mail and chat Later, while Mail unread and chat read markers keep their different semantics. Keep existing links as the sole relationship graph. No generic module registry, second project model, parallel PR records or service framework is required.

| Report proposals                                                    | Canonical task ownership                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| shell S1, S2, S3, S4, S5, S6                                        | W4-T1, T2, T3, T4, T5, T6 respectively                                                                                                  |
| shell S7 Files/Browser/Agents; S8 Tasks/Docs/PRs; S9 combined proof | W7-T3; W10-T1..T4; W5-T7; W8-T3..T7. W4-T6 owns shell regression; each wave gate extends its integrated proof, no duplicate module task |
| tasks-calendar TC1..TC7                                             | W5-T1..T7 respectively                                                                                                                  |
| tasks-calendar TC8, TC9, TC10, TC11, TC12, TC13a/b, TC14            | W6-T1; W6-T6 default/W12-T2 optional; W6-T3; W6-T4; W6-T5; W6-T2/W12-T1; W5-T7/W6-T9 gates                                              |
| meetings M1/M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12           | W6-T1/T2; W6-T7; W6-T3/T8; W6-T4; W6-T6; W8-T3/T4; W8-T5/T6; W12-T5; W6-T9/W8-T8; W6-T6 default/W12-T3 optional; W12-T4                 |
| projects P1..P8                                                     | W4-T4; W8-T1; W8-T2; W8-T3; W8-T4; W8-T6; W8-T7; W8-T8 default/W12-T6 optional                                                          |
| email-files EF-01..EF-04                                            | W11-T1; W11-T2; W9-T7 storage/W11-T3 UI; W11-T3                                                                                         |
| email-files EF-05..EF-12                                            | W7-T1; W7-T2; W7-T3; W11-T4; W11-T5; W11-T6; W11-T7; W11-T7 integration gate                                                            |
| communications COMM-00..COMM-05                                     | Decisions table/spec A13; W9-T1; W9-T2; W9-T3; W9-T4; W9-T5                                                                             |
| communications COMM-06/06T, COMM-07, COMM-08/09, COMM-10/11         | W9-T6 default/W12-T9/T10 remote send; W12-T7; W9-T7/T8; W7-T1/T2/T3; W4-T5/W9-T5 and W9-T8 gate                                         |
| browser-agents BA-1..BA-6                                           | W4-T4; W10-T1; W10-T2; W10-T3; W10-T4; W10-T4 gate                                                                                      |
| Extra lifecycle units exposed by decisions                          | W12-T8 followers, plus separate provider send units W12-T9/T10 so one agent never owns two connectors                                   |

Source proposal IDs in this table are local report IDs. Stable task families are W4-T0 through W12-T10, including W4-T7. Suffixed children replace oversized parent units in the task records. Parent IDs W4-T4, W5-T5, W6-T1/T2, W8-T1/T3 and W9-T2/T3 are non-dispatchable families; use a/b/c children. Do not renumber them when a decision changes; mark the affected task held, cut or superseded.

## Delivery and test contract

Each task is one implementation subagent unit with its own focused test cycle, not a whole-wave assignment. Keep tasks separate even when files overlap. At dispatch, reread current source and preserve the correction and other owners' edits. Serialize shared contracts, migrations, WS/auth/server wiring and shared shell files. Choose the next free forward migration at implementation time; never rewrite shipped migrations. Later detailed plans must name exact tests/commands and narrow file ownership before admission.

For every task, prove the behavior through user actions or a public service/RPC boundary, using fake external boundaries and disposable state where appropriate. Run `vp test run <named files>` in the owning package, targeted lint and the affected package's declared typecheck. Backend changes need focused contract/service tests, old-client decode/save compatibility and read/operate authorization. Await persisted events/receipts or worker drains; no sleeps, polling-readiness or snapshot-only proof. No repo-wide checks.

Every wave gate includes menu, detail/header, command-palette, existing keybinding and visible touch/long-press paths; selected-item and resource endpoint actions must agree. Check create/cancel, close/reopen, complete/reopen, link/unlink/relink, connect/disconnect and unavailable/deleted targets as applicable. Never auto-confirm a suggestion, grant context from discovery, or change a project root by browsing.

Web and desktop share components, with desktop-specific preview/IPC tested separately. Phone delivery is responsive web, one pane plus Resources sheet, not new React Native screens. Shared contracts/atoms remain native-compatible. Test local, direct remote, relay/tunnel, multiple environments and old servers explicitly; bind every cache, command and drag endpoint to its environment. Provider-shaped behavior needs a stated decision for each currently configured adapter. Shared workspace refs/MCP paths should serve Codex, Claude, Cursor, Grok, OpenCode and configured ACP providers without new adapter-specific UI; unsupported Draft reply/tool support must be explicit.

Keep bounded metadata pages, cursor-aware filtering/sorting, lazy bodies only for active tabs, shared change subscriptions and one mounted resource tool. No per-row full-body fetch, all-project fanout, background browser capture or continuously repainting animation. Reuse current services and primitives before adding files/dependencies. Do not rebuild Slack, Gmail or Drive.

At each wave's authorized integration boundary the primary implementation controller, not subagents, runs one integrated client pass with `test-t3-app`, compares named 1280x800 fixture regions plus 1024px and 390px states, batches repairs, then rechecks affected cases. Permission for browser/server use is not granted by this document. Record synthetic fixtures, real accounts, packaged desktop/native, physical other-device access and human pilot as separate outcomes. A local request/viewport is not another-device proof. Update existing user guidance only for accepted behavior; implementation and acceptance remain unrun here.

## File-set notation

All paths are worktree-relative. UI means `apps/web/src/components/workspace`. A file marked proposed does not exist by assertion. A file set names the candidate change boundary, not a requirement to touch every member. Each record also owns its adjacent focused tests.

- ROUTES: `apps/web/src/routes/_chat.workspace.tsx`, `apps/web/src/routes/-_chat.workspace.test.ts`, `apps/web/src/components/CommandPalette.tsx`.
- TOOLS: `packages/contracts/src/pulseWorkspaceTools.ts`, `apps/server/src/workspace/WorkspaceTools.ts`, `packages/client-runtime/src/state/workspaceTools.ts`, `apps/web/src/state/workspaceTools.ts`, relevant project settings UI and next-free migration/registration if needed.
- RPC: relevant contract exports/`rpc.ts`/`server.ts`, `apps/server/src/ws.ts` separate family layer, `apps/server/src/server.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `packages/client-runtime/src/rpc/client.ts` and package subpath export only as required. Keep handlers thin and capability gates optional.
- CALENDAR, proposed: `packages/contracts/src/pulseCalendar.ts`, `apps/server/src/workspace/WorkspaceCalendar.ts`, `packages/client-runtime/src/state/workspaceCalendar.ts`, web binding and forward storage migration. Meetings is a view/adapter consumer of this service, never a second calendar store.
- NOTES, proposed: `packages/contracts/src/pulseNotes.ts`, `apps/server/src/workspace/WorkspaceNotes.ts`, `packages/client-runtime/src/state/workspaceNotes.ts`, web binding and forward storage migration. One native note identity uses generic provider-resource; Drive notes keep existing file identity.
- DRIVE: `packages/contracts/src/pulseDrive.ts`, `apps/server/src/drive/DriveApi.ts`, `DriveService.ts` and `DriveStore.ts` in that directory as needed, `packages/client-runtime/src/state/drive.ts` and web binding.
- MAIL: `packages/contracts/src/pulseMail.ts`, `apps/server/src/mail/MailRpc.ts` and existing mail service methods needed by that task, `apps/web/src/mail/mailReadState.ts`, shared runtime state only when both clients need it.
- OPENERS: `UI/useWorkspaceItemOpener.ts`, `UI/mail/linkedItems.ts`, `UI/WorkspaceItemIcon.tsx`, route/parser only as required. Existing `pulseLinks.ts`, WorkspaceLinks and shared link atoms remain authoritative.

## Maintainer decisions

Every recommendation below is **default assumed, confirm** for planning. These defaults are not approved account operations. The last column names tasks whose scope or exact parity is affected; held tasks explicitly require an affirmative expansion. Scope-source labels refer to each report's section 6. No reported conflict is silently resolved by an empty tab.

| ID  | Scope conflict                                                | Sources                                                                      | Recommended default                                                                                                                                                                                                                                                                                                                                                                                                       | Affected or blocked tasks                                      |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D01 | Full navigation, naming, landing and close                    | shell D1/D2; projects navigation/X; email D10                                | Use the six-destination workspace shell and mockup geometry. Workspace/Code in Code and folder-only Mail from A12 remain. Keep Projects as Workspace landing, searchable dropdown, start resources open, explicit X/Resources close and reopen.                                                                                                                                                                           | W4-T1..T6; W8-T2                                               |
| D02 | Project resources versus item context                         | shell D3; P1; BA-1; COMM S8                                                  | Independent resource project; named Linked context header action preserves Linked, Suggested, provenance and linked projects. Browsing/project choice never links. Structural ownership, direct links and one-hop discovery remain distinct.                                                                                                                                                                              | W4-T4/T5; W6-T3/T8; W8-T3; W9-T5; W10-T3                       |
| D03 | Contradictory fixtures and sample identity                    | shell D4/D5; email D9; BA selected tab/activity; all sample labels           | Select Files in 02, Browser in 05 and Agents in 06. Correct selected mail Maya/Nina disagreement. Keep sample labels/names/counts only in marked fixtures; live avatars/status/footer use real data. Direct PNG inspection shows Email Unread/Later in 01 despite the shell inventory saying otherwise, and + Schedule in both 07 and 08. The corrected gap reports now agree. W4-T7 supplies the isolated sample states. | W4-T1/T3/T4/T5; W8-T1/T8; W11-T3/T4                            |
| D04 | Expanded tasks, shared statuses and Board                     | shell D6; TC D1/D5                                                           | Global/project list, Board, completion, date-only due and area are default assumed, confirm. Completion derives from one designated column; preserve custom project lanes and group global Board by project. No universal lane migration, recurrence, dependencies or reminder jobs.                                                                                                                                      | W5-T1..T7                                                      |
| D05 | Accountable people, roster, roles and shared-workspace claims | TC D4; projects people/team/environment-local; meetings sharing; BA identity | Me/environment-owner and Unassigned; existing environment authorization and projects. No new directory, Pulse roles or inferred access. Provider-labelled read-only roster is held separately; four fixture coworkers do not establish a production team/assignee model.                                                                                                                                                  | W5-T3/T5/T7; W8-T1/T2/T5/T8; W12-T6/T8 held                    |
| D06 | Project followers                                             | TC D6                                                                        | Keep followers out of live footer by default. A real follow/unfollow and visibility/notification model requires an affirmative identity/lifecycle decision. Record the 03 footer departure.                                                                                                                                                                                                                               | W5-T5; W8-T8; W12-T8 held                                      |
| D07 | Calendar ownership, providers and account migration           | TC D3/D7; meetings server migration; shell D7                                | One server calendar service and due-task agenda, Google read-only first with explicit server reconnection and scope review. Do not copy desktop tokens or widen mail grants. Outlook is an independent held connector; provider API/scopes are unverified offline.                                                                                                                                                        | W6-T1..T5; W12-T1 held                                         |
| D08 | Schedule and invitations                                      | TC D2; meetings scheduling; shell D7                                         | Resolve the reports' conflicting local-editor versus external recommendations in favor of external chosen-provider Schedule handoff first. Local personal editing and Google invitation writes have separate held tasks and missing-state design gates. No invites, rooms, recurrence or provider writes in default waves.                                                                                                | W6-T6; W12-T2/T3 held                                          |
| D09 | Joining Meet/Zoom/Teams                                       | meetings joining; TC event action                                            | Validated HTTPS handoff on requesting client, no OAuth merely for Join. No in-app attendance, SSO automation, meeting bot or conference creation. Missing/blocked URL has a usable explanation.                                                                                                                                                                                                                           | W6-T2/T6                                                       |
| D10 | Native notes versus provider Docs and formatting              | meetings native notes; projects formatted Docs                               | One bounded native text/Markdown note model and shared safe renderer; existing Drive docs remain file refs with chosen-account reads. Native revision-safe edit allowed under existing environment authority; provider edits open externally. No collaborative rich-text product or Drive writes.                                                                                                                         | W6-T7/T8; W8-T3/T4                                             |
| D11 | Comments, sharing metadata and author meaning                 | meetings shared comments; projects P6/sharing; email D8; COMM S6             | Native comments use explicit environment-owner attribution if create/delete is confirmed, not invented coworker identity. Provider comments are read-only. Display permission/count claims only with supported complete metadata; otherwise say environment access or unavailable. Scope/API sufficiency must be checked before provider task admission; no silent new consent.                                           | W8-T5/T6/T8; W7-T3; provider operations can remain blocked     |
| D12 | Recording consent, publication and retention                  | meetings recording policy and M9/M12                                         | Manual local capture only after reviewed capture/source/retention policy; acknowledgement distinct from model download and sharing. No auto-record on Join. Keep existing local Talk; remote publication is explicit transcript text/metadata only and held pending publication/deletion choice.                                                                                                                          | W12-T4/T5 held; W6-T4 Recordings availability                  |
| D13 | Cloud transcription and audio transport                       | meetings local/cloud; M9 audio option                                        | Local transcription, no automatic Groq fallback. No cloud upload, audio publication or remote audioPath. Cloud cost/key/retention and bounded audio transfer need separate opt-in scope; they are outside the default and held text-publication task.                                                                                                                                                                     | W12-T4/T5 acceptance; no cloud/audio implementation admitted   |
| D14 | Drive explorer, root/filter semantics and management          | shell D9; email D1..D4; COMM S6; projects explorer                           | Read-only folder explorer. Root designates a confirmed project-folder link with explicit bound connection, replace/clear. Type means MIME, People means owner, Modified means server filter/sort, not directory/sharing. Menus open/copy/link/unlink existing relations. No sync/upload/rename/move/delete/share, silent shortcut escape or arbitrary account choice.                                                     | W7-T1..T3; W11-T4/T7                                           |
| D15 | Manual Email reply and demo send                              | email D6; COMM S7                                                            | Manual typed reply reuses trusted reply addressing, explicit owning thread and exact-send approval. Live action Review reply. Send demo only in a non-sending fixture. Agent draft stays available and sends never bypass approval.                                                                                                                                                                                       | W11-T1/T5/T6                                                   |
| D16 | Drive/mail/chat attachment semantics                          | email D5; COMM plus/upload                                                   | Link insertion by default, with honest copy and exact approval text. No binary MIME/export/download/upload or hidden local-path attachment. Bytes require a later separately scoped immutable-approval/cleanup task before implementation; no report establishes arbitrary binary support.                                                                                                                                | W11-T7; W9-T6                                                  |
| D17 | Unread, count 3 and Later                                     | shell D2; email D7; COMM S5                                                  | Later is saved refs, shared storage and explicit legacy import, no snooze. Chat unread is known messages after Pulse-local marker; count 3 means that unread count, not provider sync/mentions. Mail Unread uses true IMAP unseen before paging. Server state is environment-owned; no cross-environment aggregate.                                                                                                       | W9-T7/T8; W11-T1/T2/T3                                         |
| D18 | Slack and Discord remote parity and sends                     | COMM S1/S2/S4 composer; projects Slack counts                                | D18-S and D18-D are independent confirmations. Default bounded server read/link/reply-reader connectors, preserve desktop access and acknowledged human sends. Discord stays bot-only. Remote human text sending is held separately per provider. No administration, whole history index/sync, reactions, calls, media upload or personal Discord inbox.                                                                  | W9-T1..T6/T8; W12-T9/T10 held; W12-T6 roster held              |
| D19 | Teams scope                                                   | COMM S3; meetings Teams handoff                                              | Linkable supported Teams URLs and existing work actions only. No Teams chat/channel reader/send connector in this default. A full connector needs its own tenant/account/permissions/admin-consent plan before admission; a Teams meeting URL does not imply Outlook Calendar support.                                                                                                                                    | W9-T1/T4; W6-T6                                                |
| D20 | Telegram identity and outbound bot replies                    | COMM S4 and COMM-06T; A9                                                     | Keep server-paired received bot history, no personal login or account takeover. Honest received-only UI by default; explicit human bot replies remain a held send task. No media/history import fiction or agent-triggered unapproved send.                                                                                                                                                                               | W9-T1/T4/T5/T6; W12-T7 held                                    |
| D21 | Browser placement, web/phone and search                       | shell D10; BA placement/web/search                                           | Right resource body, existing inline desktop preview and optional enlarge. Web/phone use external-tab card; linked-page title/URL search plus valid URL entry. No top-level Browser nav, arbitrary iframe/proxy, Internet search/history sync, cookie transfer or new streaming service.                                                                                                                                  | W10-T1/T2/T3                                                   |
| D22 | Agent identity, status and linked content reads               | shell D11; BA agent/activity/reader limitations                              | Agent card is an explicit project-thread link with live title/status; no new persona/agent manager or fabricated activity model call. Opening starts no paid run. Workspace URL reads remain metadata-only and linked-thread transcript reading remains unsupported; page extraction/transcript access need separately approved bounded grants.                                                                           | W10-T3/T4                                                      |
| D23 | Unseen PR design and project collection                       | shell D8; projects P7                                                        | Bounded linked-PR collection reuses Code records/viewer and generic direct URL links with provenance. No new GitHub integration/PR table or implicit repository-wide links. Review proposed PR-open capture before implementation; keep merge/review/comment mutations in existing Code flow.                                                                                                                             | W8-T7, design acceptance blocked until PR-open layout reviewed |
| D24 | Web, desktop, phone and evidence boundaries                   | all native/mobile/remote conflicts; shell D12                                | Responsive web and shared desktop UI, phone web; no new React Native screens. Preserve optional decoding/shared runtime compatibility. Old-server absence, local/direct/relay/tunnel and multi-environment behavior need explicit tests. Real accounts, packaged desktop/native, physical other device and pilot are separate unrun outcomes, never inferred from viewport or HTTP 200.                                   | All wave gates; W4-T6/W5-T7/W6-T9/W8-T8/W9-T8/W10-T2/T4/W11-T7 |

| D25 | Sample brand/mode copy versus live product copy | shell §2 brand/mode; A12 | Fixtures retain Pulse Next and Office / Code. Live uses Pulse Code and Workspace / Code in both modes, with Workspace as the group label. Keep geometry and Code controls; record this copy departure rather than rebranding the product from sample artwork. | W4-T1/T2/T7 |
| D26 | Channel member counts | communications §2 header; projects metadata | Show N members only when the selected provider reports a bounded complete count and freshness. Otherwise omit that fragment. The fixture reports 8 explicitly; unread count 3 is separate. No roster or history fanout to manufacture it. | W9-T4/T8; W8-T1b; W12-T6 |
| D27 | DIRECT MESSAGES scope | communications §2 DM rows, COMM-04 | Render only existing DMs returned under the explicitly chosen Slack grant when it supports them. No personal-scope expansion, new-DM creation or inbox sync. Bot-only Discord and Telegram omit the group. Marked Slack fixture supplies MC/LM/NP rows. A declined Slack DM grant is a recorded live departure. | W9-T2b/T4; W12-T10 remains bot-only |
| D28 | Date navigation and source copy | meetings §2; tasks-calendar §2 | The seven pictured chips choose days in the current week, with no prev/next arrows. Add an accessible date-heading picker for other weeks as a separately reviewed new state. Freeze the exact 07/08 subtitles in W6-T4. | W6-T4/T5/T9; W4-T7 |
| D29 | Blue Marketing folder | email-files §2; shell Files inventory | Blue folder means confirmed folder linked to resource project, never browse selection. Seed that relation for all 01-04 fixtures; use the same rule with real links. | W7-T1/T3 |

## Visual acceptance contract V1

W4-T7 is the fixture prerequisite for every visual acceptance in every wave, including Wave 12. W4-T0 has no rendered change; W4-T7 proves its own fixture readiness before any comparison. Functional/code tasks can run before fixture completion; their visual claims cannot. Each task below names its 1280x800 pixel box as [x,y,width,height], corrected inventory range, specific pass criteria and allowed live substitutions. The inventory plus PNG are authoritative; original review line numbers are historical. All report links resolve in this tracked mockup-waves directory.

Pin the dark theme shown in every PNG, 1280x800 CSS viewport, device scale 1, zoom 100%, en-GB, Africa/Johannesburg and the W4-T7 clock. Pin Segoe UI on the Windows capture host with system-ui fallback; record the resolved font/OS in the capture manifest and reuse it for before/after. The PNG font is visually estimated, so a changed font/host requires an explicit reviewed rebaseline. A light-theme smoke pass is separate and cannot establish PNG parity.

Pass V1 when the named boundaries, insets, baselines, row pitch and control bounds are within 2 CSS px of the stated box/inventory, type sizes within 1px, and text wrapping, control set/order, icon type, selected state and copy match the corrected fixture. Inspect an overlay/difference plus the side-by-side crop; exclude text antialiasing from geometric measurement, not whole controls. Record each authorized D03/D25/D28 correction in the capture manifest. No screenshot-only test proves the service behavior. Unpictured states need reviewed proposed captures before acceptance; their named PNG box is context, never an invented original target.

In live captures permit only the task's listed data substitutions plus the W4 chrome table below. Data-driven height/wrap changes must preserve the same spacing rules, truncation/accessibility and controls without overlap. Brand/mode, corrected tabs and corrected selected mail identity are explicit departures, not loose pixel tolerance. No unsupported identity, connection, count or permission claim can be substituted silently.

## Shared-file serial slots

Acquire one exclusive RPC/migration/context slot across all waves for contract exports, rpc.ts, server.ts, ws.ts, RpcAuthorization.ts, shared RPC client registration, forward-migration registration, linkedItemsContext.ts and its turn integration test. A task takes it only when ready to edit those files; consent/network investigation does not hold it. UI files also require one owner per file. The following chains and each task's Serial predecessors are scheduler edges, separate from Dependencies. If a branch is declined, held on consent, or cut, mark it explicitly skipped in the dispatch graph, splice the chain to the nearest admitted ready predecessor, then release independent work. Never wait for a rejected connector to implement native notes, Drive, Browser or Agents. Do not dispatch any two ready tasks that share a slot/file even across waves. W8 native-note/comment branches may be spliced out for Drive-only delivery; no dangling dependency is treated as completed.

- shell: W4-T1 -> W4-T2 -> W4-T3 -> W4-T4a -> W4-T4b -> W4-T5 -> W4-T6.
- W5 RPC/migrations: W5-T1 -> W5-T2 -> W5-T3 -> W5-T4.
- task row/UI: W5-T5a -> W5-T5b -> W5-T6 -> W5-T7.
- W6 RPC/migrations/context: W6-T7 -> W6-T1a -> W6-T1b -> W6-T3 -> W6-T8 -> W6-T2a -> W6-T2b.
- W7 RPC/migrations: W7-T1 -> W7-T2.
- W8 RPC/migrations: W8-T1a -> W8-T1b -> W8-T5 -> W8-T6.
- Docs UI: W6-T8 -> W8-T3a -> W8-T4 -> W8-T3b -> W8-T5 -> W8-T6 -> W8-T8.
- W9 RPC/migrations/context: W9-T1 -> W9-T7 -> W9-T2a -> W9-T2b -> W9-T2c -> W9-T3a -> W9-T3b -> W9-T3c -> W9-T8.
- chat UI: W9-T4 -> W9-T5 -> W9-T6 -> W9-T8.
- Browser/UI extraction: W10-T1 -> W10-T2 -> W10-T3 -> W10-T4.
- W11 RPC: W11-T1 -> W11-T2 -> W11-T3 -> W11-T5.
- W11 UI: W11-T3 -> W11-T4 -> W11-T6 -> W11-T7.
- W12 admitted RPC/migrations: W12-T1 -> W12-T2 -> W12-T3 -> W12-T4 -> W12-T5 -> W12-T6 -> W12-T7 -> W12-T8 -> W12-T9 -> W12-T10.

- UI/WorkspaceResourceBody.tsx: W4-T4a -> W5-T7 -> W6-T8 -> W7-T3 -> W8-T3a -> W8-T7 -> W8-T8 -> W10-T1 -> W10-T4. T6 changes the responsive host, not this switch. Each consumer lists the switch in Files and git add.
- UI/ProjectTasks.tsx: W4-T5 -> W5-T1 -> W5-T2 -> W5-T3 -> W5-T4 (config) -> W7-T1 -> W8-T1a -> W5-T5b -> W5-T7.
- UI/WorkspaceShellLayout.tsx: W4-T2 -> W4-T3 -> W4-T4a -> W4-T6. Both live AppSidebarLayout and the fixture mount it; no parallel fixture layout.
- UI/workspaceNavigation.ts and UI/WorkspaceViewRail.tsx: W4-T1/T2 initial ownership -> W4-T6 gate where applicable -> W5-T5a -> W6-T4 -> W6-T5 -> W11-T3. Only admitted tasks touching that file take the slot; explicitly splice other parser/registry extensions into this chain before dispatch.
- UI/dev/WorkspaceMockupApp.tsx prop/provider wiring: W4-T7 -> W4-T2 -> W4-T3 -> W4-T4a -> W4-T5. Region geometry is owned only by WorkspaceShellLayout, shared by live and fixture.
- UI/workspaceResourceState.ts: W4-T4a -> W4-T6. W7 adds its convenience wrapper in UI/openFiles.ts instead of a second resource store.
- UI/dev/tasksMockupModule.tsx: W4-T7 -> W5-T5a -> W5-T7.
- UI/dev/notesMockupModule.tsx: W4-T7 -> W6-T8 -> W8-T4 -> W8-T5. W8-T3a preserves W6's native-note branch until T3b, which deletes meetings/WorkspaceNoteView.tsx and its test after repointing callers.
- Each other UI/dev/<area>MockupModule.tsx: W4-T7 -> the owning task named in the W4 module-owner table, with any later edits explicitly spliced into that per-file chain.
- docs gate: by wave number, admitted only. Shared docs/internals/glossary.md and docs/internals/overview.md: W4-T6 -> W5-T7 -> W6-T9 -> W7-T3 -> W8-T8 -> W9-T8 -> W10-T4 -> W11-T7; docs/user/workspace-spaces.md follows the same filtered order for tasks that edit it. Skipped/held waves do not block admitted docs updates.

Cross-wave config slot: W5-T4 -> W7-T1 -> W8-T1a. New forward migrations choose their number only while holding the slot. Each admitted Wave 12 task carries its own documentation gate; W12-T10 is only the final aggregate if all optional units are chosen, never a dependency of another optional unit.

## Wave 4 sample chrome to live chrome

| Element and pixel box                       | Marked sample                                            | Live default and controlling decision                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand [0,0,207,44]                          | Pulse Next and static blue artwork                       | Pulse Code; retain static artwork geometry only, D25. No animation.                                                                                                                                                                                                                                            |
| Mode [7,44,193,26], section [13,123,190,14] | Office / Code, section Office                            | Workspace / Code in both modes, section Workspace, D25; preserve A12 Code project/thread controls.                                                                                                                                                                                                             |
| Breadcrumb [220,0,585,26]                   | SynKEK workspace / space                                 | Selected environment display name / space; fallback Workspace when unnamed, never an inferred organization.                                                                                                                                                                                                    |
| Sample marker [1149,0,118,26]               | Design preview · sample data                             | Hidden outside fixture mode; no live demo or connection claim.                                                                                                                                                                                                                                                 |
| Header avatar [904,42,19,19]                | MC                                                       | D05 configured environment-owner initials with display-name accessible text; hide when unset. It grants no access and opens no invented profile menu.                                                                                                                                                          |
| Footer [940,768,340,32]                     | Blue dot, Sample project connections, gear               | Static aggregate from known selected-project connection state: Connected only when supported health is known, Unavailable for a failed known source, otherwise Connection status unavailable with neutral dot. Gear opens existing scoped project settings. Never animate or probe accounts to fill the label. |
| Files sentence [953,654,314,22]             | Shared with the SynKEK team. Files stay in Google Drive. | Files stay in Google Drive. unless complete supported metadata justifies more specific provider sharing text, D11. Never infer team sharing from a folder link.                                                                                                                                                |
| Header count [275,55,540,18]                | SynKEK · Slack · 8 members                               | Actual project/provider and N members only when source-reported with completeness/freshness, otherwise omit count, D26.                                                                                                                                                                                        |

## Per-PNG capture recipes owned by W4-T7

The route fragments below are proposed dev/test-only fixture selectors, not shipped public routes. Use the running isolated worktree origin only when a future capture is authorized. Each starts with a reset in-memory seed, the pinned V1 environment and open Resources at project fixture-synkek. No real account, live home or provider credential is loaded. The original PNGs remain unchanged. D03 corrects selection inconsistencies rather than storing contradictory UI state.

| PNG under W/mockups         | Dev-only route                             | view     | centerArea     | resourceArea | Selected state and resource tab                                                                                                                 |
| --------------------------- | ------------------------------------------ | -------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-email-files.png          | /workspace?space=mail&fixture=01           | inbox    | mail           | drive        | Nina's mail-1, maya@synkek.com; typed recipients Maya/Leo/me and 10:24 AM; confirmed SynKEK chip and Marketing · SynKEK folder card; Files/root |
| 02-communications-files.png | /workspace?space=communications&fixture=02 | chats    | communications | drive        | slack-marketing, 8 complete members, marker message-1, 3 known unread, four top-level messages/two replies; Files, corrected from Browser       |
| 03-tasks.png                | /workspace?space=tasks&fixture=03          | all      | tasks          | drive        | Five tasks/four open; areaLabel/dueOn/owner plus display-only MC/LM/NP/AM/MC; sampleCopy.tasksFooter; Files                                     |
| 04-projects.png             | /workspace?space=projects&fixture=04       | projects | projects       | drive        | fixture-synkek, Pulse website, Brand studio; complete sample counts/Drive link and four roster display rows; Files                              |
| 05-browser-module.png       | /workspace?space=communications&fixture=05 | chats    | communications | browser      | Same marketing conversation; inert local SynKEK site, comma-correct body and sampleCopy.browserFooter; Browser, corrected from Agents           |
| 06-agents-module.png        | /workspace?space=communications&fixture=06 | chats    | communications | agents       | Same conversation; three linked threads, one working/two idle; Agents, corrected from Files                                                     |
| 07-meetings-notes.png       | /workspace?space=meetings&fixture=07       | upcoming | calendar       | notes        | event-review, T 13, 09:00/14:00/16:30 +02:00; Schedule; Docs request note-launch-review; format/comment remain incomplete until W8              |
| 08-calendar-tasks.png       | /workspace?space=calendar&fixture=08       | agenda   | calendar       | tasks        | Same date/events and Schedule; Week uses Grid2X2; same five task records as 03; Tasks                                                           |

These fields are the exact WorkspaceMockupRecipe slot mapping; requiredAreas is the union of centerArea/resourceArea, not their positional dispatch mechanism. A resourceArea of null means no adapter contributes a body. The eight recipes above all have a resourceArea. Titles Agenda/Upcoming are display labels, not URL view values. Fixture parser allows only space/fixture; the recipe supplies view/day/selected state. Unknown IDs/space mismatch/other query keys fail closed with W4-T7's exact errors. Reset uses a new seed, storage map and memory router. Capture requires measured resolvedLocale/resolvedTimeZone, font/OS/viewport plus pinned dark cleanup of index.html's earlier theme attributes. An enforced throwing/counting request guard allows only same-origin module/CSS/font GETs and vite-hmr; ready rejects any application attempt. Capture needs only a web-only Vite server, with no backend or pairing. Desktop dev with fixture is outside PNG acceptance.

Files fixtures 01-04 seed four folders/four Docs with exact dates, a confirmed Marketing-to-SynKEK link for the blue glyph, and no opened folder row. Names, bodies, labels and ordering come from each corrected inventory, including the middle-dot launch-review title. Demo Schedule/Join/send use non-writing fakes. Capture from a fully settled receipt-driven state with focus/hover cleared and no pending request; record selected ref, resource project/tab, clock, theme, resolved font and manifest of allowed corrections beside each future capture. Do not copy or ship the 8 MB presentation HTML; the eight PNGs are the reference assets.

## Wave sequence

Default path is W4 -> W5 -> W6 -> W7 -> W8 -> W9 -> W10 -> W11. These are release-order boundaries for user value, not invented code dependencies. Dependencies below name code prerequisites; Serial predecessors name scheduler edges for shared writes. Connector consent gates only that connector; independent detailed plans can overlap only after shared-file ownership is settled. Wave 12 is a set of independent holds, not one serial release. W6 may ship with the explicit plain-note intermediate state; W8 closes its full 07 note/comment acceptance. Full 03/04 people/follower pixels and remote send parity stay conditional, clearly recorded above.

## Wave 4: Shared workspace shell

Goal: Give every space the same navigation, headers and independently selected project resources. Preserve B-2026-10-16-001.

Mockups: 01-email-files.png through 08-calendar-tasks.png.

Spec acceptance: Compare all eight PNGs at 1280x800: boundaries near x207/259/940, 26px breadcrumb, 52px header, 340px resources and six icon tabs. Email/Communications split the 681px center near x429; other spaces use its full width. Demo every destination, Code return, project choice before item selection, Linked context, close/reopen and compact Back. Module bodies are accepted in their owning waves.

Canonical detailed plan: `docs/superpowers/plans/2026-10-16-workspace-wave-4-shell.md`. Plan fix round 1 aligns this handoff at HEAD 1f0d9164de; implementation and rendered acceptance remain unrun.

### Canonical module-owner handoff

All paths here are under apps/web/src/components/workspace/. T7 creates the nine adapters below with empty readyRegions and transfers ownership. Each later task MUST name its exact adapter in Files and its explicit git add, export createWorkspaceMockupModule(session: WorkspaceMockupSession): WorkspaceMockupModule, mount the same pure presentation as live with fake reads/commands, and declare the center/resource regions it marks ready. Extra fake data stays in sibling dev files imported only by the adapter. There is a fixed dev import list and no registration call. No data-only or placeholder region can pass complete; outstanding 07.docs-format/07.docs-comments block the full Docs crop.

| Adapter                            | Owning task             | Region                                |
| ---------------------------------- | ----------------------- | ------------------------------------- |
| dev/mailMockupModule.tsx           | W11-T3/gate             | 01 center                             |
| dev/communicationsMockupModule.tsx | W9-T8                   | 02/05/06 center                       |
| dev/tasksMockupModule.tsx          | W5-T5a -> W5-T7         | 03 center, 08 resource                |
| dev/projectsMockupModule.tsx       | W8-T2                   | 04 center                             |
| dev/driveMockupModule.tsx          | W7-T3                   | 01-04 resource                        |
| dev/calendarMockupModule.tsx       | W6-T4                   | 07/08 center                          |
| dev/notesMockupModule.tsx          | W6-T8 -> W8-T4 -> W8-T5 | 07 resource, then format and comments |
| dev/browserMockupModule.tsx        | W10-T1                  | 05 resource                           |
| dev/agentsMockupModule.tsx         | W10-T4                  | 06 resource                           |

Later tasks wire Tasks/Docs/Files/PRs/Browser/Agents only in WorkspaceResourceBody.tsx under its serial chain and list it in Files/git add. W6's note handoff calls openResource with tab docs and request noteRef. W7 exports OpenFilesInput/OpenFiles/useOpenFiles from openFiles.ts; W9/W11 consume that wrapper and WorkspaceResourceBodyProps without redefining item?. W8-T3a preserves W6's interim native-note body until T3b replaces it with WorkspaceDocsPanel and deletes meetings/WorkspaceNoteView.tsx/test. W8 uses createWorkspaceNoteAtoms, the W6 producer name. W11 consumes W7's existing explorer pick mode. The controller amends those later detailed plans before dispatch; this two-file fix does not claim to have edited them.

Implementer commits end with a Co-Authored-By line naming the model that made the commit; controller commits use the controller's attribution line.

### W4-T0. Commit B-2026-10-16-001 shell correction

- Source: shell §3 current baseline; plan Wave 3b.
- Mockup and region: all: preserved shell baseline.
- Files: only the already reviewed B-2026-10-16-001 file set, including ProjectsNav.test.tsx and WorkspaceEngagement.test.tsx; existing evidence/ledger pointers.
- Dependencies: existing correction review and its required checks.
- Decision state: planned future maintainer/controller action, no commit in this planning pass. Common D24 applies to every task.
- Work and acceptance: Before isolated Wave 4 dispatch, inspect and commit the exact reviewed correction plus both untracked tests. Exclude unrelated working-tree edits; inspect the actual diff and current evidence rather than staging by path pattern. Record the resulting SHA. Before child worktrees start, the controller must also include this reviewed plan/A13 and the complete docs/superpowers/workspace-mockups bundle in the chosen committed parent revision. These new documentation files are intentionally unstaged in this pass, per the brief. This record schedules the commit; it does not claim it occurred.
- Own test cycle: Verify committed file list, both test files, required correction checks and retained evidence. This task has no rendered change or screenshot gate; pixel reference is all PNGs [0,0,1280,800], gap-shell.md:15-107. Later visual gates wait for W4-T7. Apply the focused test contract above.

### W4-T7. Isolated sample workspace fixture and eight capture recipes

- Source: shell §2 sample labels and all seven corrected inventories.
- Mockup and region: 01..08: full [0,0,1280,800] state.
- Files: dev/test-only UI/dev/workspaceMockupFixtures.ts, workspaceMockupEntry.tsx, WorkspaceMockupApp.tsx and adjacent fixture/entry/build tests; apps/web/src/bootstrap.ts; the nine exact dev adapters below; docs/superpowers/workspace-mockups/capture-recipes.md proposed.
- Dependencies: W4-T0.
- Decision state: default assumed, confirm D03, D25, D28. Common D24 applies to every task.
- Work and acceptance: Build a dev/test-only entry with an injected clock fixed at Tuesday 2026-10-13T10:30:00+02:00, timezone Africa/Johannesburg and en-GB locale. Seed deterministic SynKEK mail, channels/DMs, messages/replies, tasks, projects, Drive root/files, calendar occurrences, note/comment and agent statuses for all eight PNGs, plus a controlled Browser site. Render Design preview · sample data and Sample project connections. All mutations use disposable in-memory fakes, including demo sends; no provider/SMTP/agent/network write. Accept no state paths at all. All storage is injected per-session memory; never read/write browser storage or open userdata. Clear memory on dispose/reset. Pin dark after the inline boot script, use an isolated memory-history router, and enforce the throwing/counting zero-application-network guard. Build-exclusion tests use the real Vite config with only main stubbed, inspect output module IDs for /dev/ or .fixtures. and scan synkek.invalid/sample marker; a separate full production build scan runs outside unit tests. Production bundles omit the entry and sample data; production/old-server paths do not accept the fixture selector. Own the per-PNG recipe table below and keep module factories adjacent to their owners so parallel tasks do not all edit one fixture file.
- Own test cycle: Test pinned dates across clock advances, seeded row identities/counts, sample marker on every state, no production entry, no real credentials/process sends and rejected live-home path. Each module contributes its missing typed fake state as it lands; fixture readiness is not module completion. Capture every recipe at 1280x800, then record 1024px/390px adaptations separately when browser use is authorized. Apply the focused test contract above.
- Visual acceptance: Own W4-T7 fixture readiness, then V1; PNG 01-08, box [0,0,1280,800] at 1280x800; corrected inventory [gap-shell.md:15-107](gap-shell.md#L15). Pass: all eight recipes show marker, pinned Tue 13 date, exact seed rows and D03 corrected selection; V1 dark theme/font/2px criteria apply. Allowed substitutions: none in fixture captures; fixture must stay deterministic. The W4 live chrome table applies only to separate non-fixture captures.

### W4-T1. Typed destinations and scoped mode return

- Source: shell §5 S1; COMM-00.
- Mockup and region: all: mode switch, primary rows, breadcrumb.
- Files: ROUTES; UI/WorkspaceSpaceSelector.tsx; UI/OfficeWorkspace.tsx and focused route/selector tests.
- Dependencies: W4-T0.
- Decision state: default assumed, confirm D01, D03. Common D24 applies to every task.
- Work and acceptance: Preserve legacy URLs and environment/account/project identity; add six destinations and the one canonical view key validated against exported workspaceViews. Later rail values extend that vocabulary/registry/parser tests under their file slots; taskLayout/day are separate bounded fields, not alternate rail keys. Keep Projects as Workspace landing and restore the scoped Code thread. Unsupported capabilities explain availability without RPC calls.
- Own test cycle: Drive menu/palette/direct URL/back-forward transitions, invalid views, older server and environment changes; verify navigation starts no work. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-08, box [0,0,259,800] at 1280x800; corrected inventory [gap-shell.md:15-53](gap-shell.md#L15). Pass: six destinations in order, exactly one selected, Inbox/Unread/Later visible in 01, mode and breadcrumb aligned; V1 dark theme/font/2px criteria apply. Allowed live substitutions: live brand/mode/environment names only per D25 and chrome table, plus the W4 chrome table.

### W4-T2. Persistent navigation and per-space rail slots

- Source: shell §5 S2; COMM-04 shell portion.
- Mockup and region: all: x0..259 navigation.
- Files: apps/web/src/components/AppSidebarLayout.tsx; UI/WorkspaceSpaceSelector.tsx; UI/OfficeWorkspace.tsx; UI/WorkspaceShellLayout.tsx proposed; UI/WorkspaceNavigationView.tsx; UI/WorkspaceViewRail.tsx; UI/mail/MailNav.tsx; UI/ProjectsNav.tsx; apps/web/src/components/sidebar/SidebarChrome.tsx and focused tests.
- Dependencies: W4-T1.
- Serial predecessors: W4-T1. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D01. Common D24 applies to every task.
- Work and acceptance: Compose the 207px sidebar and 52px rail. Space owners supply WorkspaceRailItem[] through workspaceRailItems, clearing unavailableReason when supported. No ReactNode rail slot. Mount the shared WorkspaceShellLayout in both AppSidebarLayout and the fixture. Keep Mail account/folder access and A12 searchable project dropdown; Code retains its native project/thread controls and both sidebar variants.
- Own test cycle: Navigate each row by keyboard and pointer; test folder/account access, Settings and compact menu dismissal. Screenshot ordered six rows and one selected destination. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-08, box [0,0,259,800] at 1280x800; corrected inventory [gap-shell.md:15-53](gap-shell.md#L15). Pass: six destinations in order, exactly one selected, Inbox/Unread/Later visible in 01, mode and breadcrumb aligned; V1 dark theme/font/2px criteria apply. Allowed live substitutions: live brand/mode/environment names only per D25 and chrome table, plus the W4 chrome table.

### W4-T3. Shared headers and center sizing

- Source: shell §5 S3.
- Mockup and region: all: y0..78; center x259..940.
- Files: UI/WorkspaceEngagement.tsx; apps/web/src/components/WorkspacePageHeader.tsx; apps/web/src/components/WorkspaceBreadcrumb.tsx; UI/mail/MailSpace.tsx; UI/ProjectsSpace.tsx; UI/CommunicationsWorkspace.tsx; UI/TelegramWorkspace.tsx; UI/WorkspaceShellLayout.tsx; apps/web/src/hooks/useResizableWidth.ts and its test; fixture entry test, fixture prop wiring and focused header/layout tests.
- Dependencies: W4-T2.
- Serial predecessors: W4-T2. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D01, D03. Common D24 applies to every task.
- Work and acceptance: Spaces pass WorkspaceHeaderModel via WorkspaceEngagement.header. The shell renders one header and breadcrumb; no module renders a second WorkspacePageHeader. Inject storage into every divider read/write for clean fixture reset. Provide Resources and truthful identity. Support a split center or a wide module body; preserve keyboard resizing when applicable. Use semantic tokens and static artwork.
- Own test cycle: Test route/account title updates, long names, no-list composition and Electron drag regions. Compare header baselines and width budget without adding a vacant list column. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-08, box [207,0,1073,78] at 1280x800; corrected inventory [gap-shell.md:30-57](gap-shell.md#L30). Pass: one 26px breadcrumb and 52px header, split center only in mail/chat, Resources and avatar aligned; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual title/account/provider and configured owner initials, plus the W4 chrome table.

### W4-T4a. Project resource frame, selection and six lazy tabs

- Source: shell §5 S4; projects §5 P1; browser-agents §5 BA-1.
- Mockup and region: all: x940..1280 resource frame.
- Files: UI/WorkspaceEngagement.tsx; UI/WorkspaceToolsPanel.tsx; UI/ProjectsNav.tsx; UI/WorkspaceResourcesPanel.tsx; UI/WorkspaceResourcesPanelView.tsx; UI/ProjectPickerView.tsx; UI/workspaceResourceState.ts; UI/WorkspaceResourceBody.tsx; UI/WorkspaceShellLayout.tsx; apps/web/src/components/AppSidebarLayout.tsx; dev/WorkspaceMockupApp.tsx provider/frame wiring; focused selection/picker/isolation tests.
- Dependencies: W4-T3.
- Serial predecessors: W4-T3. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D02, D03. Common D24 applies to every task.
- Work and acceptance: Lift existing project resolution into one environment-scoped resource project independent of the center item. Own picker, X, Files/Browser/Agents/Tasks/Docs/PRs, default-open and close/reopen persistence. Mount only the selected lazy body through WorkspaceResourceBody.tsx, the sole switch. Expose openResource({ tab, projectId, request }) through WorkspaceResourcesContext/Provider and useWorkspaceResources; BodyProps includes nullable request and selectedItem. The frame view receives pure projects/callback/body/footer props; it imports no live container. Unsupported slots are explained, never counted delivered.
- Own test cycle: Test zero/one/multiple projects before item selection, late reads after project/environment changes, close/reopen and exactly one mounted body without link writes. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 01-08, box [940,26,340,774] at 1280x800; corrected inventory [gap-shell.md:33-36](gap-shell.md#L33). Pass: six tabs in order, correct body-selected tab under D03, fixed footer and close/reopen project retention; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual project names and capability-unavailable body, plus the W4 chrome table.

### W4-T4b. Linked context entrance and retained provenance

- Source: shell §5 S4, S5; projects §5 P1.
- Mockup and region: all: Resources/header and Linked context action.
- Files: UI/WorkspaceResourcesPanel.tsx proposed; UI/mail/LinkedSection.tsx; UI/WorkspaceEngagement.tsx; focused context tests.
- Dependencies: W4-T4a.
- Serial predecessors: W4-T4a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D02. Common D24 applies to every task.
- Work and acceptance: Add the named Linked context header action for the selected item. Retain Linked, Suggested, provenance and linked projects; keep resource project choice separate. This is a reviewed live addition to the header, since the PNGs show Resources only.
- Own test cycle: Test context open/back, absent selection, suggestion accept/dismiss and captured item identity during resource-project changes; no link created by browsing. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 01-08, box [822,26,118,52] at 1280x800; corrected inventory [gap-shell.md:32-35](gap-shell.md#L32). Pass: Resources preserved; proposed Linked context control does not overlap title/avatar and opens provenance without changing resource project; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual selected-item links; new Linked context state requires design review, plus the W4 chrome table.

### W4-T5. Shared item actions, project settings and truthful footer

- Source: shell §5 S5; COMM-10 shared portion.
- Mockup and region: all: resource actions/footer; 04 card menus.
- Files: UI/WorkspaceItemActions.tsx; UI/mail/LinkedSection.tsx; UI/mail/useMailLinks.ts; UI/WorkspaceResourcesPanel.tsx proposed; UI/ProjectTasks.tsx; apps/web/src/components/AppSidebarLayout.tsx and dev/WorkspaceMockupApp.tsx footer-prop wiring; tests.
- Dependencies: W4-T4a.
- Serial predecessors: W4-T4b. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D02, D03. Common D24 applies to every task.
- Work and acceptance: Expose the same captured endpoint through context menu, detail/header, palette/keybinding and touch menu. Footer gear opens existing scoped project/integration settings. Release ProjectTasks.tsx to W5-T1 in its declared cross-wave file chain. Keep direct/one-hop/suggested relationships distinct and handle unavailable targets.
- Own test cycle: Cancel creates nothing; switch selection during an action and verify the original endpoint; unlink/relink preserves origin; settings retains environment/project. Sample footer appears only in fixture mode. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-08; 04 card menus, box [940,768,340,32] at 1280x800; corrected inventory [gap-shell.md:36-38](gap-shell.md#L36). Pass: footer dot/text/gear alignment, settings retains captured environment/project; unseen menus need review; V1 dark theme/font/2px criteria apply. Allowed live substitutions: supported live health labels from chrome table, plus the W4 chrome table.

### W4-T6. Compact shell and single-body regression

- Source: shell §5 S6, S9; S7/S8 frame integration only.
- Mockup and region: all: shared chrome; compact adaptation has no supplied PNG.
- Files: UI/WorkspaceEngagement.tsx; UI/WorkspaceShellLayout.tsx; shared headers/resources, excluding the body switch; focused workspace route and interaction tests; docs/user/workspace-spaces.md only for changed guidance; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W4-T5.
- Serial predecessors: W4-T5. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D24. Common D24 applies to every task.
- Work and acceptance: Use menu, one center pane and Resources sheet at phone/intermediate widths. Preserve query/scroll/draft/focus; six tabs scroll inside their strip. Resize transfers one body without duplicate subscriptions or preview leases.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Test 390x844, 768/1024/1279/1280 transitions, sheet-open resize, keyboard and touch cancellation. Future primary visual pass verifies no page overflow and exact wide geometry; no module completion claim. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-08, box [0,0,1280,800] at 1280x800; corrected inventory [gap-shell.md:101-107](gap-shell.md#L101). Pass: wide boundaries 207/259/940 restored after resize; exactly one resource body; compact proposed states reviewed; V1 dark theme/font/2px criteria apply. Allowed live substitutions: chrome table only; compact has no original pixel target, plus the W4 chrome table.

## Wave 5: Tasks list, board and resource tab

Goal: Extend existing task identity and service into a global/project task space, with reversible completion, dates, area and accountable owner.

Mockups: 03-tasks.png, 08-calendar-tasks.png.

Spec acceptance: Compare 03 center: 59px rows, checkbox/title/area/due/19px initials, search, Board and 4 open of 5. Compare 08 right Tasks body at 340px using the same records. Demo filter, edit, complete, reopen and Board movement on two subscribed clients. The Board body is a proposed design requiring review because no open Board PNG exists. Four named coworkers and followers remain explicit D05/D06 departures in live mode.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-5-tasks.md`. This file is a named handoff, not created or validated by this assignment.

### W5-T1. Completion semantics and revision-safe moves

- Source: tasks-calendar §5 TC1.
- Mockup and region: 03 center and 08 right: checked final row/count.
- Files: TOOLS; UI/ProjectTasks.tsx; forward migration and focused contract/service/atom tests.
- Dependencies: W4-T0. No shell resource-frame prerequisite.
- Decision state: default assumed, confirm D04. Common D24 applies to every task.
- Work and acceptance: Designate completedColumn in project config; derive done from column, migrate exact default Done and require explicit choice for custom vocabularies. Use desired-state, revision-checked complete/reopen/move and protect used columns.
- Own test cycle: Test custom config, migration, repeat completion, deterministic reopen, stale writes and second-client change receipts. Keep old upsert valid. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 03; 08, box [275,191,648,295; 953,197,314,291] at 1280x800; corrected inventory [gap-tasks-calendar.md:43-49](gap-tasks-calendar.md#L43), [gap-tasks-calendar.md:89-100](gap-tasks-calendar.md#L89). Pass: only final task checked/struck, four open in both views, complete/reopen changes same record; V1 dark theme/font/2px criteria apply. Allowed live substitutions: live title/completion state, D05 owner substitution, plus the W4 chrome table.

### W5-T2. Date-only due dates, area and display timezone

- Source: tasks-calendar §5 TC2.
- Mockup and region: 03/08 task metadata and Today/16 Oct.
- Files: TOOLS; UI/ProjectTasks.tsx; existing settings owner after inspection; forward migration and tests.
- Dependencies: W5-T1.
- Serial predecessors: W5-T1. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D04. Common D24 applies to every task.
- Work and acceptance: Add nullable validated dueOn and areaLabel with explicit clear semantics. Preserve metadata on old title/column saves. Use one editable environment display timezone; due dates create no scheduled jobs.
- Own test cycle: Reject impossible dates; set/clear/restart; old client preserves fields; injected midnight/DST clock never shifts a date-only value. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 03; 08, box [301,207,619,264; 979,210,288,265] at 1280x800; corrected inventory [gap-tasks-calendar.md:45-48](gap-tasks-calendar.md#L45), [gap-tasks-calendar.md:97-100](gap-tasks-calendar.md#L97). Pass: Today on first row, 16 Oct on remaining four, area lines and right alignment match; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real dueOn, area and chosen display timezone, plus the W4 chrome table.

### W5-T3. Environment owner display profile

- Source: tasks-calendar §5 TC3.
- Mockup and region: 03/08: owner initials column.
- Files: TOOLS; existing environment settings/profile if suitable; task detail owner control; forward migration and tests.
- Dependencies: W5-T2.
- Serial predecessors: W5-T2. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D05. Common D24 applies to every task.
- Work and acceptance: Use Me/environment-owner and Unassigned. Legacy tasks remain Unassigned; new tasks default Me. Store display name/initials without a people directory or authorization roles.
- Own test cycle: Test default/migration/clear/reassign, invalid identity and operate scope; both devices see the same owner after rename. Fixture people remain clearly marked. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 03; 08, box [901,211,19,255; 1245,213,19,255] at 1280x800; corrected inventory [gap-tasks-calendar.md:48-51](gap-tasks-calendar.md#L48), [gap-tasks-calendar.md:97-100](gap-tasks-calendar.md#L97). Pass: 19px initials column and five-row alignment match; V1 dark theme/font/2px criteria apply. Allowed live substitutions: Me/Unassigned and configured owner initials per D05, fixture people only in sample, plus the W4 chrome table.

### W5-T4. Paged all-task summaries and the open total

- Source: tasks-calendar §5 TC4.
- Mockup and region: 03: unbadged All tasks/Open/Done rail and the single 4 open summary, search/filter data.
- Files: TOOLS; RPC; indexed forward migration and public RPC tests.
- Dependencies: W5-T2, W5-T3.
- Serial predecessors: W5-T3. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D04. Common D24 applies to every task.
- Work and acceptance: Query active projects in one environment with optional project/state/text/due/owner and stable cursor. Return bounded summaries and the filtered open total used by 4 open · SynKEK; render no All/Open/Done rail counts, since 03 has none; retain old project list. No per-project request fanout.
- Own test cycle: Enumerate over 200 rows and equal-date ties without gaps/duplicates; verify cursor/filter binding, deleted projects, auth and isolated environments. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 03, box [207,38,716,141] at 1280x800; corrected inventory [gap-tasks-calendar.md:36-42](gap-tasks-calendar.md#L36). Pass: All tasks/Open/Done carry no counts; only heading reads 4 open · SynKEK; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual project and filtered open total, plus the W4 chrome table.

### W5-T5a. Tasks list, status rail and scope filters

- Source: tasks-calendar §5 TC5.
- Mockup and region: 03: x207..940 status rail, toolbar and five rows.
- Files: UI/TasksSpace.tsx, TasksNav.tsx and WorkspaceTaskRow.tsx, all proposed; ROUTES; focused list tests.
- Dependencies: W5-T4, W4-T6.
- Decision state: default assumed, confirm D04, D05, D06. Common D24 applies to every task.
- Work and acceptance: Render All tasks/Open/Done without badges, project scope, search, filter/clear and shared task refs/actions. Keep the one open-total subtitle and existing task URLs. The live footer omits followers under D06.
- Own test cycle: Test direct URL, filter-before-page, selection and checkbox separation, empty/error/read-only states and retained search/scroll on phone Back. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 03, box [207,26,733,495] at 1280x800; corrected inventory [gap-tasks-calendar.md:32-51](gap-tasks-calendar.md#L32). Pass: five 59px rows, search and unbadged rail, 4 open, checkbox distinct from row open; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual titles, metadata, open total and D05/D06 live substitutions, plus the W4 chrome table.

### W5-T5b. Task detail, creation and revision-safe editing

- Source: tasks-calendar §5 TC5.
- Mockup and region: 03: task row opens detail, editor unseen.
- Files: UI/TasksSpace.tsx and WorkspaceTaskRow.tsx proposed; UI/ProjectTasks.tsx; OPENERS; focused edit tests.
- Dependencies: W5-T5a.
- Serial predecessors: W5-T5a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D04, D05. Common D24 applies to every task.
- Work and acceptance: Reuse existing task creation/detail service and stable refs for title, area, dueOn, Me/Unassigned, completion and settings. Retain established menu/palette entrances. Design the unseen editor before its visual acceptance.
- Own test cycle: Test create/cancel, clear fields, revision conflict, failed save retaining edits, deleted target, direct task URL and phone return. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 03, box [275,191,648,295] at 1280x800; corrected inventory [gap-tasks-calendar.md:43-51](gap-tasks-calendar.md#L43). Pass: resting rows unchanged; reviewed proposed detail/editor preserves title/date and cancel/back; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual task fields; no fixture coworker identities live, plus the W4 chrome table.

### W5-T6. Board using configured project columns

- Source: tasks-calendar §5 TC6.
- Mockup and region: 03: Board button; board body is unseen.
- Files: UI/TaskBoard.tsx proposed; UI/TasksSpace.tsx; shared task rows/cards and tests.
- Dependencies: W5-T5b.
- Serial predecessors: W5-T5b. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D04. Common D24 applies to every task.
- Work and acceptance: Reuse list scope, filters, ordering and completion rules. Show project-specific lanes with empty lanes/counts and accessible Move to column. Global Board groups by project; optional drag follows working menu.
- Own test cycle: Test custom lane order, empty lanes, filter retention, completion/reopen, keyboard move, failure and revision conflict. Review proposed Board capture before implementation acceptance. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 03, box [863,101,60,24] at 1280x800; corrected inventory [gap-tasks-calendar.md:41-51](gap-tasks-calendar.md#L41). Pass: LayoutGrid 2x2 icon then Board; board body reviewed separately and preserves configured columns; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real project lanes/titles/counts only in proposed Board state, plus the W4 chrome table.

### W5-T7. Shared project Tasks resource body

- Source: tasks-calendar §5 TC7, TC14 task portion; shell §5 S8 Tasks.
- Mockup and region: 08: x953..1267 task rows; 03 keeps Files selected.
- Files: UI/ProjectTasksResource.tsx proposed; UI/WorkspaceTaskRow.tsx; UI/WorkspaceToolsPanel.tsx; UI/ProjectTasks.tsx; focused panel tests; docs/user/workspace-tools.md; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W5-T6, W4-T6.
- Serial predecessors: W5-T6. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D04, D05, D24. Common D24 applies to every task.
- Work and acceptance: Mount chosen project's all-status rows and exact open count, same detail/checkbox service as center. Do not force Tasks tab merely because Tasks center opens.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Complete/reopen in resource body and observe center/hub on another client; test ambiguous project, environment change and one sheet query. Capture 08 density, preserve 03 Files selection. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 08, box [953,149,314,339] at 1280x800; corrected inventory [gap-tasks-calendar.md:89-100](gap-tasks-calendar.md#L89). Pass: Project tasks/SynKEK · 4 open, five 59px rows, final checked; 03 still Files; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real chosen project/tasks, Me/Unassigned per D05, plus the W4 chrome table.

## Wave 6: Shared Calendar and Meetings

Goal: Use one server-owned event/range service for Agenda and Upcoming, plus external Join/Schedule and explicit meeting-note links.

Mockups: 07-meetings-notes.png, 08-calendar-tasks.png.

Spec acceptance: Compare 07/08 center x259..940: selected T 13, seven-day strip, 09:00/14:00/16:30 gutter and three content-sized cards. Demo day-chip selection and the reviewed date-heading picker, the same fake/local occurrence in both spaces and each admitted provider separately, external Join on the requesting device, notes round-trip and Tasks completion. Both 07 and 08 toolbars show + Schedule; every conference card shows Join meeting. Formatted note/comment parity completes in Wave 8; Recordings publication is conditional Wave 12. No provider-labelled events are fabricated in an unconnected environment.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-6-calendar-meetings.md`. This file is a named handoff, not created or validated by this assignment.

### W6-T1a. Shared event contract, storage and bounded range service

- Source: tasks-calendar §5 TC8; meetings §5 M1.
- Mockup and region: 07/08: shared day/card identity and metadata.
- Files: CALENDAR contract and server store/service, all proposed; RPC; forward migration; focused contract/storage tests.
- Dependencies: W4-T0.
- Serial predecessors: W6-T7. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D07. Common D24 applies to every task.
- Work and acceptance: Define stable event/occurrence IDs, source connection mapping, UTC timed instants separate from all-day dates, display timezone and bounded range/detail reads. Reuse one service for Calendar and Meetings, with fake readers and distinct disconnected/empty/partial states. No Google account is needed for admission.
- Own test cycle: Test end-exclusive overlap, DST, occurrence collisions, migration/restart, paging, bounds and read/operate scopes through the public service. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [275,98,648,564] at 1280x800; corrected inventory [gap-tasks-calendar.md:66-87](gap-tasks-calendar.md#L66). Pass: Tue 13, 09:00/14:00/16:30, three content-sized cards, no duplicate event across spaces; backend tasks introduce no new chrome; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real events/source labels/timezone/attendees, disconnected states truthful, plus the W4 chrome table.

### W6-T1b. Calendar change stream, due-task projection and shared atoms

- Source: tasks-calendar §5 TC8; meetings §5 M1, M2 common boundary.
- Mockup and region: 07/08: selected day and event/due rows.
- Files: CALENDAR shared atoms/web binding and change stream, proposed; existing TOOLS queries; RPC; focused subscription tests.
- Dependencies: W6-T1a, W5-T2, W5-T4.
- Serial predecessors: W6-T1a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D07. Common D24 applies to every task.
- Work and acceptance: Project date-only due tasks as references without duplicate events. Add one environment-scoped change subscription for local writes/source refresh receipts, shared between Calendar and Meetings. Use only on-demand selected-range reads and explicit Refresh. No timer, background poll, provider push endpoint or all-calendar scan.
- Own test cycle: Use receipts/drains to test task date changes, reconnect/resubscribe, two-client invalidation, range switch and one shared subscription. Assert advancing the clock causes no provider request. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [275,98,648,564] at 1280x800; corrected inventory [gap-tasks-calendar.md:66-87](gap-tasks-calendar.md#L66). Pass: Tue 13, 09:00/14:00/16:30, three content-sized cards, no duplicate event across spaces; backend tasks introduce no new chrome; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real events/source labels/timezone/attendees, disconnected states truthful, plus the W4 chrome table.

### W6-T2a. Google Calendar OAuth and account lifecycle

- Source: tasks-calendar §5 TC13a; meetings §5 M2.
- Mockup and region: 07/08: Google source availability, setup unseen.
- Files: apps/server/src/workspace/calendar/GoogleCalendarOAuth.ts and CalendarAccountStore.ts, both proposed; server secrets/settings patterns; CALENDAR; RPC; forward migration; focused OAuth tests.
- Dependencies: W6-T1a.
- Serial predecessors: W6-T8. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D07. Common D24 applies to every task.
- Work and acceptance: Explicitly reconnect a selected server account with reviewed read-only scopes. Own consent, secret rotation, selected calendar list, revoke/disconnect and health. Do not migrate Electron tokens or reuse mail grants. Verify current API/scopes at implementation time before admission.
- Own test cycle: Script denied consent, state mismatch, rotation, disconnect/reconnect, no secrets in RPC and preserved desktop accounts. Actual-account evidence is separately authorized. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [275,98,648,564] at 1280x800; corrected inventory [gap-tasks-calendar.md:66-87](gap-tasks-calendar.md#L66). Pass: Tue 13, 09:00/14:00/16:30, three content-sized cards, no duplicate event across spaces; backend tasks introduce no new chrome; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real events/source labels/timezone/attendees, disconnected states truthful, plus the W4 chrome table.

### W6-T2b. Paged Google event normalization and explicit Refresh

- Source: tasks-calendar §5 TC13a; meetings §5 M2.
- Mockup and region: 07/08: source labels, real attendees and three event cards.
- Files: apps/server/src/workspace/calendar/GoogleCalendar.ts proposed; CALENDAR adapter; scripted normalization/range tests.
- Dependencies: W6-T2a, W6-T1b.
- Serial predecessors: W6-T2a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D07, D09. Common D24 applies to every task.
- Work and acceptance: Normalize recurrence exceptions, reschedule/cancel, source IDs, all-day/timezone fields and validated meeting URLs. Read only the selected bounded range on demand or explicit Refresh. One in-flight request per connection/range, max 100 events per page and explicit next page; honor Retry-After without an automatic loop. No background polling or scan of all calendars.
- Own test cycle: Test native cursors, recurring exceptions, DST, 429/cancel, disconnect during read and missing Join URL. Assert no request on clock advance, unopened range or second subscriber; explicit Refresh is deduplicated and bounded. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [275,98,648,564] at 1280x800; corrected inventory [gap-tasks-calendar.md:66-87](gap-tasks-calendar.md#L66). Pass: Tue 13, 09:00/14:00/16:30, three content-sized cards, no duplicate event across spaces; backend tasks introduce no new chrome; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real events/source labels/timezone/attendees, disconnected states truthful, plus the W4 chrome table.

### W6-T3. Openable linked events and bounded agent reads

- Source: tasks-calendar §5 TC10; meetings §5 M4 event portion.
- Mockup and region: 07/08: event card/actions/selected context.
- Files: OPENERS; apps/server/src/mcp/toolkits/workspace/handlers.ts and tools.ts; CALENDAR reader tests; apps/server/src/workspace/linkedItemsContext.ts; apps/server/src/workspace/linkedItemsContext.test.ts; apps/server/src/workspace/linkedItemsTurn.integration.test.ts; inspect apps/server/src/orchestration-v2/ProviderTurnStartService.ts:1052 integration.
- Dependencies: W6-T1a, W4-T5.
- Serial predecessors: W6-T1b. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D02, D07. Common D24 applies to every task.
- Work and acceptance: Use provider-resource workspace-calendar with server event ID. Route all card/header/touch actions through shared refs and resolve confirmed access before reading. Cancellation/disconnection retains unavailable links.
- Own test cycle: Test guessed/unlinked/suggested/one-hop refs denied, exact linked event readable, renamed occurrence stable, original environment opening and source cancellation reason. Verify a typed provider label, sanitized bounded summary and confirmed-resource-only read through linkedItemsTurn.integration.test.ts. Saving alone adds no provider context. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [275,98,648,564] at 1280x800; corrected inventory [gap-tasks-calendar.md:66-87](gap-tasks-calendar.md#L66). Pass: Tue 13, 09:00/14:00/16:30, three content-sized cards, no duplicate event across spaces; backend tasks introduce no new chrome; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real events/source labels/timezone/attendees, disconnected states truthful, plus the W4 chrome table.

### W6-T4. Reusable day agenda for Calendar and Upcoming

- Source: tasks-calendar §5 TC11; meetings §5 M5.
- Mockup and region: 07/08: x259..940 agenda, rail and day strip.
- Files: UI/calendar/CalendarAgenda.tsx proposed; UI/calendar/CalendarSpace.tsx proposed; UI/meetings/MeetingsSpace.tsx proposed; shared date/event-card components; ROUTES; CALENDAR atoms and focused tests.
- Dependencies: W6-T1b, W6-T3, W5-T7, W4-T6. W6-T2b is additive; fake/local data proves UI independently of Google consent.
- Decision state: default assumed, confirm D07, D08, D09. Common D24 applies to every task.
- Work and acceptance: Compose both destinations from the same event/card/date components with exact 07 subtitle Prepare, meet and follow through. and 08 subtitle Your week · 12 – 18 October 2026 beneath Tuesday, 13 October; both shared headers retain SynKEK · Brand & growth. Both toolbars show + Schedule. Each card has a blue 12px Video conferencing-link indicator at x897/y225,372,548 only for a validated Join URL. Video is decorative, aria-hidden within the card, while Join meeting is the one named action. Show true untimed due/all-day rows, participant data and conditional descriptions. Keep Recordings entrance truthful and preserve legacy access until replacement acceptance.
- Own test cycle: Test day/back/palette/direct URL, stale day/environment responses, zero/cancelled/no-URL events and task resource completion. Compare three card heights and day selection to both PNGs. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [259,78,681,584] at 1280x800; corrected inventory [gap-meetings-notes.md:47-62](gap-meetings-notes.md#L47). Pass: both + Schedule buttons, exact per-space subtitles, T 13, card sizes and decorative Video indicators match; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real date/events/attendees, Video only for valid Join URL; D28 picker is reviewed addition, plus the W4 chrome table.

### W6-T5. Week view from the same event ranges

- Source: tasks-calendar §5 TC12.
- Mockup and region: 08: Week rail; open grid unseen.
- Files: UI/calendar/CalendarWeek.tsx proposed; CalendarSpace/date/event helpers and focused tests.
- Dependencies: W6-T4.
- Decision state: default assumed, confirm D07. Common D24 applies to every task.
- Work and acceptance: Provide seven display-zone days, all-day/due band, overlap layout and keyboard details. Phone defaults to readable Agenda; no minute polling or new scheduler.
- Own test cycle: Test DST folds/gaps, cross-midnight/overlap, day-chip selection within 12-18 October and retained Agenda selection. The pictured strip has no previous/next arrows. For out-of-week navigation use a separately reviewed date-heading picker addition under D28; do not add hidden arrow assumptions. Review proposed Week capture against 08 chrome before acceptance. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 08, box [207,94,716,91] at 1280x800; corrected inventory [gap-tasks-calendar.md:71-76](gap-tasks-calendar.md#L71). Pass: Week rail and seven day chips match; no strip arrows; proposed Week/date picker separately reviewed; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real week/date/timezone and event overlap; no extra sample-only controls, plus the W4 chrome table.

### W6-T6. External Join and Schedule handoffs

- Source: meetings §5 M6; tasks-calendar §5 TC9 default substitution; meetings §5 M11 default substitution.
- Mockup and region: 07 and 08: Schedule plus Join.
- Files: shared validated external-link helper; calendar provider parsing; UI calendar/meeting cards and focused tests.
- Dependencies: W6-T4.
- Decision state: default assumed, confirm D08, D09. Common D24 applies to every task.
- Work and acceptance: Join validated Meet/Zoom/Teams HTTPS on the requesting client. Schedule in both Meetings and Calendar opens an explicit chosen-provider calendar handoff with selected date where supported; unconfigured state explains setup. No local editor or invitations under this default.
- Own test cycle: Test deceptive hosts/protocols, query preservation, missing URL, blocked popup and remote caller destination without attending a call. Cancel/open alone makes no event or provider mutation. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [847,102,76,24; 340,302,180,347] at 1280x800; corrected inventory [gap-meetings-notes.md:48-61](gap-meetings-notes.md#L48). Pass: 07 and 08 Schedule plus Join in every linked card; one named Join action, Video decorative; V1 dark theme/font/2px criteria apply. Allowed live substitutions: chosen external provider and valid real Join URL; no auto invites, plus the W4 chrome table.

### W6-T7. Bounded native notes with revision-safe lifecycle

- Source: meetings §5 M3.
- Mockup and region: 07: note title, paragraphs and ordered priorities.
- Files: NOTES; RPC; forward migration and service/contract/atom tests.
- Dependencies: W4-T0. Own the first Wave 6 migration/RPC serial slot; no Calendar or Google prerequisite.
- Decision state: default assumed, confirm D10. Common D24 applies to every task.
- Work and acceptance: One workspace note model for Meetings and Docs, bounded text/Markdown with create/read/update/delete, request idempotency, revision checks and environment authorization. Drive notes remain file refs and provider editing stays external.
- Own test cycle: Test concurrent edits, same-request retry, restart, oversize content, unlink preserves note, deletion preserves unavailable references and recoverable creation/link failure. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07, box [953,145,314,378] at 1280x800; corrected inventory [gap-meetings-notes.md:66-72](gap-meetings-notes.md#L66). Pass: launch-review ref opens same note; title/paragraphs/ordered priorities retained, formatted rendering closes in W8; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real note title/body and environment-access caption under D10/D11, plus the W4 chrome table.

### W6-T8. Meeting-note relationships, opener and read grants

- Source: meetings §5 M4 note portion; M7 selection handoff.
- Mockup and region: 07: Notes & agenda selects correct Docs note.
- Files: OPENERS; NOTES; workspace MCP handlers/tools/tests; UI meeting card actions; apps/server/src/workspace/linkedItemsContext.ts; apps/server/src/workspace/linkedItemsContext.test.ts; apps/server/src/workspace/linkedItemsTurn.integration.test.ts; inspect apps/server/src/orchestration-v2/ProviderTurnStartService.ts:1052 integration.
- Dependencies: W6-T7, W6-T3, W4-T4b.
- Serial predecessors: W6-T3. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D02, D10. Common D24 applies to every task.
- Work and acceptance: Explicitly link meeting-note and chosen project-note through existing links. Use provider-resource workspace-note for native notes, file refs for Drive. Notes & agenda carries stable ref and project to Docs; until Wave 8 use a bounded plain-note view with explicit intermediate status.
- Own test cycle: Test retry repairs same links, meeting-only grant cannot read note, direct owner grant can, unlink revokes absent another grant, multibyte/revision continuation and hostile text remains data. Verify a typed provider label, sanitized bounded summary and confirmed-resource-only read through linkedItemsTurn.integration.test.ts. Saving alone adds no provider context. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07, box [953,145,314,378] at 1280x800; corrected inventory [gap-meetings-notes.md:66-72](gap-meetings-notes.md#L66). Pass: launch-review ref opens same note; title/paragraphs/ordered priorities retained, formatted rendering closes in W8; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real note title/body and environment-access caption under D10/D11, plus the W4 chrome table.

### W6-T9. Calendar/Meetings compatibility and reconnect proof

- Source: tasks-calendar §5 TC14 calendar portion; meetings §5 M10.
- Mockup and region: 07/08 center; phone adaptation.
- Files: focused calendar/meeting route/service/atom integration tests; docs/user/workspace-spaces.md; calendar guidance in existing appropriate user page; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W6-T5, W6-T6, W6-T8.
- Decision state: default assumed, confirm D24. Common D24 applies to every task.
- Work and acceptance: Close menu/header/palette/keybinding/touch and environment/old-server/reconnect cases for this wave. Keep no-body summaries, lazy details and shared subscriptions. Preserve selected note/day through context and return.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Use event receipts/drains, two clients and scoped commands. Future primary pass captures 1280/1024/390 and separately records actual other-device/provider evidence; full note visuals wait for Wave 8. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [207,26,1073,774] at 1280x800; corrected inventory [gap-tasks-calendar.md:66-100](gap-tasks-calendar.md#L66). Pass: all agenda controls and same Tasks state persist through reconnect; Wave 8 note formatting remains explicit pending gate; V1 dark theme/font/2px criteria apply. Allowed live substitutions: only connected real sources, D05/D11 substitutions, plus the W4 chrome table.

## Wave 7: Read-only project Drive explorer

Goal: Supply one explicit project root and one reusable, paged explorer for every resource tab and later reply picker.

Mockups: 01-email-files.png, 02-communications-files.png, 03-tasks.png, 04-projects.png.

Spec acceptance: Compare right body at x953..1267: search y149, Project Drive breadcrumb y205, Type/People y229, Name/Modified y276, four folders/four Docs at 43px pitch and neutral live sharing copy. Demo choose/replace/clear root, nested folder/back, filter, sort, next page, list/grid and explicit link. No browsing action creates a link or Drive write.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-7-drive-explorer.md`. This file is a named handoff, not created or validated by this assignment.

### W7-T1. Explicit confirmed root and account designation

- Source: email-files §5 EF-05; communications §5 COMM-08 root portion.
- Mockup and region: 01..04: SynKEK root and Marketing context.
- Files: TOOLS; UI/ProjectTasks.tsx settings; apps/server/src/drive/DriveService.ts; packages/contracts/src/pulseDrive.ts and tests.
- Dependencies: W4-T0. No resource-frame prerequisite for config storage.
- Serial predecessors: W5-T4. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D14. Common D24 applies to every task.
- Work and acceptance: Store nullable root designation against an existing confirmed project-folder link and explicit Drive binding. Validate folder MIME; replace/clear, unlink/disconnect and stale binding keep honest state. No second relationship graph.
- Own test cycle: Test non-folder rejection, choose/replace/clear, root unlink, deleted project, late binding/reconnect and another-client config updates. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-04, box [953,192,314,185] at 1280x800; corrected inventory [gap-email-files.md:97-104](gap-email-files.md#L97). Pass: SynKEK root breadcrumb and Marketing blue linked-folder glyph, no selected/open-folder fill; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual root/account and confirmed folder links, no inferred sharing, plus the W4 chrome table.

### W7-T2. Paged child reads, scoped search and metadata filters

- Source: email-files §5 EF-06; communications §5 COMM-08 read portion.
- Mockup and region: 01..04: explorer data/search/filter/sort.
- Files: DRIVE; RPC only for new methods; scripted Drive API and contract/atom tests.
- Dependencies: W7-T1.
- Serial predecessors: W7-T1. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D14. Common D24 applies to every task.
- Work and acceptance: Extend current GET/read-only service with connection/parent/cursor/type/owner/date/sort. Bind cursor to scope/query/order; define root search coverage honestly. Handle shared drives/shortcuts explicitly; no body prefetch or implicit child binding.
- Own test cycle: Test escaped query, nested/empty root, more than one page, stable Name/Modified sorting, filter before paging, shared-drive ownerless metadata, 401/403/404/incomplete and late disconnect. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-04, box [953,149,314,485] at 1280x800; corrected inventory [gap-email-files.md:96-108](gap-email-files.md#L96). Pass: exact four folders/four Docs and dates, Type/People and Name/Modified ordering; metadata-only bounded reads; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real names/dates/MIME/owners and paged counts with same row geometry, plus the W4 chrome table.

### W7-T3. One explorer component across spaces

- Source: email-files §5 EF-07; communications §5 COMM-09; shell §5 S7 Files.
- Mockup and region: 01..04: complete resource Files body.
- Files: UI/ProjectDriveExplorer.tsx proposed; UI/DriveFiles.tsx; UI/WorkspaceToolsPanel.tsx; shared resource body mapping; focused explorer tests; docs/user/google-drive.md; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W7-T2, W4-T6.
- Decision state: default assumed, confirm D14, D11, D03. Common D24 applies to every task.
- Work and acceptance: Render folder breadcrumbs, scope-labelled search, filter/clear, sort, list/grid, pagination and read-only menus. Share openFiles handoff with mail/chat/task/project rows. Reuse explicit chosen-account reads and stable file refs; linked versus browsed states stay distinct. Under D29 the blue Marketing glyph means an existing confirmed project-folder link, not a selected/open folder. Fixture setup explicitly links Marketing to SynKEK in all 01-04 states; only confirmed linked folders are blue, with accessible Linked to project text. Browsing, focus and hover never confer that color. Live sharing sentence follows the W4 chrome table.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Navigate root/folder/back, compare list/grid actions and selection, stale root responses, older-server direct-file fallback, denied reads and touch menus. Review unseen grid state, then compare all four PNG bodies. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-04, box [953,149,314,527] at 1280x800; corrected inventory [gap-email-files.md:96-110](gap-email-files.md#L96). Pass: 43px rows, blue confirmed Marketing glyph, list selected, sharing line at y655 and root/back semantics; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual linked-folder emphasis and Files stay in Google Drive. live copy under D11, plus the W4 chrome table.

## Wave 8: Projects, Docs and PR resources

Goal: Match project cards and formatted note reading, add real comments and a bounded project PR collection without new project or PR identity models.

Mockups: 04-projects.png, 07-meetings-notes.png; all eight resource tab strips.

Spec acceptance: Compare 04 center cards/search/New project and 07 Docs card at x953/y178/w314/h345, true headings/list, next steps and comment divider around y536. Demo project card/dropdown agreement, create without opening Code, Notes & agenda to Docs, safe read/edit/revision, comment read and project PR open/unlink. PR-open content has no source PNG and requires a reviewed proposed capture. Roster/permission substitutions are recorded against D05/D11 rather than counted as exact production parity.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-8-projects-docs-prs.md`. This file is a named handoff, not created or validated by this assignment.

### W8-T1a. Persist bounded project descriptions in existing config

- Source: projects §5 P2.
- Mockup and region: 04: descriptions on the three project cards.
- Files: TOOLS; UI/ProjectTasks.tsx settings; forward migration; focused config tests.
- Dependencies: W4-T0. No resource-frame prerequisite for config storage.
- Serial predecessors: W7-T1. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D03, D05. Common D24 applies to every task.
- Work and acceptance: Add a bounded optional description to existing config. Preserve task/browser/root fields across old-client saves. This task owns storage only; W8-T1b is the decided separate batch overview read.
- Own test cycle: Test migration/default, set/clear, old save preservation and environment/project authorization. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 04, box [275,188,649,296] at 1280x800; corrected inventory [gap-projects-docs-prs.md:31-35](gap-projects-docs-prs.md#L31). Pass: three card descriptions and keyed connection metadata, no fabricated counts or roster; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real descriptions, directly linked channel totals, complete provider member count only under D26, plus the W4 chrome table.

### W8-T1b. One paged project overview read for cards

- Source: projects §5 P2.
- Mockup and region: 04: descriptions and truthful connection metadata.
- Files: TOOLS; RPC; packages/client-runtime/src/state/workspaceTools.ts; focused overview RPC/query tests.
- Dependencies: W8-T1a.
- Serial predecessors: W8-T1a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D03, D05, D26. Common D24 applies to every task.
- Work and acceptance: Add the batch overview RPC now, rather than leaving the shape conditional. Return at most 50 project summaries per page with projectId, description, confirmed Drive-root availability, directly linked channel count, optional source-reported member count and completeness flags. Cursor binds environment/filter/order. Use existing project/config/link records, never one full hub request per project or a new summary table. Existing listMany returns one merged link list at packages/contracts/src/pulseLinks.ts:252, insufficient for keyed per-card counts.
- Own test cycle: Test 51 projects, bounded query/request count, stable paging, dismissed links excluded, zero versus unavailable, incomplete provider membership, old-server fallback and isolated environments. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 04, box [275,188,649,296] at 1280x800; corrected inventory [gap-projects-docs-prs.md:31-35](gap-projects-docs-prs.md#L31). Pass: three card descriptions and keyed connection metadata, no fabricated counts or roster; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real descriptions, directly linked channel totals, complete provider member count only under D26, plus the W4 chrome table.

### W8-T2. Searchable project cards and explicit creation

- Source: projects §5 P3.
- Mockup and region: 04: x275..924 center, three 92px cards.
- Files: UI/ProjectsSpace.tsx; UI/ProjectsNav.tsx selection synchronization only; apps/web/src/hooks/useNewProject.ts reuse; focused UI tests.
- Dependencies: W8-T1b, W4-T6.
- Decision state: default assumed, confirm D01, D05. Common D24 applies to every task.
- Work and acceptance: Keep A12 dropdown, add Your projects, search/filter and New project. Selection keeps overview visible and retargets resources. Linked destination preserves shipped hub threads/tasks/direct and labelled one-hop items. Use openThread false.
- Own test cycle: Test title/description filter, real empty states, card/dropdown agreement, idempotent create recovery and native/touch menus. One-hop discovery never becomes context without confirmation. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 04, box [207,26,733,458] at 1280x800; corrected inventory [gap-projects-docs-prs.md:27-36](gap-projects-docs-prs.md#L27). Pass: Your projects/search/+ New project and three 92px cards, one selected, dropdown agrees; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual projects/descriptions/connection availability; no unsupported roster, plus the W4 chrome table.

### W8-T3a. Docs list and account-bound Drive reads

- Source: projects §5 P4; meetings §5 M7 Drive portion.
- Mockup and region: 07: document identity and inline reading card.
- Files: UI/WorkspaceDocsPanel.tsx proposed; UI/DriveFiles.tsx; DRIVE atoms/bindings; focused read tests.
- Dependencies: W4-T4a, W7-T2.
- Decision state: default assumed, confirm D10. Common D24 applies to every task.
- Work and acceptance: List confirmed project documents and labelled discovery. Bind the explicitly chosen Drive account before reading and expose a stable document-selection interface. Plain text is intermediate until W8-T4. Drive admission is independent of native notes and Calendar.
- Own test cycle: Test pasted/search identity, unsupported MIME, no automatic account, stale project/account response, bounded continuation, unlink and discovery granting no read. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 07, box [953,145,314,378] at 1280x800; corrected inventory [gap-projects-docs-prs.md:48-58](gap-projects-docs-prs.md#L48). Pass: same stable doc identity and inline card, correct Docs selection, no automatic account; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real chosen Drive/native document and supported access wording, plus the W4 chrome table.

### W8-T3b. Native-note entrance in the shared Docs panel

- Source: projects §5 P4; meetings §5 M7 native portion.
- Mockup and region: 07: Notes & agenda selects the inline note.
- Files: UI/WorkspaceDocsPanel.tsx proposed; NOTES bindings; meeting selection handoff tests.
- Dependencies: W8-T3a, W6-T8.
- Serial predecessors: W8-T4. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D10. Common D24 applies to every task.
- Work and acceptance: Plug native workspace-note refs into the same selection interface and card. Keep Drive refs intact and preserve the explicit plain-note intermediate state until W8-T4 is available. Native admission does not gate Drive reading.
- Own test cycle: Test meeting-to-note/back, direct note URL, deleted note, account-independent native read and resource-project changes without stale repaint. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 07, box [953,145,314,378] at 1280x800; corrected inventory [gap-projects-docs-prs.md:48-58](gap-projects-docs-prs.md#L48). Pass: same stable doc identity and inline card, correct Docs selection, no automatic account; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real chosen Drive/native document and supported access wording, plus the W4 chrome table.

### W8-T4. Shared safe formatted document and note renderer

- Source: projects §5 P5; meetings §5 M7; shell §5 S8 Docs.
- Mockup and region: 07: complete note card/title/headings/list/next steps.
- Files: UI/WorkspaceDocContent.tsx proposed; UI/WorkspaceDocsPanel.tsx; NOTES rendering; DRIVE typed/export read only if required; focused semantic/safety tests.
- Dependencies: W8-T3a. Native edit integration applies when W6-T7/W8-T3b are admitted; it never gates Drive rendering.
- Serial predecessors: W8-T3a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D10, D11. Common D24 applies to every task.
- Work and acceptance: Use one renderer for native bounded Markdown and typed safe provider blocks/export. Do not infer headings from plain text or execute provider HTML. Preserve plain-text MCP compatibility, bounded continuation and unsupported structure notices. Native edit/save/cancel uses W6-T7 revisions; Drive edit opens provider.
- Own test cycle: Test exact fixture paragraphs and ordered list, malicious markup, unsupported blocks, late rebind, UTF-8 bounds and old-server fallback. Compare title/line spacing/card scrolling to 07. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07, box [953,178,314,345] at 1280x800; corrected inventory [gap-projects-docs-prs.md:55-61](gap-projects-docs-prs.md#L55). Pass: title, introduction wrap, headings, ordered list and next steps match, safe semantic renderer; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real bounded note/document content; unavailable structure disclosed, plus the W4 chrome table.

### W8-T5. Native note comments with explicit author semantics

- Source: meetings §5 M8 native portion.
- Mockup and region: 07: Comments · 1, NP avatar and wrapped text.
- Files: NOTES; UI/WorkspaceDocsPanel.tsx; focused comment RPC/service/interaction tests.
- Dependencies: W6-T7, W8-T4, W5-T3.
- Serial predecessors: W8-T1b, W8-T3b. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D11, D05. Common D24 applies to every task.
- Work and acceptance: Page native note comments under existing environment access. If create/delete is confirmed, label author as environment owner, not a distinct authenticated coworker; use request idempotency and change stream. Source-labelled comments never mix with provider comments. No project roles.
- Own test cycle: Test count/page agreement, replay, delete constraints, revocation, two-client updates and comments omitted from default agent body. Fixture NP requires a marked sample; live copy identifies actual authority. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07, box [953,536,314,74] at 1280x800; corrected inventory [gap-meetings-notes.md:73-74](gap-meetings-notes.md#L73). Pass: Comments · 1, NP 19px avatar and two-line comment match; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual owner attribution/comment count/text, D05/D11 environment author, plus the W4 chrome table.

### W8-T6. Read-only provider comments and supported sharing metadata

- Source: projects §5 P6; meetings §5 M8 provider portion.
- Mockup and region: 07: comments below card and sharing line; 01..04 footer.
- Files: DRIVE; RPC for optional read capability; UI/WorkspaceDocsPanel.tsx; explorer sharing display; focused API/permission tests.
- Dependencies: W8-T4, W7-T2. Serial predecessor W8-T5 applies only when that native-comment task is admitted.
- Serial predecessors: W8-T5. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D11, D14. Common D24 applies to every task.
- Work and acceptance: Verify approved Google operation/scope support before implementation; read bounded comments/permission metadata only where supported. Report unavailable/incomplete count honestly. Add no comment/resolve/share writes or permission grants.
- Own test cycle: Test zero/one/multiple pages, unknown authors, denied scopes, partial sharing count, project/account switch and no write requests. Unavailable provider support blocks this task's exact parity, not native notes or other tabs. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07; 01-04, box [953,197,314,413; 953,654,314,22] at 1280x800; corrected inventory [gap-projects-docs-prs.md:56-64](gap-projects-docs-prs.md#L56). Pass: sharing caption and separate comment divider/count use supported metadata, no provider-write control; V1 dark theme/font/2px criteria apply. Allowed live substitutions: provider comments/authors/counts only when available and complete; otherwise unavailable caption, plus the W4 chrome table.

### W8-T7. Linked project PR collection and existing detail viewer

- Source: projects §5 P7; shell §5 S8 PRs.
- Mockup and region: all: PRs tab; PR body unseen.
- Files: UI/WorkspacePullRequestsPanel.tsx proposed; packages/client-runtime/src/projectPullRequests.ts proposed; UI/ThreadWorkspaceLinks.tsx; apps/web/src/hooks/usePullRequestLinking.ts; existing pullRequest row/detail primitives and tests.
- Dependencies: W4-T5, W8-T2.
- Decision state: default assumed, confirm D23. Common D24 applies to every task.
- Work and acceptance: Compose owned/explicitly linked thread PRs and direct project URL links, dedup host/repo/number with all provenance. Reuse native snapshots, stack dismissal and source-specific unlink/watch. Label incomplete collection; repository browse remains separate. Selection never starts work or merges/reviews.
- Own test cycle: Test duplicate native/direct edges, unlink one preserves others, legacy fallback, auth/capability absence, disconnected source and stale environment. Review PR-open design before acceptance; retain Code behavior. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01-08, box [1222,85,45,43] at 1280x800; corrected inventory [gap-projects-docs-prs.md:66-70](gap-projects-docs-prs.md#L66). Pass: PRs icon/label/order match; PR-open is a separately reviewed proposed body, never original parity; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual PR titles/state/provenance; unknown checks remain unavailable, plus the W4 chrome table.

### W8-T8. Truthful people, sharing and project resource integration

- Source: projects §5 P8 default substitution; meetings §5 M10 notes portion; shell §5 S7/S8 body wiring.
- Mockup and region: 04 roster/connection region; 07 sharing/comments; all tabs.
- Files: UI/ProjectsSpace.tsx; UI/WorkspaceDocsPanel.tsx; resource body mapping and focused integration tests; docs/user/workspace-spaces.md; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W8-T2, W8-T4, W8-T7, W7-T3, plus each admitted W8-T3b/T5/T6 branch. Unavailable provider metadata is an explicit recorded departure, not a gate on native notes or other tabs.
- Serial predecessors: W8-T6. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D05, D06, D11, D24. Common D24 applies to every task.
- Work and acceptance: Default live UI omits unsupported roster/roles/follower promises and uses known provider statements or environment-access wording. Record exact departures; W12-T6/T8 hold optional full roster/followers. Wire existing module bodies without recreating shell state.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Exercise project-to-doc-to-PR/back and note/account errors without losing center selection; no body fetch for inactive tabs. Future primary pass compares 04/07, phone sheet and reconnect; note render/comments now close Wave 6 visual dependency. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 04; 07, box [275,188,649,459; 953,145,314,465] at 1280x800; corrected inventory [gap-projects-docs-prs.md:31-35](gap-projects-docs-prs.md#L31), [gap-projects-docs-prs.md:48-70](gap-projects-docs-prs.md#L48). Pass: project-doc-PR selection stable, note card/comment match; sample roster isolated; V1 dark theme/font/2px criteria apply. Allowed live substitutions: live roster omitted until W12-T6, no followers; supported sharing only D05/D06/D11, plus the W4 chrome table.

## Wave 9: Communications and shared saved items

Wave 9 cut order, if the bounded link-model delivery grows too large: cut the known-read-marker implementation in W9-T8 first and omit unread numbers/filter honestly, while retaining its final integration/documentation gate under the same ID; cut W9-T3a/b/c Discord server parity second while retaining its existing desktop path; then cut W9-T2b/T4 DM exposure and record D27's departure. Keep at least one accepted reader, stable refs, explicit links, bounded selected-message reads, stream/open/back and shared saved refs. Do not expand into reactions, presence, administration, search indexing or a full chat replacement. The wave gate demonstrates every admitted connector, never requires both independent confirmations. Browser/Agents implementation is independent; the full 05/06 conversation composite waits for W9-T5 only at screenshot integration.

Goal: Render one linked conversation stream with bounded server readers and truthful known-message unread/saved state. Preserve desktop sends and A9 bot boundaries.

Mockups: 02-communications-files.png, 05-browser-module.png, 06-agents-module.png.

Spec acceptance: Compare x259/429 list/stream boundary, marketing groups, 30px avatars, 260x53 document card, chronological messages/replies and composer at x442/y687/w485/h100. Demo each independently accepted reader, exact-message actions, replies distinct from agent threads, Drive handoff and shared Later. Remote send is read-only under the default; desktop acknowledged human sends remain. Telegram remains paired bot received-only unless W12-T7 is confirmed. This is a recorded functional departure from the sample composer.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-9-communications.md`. This file is a named handoff, not created or validated by this assignment.

### W9-T1. Stable conversation/message endpoints and Teams URL handoff

- Source: communications §5 COMM-01; COMM-00 decisions.
- Mockup and region: 02/05/06: selected channel, message/file actions.
- Files: packages/contracts/src/communications.ts; OPENERS; UI/ChatCommunicationsWorkspace.tsx; focused identity/action tests.
- Dependencies: W4-T5.
- Decision state: default assumed, confirm D18, D19, D20. Common D24 applies to every task.
- Work and acceptance: Use versioned provider-resource connection/workspace/conversation/message IDs, preserving Slack timestamp bytes. Teams uses existing URL refs and external open. Legacy-only sources disclose remote unavailability.
- Own test cycle: Test colliding IDs, clicked-row capture after selection changes, origin-preserving relink, same-environment drag, foreign drop refusal and unsupported source reason. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [259,26,681,52; 484,201,260,53] at 1280x800; corrected inventory [gap-communications.md:74-83](gap-communications.md#L74). Pass: same captured marketing/message/doc endpoints through actions, no resting pixel additions; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual source/account/channel/title and unavailable Teams read state, plus the W4 chrome table.

### W9-T2a. Slack server connection and secrets

- Source: communications §5 COMM-02.
- Mockup and region: 02/05/06: provider availability, connection UI unseen.
- Files: apps/server/src/communications/SlackConnection.ts and SlackAccountStore.ts, both proposed; proposed packages/contracts/src/pulseCommunications.ts; server secrets; RPC; forward migration; focused account tests.
- Dependencies: W9-T1.
- Serial predecessors: W9-T7. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D18-S. Common D24 applies to every task.
- Work and acceptance: Own explicit server connection, health, revoke/disconnect and Slack token/account permissions. Server RPC contracts are new in pulseCommunications.ts; communications.ts is existing desktop IPC and has no server RPC group. Reuse pure RestChatAdapter boundary code only where it avoids duplication; preserve desktop accounts and behavior. No send or history sync.
- Own test cycle: Test denied credentials/permissions, connect/disconnect/restart, secret redaction and legacy desktop behavior if shared extraction changes it. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [259,26,681,52] at 1280x800; corrected inventory [gap-communications.md:74-77](gap-communications.md#L74). Pass: provider header uses explicit connection identity; new setup states reviewed, no fictitious membership; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual provider/connection, Discord bot label and absent unsupported counts, plus the W4 chrome table.

### W9-T2b. Slack paged channel, history and reply reads

- Source: communications §5 COMM-02.
- Mockup and region: 02/05/06: channels, selected stream and provider replies.
- Files: apps/server/src/communications/SlackReader.ts proposed; proposed pulseCommunications.ts; shared atoms; RPC; scripted read tests.
- Dependencies: W9-T2a.
- Serial predecessors: W9-T2a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D18-S. Common D24 applies to every task.
- Work and acceptance: Provide bounded native-cursor channel/history/reply reads and source health. Retain Slack timestamp bytes and list only existing DMs exposed by the chosen approved connection under D27; do not request personal history scopes or create DMs. Read the open conversation/reply only on demand or explicit Refresh. Max 100 messages per page, one in-flight refresh for that open endpoint, no timer/polling/webhook deployment or all-channel history scan. A 429 reports retry availability and honors Retry-After on the next explicit request.
- Own test cycle: Test native cursors, oldest-page anchor, permission changes, 429/cancel/disconnect and old-server absence. Assert list opening causes zero per-channel history calls and advancing time causes no request; explicit Refresh stays bounded. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [259,78,681,480] at 1280x800; corrected inventory [gap-communications.md:50-95](gap-communications.md#L50). Pass: bounded same grouped list, chronological page and supplied replies without added loading animation; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual messages/channels/times, approved Slack DMs only, Discord omits DMs, plus the W4 chrome table.

### W9-T2c. Slack exact linked reads and provider turn labels

- Source: communications §5 COMM-02; COMM-01.
- Mockup and region: 02/05/06: exact message context, no added resting controls.
- Files: apps/server/src/mcp/toolkits/workspace/handlers.ts and tools.ts; apps/server/src/workspace/linkedItemsContext.ts; linkedItemsContext.test.ts; linkedItemsTurn.integration.test.ts; Slack reader exact-read tests.
- Dependencies: W9-T2b.
- Serial predecessors: W9-T2b. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D18-S. Common D24 applies to every task.
- Work and acceptance: After resolveLinked access, read exactly the confirmed Slack message with bounded continuation. Render a provider/type label and sanitized bounded title/summary in the common linked-items block for every provider. Saving a ref is not a grant. Reuse ProviderTurnStartService without adapter-specific context.
- Own test cycle: Test guessed/cross-channel IDs, revoked links, deleted/unavailable messages, byte budgets and hostile titles. Run the linkedItemsTurn integration through fake providers and verify typed labels, bounds, retained-chip grants and unchanged stored user text. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [445,137,482,421] at 1280x800; corrected inventory [gap-communications.md:79-92](gap-communications.md#L79). Pass: exact selected message/ref preserved, no new resting controls; typed provider context verified at service boundary; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual sanitized titles/summaries; unavailable linked items explicit, plus the W4 chrome table.

### W9-T3a. Discord server connection and secrets

- Source: communications §5 COMM-03.
- Mockup and region: 02/05/06: provider availability, connection UI unseen.
- Files: apps/server/src/communications/DiscordConnection.ts and DiscordAccountStore.ts, both proposed; proposed packages/contracts/src/pulseCommunications.ts; server secrets; RPC; forward migration; focused account tests.
- Dependencies: W9-T1.
- Serial predecessors: W9-T2c. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D18-D. Common D24 applies to every task.
- Work and acceptance: Own explicit server connection, health, revoke/disconnect and Discord bot-only token, guild permissions and no personal inbox. Server RPC contracts are new in pulseCommunications.ts; communications.ts is existing desktop IPC and has no server RPC group. Reuse pure RestChatAdapter boundary code only where it avoids duplication; preserve desktop accounts and behavior. No send or history sync.
- Own test cycle: Test denied credentials/permissions, connect/disconnect/restart, secret redaction and legacy desktop behavior if shared extraction changes it. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [259,26,681,52] at 1280x800; corrected inventory [gap-communications.md:74-77](gap-communications.md#L74). Pass: provider header uses explicit connection identity; new setup states reviewed, no fictitious membership; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual provider/connection, Discord bot label and absent unsupported counts, plus the W4 chrome table.

### W9-T3b. Discord paged channel, history and reply reads

- Source: communications §5 COMM-03.
- Mockup and region: 02/05/06: channels, selected stream and provider replies.
- Files: apps/server/src/communications/DiscordReader.ts proposed; proposed pulseCommunications.ts; shared atoms; RPC; scripted read tests.
- Dependencies: W9-T3a.
- Serial predecessors: W9-T3a. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D18-D. Common D24 applies to every task.
- Work and acceptance: Provide bounded native-cursor channel/history/reply reads and source health. Keep guild/channel/thread IDs and bot view/history overwrites; omit DMs. Read the open conversation/reply only on demand or explicit Refresh. Max 100 messages per page, one in-flight refresh for that open endpoint, no timer/polling/webhook deployment or all-channel history scan. A 429 reports retry availability and honors Retry-After on the next explicit request.
- Own test cycle: Test native cursors, oldest-page anchor, permission changes, 429/cancel/disconnect and old-server absence. Assert list opening causes zero per-channel history calls and advancing time causes no request; explicit Refresh stays bounded. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [259,78,681,480] at 1280x800; corrected inventory [gap-communications.md:50-95](gap-communications.md#L50). Pass: bounded same grouped list, chronological page and supplied replies without added loading animation; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual messages/channels/times, approved Slack DMs only, Discord omits DMs, plus the W4 chrome table.

### W9-T3c. Discord exact linked reads and provider turn labels

- Source: communications §5 COMM-03; COMM-01.
- Mockup and region: 02/05/06: exact message context, no added resting controls.
- Files: apps/server/src/mcp/toolkits/workspace/handlers.ts and tools.ts; apps/server/src/workspace/linkedItemsContext.ts; linkedItemsContext.test.ts; linkedItemsTurn.integration.test.ts; Discord reader exact-read tests.
- Dependencies: W9-T3b.
- Serial predecessors: W9-T3b. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D18-D. Common D24 applies to every task.
- Work and acceptance: After resolveLinked access, read exactly the confirmed Discord message with bounded continuation. Render a provider/type label and sanitized bounded title/summary in the common linked-items block for every provider. Saving a ref is not a grant. Reuse ProviderTurnStartService without adapter-specific context.
- Own test cycle: Test guessed/cross-channel IDs, revoked links, deleted/unavailable messages, byte budgets and hostile titles. Run the linkedItemsTurn integration through fake providers and verify typed labels, bounds, retained-chip grants and unchanged stored user text. Apply the focused test contract above.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [445,137,482,421] at 1280x800; corrected inventory [gap-communications.md:79-92](gap-communications.md#L79). Pass: exact selected message/ref preserved, no new resting controls; typed provider context verified at service boundary; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual sanitized titles/summaries; unavailable linked items explicit, plus the W4 chrome table.

### W9-T4. Conversation navigation, groups and header

- Source: communications §5 COMM-04.
- Mockup and region: 02/05/06: sub-rail, list x259..429, header.
- Files: UI/CommunicationsWorkspace.tsx; UI/ChatCommunicationsWorkspace.tsx; UI/TelegramWorkspace.tsx; ROUTES and focused tests.
- Dependencies: W9-T1, W4-T6 for implementation with fakes. Release needs any one accepted reader: W9-T2b OR W9-T3b OR existing paired Telegram/desktop. Each additional reader plugs in independently.
- Decision state: default assumed, confirm D18, D19, D20, D17. Common D24 applies to every task.
- Work and acceptance: Use shell rail slots, real connection/channel labels, loaded-results search and defined provider/type filters. Group GENERAL channels, confirmed project channels and DIRECT MESSAGES separately. Under D27 render existing provider-supplied DMs for an explicitly approved Slack connection, using real initials/names and stable conversation IDs; bot-only Discord and Telegram show no DM group. Clicking a DM uses the same read/link/reply path and never opens a new DM. Under D26 append N members only when reported for that selected channel with completeness/freshness; hide the fragment when unsupported, never infer 8 from loaded rows. Group projects only from confirmed links; retain exact Telegram URLs and bot-history limits. Unread/Later activate when W9-T7/T8 are ready.
- Own test cycle: Test provider/account/channel/back transitions, stale selection, keyboard/phone Back and missing-capability no-RPC behavior. Match group spacing without fabricated counts. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [207,26,733,506] at 1280x800; corrected inventory [gap-communications.md:50-77](gap-communications.md#L50). Pass: GENERAL/SynKEK/DIRECT MESSAGES grouping, three DM initials rows and header 8 members in sample; V1 dark theme/font/2px criteria apply. Allowed live substitutions: source-reported member count only D26, Slack approved DM rows only D27, bot groups omitted, plus the W4 chrome table.

### W9-T5. Chronological stream, provider replies and document cards

- Source: communications §5 COMM-05, COMM-10 module portion.
- Mockup and region: 02/05/06: x445..927 stream and replies.
- Files: UI/ChatCommunicationsWorkspace.tsx; UI/TelegramWorkspace.tsx; shared message/card helpers as needed; UI/DriveFiles.tsx reuse; resource open handoffs/tests.
- Dependencies: W9-T4, W7-T3, W8-T3a.
- Serial predecessors: W9-T4. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D02, D18, D20. Common D24 applies to every task.
- Work and acceptance: Show inert text, real date/author/time, received media limits and supplied reply counts. Replies use center subview/back rather than a competing right resource panel. Files open shared Docs/Files without auto-bind/link; exact message remains action source.
- Own test cycle: Test older-page anchor/order, edited-ID replacement, safe text, real reply counts, Drive file identity, two-project context, phone reply/context Back and no action target drift. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [445,98,482,460] at 1280x800; corrected inventory [gap-communications.md:78-92](gap-communications.md#L78). Pass: 30px avatars, date divider, four messages, 260x53 doc card and 2 replies match; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real author/time/text/reply count and file identity; same spacing rules, plus the W4 chrome table.

### W9-T6. Composer layout with acknowledged desktop send

- Source: communications §5 COMM-06.
- Mockup and region: 02/05/06: bottom composer and plus action.
- Files: UI/ChatCommunicationsWorkspace.tsx composer; UI/TelegramWorkspace.tsx received-only state; focused composer tests.
- Dependencies: W9-T5.
- Serial predecessors: W9-T5. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D18, D20, D16. Common D24 applies to every task.
- Work and acceptance: Keep existing nonce/ACK send path on authorized desktop, explicit destination and reply cancellation. Remote Slack/Discord remain read-only pending W12-T9/T10. Plus opens a small paste-URL action with validation, insert/cancel and an honest link-only label. It inserts supported canonical URLs into the captured draft; no explorer picker dependency or upload. W11-T7 may later reuse a picker for Mail only. Demo send stays fixture-only.
- Own test cycle: Test Enter/Shift+Enter/IME, failure keeps text, duplicate click, changed destination invalidates attempt and unknown outcome avoids automatic POST retry. Capture resting/pending/error and truthful remote fallback. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [442,687,485,100] at 1280x800; corrected inventory [gap-communications.md:93-97](gap-communications.md#L93). Pass: composer/plus/Send demo sample geometry, paste-link insert/cancel reviewed; no picker promise; V1 dark theme/font/2px criteria apply. Allowed live substitutions: desktop Send and truthful remote read-only wording, captured destination and draft text, plus the W4 chrome table.

### W9-T7. Cross-device saved item references for Later

- Source: communications §5 COMM-07 saved portion; email-files §5 EF-03 store portion.
- Mockup and region: 02/05/06 and 01: Later rail/menu.
- Files: packages/contracts/src/pulseWorkspaceSavedItems.ts proposed; apps/server/src/workspace/WorkspaceSavedItems.ts proposed; shared runtime atoms; RPC; forward migration and focused service tests; apps/server/src/workspace/linkedItemsContext.ts; apps/server/src/workspace/linkedItemsContext.test.ts; apps/server/src/workspace/linkedItemsTurn.integration.test.ts; inspect apps/server/src/orchestration-v2/ProviderTurnStartService.ts:1052 integration.
- Dependencies: W9-T1; existing mail stable refs.
- Serial predecessors: W9-T1. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D17. Common D24 applies to every task.
- Work and acceptance: Use one small environment-owned saved-key collection for supported chat/mail refs, not another relationship graph or body cache. Explicit add/remove/list/change; idempotent requests and opt-in import of legacy local saved refs. No snooze/wake job. Store refs only, so saved state neither grants a body read nor adds an item to provider context; dispatch the underlying ref through its existing typed reader/label when it is also confirmed linked.
- Own test cycle: Test two-client save/remove, moved mail, unavailable original removable, account/environment collisions, reconnect and no automatic agent grants. Verify a typed provider label, sanitized bounded summary and confirmed-resource-only read through linkedItemsTurn.integration.test.ts. Saving alone adds no provider context. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01/02/05/06, box [207,143,52,45] at 1280x800; corrected inventory [gap-communications.md:54-68](gap-communications.md#L54). Pass: Later label/icon retained; save/remove same stable ref without body copy or read grant; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual saved refs and unavailable originals, no snooze label, plus the W4 chrome table.

### W9-T8. Known-message read markers and final Communications wiring

- Source: communications §5 COMM-07 read portion, COMM-11.
- Mockup and region: 02/05/06: Unread and count 3.
- Files: communications contracts; apps/server/src/communications/ReadMarkers.ts and ReadMarkerStore.ts, both proposed; shared atoms; rail/message menus; docs/user/communications.md if existing, otherwise existing workspace guide; focused tests; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W9-T4, W9-T7.
- Serial predecessors: W9-T3c, W9-T6. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D17, D18, D24. Common D24 applies to every task.
- Work and acceptance: Unread means known messages after Pulse-local read marker, not provider read synchronization. Define count as known unread messages only for channels whose recent message page is already loaded. Unloaded channels show no number; opening the list must issue zero per-channel history requests. Never scan every channel for counts, and keep zero distinct from unknown. Mark read/unread reversibly and wire Later to saved refs; member-count presence follows D26 and is unrelated to Pulse-local unread markers.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Test two clients, older-page loads do not inflate unread, identical provider IDs, offline/reconnect and no data mutation from filter selection. Assert list opening performs no per-channel history fanout, stale pages do not claim freshness and only explicit Refresh requests new open-channel messages. Future primary compares 02 and captures read-only/error/390px states. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [207,89,222,223] at 1280x800; corrected inventory [gap-communications.md:55-68](gap-communications.md#L55). Pass: known count 3 only for loaded sample marketing page; Unread/Later reversible, unloaded channels unnumbered; V1 dark theme/font/2px criteria apply. Allowed live substitutions: known loaded unread counts only, unsupported member count omitted D26, plus the W4 chrome table.

## Wave 10: Browser and project agents

Goal: Put existing desktop preview inside the resource body and show project agents as confirmed linked threads with real status.

Mockups: 05-browser-module.png, 06-agents-module.png.

Spec acceptance: Compare 05 address pill y149 and website card x953/y191/w314, using a controlled site fixture; compare 06 Project agents with 29px monograms, 85px row pitch, static status dots and Open conversation links. Correct selected tabs to Browser and Agents. Demo desktop session survival across Code/Workspace, web external fallback, explicit URL link/unlink, thread assignment/open/unassign and no paid run from merely opening a tab.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-10-browser-agents.md`. This file is a named handoff, not created or validated by this assignment.

### W10-T1. Inline desktop Browser using existing preview lease

- Source: browser-agents §5 BA-2; shell §5 S7 Browser.
- Mockup and region: 05: Browser address/site body.
- Files: UI/WorkspaceToolsPanel.tsx; UI/WorkspaceBrowser.tsx proposed extraction; apps/web/src/components/preview/PreviewPanel.tsx and chrome only if needed; browser lease/open helper tests.
- Dependencies: W4-T6.
- Decision state: default assumed, confirm D21. Common D24 applies to every task.
- Work and acceptance: Reuse configured project Browser thread, profile/session/navigation/error paths and BrowserSurfaceSlot. Replace modal-only presentation with resource body, optional enlarge; retain session on tab switch and never visibly lease same guest twice.
- Own test cycle: Test redirects/title, resize, resource switch and Code/Workspace return with one session; missing thread and load failure. Compare controlled site composition, not production hardcoded SynKEK content. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 05, box [953,149,314,354] at 1280x800; corrected inventory [gap-browser-agents.md:55-67](gap-browser-agents.md#L55). Pass: address pill, 314px site card, two-line heading, comma-correct body and CTA; Browser selected under D03; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual desktop page content only in live mode, controlled site fixed in fixture, plus the W4 chrome table.

### W10-T2. Truthful web and phone external-tab Browser

- Source: browser-agents §5 BA-3.
- Mockup and region: 05: approved web/phone substitute for site card.
- Files: UI/WorkspaceBrowser.tsx; existing external-open helper if needed; focused interaction tests; docs/user/workspace-spaces.md.
- Dependencies: W10-T1, W4-T6.
- Serial predecessors: W10-T1. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D21, D24. Common D24 applies to every task.
- Work and acceptance: Use same address chrome plus explicit external-tab guidance and Link target. Direct user gesture opens valid URL; do not infer external navigation or add arbitrary iframes/proxy/extension.
- Own test cycle: Test invalid address, blocked open and retry, paste-current-address behavior, 390/1024 sheet/back and no overflow. External navigation is never presented as observed. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 05, box [953,149,314,354] at 1280x800; corrected inventory [gap-browser-agents.md:60-67](gap-browser-agents.md#L60). Pass: same address chrome with reviewed external-tab substitute; no iframe or claimed observed navigation; V1 dark theme/font/2px criteria apply. Allowed live substitutions: web/phone external-open guidance per D21, plus the W4 chrome table.

### W10-T3. Captured page actions and linked-page search

- Source: browser-agents §5 BA-4.
- Mockup and region: 05: Search or enter a URL and compact actions.
- Files: UI/WorkspaceBrowser.tsx; UI/useWorkspaceItemOpener.ts; UI/WorkspaceItemActions.tsx only shared gaps; existing links picker/state and focused tests.
- Dependencies: W10-T1, W10-T2, W4-T5.
- Serial predecessors: W10-T2. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D21, D22. Common D24 applies to every task.
- Work and acceptance: Search current project's linked page titles/URLs locally, open valid pasted URLs, link captured active desktop URL/title or explicitly pasted web URL. Reuse work actions; navigation never auto-confirms. Workspace URL reader continues metadata-only.
- Own test cycle: Test navigation during link action, reverse-pair dedup, relink origin, second-client updates, context-chip removal and desktop/external opener. Internet search/page extraction/cookie transfer are excluded defaults. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 05, box [953,149,314,29] at 1280x800; corrected inventory [gap-browser-agents.md:60-67](gap-browser-agents.md#L60). Pass: pill preserved, restrained proposed captured-page actions reviewed outside website CTA; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual captured URL/title and current project linked-page results, plus the W4 chrome table.

### W10-T4. Project agents as real linked-thread cards

- Source: browser-agents §5 BA-5, BA-6; shell §5 S7 Agents.
- Mockup and region: 06: Project agents heading, rows and statuses.
- Files: UI/WorkspaceAgents.tsx proposed extraction; UI/WorkspaceToolsPanel.tsx; existing thread-shell/link state; focused tests; workspace user guide; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W4-T5, W4-T6.
- Serial predecessors: W10-T3. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D22, D24. Common D24 applies to every task.
- Work and acceptance: List explicit project-thread links, live thread title as role, derived initials and truthful activity. Keep Link existing thread/Start thread in restrained menu; unassign removes only project link. No Agent/persona table or LLM status generation.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Test linked versus merely owned thread, deleted/unavailable state, live shell updates without transcripts, correct environment open and unassign preserving thread. Future primary verifies both PNGs plus Code/browser lifetime and compact return. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 06, box [953,149,314,309] at 1280x800; corrected inventory [gap-browser-agents.md:69-81](gap-browser-agents.md#L69). Pass: Project agents, 29px monograms, 85px row pitch, static status and Open conversation links; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real linked thread title/initials/status; no generated role/status claims, plus the W4 chrome table.

## Wave 11: Email reading and reply polish

Goal: Match the inbox/reader/reply composition while retaining stable mail references, conversations and exact-send approval.

Mockups: 01-email-files.png.

Spec acceptance: Compare 01 170px list, compact sender/time/preview/chips, subject y142, 29px sender avatar, body spacing, related Marketing folder card x449/y518 and reply box x449/y591/w471/h143. Fix selected Maya/Nina disagreement. Demo typed filters, moved-message star, Later save/remove, folder navigation, manual review/approve/decline/edit and Drive link insertion. Live action is Review reply; required exact approval and link-only attachment are declared departures from demo copy.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-11-email-polish.md`. This file is a named handoff, not created or validated by this assignment.

### W11-T1. Bounded presentation metadata and typed mail filters

- Source: email-files §5 EF-01.
- Mockup and region: 01: list previews/sender/time and reply addressing data.
- Files: MAIL; apps/server/src/mail/MailImapRead.ts; MailReadRpc and fake IMAP tests.
- Dependencies: W4-T0. Shared shell is not a prerequisite for the server metadata work.
- Decision state: default assumed, confirm D15, D17. Common D24 applies to every task.
- Work and acceptance: Expose structured addresses/reply headers, bounded preview and shared unseen/from/date/flag filters for messages/conversations. Preserve text/cursor compatibility and new-capability fallback. Extend the existing header-page FETCH at `apps/server/src/mail/MailImapRead.ts:283` with partial `BODY.PEEK[TEXT]<0.N>` in that same request, using the installed IMAP client's partial-body option after checking it. Bound N to 4096 bytes per message, decode safely and report missing/unsupported snippets. No full MIME or second per-message round trip.
- Own test cycle: Test filter before paging in both modes, bounded snippets, comma names, missing preview and malicious text. Capture query/request bounds as well as visible result. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01, box [259,87,170,591] at 1280x800; corrected inventory [gap-email-files.md:35-50](gap-email-files.md#L35). Pass: five compact sender/time/preview/project rows, corrected Nina selection; preview fetch changes no extra controls; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real safe bounded preview/sender/date and project chips, plus the W4 chrome table.

### W11-T2. Stable-reference mail flag mutation

- Source: email-files §5 EF-02.
- Mockup and region: 01: reader star x891/y107 and unread state.
- Files: MAIL; apps/server/src/mail/MailImapWrite.ts; RPC; shared mail invalidation and focused tests.
- Dependencies: W11-T1.
- Serial predecessors: W11-T1. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D17. Common D24 applies to every task.
- Work and acceptance: Expose operate-scoped seen/flagged desired-state updates through shared writer after re-finding original by Message-ID/current location. Refresh all affected same-environment list/conversation/reader queries.
- Own test cycle: Test star/unstar/read/unread, archive move, UIDVALIDITY change, foreign message protection, revoked grant and failed-write honest state. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01, box [884,99,37,20] at 1280x800; corrected inventory [gap-email-files.md:58-62](gap-email-files.md#L58). Pass: unfilled reader star at rest, desired-state star/unstar and seen state honest; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual flag state and sender identity, plus the W4 chrome table.

### W11-T3. Inbox/Unread/Later rail and enriched mail rows

- Source: email-files §5 EF-03 UI portion, EF-04.
- Mockup and region: 01: x207..429 rail/search/list.
- Files: UI/mail/MailNav.tsx; MailSpace.tsx; MailMessageList.tsx; MailConversationList.tsx; mailItemRef.ts; mailReadState.ts; focused UI tests.
- Dependencies: W11-T1, W11-T2, W9-T7, W4-T6.
- Decision state: default assumed, confirm D17, D03. Common D24 applies to every task.
- Work and acceptance: Use shared saved service for Later, IMAP unseen for Unread and retain real folders/accounts, conversations toggle, refresh and more pages. Batch keyed visible-page project chips; extend existing listMany response only if needed, no per-row requests/model calls.
- Own test cycle: Test save/remove/moved mail, query clear/reset, account selection reset, chip attribution/open, old-server fallback and row/menu action identity. Compare corrected selected sender and row density. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01, box [207,26,222,774] at 1280x800; corrected inventory [gap-email-files.md:35-50](gap-email-files.md#L35). Pass: Inbox/Unread/Later, search, five rows/chips and corrected selected Nina sender match; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real mail/folders/unseen/saved state, actual sender/time/previews, plus the W4 chrome table.

### W11-T4. Compact reader and explicit related-folder handoff

- Source: email-files §5 EF-08.
- Mockup and region: 01: x449..920 subject/sender/body/Marketing card.
- Files: UI/mail/MailMessageView.tsx; MailSpace.tsx; OPENERS; confirmed-link helpers and tests.
- Dependencies: W11-T2, W7-T3, W11-T3.
- Serial predecessors: W11-T3. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D02, D03, D14. Common D24 applies to every task.
- Work and acceptance: Render real project chips, sender/recipients/time, star and discreet shared more menu. Keep bounded body/read-more, attachments and missing-Message-ID warning. Only confirmed related folder opens Files at that folder without replacing root.
- Own test cycle: Test absent/multiple projects, address fallback, stale reader response, unavailable linked folder and all existing action entrances. Compare resting view without expanded metadata table. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01, box [449,98,471,468] at 1280x800; corrected inventory [gap-email-files.md:54-85](gap-email-files.md#L54). Pass: subject/sender/paragraph spacing, Marketing card 185x48 and discreet menus; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual sender/body/confirmed related folder, correct stable message identity, plus the W4 chrome table.

### W11-T5. Manual prepare-reply entrance to exact approval

- Source: email-files §5 EF-09.
- Mockup and region: 01: reply service, no new resting pixels.
- Files: MAIL; apps/server/src/mail/MailReply.ts; apps/server/src/mail/MailSendService.ts; RPC; apps/mobile/src/features/threads/MailSendApprovalCard.tsx; packages/client-runtime/src/mail/mailApprovals.ts; focused service, shared state and RN card tests.
- Dependencies: W11-T1, W11-T2, for shared mail RPC serialization.
- Serial predecessors: W11-T2. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D15. Common D24 applies to every task.
- Work and acceptance: Prepare manual reply using trusted original headers/stable reference and explicitly chosen/created owning thread. Reuse project sending grant, exact digest approval, sent Message-ID capture and link recovery. No provider CLI for manual text.
- Own test cycle: Test Reply-To, reply-all dedup/self removal, comma names, moved original, forged account, zero SMTP bytes on prepare, stale digest, approve once and recovery without resend. Decode old and manual-reply approval shapes in client-runtime, show the manual reply in the existing RN MailSendApprovalCard and approve/decline through its existing thread subscription. No new native screen. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01, box [449,591,471,143] at 1280x800; corrected inventory [gap-email-files.md:65-85](gap-email-files.md#L65). Pass: no extra resting controls; manual prepare uses exact visible reply and existing approval card; RN approval state reviewed separately; V1 dark theme/font/2px criteria apply. Allowed live substitutions: live Review reply action, trusted real addressing and exact approval content, plus the W4 chrome table.

### W11-T6. Inline composer and shared approval card

- Source: email-files §5 EF-10.
- Mockup and region: 01: reply box and bottom actions.
- Files: UI/mail/MailInlineReply.tsx proposed; UI/mail/MailMessageView.tsx; mail draft state; apps/web/src/components/chat/MailSendApprovalPanel.tsx shared card; focused tests.
- Dependencies: W11-T4, W11-T5.
- Serial predecessors: W11-T4. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D15, D16. Common D24 applies to every task.
- Work and acceptance: Scope draft by environment/account/stable original. Review reply prepares exact typed content; reuse approval card. Preserve text through decline/error/account loss, explicit discard/edit/reprepare, unknown outcome history. Keep Draft reply with agent reachable.
- Own test cycle: Test no send while typing/prepare, complete visible approval, edit invalidation, selection-change routing, decline and reconnect. Phone keyboard leaves controls reachable. Compare reply geometry with documented live copy. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01, box [449,591,471,143] at 1280x800; corrected inventory [gap-email-files.md:65-67](gap-email-files.md#L65). Pass: reply label/textarea/action geometry and existing approval lifecycle retained; V1 dark theme/font/2px criteria apply. Allowed live substitutions: Review reply live copy, real recipients/draft/outcome; Send demo non-sending sample only, plus the W4 chrome table.

### W11-T7. Project Drive link picker and Email integration

- Source: email-files §5 EF-11, EF-12.
- Mockup and region: 01: Attach from project Drive and return to same draft.
- Files: UI/mail/MailInlineReply.tsx; UI/ProjectDriveExplorer.tsx picker mode; focused mail/Drive integration tests; docs/user/workspace-spaces.md and google-drive.md; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W11-T6, W7-T3.
- Serial predecessors: W11-T6. Apply the admitted-task serial-slot rule above.
- Decision state: default assumed, confirm D16, D24. Common D24 applies to every task.
- Work and acceptance: Choose existing file and insert canonical provider URL into actual approval text, with removal/duplicate handling. Label link semantics clearly; browsing creates no relationships or Drive grant. Binary MIME attachment/export remains a separate decision.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Test correct root/account, inaccessible file, duplicate/removal, exact approved URL, no local hidden path/Drive write and all mail/conversation/reply recovery paths. Future primary captures 01/390/1024 and separates real-account/other-device evidence. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 01, box [798,697,109,24] at 1280x800; corrected inventory [gap-email-files.md:67-85](gap-email-files.md#L67). Pass: Attach from project Drive at bottom-right, reviewed picker returns to same draft with exact visible URL; V1 dark theme/font/2px criteria apply. Allowed live substitutions: link-only live label where needed, actual chosen canonical URL, no binary claim, plus the W4 chrome table.

## Wave 12: Conditional collaboration, scheduling and capture

Goal: Retain explicit opt-in units for report proposals beyond the recommended default release. These are scheduled holds, not permission to connect accounts, invite people, publish audio or send provider messages.

Mockups: 03-tasks.png followers, 04-projects.png roster, 07-meetings-notes.png Schedule/Recordings/notes, 02-communications-files.png composer, 08-calendar-tasks.png source labels; new states need reviewed references.

Spec acceptance: No blanket completion claim. Approve each named decision and missing-state design before admitting its task. Compare the applicable original PNG region and then demonstrate its full create/change/reverse/error lifecycle. Rejected extensions remain an explicit accepted departure in the decision record; they never block the default waves as a group.

Detailed plan to be written later: `docs/superpowers/plans/2026-10-16-workspace-wave-12-conditional-extensions.md`. This file is a named handoff, not created or validated by this assignment.

### W12-T1. Optional Outlook read-only calendar adapter

- Source: tasks-calendar §5 TC13b; meetings §6 server account migration.
- Mockup and region: 07/08: provider source substitutions; setup unseen.
- Files: CALENDAR; apps/server/src/workspace/calendar/OutlookCalendar.ts proposed; server account/settings connector; RPC and scripted tests.
- Dependencies: W6-T1b, W6-T3; separate approval D07.
- Decision state: BLOCKED D07 affirmative Outlook choice. Common D24 applies to every task.
- Work and acceptance: One independently approved provider account lifecycle, explicit scopes/consent and native occurrence normalization. No mail-token reuse, silent migration, writes or invitations.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Script connect/refresh/disconnect, denied scope, paging/429, all-day/recurrence/cancel IDs and remote read grants; separate authorized actual-account pass. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [327,207,596,455] at 1280x800; corrected inventory [gap-tasks-calendar.md:78-87](gap-tasks-calendar.md#L78). Pass: existing card composition with honest optional Outlook source; proposed setup reviewed; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real chosen Outlook events/source/attendees, never Google fixture labels live, plus the W4 chrome table.

### W12-T2. Optional personal server-local event editor

- Source: tasks-calendar §5 TC9.
- Mockup and region: 07: Schedule button; editor unseen.
- Files: CALENDAR; UI/calendar/CalendarEventEditor.tsx proposed; focused lifecycle tests.
- Dependencies: W6-T1b, W6-T3; choose local editing in D08.
- Serial predecessors: W12-T1. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D08 local-edit choice. Common D24 applies to every task.
- Work and acceptance: Create stable-request personal events, revision edit/cancel/delete and meeting URL clear. No invitations, provider writes, recurrence or new rooms. External Schedule remains default until chosen.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test repeated save, validation/DST/all-day, revision conflict, partial link recovery, cancel creates nothing, restart and no provider/scheduler calls. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [847,102,76,24] at 1280x800; corrected inventory [gap-tasks-calendar.md:73-87](gap-tasks-calendar.md#L73). Pass: Schedule remains in both; optional editor/review/cancel states separately designed and reversible; V1 dark theme/font/2px criteria apply. Allowed live substitutions: chosen local/Google provider and exact reviewed event/attendees, plus the W4 chrome table.

### W12-T3. Optional Google invitation create/update/cancel

- Source: meetings §5 M11.
- Mockup and region: 07: Schedule; invitation review/cancel unseen.
- Files: CALENDAR; chosen Google adapter; shared event editor/review UI; RPC and focused boundary tests.
- Dependencies: W6-T2b, W12-T2; explicit D08 write-scope approval.
- Serial predecessors: W12-T2. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D08 invitations choice. Common D24 applies to every task.
- Work and acceptance: Review exact account/calendar/event/timezone/attendees and notification behavior before provider mutation. Capture idempotent/ambiguous outcome and separate unlink from invitation cancellation.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test duplicate/lost response, denied scope, participant change, conflict, exact approval and no automatic resend. No recurrence editor. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07-08, box [847,102,76,24] at 1280x800; corrected inventory [gap-tasks-calendar.md:73-87](gap-tasks-calendar.md#L73). Pass: Schedule remains in both; optional editor/review/cancel states separately designed and reversible; V1 dark theme/font/2px criteria apply. Allowed live substitutions: chosen local/Google provider and exact reviewed event/attendees, plus the W4 chrome table.

### W12-T4. Local recording consent, sources and retention policy

- Source: meetings §5 M12.
- Mockup and region: 07: Recordings entrance; capture policy UI unseen.
- Files: packages/contracts/src/talk.ts; UI/office/TalkPanel.tsx; apps/desktop/src/talk/TalkService.ts; focused existing capture tests.
- Dependencies: W6-T4; explicit capture/retention decision D12.
- Serial predecessors: W12-T3. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D12 policy approval; D13 local-only default. Common D24 applies to every task.
- Work and acceptance: Retain native capture; explicit per-capture acknowledgement, chosen microphone, system audio off, static active indicator and stop/save. Separate model download, transcription and later sharing choices. No auto-record from Join/event/agent.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test refusal/no capture, selected sources, stop/save, interruption, failed local transcription keeps audio and no cloud/audio upload. Review missing capture state before implementation. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07, box [207,94,52,45] at 1280x800; corrected inventory [gap-meetings-notes.md:42-48](gap-meetings-notes.md#L42). Pass: Recordings icon/label retained; capture/publication views are reviewed proposed states; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual local versus published recording availability; static capture indicator only, plus the W4 chrome table.

### W12-T5. Publish selected transcript text to Recordings

- Source: meetings §5 M9.
- Mockup and region: 07: Recordings entrance; publication view unseen.
- Files: apps/desktop/src/talk/TalkService.ts narrow export; UI/office/TalkPanel.tsx; NOTES/server authenticated import; shared Recordings view and focused tests.
- Dependencies: W12-T4, W6-T8; explicit publication choice D12.
- Serial predecessors: W12-T4. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D12 publication approval; D13 text-only default. Common D24 applies to every task.
- Work and acceptance: User explicitly publishes transcript text/metadata with device/recording provenance. Local-only and published states remain distinct. Audio path never crosses wire; create note only by explicit request. No cloud transcriber.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test idempotent publish, offline PC, failed transfer retains local audio, remote can read only published text, local/server delete distinctions and revoked future reads. Return restores Upcoming/day/note. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 07, box [207,94,52,45] at 1280x800; corrected inventory [gap-meetings-notes.md:42-48](gap-meetings-notes.md#L42). Pass: Recordings icon/label retained; capture/publication views are reviewed proposed states; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual local versus published recording availability; static capture indicator only, plus the W4 chrome table.

### W12-T6. Optional read-only Slack project roster

- Source: projects §5 P8; shared member/count portions of reports.
- Mockup and region: 04: four avatar/name/role-source rows and member counts.
- Files: approved Slack reader/contracts/atoms; UI/ProjectMembers.tsx proposed; project summary/sharing display tests.
- Dependencies: W9-T2b, W8-T2; explicit D05 roster source choice.
- Serial predecessors: W12-T5. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D05 provider-roster amendment. Common D24 applies to every task.
- Work and acceptance: One provider only per task. Bounded provider identities/membership/freshness with display-only role text. No Pulse directory/roles/grants or automatic task-assignee identities. Other connectors require separate units if later selected.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test zero versus unavailable, disconnect/refresh, names/initials, source labels, environment isolation and provider membership granting no Pulse access. Compare roster only after real source exists. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 04, box [275,505,649,142] at 1280x800; corrected inventory [gap-projects-docs-prs.md:34-36](gap-projects-docs-prs.md#L34). Pass: four 19px-avatar roster rows, role/source alignment and spacing match when provider supports them; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real bounded Slack identities/provider role text; never Pulse access roles, plus the W4 chrome table.

### W12-T7. Optional human Telegram bot send/reply

- Source: communications §5 COMM-06T.
- Mockup and region: 02/05/06: composer adapted with Telegram bot identity.
- Files: packages/contracts/src/pulseTelegram.ts; apps/server/src/telegram/TelegramService.ts and TelegramStore.ts; Telegram atoms/UI; RPC; forward migration and tests.
- Dependencies: W9-T6; affirmative D20 send decision.
- Serial predecessors: W12-T6. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D20 bot-send approval. Common D24 applies to every task.
- Work and acceptance: Explicit paired destination, operate authorization and durable outcomes; send as bot only, with captured reply target. No personal login, media upload, agent-triggered unapproved send or automatic ambiguous retry.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test unpaired/removed/disconnected denial, duplicate submission, ambiguous response retains text/history guidance and unchanged pairing behavior. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [442,687,485,100] at 1280x800; corrected inventory [gap-communications.md:93-97](gap-communications.md#L93). Pass: same composer; reviewed pending/error/unknown outcome and explicit bot identity where applicable; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual provider/destination, Send live copy and bot label; no personal DM fiction, plus the W4 chrome table.

### W12-T8. Optional project follow/unfollow

- Source: tasks-calendar §6 D6; projects §5 P8 identity implications.
- Mockup and region: 03: Project followers footer; follow UI unseen.
- Files: approved identity contract/service first; existing project/task config only if sufficient; shared state/UI and focused tests.
- Dependencies: W8-T2; explicit D05 identity and D06 lifecycle decisions.
- Serial predecessors: W12-T7. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D06 followers approval and D05 identity design. Common D24 applies to every task.
- Work and acceptance: Define who follows, visibility/read authority, follow/unfollow and notifications before adding persistence. No inert footer promise, invented collaborators or generic notification engine.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test follow/unfollow/retry, identity isolation, visibility, notifications only as explicitly accepted and no read grant from following. Review new control/empty/error states. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 03, box [275,499,648,24] at 1280x800; corrected inventory [gap-tasks-calendar.md:49-51](gap-tasks-calendar.md#L49). Pass: followers footer restored only with reviewed follow/unfollow identity/lifecycle states; V1 dark theme/font/2px criteria apply. Allowed live substitutions: real authorized follower state and agreed visibility, no fixture coworker grants, plus the W4 chrome table.

### W12-T9. Optional remote human Slack text sends

- Source: communications §5 COMM-06 remote Slack branch.
- Mockup and region: 02/05/06: live composer rather than read-only remote.
- Files: server Slack adapter/service; communications contracts/atoms; RPC operate mapping; composer and focused outcome tests.
- Dependencies: W9-T2b, W9-T6; separate affirmative D18-S send choice.
- Serial predecessors: W12-T8. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D18-S remote-send approval. Common D24 applies to every task.
- Work and acceptance: Reuse existing nonce/ACK discipline and captured account/channel/reply. Human action only; no auto-send, upload, administration or automatic POST retries.
- Documentation gate: This admitted optional unit reviews docs/internals/overview.md and docs/internals/glossary.md for changed cross-component constraints/vocabulary, updates them or records a concrete no-change reason, and updates changed user guidance. It does not wait for other optional units.
- Own test cycle: Test permission denial, target change, double click, lost/ambiguous provider response, text retention and acknowledged single send through fake boundary. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [442,687,485,100] at 1280x800; corrected inventory [gap-communications.md:93-97](gap-communications.md#L93). Pass: same composer; reviewed pending/error/unknown outcome and explicit bot identity where applicable; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual provider/destination, Send live copy and bot label; no personal DM fiction, plus the W4 chrome table.

### W12-T10. Optional remote human Discord bot text sends

- Source: communications §5 COMM-06 remote Discord branch.
- Mockup and region: 02/05/06: composer with Discord bot identity.
- Files: server Discord adapter/service; communications contracts/atoms; RPC operate mapping; composer and focused outcome tests; docs/internals/overview.md and docs/internals/glossary.md decision review at this wave gate.
- Dependencies: W9-T3b, W9-T6; separate affirmative D18-D send choice.
- Serial predecessors: W12-T9. Apply the admitted-task serial-slot rule above.
- Decision state: BLOCKED D18-D remote-send approval. Common D24 applies to every task.
- Work and acceptance: Preserve bot-only identity, send permission checks, enforced nonce and no parsed mentions. No personal DM parity, provider administration or automatic POST retry.
- Documentation gate: Review cross-component constraints and vocabulary introduced by this wave against docs/internals/overview.md and docs/internals/glossary.md. Update changed durable decisions/definitions, or record a concrete no-change reason under AGENTS.md documentation rules. Resource frame, date-only task, calendar occurrence, workspace note, Drive root, project PR collection, Later and known-message marker must each have one agreed definition in their owning wave. Update user guidance only when the workflow changes.
- Own test cycle: Test channel permission/reply failure, ambiguous outcome, duplicate request, cross-guild target capture and honest bot sending identity. Apply the focused test contract above; visual acceptance follows the task-specific V1 record below.
- Visual acceptance: W4-T7, then V1; PNG 02/05/06, box [442,687,485,100] at 1280x800; corrected inventory [gap-communications.md:93-97](gap-communications.md#L93). Pass: same composer; reviewed pending/error/unknown outcome and explicit bot identity where applicable; V1 dark theme/font/2px criteria apply. Allowed live substitutions: actual provider/destination, Send live copy and bot label; no personal DM fiction, plus the W4 chrome table.

## Surfaced gaps

This is a complete scheduling handoff for the seven reports, not an implementation or experience-acceptance receipt. Missing source designs are PR-open, Board, Week, filter/grid/empty/error states, capture/recordings, scheduling editors and compact/Code adaptations. Their tasks require reviewed proposed states, not invented original-mockup claims. API/scope sufficiency, real accounts, packaged clients, a physical remote device and pilot remain unverified. Decisions D01-D29 and all Wave 12 affirmative choices remain open. No tracker, code, server, browser, network, staging or commit operation is part of this handoff.

## Review response log

Fix round 1, 2026-10-16. F prefixes [review-fidelity.md](review-fidelity.md); B prefixes [review-feasibility.md](review-feasibility.md). The fidelity review's four unnumbered actionable Minor bullets are assigned F-M1 through F-M4 in their original order. Its final verified-correct bullet needs no fix. Both original review files are retained verbatim in the tracked bundle; their old line numbers describe the reviewed revision.

| Finding | Action and location                                                                                                                                                                                                                                                                                                                                                                               | Disposition                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| F-C1    | Inspected 07/08 toolbar [847,102,76,24]; Schedule present in both. Corrected D03, W6-T4/T6, Wave 6 acceptance, plan outline and gap-shell:57.                                                                                                                                                                                                                                                     | Addressed                                                        |
| F-C2    | W4-T7 owns pinned Tue 13 clock, dev/test-only isolated seeds, marker, non-writing boundaries and eight capture recipes. V1 and every task visual gate require it; production/live userdata are excluded.                                                                                                                                                                                          | Addressed                                                        |
| F-I1    | Every task has PNG/pixel box, corrected inventory lines, specific pass criteria and live substitutions under V1. W4-T0 names a reference box with no rendered delta; unseen states need review. Disagree only with suggested light theme: all eight PNGs are near-black, corroborated by gap-shell:19 and gap-tasks-calendar:15. V1 pins dark with recorded system font; light is separate smoke. | Addressed; light-theme recommendation disputed with PNG evidence |
| F-I2    | W4 sample-to-live table defines footer/dot/gear, breadcrumb, avatar, brand/mode and Drive sharing sentence; D25 records brand/mode defaults.                                                                                                                                                                                                                                                      | Addressed                                                        |
| F-I3    | D26 records source-only member counts; D27 records Slack existing-DM scope and bot omissions. W9-T2b/T4 schedule the DIRECT MESSAGES group and header metadata.                                                                                                                                                                                                                                   | Addressed, including a and b                                     |
| F-I4    | W6-T4 owns decorative Video and exact subtitles; W6-T5/D28 define chip navigation and reviewed date picker. W7-T3/D29 define confirmed-folder Marketing emphasis.                                                                                                                                                                                                                                 | Addressed                                                        |
| F-I5    | W5-T4 removes rail counts and retains only the pictured open-total subtitle. W5-T5a and visual acceptance require unbadged All tasks/Open/Done.                                                                                                                                                                                                                                                   | Addressed                                                        |
| F-M1    | gap-shell:44/53 and decision D2 now say Inbox/Unread/Later are visible in 01.                                                                                                                                                                                                                                                                                                                     | Addressed                                                        |
| F-M2    | gap-shell:76 restores the comma in Thoughtful products, made for everyday life.                                                                                                                                                                                                                                                                                                                   | Addressed                                                        |
| F-M3    | gap-meetings-notes:56 and gap-tasks-calendar:81 use the requested SynKEK · Launch review copy; W4-T7 seeds it consistently.                                                                                                                                                                                                                                                                       | Addressed                                                        |
| F-M4    | gap-tasks-calendar:41 and W5-T6 specify LayoutGrid, the pictured 2x2 Board icon.                                                                                                                                                                                                                                                                                                                  | Addressed                                                        |
| B-C1    | Copied eight PNGs, map, seven corrected gap reports and both verbatim reviews to docs/superpowers/workspace-mockups; plan, A13 and map point there. Originals retained; presentation HTML excluded.                                                                                                                                                                                               | Addressed                                                        |
| B-I1    | Code prerequisites separate from scheduling. W6-T4 needs shared fake/local service, not Google; notes W6-T7 have no Calendar dependency; Drive W8-T3a independent of native entrance W8-T3b. W9-T4 accepts any one reader. W10-T1/T4 independent of W9; W5-T1 starts from W4-T0.                                                                                                                  | Addressed                                                        |
| B-I2    | Explicit per-wave/shared-file serial chains plus task Serial predecessors cover RPC/migrations/context/UI. W11-T5 follows T2, W8-T6 serializes after admitted T5, W6/W9 RPC units serialize, W5-T7 follows T6 and W10-T2 requires T1 extraction.                                                                                                                                                  | Addressed                                                        |
| B-I3    | Parent IDs remain families; dispatch W4-T4a/b, W5-T5a/b, W6-T1a/b, W6-T2a/b and W9-T2a/b/c, T3a/b/c. Also split W8-T1 storage/overview and W8-T3 Drive/native to close the requested seams.                                                                                                                                                                                                       | Addressed                                                        |
| B-I4    | W6-T3/T8, W9-T2c/T3c and W9-T7 name linkedItemsContext.ts and its turn integration test. Common block is at linkedItemsContext.ts:61 and ProviderTurnStartService.ts:1052; tests require typed labels, bounded sanitized summaries and no saved-only grant for all providers.                                                                                                                     | Addressed                                                        |
| B-I5    | W6-T1b/T2b and W9-T2b/T3b specify on-demand plus explicit Refresh, bounded pages and one in-flight request, no polling/timer/all-source scan. W9-T8 counts loaded pages only; request-count tests prohibit list history fanout.                                                                                                                                                                   | Addressed                                                        |
| B-I6    | W11-T5 names existing mobile MailSendApprovalCard and client-runtime mailApprovals.ts; tests cover old/manual shapes and approve/decline on the RN card. D24 still excludes new native screens.                                                                                                                                                                                                   | Addressed                                                        |
| B-I7    | Final gate of each W4-W11 wave names docs/internals/overview.md and glossary review/update or a specific no-change reason. Each admitted W12 unit has the same gate, with optional final aggregate.                                                                                                                                                                                               | Addressed                                                        |
| B-I8    | W4-T0 explicitly schedules the future B-2026-10-16-001 commit including both untracked tests before isolated dispatch. No commit, stage, stash or checkout performed in this pass.                                                                                                                                                                                                                | Addressed                                                        |
| B-M1    | Re-read actual current lines: aside width WorkspaceEngagement.tsx:91, Sheet mount :95, filters WorkspaceToolsPanel.tsx:72/:73 and disabled context controls WorkspaceEngagement.tsx:114. Updated map/gap-projects citation and plan Telegram wording to service at :41. Review's suggested :96 and :73/:74 drift themselves, so current source takes precedence.                                  | Addressed with freshly verified anchors                          |
| B-M2    | W9-T8 marks ReadMarkers.ts and ReadMarkerStore.ts under apps/server/src/communications as proposed; server communications RPC/account/read paths also explicitly proposed.                                                                                                                                                                                                                        | Addressed                                                        |
| B-M3    | Wave 9 cut order is read-marker behavior with its final gate retained, Discord server reader, then Slack DM exposure; one accepted reader and link-model core suffice.                                                                                                                                                                                                                            | Addressed                                                        |
| B-M4    | W11-T1 names MailImapRead.ts:283 FETCH extension with bounded partial BODY.PEEK[TEXT]<0.N> in the header request; no full MIME or per-row extra request. Current :283 is header-only; partial fetch is proposed work.                                                                                                                                                                             | Addressed                                                        |
| B-M5    | W8-T1a owns description storage; W8-T1b explicitly adds one <=50-project paged overview RPC with keyed summaries and completeness, with fixed query-bound tests. listMany at pulseLinks.ts:252 merges output and cannot supply keyed per-project totals.                                                                                                                                          | Addressed                                                        |
| B-M6    | W9-T6 plus is a reviewed paste-URL insert/cancel action. It needs no W11 explorer picker and no binary upload.                                                                                                                                                                                                                                                                                    | Addressed                                                        |

26 finding groups handled: 25 fully addressed and one addressed with a disputed theme recommendation, F-I1. No finding is skipped. Defaults D01-D29 remain maintainer-confirmable; Wave 12 and account/scope expansions retain their explicit holds. Capture/service acceptance is still unrun, since this pass edits planning artifacts only.
