# Agent roles: assistant, watchdog, manager (Argo)

Date: 2026-09-11. Status: design, partly implemented (vocabulary, tabs, message provenance). Sections 3 and 4 adopt the Scape Argus model in full, plus the items Scape leaves out.

Vocabulary is in `docs/internals/glossary.md` under Agent roles. This document records the
smallest shape for each role and what already exists to build it from. It follows the
Scape model (assistants, Argus managers, watchdogs) while keeping Pulse's provider and
thread as the runtime and unit of work.

## Already landed

- Glossary, AGENTS.md, and the product structure reference define the roles.
- Right panel: the provider subagent surface is labelled Subagents (internal kind stays
  `agents` for stored state). Assistants and Watchdog surfaces exist as placeholders.
- Message provenance: `authoredBy` on `OrchestrationMessage`, `ThreadMessageSentPayload`,
  and the server-only `ThreadTurnStartCommand`. Values: `user`, `schedule`, `handoff`,
  `assistant`, `manager`, `watchdog`, or `{ kind: "thread", threadId }`. Absent means
  `user`. The client command shape omits it so a human cannot spoof a role. Scheduled
  chats set `schedule`; a provider handoff sets `handoff` for the default filler text and
  `user` for a typed next instruction. Web and mobile timelines render a small provenance
  badge above user-role messages that carry `authoredBy` (Scheduled, Handoff, Assistant,
  Argo, Watchdog, From another thread). Labels live in
  `packages/client-runtime/src/state/messages.ts`. Scape only shows trust framing to the
  model; Pulse shows it to the user as well.
- Watchdog server side: `ThreadWatchdog` on `OrchestrationThread` (`enabled`, `rules`,
  `modelSelection`, `escalatedAt`, `interventions`); client command `thread.watchdog.set`;
  server-only commands `thread.watchdog.record-intervention` and
  `thread.watchdog.escalate`; event `thread.watchdog-updated`. `WatchdogReactor`
  (`apps/server/src/orchestration/Layers/WatchdogReactor.ts` and
  `Services/WatchdogReactor.ts`) subscribes to `thread.activity-appended` gate activities,
  asks `TextGeneration.generateWatchdogDecision` for a decision under the thread's rules,
  and dispatches the matching respond command, an intervention record, or an escalation.
  A user-authored message resets `interventions` and `escalatedAt` in
  `packages/client-runtime/src/state/threadReducer.ts`. Not yet built: `authoredBy:
"watchdog"` on the dispatched respond commands.
- Watchdog client side: `setThreadWatchdog` in
  `packages/client-runtime/src/operations/commands.ts` (exposed as
  `threadEnvironment.setWatchdog`) and shared presentation helpers in
  `packages/client-runtime/src/state/watchdog.ts`. Web ships the Watchdog right-panel tab
  (rules, on/off, model picker, "Watchdog stuck" with Take action, intervention count), an
  eye toggle in the thread header with a warning dot when escalated, sidebar row markers,
  and toggle entries in the sidebar thread menu, the chat header menu, and the command
  palette. `watchdog.escalated` renders through the generic activity path with its reason
  as the detail line. Mobile ships the header eye toggle, a rules sheet (switch and text,
  no model picker), the "Watchdog stuck" banner with Take action, a thread row menu toggle,
  and eye markers in both thread list styles. User docs: the Watchdog section of
  `docs/user/permission-modes.md`.
- Manager (Argo) record, phase A: `packages/contracts/src/manager.ts` holds `ManagerId`,
  `OrchestrationManager`, `ManagerMaxChildren`, `ManagerIntervalMinutes`, `managerState`,
  and the `manager:<id>` thread origin helpers (`managerThreadOrigin`,
  `isManagerThreadOrigin`, `managerIdFromThreadOrigin`). `ThreadOrigin` in
  `packages/contracts/src/schedule.ts` now accepts both `schedule:` and `manager:`.
  Client commands `manager.create`, `manager.update`, `manager.pause`, `manager.resume`,
  and `manager.delete { keepChildren }`; server-only `manager.thread.bind` and
  `manager.cycle.record`; events `manager.created`, `manager.updated`, `manager.paused`,
  `manager.resumed`, `manager.deleted`, `manager.thread-bound`, `manager.cycle-recorded`
  under `aggregateKind: "manager"`. Decider and projector arms live in
  `apps/server/src/orchestration/decider.ts` and `projector.ts`; deleting without
  `keepChildren` archives every live `manager:<id>` thread first. Managers reach clients
  through `apps/server/src/orchestration/shellManagerProjection.ts` and the
  `manager-upserted` / `manager-removed` arms of
  `packages/client-runtime/src/state/shellReducer.ts`.
