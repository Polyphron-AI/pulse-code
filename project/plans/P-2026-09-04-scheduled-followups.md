---
plan_id: P-2026-09-04-scheduled-followups
created_by: Codex GPT-5.6
created_at: 2026-09-04T00:00:00+02:00
target_executor: Codex
project: Pulse Code
baseline_sha: 38e061e5f
baseline_tag: research-complete-cr-proposed-2026-09-04
goal_contract_version: 2
dispatcher_hint: frontier
estimated_tasks: 13
opus_session_turns: 0
roadmap_item: R-2026-08-21-scheduled-chats
execution_gate: CR-2026-09-04-native-scheduling-approved
---

# Native scheduled follow-ups implementation plan

Build the first complete native scheduling slice: an exact one-off can be created from any thread,
through `/schedule`, or through the provider-neutral Pulse MCP tool; it returns to the selected
thread, records every disposition, and remains visible after completion.

Design authority: [Native scheduling design](../../docs/plans/2026-09-04-native-scheduling-design.md)
Research: [Scheduled AI agents and chats](../../docs/research/scheduled-ai-agents-and-chats.md)
Change control: [CR-2026-09-04-native-scheduling](../../prd/change-requests/CR-2026-09-04-native-scheduling.md)
Next plan: [Calendar recurrence and scheduler board](P-2026-09-04-calendar-scheduler-board.md)

## Execution gate

Do not begin implementation until the change request accepts the new cadence, destination, and
context decisions and the roadmap item is reshaped. This plan records implementation work; it does
not itself approve the scope change.

## Locked decisions

- Pulse owns canonical schedules and invokes providers through ordinary orchestration turns.
- Existing interval schedules keep their persisted and runtime behavior.
- Native schedule mutations use a reject-safe command boundary and advertised environment
  capabilities; an old server must never turn a one-off into a legacy daily schedule.
- An existing-thread destination retains that thread's identity and does not acquire
  `schedule:<id>` origin.
- One-off schedules complete after one terminal disposition and remain inspectable.
- Existing-thread one-offs default to Resume and defer while their thread is active.
- Schedule-owned recurring chats remain Fresh by default and keep their handoff behavior.
- Agent tools derive environment and thread scope from the MCP credential.
- Explicit user scheduling intent may authorize creation; other agent suggestions remain proposals.
- No event triggers, arbitrary cron, run chaining, or provider-native schedule synchronization.

## Research summary

- `packages/contracts/src/schedule.ts` stores required local hour/minute fields plus an optional
  elapsed interval; there is no one-off, destination, completed lifecycle, or context policy.
- `apps/server/src/orchestration/decider.ts` and `projector.ts` already provide the event-sourced
  mutation seam and latest occurrence rollup.
- `ScheduleReactor.ts` resolves or creates schedule-owned threads and explicitly dispatches every
  turn with `sessionMode: "fresh"`.
- `ExecutionEnvironmentCapabilities` is the established mixed-version gate. Scheduled Chats
  currently rely on snapshot shape instead of an advertised native-trigger capability.
- Client commands already flow through `packages/client-runtime/src/operations/commands.ts` and
  environment atoms, so new entry points should reuse that path.
- Web and mobile each have built-in slash-command lists. `/schedule` does not exist.
- Web already aggregates schedules from connected environment shell snapshots; mobile has an
  environment-specific editor.
- The MCP HTTP server has a provider/session/thread-scoped credential but grants only `preview` and
  registers only the preview toolkit.
- No RRULE dependency or schedule-run history RPC exists. Those belong to Phase 2.
- The stale `P-2026-08-26-sidebar-scheduled-chats/T2` task overlaps the navigation surface. This
  plan preserves its shipped sidebar projection and does not reopen its desktop packaging gate.

## Gap classification

- **High:** `CR-2026-09-04-native-scheduling` is proposed. Implementation remains gated until the
  product, engineering compatibility, and roadmap sign-offs are recorded.
- **Medium:** provider resume support has not been proven uniformly. T12 owns the explicit matrix;
  unsupported providers retain fresh schedule-owned chats.
