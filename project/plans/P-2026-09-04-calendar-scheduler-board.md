---
plan_id: P-2026-09-04-calendar-scheduler-board
created_by: Codex GPT-5.6
created_at: 2026-09-04T00:00:00+02:00
target_executor: Codex
project: Pulse Code
baseline_sha: 38e061e5f
baseline_tag: blocked-by-scheduled-followups
goal_contract_version: 2
dispatcher_hint: frontier
estimated_tasks: 12
opus_session_turns: 0
roadmap_item: R-2026-08-21-scheduled-chats
depends_on_plan: P-2026-09-04-scheduled-followups
execution_gate: phase-1-goal-closed
---

# Calendar recurrence and scheduler board implementation plan

Add calendar-aware recurrence, bounded run history, a cross-environment scheduler board, and result
notifications after the native trigger/destination foundation is verified.

Design authority: [Native scheduling design](../../docs/plans/2026-09-04-native-scheduling-design.md)
Research: [Scheduled AI agents and chats](../../docs/research/scheduled-ai-agents-and-chats.md)
Prerequisite: [Native scheduled follow-ups](P-2026-09-04-scheduled-followups.md)

## Execution gate

Do not start this plan until the Phase 1 goal contract is closed. Re-open this plan's baseline if
Phase 1 changes trigger, destination, lifecycle, command tags, or schedule capability names.

## Locked decisions

- RFC 5545 RRULE is the canonical calendar recurrence representation.
- Existing elapsed intervals remain supported and do not silently change to wall-clock recurrence.
- Presets cover Daily, Weekdays, Weekly, Monthly, Quarterly, and Annually; Custom edits the supported
  RRULE subset.
- Timezone is an IANA name and every create/edit confirmation previews the next three local runs.
- Missed recurring work defaults to Run latest; Skip is available. Run all is deferred.
- Recurring overlap skips with a visible run record.
- Full run history is paginated on demand and never embedded in shell snapshots.
- The existing Scheduled sidebar opens one global board; Settings links into the same management
  surface rather than becoming a second source of truth.
- Completed one-offs, paused schedules, failures, and delays remain filterable.
- No continuously updating countdowns or one-subscription-per-schedule design.

## Research summary

- The schedule shell currently carries complete definitions and latest per-project state, which is
  enough for board rows but not immutable history.
- Occurrence events already exist in the event store; a query projection can derive run pages
  without adding a second scheduler database.
- `apps/web/src/state/schedules.ts` already aggregates schedule definitions across connected
  environments and preserves environment IDs.
- The sidebar's Scheduled mode currently activates a thread or sends a threadless schedule to
  Settings. It can route to a board without changing schedule truth.
- Mobile has an environment-specific Scheduled Chats settings screen and notification navigation,
  but no global schedule board.
- No RRULE library is installed. Dependency choice needs an explicit size, maintenance, timezone,
  and correctness check before adoption.
- Agent activity publishing is capability-gated and can carry bounded schedule-result navigation
  without exposing prompt or diff contents.

## File targets

| Family         | Primary paths                                                 | Purpose                                                 |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Recurrence     | `packages/contracts/src/scheduleRecurrence.ts`, `schedule.ts` | RRULE validation, occurrence calculation, presets       |
| Domain runtime | `decider.ts`, `projector.ts`, `ScheduleReactor.ts`            | Calendar commands, next-run state, catch-up and overlap |
| Run history    | Contracts/RPC plus `scheduleRunHistory.ts`                    | Bounded event-derived run pages                         |
| Client runtime | Orchestration query atoms and query operations                | Capability-gated history loading                        |
| Web            | Schedule state, board route/components, sidebar, editors      | Global board, history drawer, recurrence creation       |
| Mobile         | Schedule board route, editors, notification navigation        | Native management and result delivery                   |
| Documentation  | User/internal Scheduled Chats docs and PRD                    | Published semantics and release evidence                |

## Gap classification

- **High:** Phase 1 is an execution prerequisite. This plan cannot safely begin against the legacy
  implicit trigger/destination contract.
- **Medium:** no recurrence dependency has been selected. T1 makes the package decision from
  measured compatibility and DST fixtures before T2 changes the contracts.
- **Medium:** immutable run history exists only as canonical events, with no bounded query seam. T4
  through T6 introduce that seam without expanding shell payloads.
- **Deferred:** spend caps, per-tool/network permissions, event triggers, deterministic command
  jobs, and team ownership require later change control.

## Task DAG

### T1: Select and verify the recurrence engine