- System project, phase A: `system` on `OrchestrationProject` and its shell shape, the
  server-only idempotent `project.ensure-system` command, the `systemProject(readModel)`
  projector helper, migration 044 for `projection_projects.system`, and a filter in
  `projectsAtom` (`packages/client-runtime/src/state/projectEntities.ts`) so system
  projects never appear in a project list while their threads still open normally.
  The manager reactor is now that caller.
- Manager (Argo) phase B: `ManagerReactor`
  (`apps/server/src/orchestration/Layers/ManagerReactor.ts` and
  `Services/ManagerReactor.ts`, wired in `apps/server/src/server.ts` and started by
  `OrchestrationReactor`) sweeps every 30 seconds and runs one cycle per watching manager
  whose `intervalMinutes` has elapsed. A cycle dispatches `project.ensure-system`, creates
  and binds the manager's own thread under the `manager:<id>` origin, composes the
  four-part prompt in the pure `apps/server/src/orchestration/managerCyclePrompt.ts`
  (mission, child status table with a stalled marker at three unchanged cycles, user
  directives since `lastCycleAt`, tool instructions), starts a turn authored by `schedule`
  on the environment's default model, dispatches `manager.cycle.record`, and publishes the
  `manager.cycle.started` runtime receipt. Cycles are skipped while the manager thread is
  already running a turn. Every sweep also creates and binds the thread of any non-deleted
  manager whose `threadId` is still null, whatever its state, without starting a turn: a
  new manager starts with no mission and the mission editor lives in that thread's header.
  Client command `manager.cycle-now { managerId }` (event `manager.cycle-requested`, field
  `cycleRequestedAt` on `OrchestrationManager`) makes a manager due on the next sweep;
  `manager.cycle.record` clears it.
- Manager (Argo) MCP toolkit: `apps/server/src/mcp/toolkits/manager/` (`tools.ts`,
  `handlers.ts`), registered in `apps/server/src/mcp/McpHttpServer.ts` beside the preview
  toolkit. Tools are `manager_list_children`, `manager_spawn_child { title, prompt,
projectId }`, `manager_message_child { threadId, prompt }`, `manager_stop_child
{ threadId }`, and `manager_log { kind, threadId?, summary }`. The MCP catalog is global
  rather than per session, so every handler re-checks at call time that its caller's
  session belongs to a thread bound to a manager as that manager's own thread, and refuses
  with `not-a-manager-thread` otherwise. Children are spawned in their own worktrees on the
  manager's `childModelSelection` and `childRuntimeMode` with the `manager:<id>` origin,
  refused past `maxChildren`; messages and stops refuse threads the manager does not own.
- Manager (Argo) phase C, the UI: client commands `createManager`, `updateManager`,
  `pauseManager`, `resumeManager`, and `deleteManager` in
  `packages/client-runtime/src/operations/commands.ts`, plus the shared selectors and
  presentation helpers in `packages/client-runtime/src/state/managers.ts`
  (`createEnvironmentManagerAtoms`, `createManagerEnvironmentAtoms`, `managerChildren`,
  `managerForThread`, `isManagerOwnThread`, `managerStateLabel`, `managerBadgeLabel`,
  `managerPillAction`, `managerCycleEntries`), exported as the `./state/managers` subpath.
  Web ships an Argo sidebar section above projects with nested live children, a state pill
  that toggles pause, a row context menu (Pause/Resume, Delete with Keep children or Close
  children), and New Argo
  (`apps/web/src/components/sidebar/SidebarManagerSection.tsx`, projections in
  `Sidebar.logic.ts`); the pinned Argo control header and the child "Argo: <name>" badge
  inside `ChatView` (`apps/web/src/components/chat/ArgoThreadHeader.tsx`); an Argo filter,
  Argo column, and single-Argo cycle table in the fleet view
  (`apps/web/src/components/workspace/OrcaWorkspace.tsx` and `.logic.ts`); and the
  New Argo, Pause Argo / Resume Argo, and Open fleet view command palette entries. Mobile
  ships the Argo section in the thread list, the pause banner in an Argo thread, and the
  "Argo: <name>" subtitle on child rows (`apps/mobile/src/features/threads/
ArgoThreadListSection.tsx`, `ArgoThreadBanner.tsx`, `use-managers.ts`). User docs:
  `docs/user/argo.md`.