- **Medium:** the stale sidebar plan still reports its visual/package task blocked even though its
  projection is present on the remote baseline. This plan treats the current code as the interface
  and does not modify that plan's historical task state.
- **Deferred:** calendar recurrence, global run history, notifications, event triggers, spend caps,
  and tool/network policies are outside Phase 1.

## File targets

| Family         | Primary paths                                                                  | Purpose                                                                 |
| -------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Contracts      | `packages/contracts/src/schedule.ts`, `environment.ts`, `orchestration.ts`     | Native trigger, destination, lifecycle, capability, commands and events |
| Domain         | `apps/server/src/orchestration/decider.ts`, `projector.ts`                     | Validate and project one-off schedules                                  |
| Runtime        | `apps/server/src/orchestration/Layers/ScheduleReactor.ts`                      | Due calculation, thread attachment, context mode, completion            |
| Client runtime | `packages/client-runtime/src/operations/commands.ts`, `state/orchestration.ts` | Shared native command path and draft helpers                            |
| MCP            | `apps/server/src/mcp/**`                                                       | Thread-scoped propose/create/list/cancel tools                          |
| Web            | `apps/web/src/composer-logic.ts`, `components/chat/**`, `ChatView.tsx`         | `/schedule` and confirmation dialog                                     |
| Mobile         | `apps/mobile/src/features/threads/**`                                          | `/schedule` and confirmation sheet                                      |
| Management     | Existing web/mobile Scheduled settings                                         | Completed one-offs and destination/context fields                       |

## Task DAG

### T1: Add native schedule trigger and destination contracts

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 1
- blocked_by: []
- blocks: [T3, T4, T5, T7, T8]
- files_touched: [packages/contracts/src/schedule.ts, packages/contracts/src/schedule.test.ts, packages/contracts/src/orchestration.ts]
- exclusive_resources: [schedule-contract]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Contracts define exact one-off and legacy-compatible interval triggers, existing-thread and schedule-owned destinations, explicit context/misfire/overlap policy, and Completed lifecycle state.
  - Native command tags reject safely on servers that do not understand them while legacy create/update commands remain decodable.
  - Pure helpers derive a legacy trigger, identify one-off completion, and construct stable occurrence keys without changing existing schedule identities.
  - Contract tests cover old events/snapshots, native round trips, unknown tags, invalid destination combinations, and exact timestamps.
  - `vp test run packages/contracts/src/schedule.test.ts` and the contracts typecheck pass.

### T2: Advertise native scheduling capabilities

- kind: protective
- status: pending
- estimate: 75 minutes
- dag_level: 1
- blocked_by: []
- blocks: [T4, T6, T9, T10]
- files_touched: [packages/contracts/src/environment.ts, packages/contracts/src/environment.test.ts, apps/server/src/environment/ServerEnvironment.ts, apps/server/src/environment/ServerEnvironment.test.ts]
- exclusive_resources: [environment-capabilities]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The environment descriptor independently advertises native triggers, thread destinations, and agent schedule tools.
  - Older descriptors decode with each capability absent and clients can treat absence as unsupported.
  - The server advertises only capabilities backed by the landed command and MCP surfaces.
  - Focused descriptor tests cover old-client/new-server and new-client/old-server decoding.
  - Targeted contracts and server environment tests pass.

### T3: Decide and project native one-off schedules

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 2
- blocked_by: [T1]
- blocks: [T4, T5, T7]
- files_touched: [apps/server/src/orchestration/decider.ts, apps/server/src/orchestration/decider.schedules.test.ts, apps/server/src/orchestration/projector.ts, apps/server/src/orchestration/projector.test.ts]
- exclusive_resources: [schedule-domain]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The decider rejects missing/deleted destination threads, cross-project thread targets, past one-off creation, and invalid context/destination combinations.
  - Native create/update events preserve trigger, destination, execution policy, and lifecycle while legacy event replay produces unchanged schedules.
  - One-off completion is an event-sourced transition and cannot be resumed as recurring work without an explicit update.
  - Exactly-once rejection still applies to scheduled and manual starts.
  - Focused decider and projector tests pass under deterministic clocks.

### T4: Expose native schedule commands through client runtime