- kind: protective
- status: pending
- estimate: 90 minutes
- dag_level: 1
- blocked_by: []
- blocks: [T2]
- files_touched: [package.json, packages/contracts/package.json, packages/contracts/src/scheduleRecurrence.test.ts]
- exclusive_resources: [schedule-recurrence-dependency]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The selected dependency supports the required RRULE subset and IANA timezone calculations on Node, web, and React Native, or the task records a no-dependency implementation decision.
  - Bundle size, maintenance state, license, ESM compatibility, and DST behavior are measured and recorded.
  - A focused red-capable fixture covers monthly, quarterly, annual, DST gap, DST repeat, COUNT, and UNTIL cases before contract integration.
  - Only the package manifests needed by the selected ownership boundary change.
  - The focused fixture test passes with deterministic timestamps.

### T2: Implement calendar recurrence contracts and helpers

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 2
- blocked_by: [T1]
- blocks: [T3, T4, T7, T9]
- files_touched: [packages/contracts/src/schedule.ts, packages/contracts/src/schedule.test.ts, packages/contracts/src/scheduleRecurrence.ts, packages/contracts/src/scheduleRecurrence.test.ts]
- exclusive_resources: [schedule-contract]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Calendar triggers validate the supported RRULE subset, local start, and IANA timezone.
  - Pure helpers return the next occurrence and a bounded preview without client-specific code.
  - Quarterly recurrence is anchored every three calendar months rather than approximated as weeks or days.
  - Invalid/unbounded rules fail with stable user-safe reasons.
  - Focused tests cover presets, DST, leap year, end-of-month, COUNT/UNTIL, and legacy intervals.

### T3: Decide, project, and fire calendar occurrences

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 3
- blocked_by: [T2]
- blocks: [T8, T9, T12]
- files_touched: [apps/server/src/orchestration/decider.ts, apps/server/src/orchestration/decider.schedules.test.ts, apps/server/src/orchestration/projector.ts, apps/server/src/orchestration/Layers/ScheduleReactor.ts, apps/server/src/orchestration/Layers/ScheduleReactor.test.ts]
- exclusive_resources: [schedule-domain, schedule-reactor]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Create/update validates calendar triggers through the contract helper and projects the exact next run.
  - The reactor fires the correct occurrence across restart, clock advance, DST, monthly, and quarterly boundaries.
  - Run latest and Skip produce distinct visible dispositions with original scheduled and actual start times.
  - Recurring overlap skips exactly one due occurrence without duplicating the next.
  - Existing interval and Phase 1 one-off reactor tests remain green.

### T4: Define paginated schedule-run history contracts

- kind: implementation
- status: pending
- estimate: 90 minutes
- dag_level: 3
- blocked_by: [T2]
- blocks: [T5, T6]
- files_touched: [packages/contracts/src/schedule.ts, packages/contracts/src/schedule.test.ts, packages/contracts/src/orchestration.ts, packages/contracts/src/rpc.ts]
- exclusive_resources: [schedule-run-contract]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Run records expose scheduled, eligible, start, and settle times; trigger source; catch-up state; status/reason; and project/thread/turn/output pointers.
  - The query accepts environment-local schedule ID, bounded page size, and a stable opaque cursor.
  - Run payloads exclude prompts, credentials, diffs, and unbounded messages.
  - A separate environment capability advertises run history to mixed-version clients.
  - Contract and RPC schema tests cover page bounds, cursor round trips, and old descriptors.

### T5: Project schedule-run pages from the event store

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 4
- blocked_by: [T4]
- blocks: [T6, T12]
- files_touched: [apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts, apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts, apps/server/src/ws.ts, apps/server/src/server.test.ts, apps/server/src/auth/RpcAuthorization.ts]
- exclusive_resources: [schedule-run-query]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The query derives immutable run rows from canonical events without introducing a second writable schedule store.
  - Pagination is stable for equal timestamps, multiple projects, manual runs, skipped runs, and replayed events.
  - Authorization follows the existing environment RPC boundary and missing/deleted schedule results are bounded.
  - Query cost is capped by page size and indexed/event-store access rather than full history in shell projection.
  - Focused query and RPC tests pass.

### T6: Add schedule-run queries to client runtime

- kind: implementation
- status: pending
- estimate: 75 minutes
- dag_level: 5
- blocked_by: [T4, T5]
- blocks: [T7, T8, T10]
- files_touched: [packages/client-runtime/src/state/orchestration.ts, packages/client-runtime/src/state/orchestration.test.ts, packages/client-runtime/src/operations/queries.ts, packages/client-runtime/src/operations/queries.test.ts]
- exclusive_resources: [client-schedule-history]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Client runtime exposes capability-gated first and next page queries keyed by environment and schedule.
  - Cache keys isolate environments and cursors and do not create a subscription per schedule.
  - Disconnect and reconnect preserve bounded stale data while preventing mutation against an unavailable environment.
  - Old servers do not receive unknown history RPC calls.
  - Focused query/state tests and client-runtime typecheck pass.