- Manager (Argo) manual cycles: client command `cycleNowManager` (`manager.cycle-now`,
  exposed as `managerEnvironment.cycleNow`) and the pure `managerCycleNowState` /
  `managerCycleNowLabel` helpers in `packages/client-runtime/src/state/managers.ts`, which
  offer the action only to a watching Argo and read "Cycle queued" while
  `cycleRequestedAt` is set. Surfaced in the web sidebar row menu, the pinned Argo header,
  the command palette ("Cycle Argo now"), and the mobile Argo banner. `shellReducer`
  needed no change: `manager-upserted` replaces the record whole.
- Mission mentions (section 3): token syntax `@[kind:id]`, `parseMentions`,
  `MentionKind`, `MENTION_SIZE_CAP`, and `MENTION_DEPTH_CAP` in
  `packages/contracts/src/mentions.ts`. Kinds are `thread`, `project`, `schedule`, and
  `manager`, because Pulse Office records (Task, Person, Organisation, Email, Meeting,
  File, Note, SOP) have no contracts in this repo yet; they join the union with their
  own. `expandMissionMentions` in `apps/server/src/orchestration/missionMentions.ts` is
  pure over the read model: it swaps every token for a `Kind "Name" (kind id)` pointer,
  appends one section per mentioned record, prints an Argo's mission in full at depth 2
  (the same slot notes and SOPs will use), marks a record reached twice as "Already
  expanded above", renders an unknown id as `(missing <kind> <id>)`, and stops at 64 KB
  with a truncation marker. `ManagerReactor` computes it and passes `expandedMission` to
  `composeManagerCyclePrompt`, which replaced the verbatim `mission` field. Web ships the
  `@` picker and the read-only chip preview
  (`apps/web/src/components/chat/ArgoMissionEditor.tsx`, logic in
  `argoMissionMentions.logic.ts`); mobile stays read-only per section 4.
- Trust wrapper (section 3): `apps/server/src/orchestration/promptTrust.ts` is pure and
  has three cases. A prompt authored by `manager` in a thread whose origin names that
  manager gets the one-line preface "Directive from your Argo manager. Follow it."; a
  prompt authored by `{ kind: "thread" }` is fenced as untrusted data with an explicit
  preface and markers relayed text cannot forge; everything else passes through byte for
  byte. It is applied at the single point where the provider input is composed,
  `buildSendTurnRequestForThread` in
  `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`, so the persisted and
  rendered message stays as typed. `authoredBy` and the thread `origin` are read from
  `orchestrationEngine.currentReadModel` on turn start, because the SQL thread-detail
  projection carries neither. Tests: `promptTrust.test.ts` plus one
  `ProviderCommandReactor.test.ts` case asserting the provider input is wrapped and the
  stored message is not.
- Tokens per child in the cycle table (section 3, Lifecycle): `threadTokenTotal` in
  `ManagerReactor.ts` reads the newest `context-window.updated` thread activity, which
  `ProviderRuntimeIngestion` already writes from the provider's
  `thread.token-usage.updated` runtime event, and `managerChildRows` puts its
  `usedTokens` in `tokens`. No new tables, queries, or migrations; the column still drops
  out when no child has reported usage. Covered by two `ManagerReactor.test.ts` cases.
- `manager_spawn_child` coverage: `apps/server/src/mcp/toolkits/manager/handlers.test.ts`
  now spawns against a real temporary git repository with the real `GitWorkflowService`,
  and asserts the child lands in the given project with origin `manager:<id>`, the
  configured `childRuntimeMode` and `childModelSelection`, a worktree that exists on a new
  `argo/<manager>/<slug>-<hash>` branch, and a first message authored by `manager`; a
  second case asserts the `child-limit-reached` refusal at `maxChildren`. No Windows path
  problems surfaced: worktrees land under the ServerConfig temp `worktreesDir`.