- kind: implementation
- status: pending
- estimate: 90 minutes
- dag_level: 3
- blocked_by: [T1, T2, T3]
- blocks: [T7, T9, T10, T11]
- files_touched: [packages/client-runtime/src/operations/commands.ts, packages/client-runtime/src/operations/commands.test.ts, packages/client-runtime/src/state/orchestration.ts]
- exclusive_resources: [client-schedule-commands]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Client runtime exposes native create/update commands through the existing per-schedule serial scheduler.
  - Callers must provide the matching advertised capability before native dispatch.
  - Legacy interval command helpers remain unchanged for connected older servers.
  - Command tests prove timestamp and ID generation, payload preservation, and reject-safe native tags.
  - Focused client-runtime tests and typecheck pass.

### T5: Fire and complete existing-thread one-offs

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 3
- blocked_by: [T1, T3]
- blocks: [T11, T12, T13]
- files_touched: [apps/server/src/orchestration/Layers/ScheduleReactor.ts, apps/server/src/orchestration/Layers/ScheduleReactor.test.ts]
- exclusive_resources: [schedule-reactor]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - A due one-off uses the stored existing thread without changing its origin or creating another thread.
  - Resume or Fresh reaches `thread.turn.start` exactly as selected and adapter support is checked before start.
  - An active destination thread defers a one-off without advancing its occurrence cursor; the later start records its original scheduled time and catch-up state.
  - A terminal one-off run completes the schedule and cannot fire again after restart or a double sweep.
  - Reactor tests use Effect clocks and receipts for on-time, host catch-up, overlap defer, failure, manual run, restart, and completion cases.

### T6: Grant a thread-scoped MCP schedule capability

- kind: protective
- status: pending
- estimate: 100 minutes
- dag_level: 2
- blocked_by: [T2]
- blocks: [T7, T12]
- files_touched: [apps/server/src/mcp/McpInvocationContext.ts, apps/server/src/mcp/McpInvocationContext.test.ts, apps/server/src/mcp/McpSessionRegistry.ts, apps/server/src/mcp/McpSessionRegistry.test.ts]
- exclusive_resources: [mcp-session-capabilities]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - MCP credentials can carry independent `preview` and `schedule` capabilities scoped to environment, provider session, and thread.
  - Schedule capability issuance does not depend on the browser-preview setting.
  - Expiry, touch, revoke-session, revoke-thread, and revoke-all behavior is unchanged for every capability.
  - Capability failures expose bounded schedule-specific errors without prompt, token, or credential material.
  - Focused MCP context and registry tests pass.

### T7: Register schedule proposal and mutation MCP tools

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 4
- blocked_by: [T1, T3, T4, T6]
- blocks: [T12, T13]
- files_touched: [apps/server/src/mcp/McpHttpServer.ts, apps/server/src/mcp/toolkits/schedule/tools.ts, apps/server/src/mcp/toolkits/schedule/handlers.ts, apps/server/src/mcp/toolkits/schedule/tools.test.ts, apps/server/src/mcp/McpHttpServer.test.ts]
- exclusive_resources: [mcp-schedule-toolkit]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - `schedule_propose`, `schedule_create`, `schedule_list`, and `schedule_cancel` have bounded schemas and explicit read-only/destructive annotations.
  - Handlers derive environment and thread from the credential and cannot target arbitrary IDs supplied by a model.
  - Ambiguous timing returns missing fields; explicit creation returns schedule ID, normalized timezone, next run, and destination.
  - Mutation requires explicit current-turn scheduling authority and is idempotent under tool retries.
  - Focused MCP toolkit and HTTP registration tests pass without changing preview tools.

### T8: Add a shared schedule draft normalizer

- kind: implementation
- status: pending
- estimate: 90 minutes
- dag_level: 1
- blocked_by: []
- blocks: [T9, T10]
- files_touched: [packages/client-runtime/src/scheduling/scheduleDraft.ts, packages/client-runtime/src/scheduling/scheduleDraft.test.ts]
- exclusive_resources: [schedule-draft]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The draft represents instruction, once/repeat choice, exact local time, timezone, destination, context mode, and advanced execution fields without UI types.
  - Deterministic helpers identify fields still requiring user input and format an absolute confirmation and next run.
  - A single dated request defaults to Once; an unspecified cadence remains unresolved and triggers the follow-up question.
  - Ambiguous numeric dates are never silently resolved without a long-form preview.
  - Focused client-runtime tests cover the Takealot example and timezone boundaries.