### T7: Build shared board rows, filters, and cadence labels

- kind: implementation
- status: pending
- estimate: 100 minutes
- dag_level: 6
- blocked_by: [T2, T6]
- blocks: [T8, T9, T10]
- files_touched: [apps/web/src/state/schedules.ts, apps/web/src/state/schedules.test.ts, apps/web/src/components/schedules/scheduleBoardLogic.ts, apps/web/src/components/schedules/scheduleBoardLogic.test.ts]
- exclusive_resources: [web-schedule-board-model]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Cross-environment rows include cadence, next run, destination, lifecycle, last result, host state, unread state, and stable navigation identity.
  - Filters implement All, Active, Paused, Completed, Needs attention, environment/project, and cadence.
  - Calendar labels and next-run values use contract helpers and never approximate quarterly recurrence.
  - Sorting is stable and does not recompute continuously while idle.
  - Focused aggregation/filter tests cover disconnected and mixed-version environments.

### T8: Add the web scheduler board and run drawer

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 8
- blocked_by: [T3, T6, T7, T9]
- blocks: [T10, T12]
- files_touched: [apps/web/src/routes/_chat.schedules.tsx, apps/web/src/components/schedules/ScheduleBoard.tsx, apps/web/src/components/schedules/ScheduleRunDrawer.tsx, apps/web/src/components/Sidebar.tsx, apps/web/src/components/settings/ScheduledChatsSettings.tsx]
- exclusive_resources: [web-scheduler-board]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Scheduled sidebar mode and Settings management links open one board route.
  - The board renders all required filters and row fields without loading history for closed rows.
  - Opening a row fetches bounded run pages and links each run to its thread/turn when available.
  - Run now, edit, pause/resume, duplicate, delete, and open-thread actions use existing command paths and disable while the owning environment is unavailable.
  - Focused logic/component tests, web typecheck, and one authorized real-client pass verify desktop and responsive layouts.

### T9: Extend web and mobile recurrence editors

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 7
- blocked_by: [T2, T3, T7]
- blocks: [T11, T12]
- files_touched: [apps/web/src/components/chat/ScheduleDraftDialog.tsx, apps/web/src/components/settings/ScheduledChatsSettings.tsx, apps/mobile/src/features/threads/ScheduleDraftSheet.tsx, apps/mobile/src/features/settings/SettingsScheduledChatsRouteScreen.logic.ts, apps/mobile/src/features/settings/SettingsScheduledChatsRouteScreen.tsx]
- exclusive_resources: [schedule-recurrence-editors]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Editors offer Daily, Weekdays, Weekly, Monthly, Quarterly, Annually, and Custom recurrence.
  - Create and edit show the next three exact local occurrences and explicit timezone.
  - Invalid custom rules cannot save and expose the contract's bounded reason.
  - Existing interval schedules open without semantic conversion unless the user chooses a calendar preset.
  - Focused web/mobile logic tests and package typechecks pass.

### T10: Add the mobile scheduler board and run history

- kind: implementation
- status: pending
- estimate: 120 minutes
- dag_level: 7
- blocked_by: [T6, T7]
- blocks: [T11, T12]
- files_touched: [apps/mobile/src/Stack.tsx, apps/mobile/src/features/schedules/ScheduleBoardRouteScreen.tsx, apps/mobile/src/features/schedules/ScheduleBoardRouteScreen.logic.ts, apps/mobile/src/features/schedules/ScheduleBoardRouteScreen.logic.test.ts, apps/mobile/src/features/settings/SettingsRouteScreen.tsx]
- exclusive_resources: [mobile-scheduler-board]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Mobile exposes the same lifecycle filters and cross-environment schedule identities in a native route.
  - Schedule detail fetches run pages only when opened and supports the same valid controls as web.
  - Disconnected environments, completed one-offs, unread results, and Needs attention states remain visible and understandable.
  - Long lists and history pages remain responsive without timers or per-row subscriptions.
  - Focused mobile tests, typecheck, and one authorized iOS or Android client pass succeed.

### T11: Publish bounded schedule-result notifications