- Assistant (Luna), whole role: `packages/contracts/src/assistant.ts` holds `AssistantId`,
  `OrchestrationAssistant` (`id`, `name`, `avatar`, `modelSelection`, `instructions`,
  `threadId`, timestamps), `DEFAULT_ASSISTANT_NAME`, the `assistant:<id>` origin helpers
  (`assistantThreadOrigin`, `isAssistantThreadOrigin`, `assistantIdFromThreadOrigin`),
  `ASSISTANT_READ_ONLY_TOOLS` per driver, `ASSISTANT_THREAD_ALLOWED_TOOLS`, and
  `assistantSystemPrompt`. Two deliberate deviations from the table below: the record ships
  `instructions` and `avatar` rather than `briefing`, and carries no `runtimeMode` (the
  read-only allow-list is the policy). Client commands `assistant.create`,
  `assistant.update`, `assistant.reset`, `assistant.message { text }`; server-only
  `assistant.thread.bind`; events `assistant.created`, `assistant.updated`, `assistant.reset`,
  `assistant.thread-bound`, and `assistant.message-requested` under
  `aggregateKind: "assistant"`. `assistant.message-requested` is new relative to the design:
  the decider cannot know the base directory or the default model, and reactors subscribe to
  events rather than commands, so the message is recorded as an event and `AssistantReactor`
  (`Layers/AssistantReactor.ts`, `Services/AssistantReactor.ts`) does the bootstrap. It
  ensures the system project, creates and binds the thread under the `assistant:<id>` origin
  with `ASSISTANT_THREAD_ALLOWED_TOOLS`, starts a turn authored by `user`, and publishes the
  `assistant.thread.ready` receipt. Assistants reach clients through
  `apps/server/src/orchestration/shellAssistantProjection.ts` and the `assistant-upserted`
  arm of `packages/client-runtime/src/state/shellReducer.ts`.
- Per-thread allowed tools: `allowedTools` on `OrchestrationThread`, the thread create
  command, `ThreadCreatedPayload`, and `ProviderSessionStartInput`, durable in
  `projection_threads.allowed_tools` (migration 045). Decisions per adapter:

  | Driver        | Decision                                                                                                                                                                   |
  | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `claudeAgent` | pass-through to the SDK `allowedTools` query option                                                                                                                        |
  | `opencode`    | mapped to permission rules by `buildOpenCodePermissionRules`: `*` denied, hard denies for bash, edit, external_directory and doom_loop, allow or deny per named permission |
  | `codex`       | not supported, no allow-list in the protocol; assistant threads run under `approval-required`                                                                              |
  | `cursor`      | not supported, same                                                                                                                                                        |
  | `grok`        | not supported, same                                                                                                                                                        |
  | `omp`         | not supported, same                                                                                                                                                        |

  The unsupported set is also listed as `ASSISTANT_ALLOWED_TOOLS_UNSUPPORTED_DRIVERS` in
  contracts, and each of those four adapters carries a comment at the session-configured
  payload saying so.

- Assistant client and UI: `createAssistant`, `updateAssistant`, `resetAssistant`, and
  `sendAssistantMessage` in `packages/client-runtime/src/operations/commands.ts`, with the
  selectors and atoms in `packages/client-runtime/src/state/assistants.ts`
  (`createEnvironmentAssistantAtoms`, `createAssistantEnvironmentAtoms`,
  `assistantDisplayName`, `assistantAvatarToken`, `assistantForThread`, `assistantThreadId`,
  `assistantHasConversation`, `canResetAssistant`, `assistantForEnvironment`) exported as the
  `./state/assistants` subpath. Web ships the persistent Luna panel
  (`apps/web/src/components/AssistantPanel.tsx` with `AssistantPanel.logic.ts`): an avatar,
  inline rename, and Reset in the header, the bound thread rendered through `ChatView` in the
  body, and a first-message composer that creates the record on send. The panel is mounted
  next to the route content in `AppSidebarLayout`, opened from the sidebar row
  (`sidebar/SidebarAssistantEntry.tsx`), the command palette ("Open Luna"), and the
  Assistants right-panel tab, which is now a jump rather than a placeholder. Mobile ships the
  row above the thread list with its Reset
  (`apps/mobile/src/features/threads/AssistantThreadListEntry.tsx`,
  `assistant-entry.logic.ts`, `use-assistants.ts`); renaming and settings stay on desktop.
  User docs: `docs/user/luna.md`.

## 1. Assistant record

An assistant is a named, persistent, read-mostly persona that proposes and never acts.
Luna is the first.