### T9: Add `/schedule` and the review dialog on web

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 4
- blocked_by: [T2, T4, T8]
- blocks: [T13]
- files_touched: [apps/web/src/composer-logic.ts, apps/web/src/composer-logic.test.ts, apps/web/src/components/chat/ChatComposer.tsx, apps/web/src/components/chat/ScheduleDraftDialog.tsx, apps/web/src/components/ChatView.tsx]
- exclusive_resources: [web-chat-composer]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - `/schedule` appears with built-in commands and opens a draft instead of sending text to the provider.
  - The thread overflow and command palette can open the same current-thread draft.
  - The dialog asks Once or Repeat only when unresolved and shows full date, timezone, destination, context, and next run before creation.
  - Native controls hide or explain update-required state when server capabilities are absent.
  - Focused composer tests, web typecheck, and one authorized real-client pass cover keyboard and pointer creation.

### T10: Add `/schedule` and the review sheet on mobile

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 4
- blocked_by: [T2, T4, T8]
- blocks: [T13]
- files_touched: [apps/mobile/src/features/threads/ThreadComposer.tsx, apps/mobile/src/features/threads/ScheduleDraftSheet.tsx, apps/mobile/src/features/threads/scheduleDraftSheet.test.tsx, apps/mobile/src/features/threads/ThreadSettingsSheet.tsx]
- exclusive_resources: [mobile-thread-composer]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Mobile built-in commands include `/schedule` and open the shared draft in the active thread.
  - The sheet supports keyboard-safe date/time, timezone, destination, context, and confirmation controls.
  - A thread settings action reaches the same sheet and capability-disabled states are explicit.
  - Successful creation closes the sheet, shows the normalized next run, and links to schedule management.
  - Focused mobile tests and typecheck pass; one authorized iOS or Android client pass verifies the flow.

### T11: Show destinations and completed one-offs in schedule management

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 4
- blocked_by: [T4, T5]
- blocks: [T13]
- files_touched: [apps/web/src/components/settings/ScheduledChatsSettings.tsx, apps/mobile/src/features/settings/SettingsScheduledChatsRouteScreen.logic.ts, apps/mobile/src/features/settings/SettingsScheduledChatsRouteScreen.logic.test.ts, apps/mobile/src/features/settings/SettingsScheduledChatsRouteScreen.tsx]
- exclusive_resources: [schedule-settings-ui]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Web and mobile display Once, completed state, exact scheduled time, existing-thread destination, and Fresh/Resume context.
  - Completed one-offs remain openable, duplicable, and deletable and cannot expose Run now or Resume as if recurring.
  - Existing interval schedules retain their current editor and status behavior.
  - Unsupported native schedules render an update-required read-only state rather than disappearing.
  - Focused logic tests and web/mobile typechecks pass.

### T12: Verify provider resume and MCP behavior

- kind: verification
- status: pending
- estimate: 120 minutes
- dag_level: 5
- blocked_by: [T5, T6, T7]
- blocks: [T13]
- files_touched: [apps/server/src/provider/Layers/CodexAdapter.test.ts, apps/server/src/provider/Layers/ClaudeAdapter.test.ts, apps/server/src/provider/Layers/CursorAdapter.test.ts, apps/server/src/provider/Layers/GrokAdapter.test.ts, apps/server/src/provider/Layers/OpenCodeAdapter.test.ts]
- exclusive_resources: [provider-schedule-matrix]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Each provider has a focused result for fresh scheduled turns, resume of an existing thread, MCP schedule-tool discovery, and unsupported-mode reporting.
  - A provider that cannot resume is excluded only from Resume, not from fresh schedule-owned chats.
  - MCP configuration contains no bearer value in logs, events, checkpoints, or assertion output.
  - Adapter stop/restart and session-recovery behavior does not duplicate the scheduled user message.
  - The five focused adapter test files pass.