- kind: implementation
- status: pending
- estimate: 100 minutes
- dag_level: 8
- blocked_by: [T9, T10]
- blocks: [T12]
- files_touched: [packages/contracts/src/relay.ts, apps/server/src/relay/AgentAwarenessRelay.ts, apps/server/src/relay/AgentAwarenessRelay.test.ts, apps/mobile/src/features/agent-awareness/notificationNavigation.ts, apps/mobile/src/features/agent-awareness/notificationNavigation.test.ts]
- exclusive_resources: [schedule-result-notifications]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Completed and Needs attention runs can publish one bounded activity carrying only schedule, environment, project, thread, and navigation identifiers.
  - Prompt contents, credentials, diffs, and assistant output are excluded.
  - Publishing obeys the existing environment capability and user opt-in.
  - Notification navigation opens the board detail or linked thread and clears the corresponding unread state.
  - Focused publisher and navigation tests pass.

### T12: Run the calendar scheduler release gate

- kind: verification
- status: pending
- estimate: 120 minutes
- dag_level: 9
- blocked_by: [T3, T5, T8, T9, T10, T11]
- blocks: []
- files_touched: [docs/user/scheduled-chats.md, docs/internals/scheduled-chats.md, prd/12-scheduled-chats.md, project/state/shards/roadmap.yaml]
- exclusive_resources: [calendar-scheduler-release-gate]
- writes_shared_state: true
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - User docs cover presets, custom recurrence, timezone/DST, catch-up, overlap, board filters, history, notifications, and recovery.
  - Internal docs record recurrence ownership, run-query pagination, payload bounds, and compatibility behavior.
  - Focused contracts, server, client-runtime, web, and mobile tests and typechecks pass without repository-wide checks.
  - One authorized integrated pass verifies one-off, weekly, monthly, and quarterly schedules plus restart, offline, overlap, history, and notification navigation.
  - PRD and roadmap state change only after all receipts exist and honestly distinguish implemented, released, and observed behavior.

## Dispatch plan

- task count: 12
- critical-path length: 9 tasks (`T1 → T2 → T4 → T5 → T6 → T7 → T10 → T11 → T12`)
- width: 3
- level 1: T1
- level 2: T2
- level 3: T3 and T4
- level 4: T5
- level 5: T6
- level 6: T7
- level 7: T9 and T10
- level 8: T8 and T11
- level 9: T12
- over-serialization: false; recurrence and history foundations are necessarily ordered, while the web board, editors, and mobile board fan out after the shared model.

## Goal DoD

- G1: Users can create daily, weekday, weekly, monthly, quarterly, annual, and supported custom calendar recurrence with exact timezone previews. - satisfied_by: [T1, T2, T3, T9]
- G2: Existing elapsed intervals keep their prior semantics and do not convert without explicit user action. - satisfied_by: [T2, T3, T9]
- G3: Restart, DST, catch-up, and overlap produce exactly one visible disposition per due occurrence. - satisfied_by: [T2, T3, T12]
- G4: The global web/desktop board shows schedules from connected environments across all lifecycle states and required filters. - satisfied_by: [T7, T8]
- G5: Mobile provides equivalent schedule discovery, status, history, and valid controls. - satisfied_by: [T7, T10]
- G6: Full run history is immutable, paginated, authorized, and fetched on demand instead of riding shell subscriptions. - satisfied_by: [T4, T5, T6, T8, T10]
- G7: Board controls use canonical orchestration commands and handle disconnected or mixed-version environments explicitly. - satisfied_by: [T6, T7, T8, T10]
- G8: Completed and Needs attention runs can notify an opted-in user without leaking prompt, output, diff, or credential data. - satisfied_by: [T11]
- G9: Schedule list and history performance remain bounded for remote and mobile clients. - satisfied_by: [T4, T5, T6, T7, T8, T10]
- G10: Focused automated and authorized integrated receipts cover calendar correctness and the complete board journey. - satisfied_by: [T3, T5, T8, T9, T10, T11, T12]

## Verification budget

- Contract recurrence fixtures: timezone, DST, leap year, end of month, quarterly, COUNT, UNTIL,
  and legacy interval equivalence.
- Server: decider/projector/reactor plus schedule-run query and RPC tests.
- Client runtime: paginated query cache and capability-skew tests.
- Web/mobile: board logic, editor behavior, navigation, notification routing, and typechecks.
- Integrated: one disposable-state web/desktop pass and one mobile pass after explicit computer-use
  approval.
- Never run repo-wide checks.

## Close-of-execution contract

- Keep unbounded run arrays out of shell snapshots and persisted client caches.
- Quarterly support requires calendar recurrence rather than a day/week approximation.
- Notification publication remains behind existing opt-in and capability gates.
- Record the implementation commit and focused receipts in task and goal ledgers.
- Event triggers, spend caps, team ownership, and deterministic command jobs stay outside this plan.

---

**Created:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** proposed . **Owner:** Engineering