| Field                                              | Reuses                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id: AssistantId`                                  | new branded id, same pattern as `ScheduleId`                                                                                                                                   |
| `name`                                             | `TrimmedNonEmptyString`, as thread title                                                                                                                                       |
| `briefing`                                         | new. Standing instruction prepended to every turn. Same pattern as `OrchestrationSchedule.prompt` and `policyInstruction` in `TextGenerationPrompts.ts`, but re-sent each turn |
| `modelSelection: optional(NullOr(ModelSelection))` | identical to `OrchestrationSchedule.modelSelection`; falls back to `textGenerationModelSelection` in server settings                                                           |
| `runtimeMode`                                      | existing `RuntimeMode`; default `approval-required`                                                                                                                            |
| `allowedTools`                                     | new plumbing. The Claude SDK `allowedTools` option is only used by the capabilities probe today (`ClaudeProvider.ts`); thread it through per-thread session start              |
| `threadId: NullOr(ThreadId)`                       | identical to `ScheduleProjectState.threadId`; lazily created persistent thread                                                                                                 |
| reset                                              | new command: replace `threadId` with a fresh thread, keep identity fields                                                                                                      |

Genuinely new: the record and its create, update, reset commands and events; the
per-turn briefing injection point; per-thread `allowedTools`; and a thread that needs no
project. `OrchestrationThread.projectId` is required everywhere today, and the universal
work actions design already lists an operational thread scope as a prerequisite. Reuse the
`ScheduleScope` environment variant as the model for a project-less scope rather than a
dummy directory project.

Provider decision per adapter: Claude supports a tool allow-list natively. OpenCode maps
runtime mode to permission rules and can be extended to a deny-all-writes rule set. Codex,
Cursor, Grok, and OMP have no allow-list today; an assistant on those runs under
`approval-required` with every write gated. Ship Luna on Claude and Codex first, since the
MVP permission block already authorises Codex for Luna discovery.

## 2. Watchdog

A per-thread supervisor that answers pending questions, approves permission gates, or
escalates under user-written rules. Skipped when a manager owns the thread.

Adapter audit, all six adapters, as of this date:

| Adapter  | Approval gate emitted and answerable | Question gate emitted and answerable | Runtime mode honoured                                               |
| -------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------- |
| Claude   | yes                                  | yes                                  | yes, `full-access` skips the gate                                   |
| Codex    | yes                                  | yes                                  | passed through, Codex's own policy decides whether a gate is raised |
| Cursor   | yes                                  | yes                                  | yes, `full-access` auto-approves                                    |
| Grok     | yes                                  | yes                                  | yes, `full-access` auto-approves                                    |
| OMP      | yes                                  | yes                                  | passed through, no explicit bypass found                            |
| OpenCode | yes                                  | yes                                  | yes, mapped to OpenCode permission rules                            |

Every adapter goes through the same two contract pairs, `request.opened` /
`request.resolved` and `user-input.requested` / `user-input.resolved`, projected as
`thread.approval-response-requested` and `thread.user-input-response-requested`. A
watchdog reactor subscribes to those two events and dispatches `thread.approval.respond`
and `thread.user-input.respond`. Unlike Scape, which supports watchdogs on Claude Code
only, Pulse can offer a watchdog on all six providers with no adapter changes.

Correction from the landed build: the actual "gate opened" signal is
`thread.activity-appended` carrying an `approval.requested` or `user-input.requested`
activity, emitted by `runtimeEventToActivities` in `ProviderRuntimeIngestion.ts`. The
`thread.approval-response-requested` / `thread.user-input-response-requested` events fire
only after a decision has already been dispatched, to forward it to the provider CLI, so
`WatchdogReactor` subscribes to the activity-append event instead.

Gaps: `ThreadBackgroundLiveness` is boolean only and resets on restart, so stall detection
must diff `updatedAt` and event `occurredAt` timestamps. Responses the watchdog sends
should carry `authoredBy: "watchdog"` once questions can be answered with free text.

Smallest build: a drainable reactor with a per-thread on/off flag and a rules string,
default model Haiku via `ModelSelection`, escalation after a fixed retry count surfaced as a
thread activity. The Watchdog tab becomes the toggle and rules editor.

## 3. Manager, surfaced as Argo

Adopted from Scape's Argus in full, with Pulse names. The product name is **Argo**, the
Argo orchestrator. Every label a user reads says Argo: sidebar row, fleet view, Office,
palette, mobile. Every identifier says manager: `ManagerId`, `manager:<id>` origin,
`authoredBy: "manager"`, `manager.cycle` activity. The split exists because
"orchestration" already names the decider, projector, and reactor layer in this repo, and
an agent role must not share a word with the plumbing that runs it. A manager is a schedule whose
persistent thread reads a mission, looks at its children, spawns or stops children, and
writes one log row. One timed run is a **cycle**, never a pulse, because Pulse is the
product name.

### Record

| Field                                                   | Reuses                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id: ManagerId`                                         | new branded id                                                                                                        |
| `name`                                                  | `TrimmedNonEmptyString`                                                                                               |
| `scope: ScheduleScope`                                  | existing. Project scope, or environment scope with a project list, so one manager can span repositories               |
| `mission`                                               | new text field. The only free-form configuration. Supports `@` mentions of records                                    |
| `childModelSelection: optional(NullOr(ModelSelection))` | as `OrchestrationSchedule.modelSelection`; null means follow the default                                              |
| `childRuntimeMode`                                      | existing `RuntimeMode`. Default `auto-accept-edits`. `full-access` is the "allow risky tools for new children" switch |
| `maxChildren`                                           | literal set 2, 4, 8, 16. Default 8                                                                                    |
| `intervalMinutes`                                       | small literal set from 1 to 240                                                                                       |
| `state`                                                 | `watching`, `paused`, or `no-mission`. `no-mission` is derived when the mission is empty                              |
| `threadId: NullOr(ThreadId)`                            | as `ScheduleProjectState.threadId`                                                                                    |