### T13: Run the Phase 1 compatibility and documentation gate

- kind: verification
- status: pending
- estimate: 120 minutes
- dag_level: 6
- blocked_by: [T5, T7, T9, T10, T11, T12]
- blocks: []
- files_touched: [docs/user/scheduled-chats.md, docs/internals/scheduled-chats.md, prd/12-scheduled-chats.md, project/state/shards/roadmap.yaml]
- exclusive_resources: [native-scheduling-release-gate]
- writes_shared_state: true
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - User docs explain one-off creation, `/schedule`, destination/context choices, host availability, catch-up, overlap, completion, and recovery.
  - Internal docs record command/event compatibility, MCP scope, provider results, and why run history remains deferred to Phase 2.
  - Focused contracts, server, client-runtime, web, and mobile suites and package typechecks pass without a repository-wide check.
  - One authorized integrated web/desktop pass and one authorized mobile pass verify creation, fire, completion, and board visibility against disposable state.
  - The PRD and roadmap history record the implementation and honest release state only after the receipts exist.

## Dispatch plan

- task count: 13
- critical-path length: 6 tasks (`T1 → T3 → T4 → T7 → T12 → T13`)
- width: 4
- level 1: T1, T2, and T8
- level 2: T3 and T6
- level 3: T4 and T5
- level 4: T7, T9, T10, and T11
- level 5: T12
- level 6: T13
- over-serialization: false; shared contract/domain files create the critical path, while client surfaces fan out after the common command and draft seams.

## Goal DoD

- G1: An unambiguous request for one exact future date creates a one-off schedule with the displayed absolute time and IANA timezone. - satisfied_by: [T1, T3, T8, T9, T10]
- G2: A schedule created from a thread returns to that same durable thread without changing its identity or origin. - satisfied_by: [T1, T3, T5]
- G3: The user can invoke `/schedule` and the equivalent thread action on web, desktop, and mobile. - satisfied_by: [T9, T10]
- G4: Pulse asks Once or Repeat only when cadence is absent or ambiguous. - satisfied_by: [T8, T9, T10]
- G5: Every provider can expose the Pulse schedule tools or report the unsupported capability without changing schedule truth. - satisfied_by: [T6, T7, T12]
- G6: A one-off fires at most once, reaches Completed, survives restart/replay, and remains inspectable. - satisfied_by: [T1, T3, T5, T11]
- G7: Active-thread overlap and offline-host catch-up produce explicit deferred, started, skipped, or failed evidence rather than silence. - satisfied_by: [T3, T5]
- G8: Old schedules and clients keep working, and an old server cannot misinterpret native trigger fields. - satisfied_by: [T1, T2, T3, T4, T13]
- G9: Existing run leashes, authentication probes, dirty-tree policy, checkpoint diffs, and remote server ownership remain enforced. - satisfied_by: [T5, T12, T13]
- G10: Focused automated and authorized real-client receipts cover the complete creation-to-completion journey across applicable surfaces. - satisfied_by: [T9, T10, T11, T12, T13]

## Verification budget

- Contracts: schedule and environment compatibility tests plus typecheck.
- Server: schedule decider/projector/reactor and MCP toolkit tests plus typecheck.
- Client runtime: command and schedule-draft tests plus typecheck.
- Web: composer/settings tests and package typecheck.
- Mobile: composer/settings logic tests and package typecheck.
- Integrated: one disposable-state web/desktop pass and one mobile pass after explicit computer-use approval.
- Never run `vp check` or the repository-wide test/typecheck suite for this plan.

## Close-of-execution contract

- Phase 1 may ship without RRULE recurrence or paginated run history.
- Do not mark the native scheduler released until mixed-version and provider-matrix receipts exist.
- Preserve completed one-offs and all occurrence evidence during rollback.
- Record the implementation commit and verification receipts in the task and goal ledgers.
- Begin Phase 2 only after G1–G10 are satisfied and the trigger/destination contract has completed one release-candidate pass.

---

**Created:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** proposed . **Owner:** Engineering