No manager settings screen. The record header renders inside the manager thread.

### Cycle

The schedule reactor fires the manager thread on its interval with a fresh session and a
server-composed prompt. The cycle prompt carries `authoredBy: "schedule"`. Prompts the
manager sends to children carry `authoredBy: "manager"`. The cycle prompt always has the
same four parts:

1. The mission with mentions expanded.
2. A status table of current children: thread, project, branch, status, last change,
   cycles since last change, tokens.
3. User messages sent to the manager thread since the last cycle, as directives.
4. The instruction to spawn, stop, or leave children, and to end with one log row.

Manager tools are existing thread commands exposed through the provider's MCP tool
catalog: create worktree, start child thread, send message to child, stop child, read
child snapshot, append log row. No new server capability beyond wiring these as tools.

### Children

A child is an ordinary thread in its own worktree. It is created with the manager's child
model and runtime mode, gets `origin: manager:<id>` (extend `ThreadOrigin` next to
`schedule:`), and cannot own children. Provider-native subagents inside a child are fine
and stay in the Subagents tab. A child shows an "Argo: <name>" badge that links up.

### Trust wrapper

A prompt in a child with `authoredBy: "manager"` whose thread origin names that manager is
sent to the provider as an authoritative directive. A prompt with
`authoredBy: { kind: "thread" }` from any other thread is wrapped as untrusted data that
must not be followed without user approval. The wrapper text lives in one server module and
is added at prompt composition, so the visible message stays clean.

### Mentions in the mission

Typing `@` in the mission opens the record picker. Rendering rules copied from Scape:

- Notes and SOP bodies expand in full under a heading.
- Every other record (Task, Person, Organisation, Project, Email, Meeting, File) becomes
  one line: display name plus the exact id the manager needs.
- Depth cap 2, size cap 64 KB with a truncation marker. A cycle renders as "already
  expanded above".
- The boundary is the environment, not the project. Tasks need no project and must be
  mentionable.

### Log

Each cycle ends with one `manager.cycle` thread activity: occurredAt, event kind
(spawned, stopped, progressed, stalled, idle, error), child thread, project, status, and
a one-line summary. The fleet view renders these as a table. Users read the table, not the
manager transcript.

### Lifecycle, limits, and what Scape leaves out

- Pause and resume toggle the schedule. The status pill is the toggle.
- Delete asks whether to keep or close children. One command with a flag.
- Depth 1, hard.
- Stall rule: a child with no status change for N cycles (default 3) is reported as
  stalled and the manager is told to decide. Scape has no such rule.
- Spend: the status table carries tokens per child from the usage already collected for
  the Subagents panel. A per-manager budget is a later field.
- A manager-owned child skips the watchdog. The manager is its supervisor.

### Adopt later

- **Distillation.** When an SOP execution driven by a manager or an agent succeeds, offer
  to freeze the agent steps into fixed steps on the next SOP version, so later runs cost
  no model calls. Requires SOP execution first.
- **Floor control.** If a thread ever hosts a human and several agents, one agent holds
  the floor until it finishes. Not needed while children are single-agent threads.

## 4. Where Argo lives and how you work with it

### Placement

- **Record.** Environment-scoped like a schedule. Never a project child, because a
  manager spans repositories and Office records.
- **Sidebar.** An Argo is a row with its own icon and status pill, and its live children
  nest under it. Section heading "Argo". This reuses the scheduled-thread marker path in the sidebar and the
  existing grouping. Collapsed by default when paused.
- **Fleet view.** The existing `/workspace` route already lists threads with status,
  provider, branch, and plan progress, and has filters for attention, working, and OMP.
  Add an Argo filter and an Argo column, and render the cycle log table beneath the rows
  when one Argo is selected. This is the fleet view. No new surface.
- **Argo thread.** Opening an Argo opens its thread. The record header is pinned at
  the top: name, status pill, interval, max children, child model, child runtime mode, and
  the mission editor. Everything below is the normal transcript.
- **Office.** The Office "Agents" nav entry and the Overview "Agents working" row list
  Argos first, then unmanaged threads. Same list as the fleet view, filtered.
- **Command palette and keybinding.** New Argo, pause or resume Argo, cycle now, open
  fleet view. Same entries as the sidebar so the entry points match.
- **Mobile.** Read the fleet view and the log, toggle pause, send a directive. No mission
  editing on mobile in the first cut.

### Interaction

- **Create.** "New Argo" from the sidebar or palette. You get an empty record in
  `no-mission` state with the mission editor focused. Nothing runs until the mission has
  text.
- **Brief.** Write the mission as prose. Mention records with `@`. Save is immediate and
  takes effect on the next cycle.
- **Direct.** Type in the Argo thread as in any thread. Your message is a directive,
  recorded `authoredBy: "user"`, and folded into the next cycle. A "Cycle now" button runs
  a cycle immediately instead of waiting.
- **Watch.** The sidebar pill shows watching, paused, or no mission. The fleet view shows
  children and the log. A child needing approval or input surfaces in the existing
  attention filter and sidebar badge, same as any thread.
- **Intervene.** Open any child and work in it directly. Your messages there are
  `authoredBy: "user"` and outrank the manager. The manager sees the change in its next
  status table.
- **Pause.** Click the pill. Children keep running; the manager stops cycling.
- **Delete.** From the thread menu. Choose keep children or close children.

### Provider decisions

The Argo thread runs on any provider that accepts Pulse tools over MCP. Children run on
any provider. Where a provider cannot take MCP tools, Argo cannot run there and the picker
says so. Codex, Claude, and OpenCode are the first three, matching Scape's
support list.

## 5. Visual model

One rule, taken from how Scape lays out its roles: a role is drawn where the thing it
governs lives. Hierarchy is shown once, by nesting. Everything else is a pill or a badge.
The record is the control surface; there is no dashboard and no settings page per role.

| Role      | Governs           | Drawn at                                                 | Toggle                                                | Escalation                                                                     |
| --------- | ----------------- | -------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Watchdog  | one thread        | thread header and sidebar row                            | header switch, also in the row's context menu         | "Watchdog stuck" banner with a "Take action" button on the thread card and row |
| Argo      | many threads      | sidebar row with children nested under it, fleet view    | the status pill itself (Watching, Paused, No mission) | a child needing approval or input badges the child row and the Argo row        |
| Assistant | nothing           | persistent sidebar or Office panel, not a per-thread tab | none                                                  | none                                                                           |
| Subagent  | provider internal | right-panel Subagents tab only                           | none                                                  | none                                                                           |

Consequences for what already exists:

- The Watchdog right-panel tab stays as the rules editor, but the on/off switch belongs in
  the thread header and the state must show on the sidebar row. A toggle that lives only
  in a side tab has no visible reverse state.
- The Assistants right-panel tab becomes a jump to the assistant panel once the record
  exists. Luna's home is a sidebar panel with avatar, rename, and reset, as in Scape.
- Argo's status pill is the pause toggle. No separate button.
- Argo children get one toolbar row each in the fleet view: status, pause, remove. This
  is Scape's rendezvous per-agent toolbar reused, without adopting rendezvous.
- Provenance badges on messages are Pulse-only. Scape wraps relayed text for the model
  and shows the user nothing.

## Fork safety

All additions are optional fields, new records, or new surfaces. No wire name, storage key,
package name, or message role literal changed. Upstream cherry-picks that touch the
subagent panel still apply, since the surface kind is unchanged and only labels moved.
