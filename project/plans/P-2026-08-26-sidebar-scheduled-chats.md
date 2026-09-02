---
plan_id: P-2026-08-26-sidebar-scheduled-chats
created_by: Codex
created_at: 2026-08-26T14:20Z
target_executor: self
project: Pulse Code
baseline_sha: f3c1dd240
baseline_tag: scope-approved-2026-08-26
scope_brief: project/scope-briefs/projects-scheduled-navigation.md
goal_contract_version: 2
dispatcher_hint: inline
estimated_tasks: 2
opus_session_turns: 0
roadmap_item: R-2026-08-21-scheduled-chats
---

# Projects and Scheduled sidebar implementation plan

Implement the approved compact sidebar control from the existing project, thread-shell, and
schedule snapshots, verify the web behavior inside Pulse Code, and package it in the Windows
desktop installer.

## Locked decisions

- The control replaces the main sidebar's existing project filter row; it is not a settings-page
  tab or a mobile navigation change.
- Projects remains the default and keeps the current All projects or logical-project scope.
- Scheduled ignores the saved project scope and derives rows from non-deleted schedule definitions.
- A null schedule thread is a visible state named **Not initialized yet**.
- The active badge counts non-deleted schedules whose `pausedAt` is null.
- Schedule data stays on the current shell snapshot stream; no protocol, persistence, or scheduler
  change is allowed.
- The sidebar's All projects boundary is the connected environment catalog, with environment
  identity retained on every row.

## Research summary

- **Project and thread aggregation:** confirmed in
  `packages/client-runtime/src/state/projectEntities.ts` and
  `packages/client-runtime/src/state/threadShell.ts`; both traverse connected catalog entries and
  preserve `environmentId`.
- **Schedule availability:** confirmed in `packages/contracts/src/orchestration.ts` and
  `packages/client-runtime/src/state/shellReducer.ts`; schedules are streamed in each shell snapshot.
- **Pre-run state:** confirmed in `packages/contracts/src/schedule.ts`; `projectStates[].threadId`
  remains null until the first occurrence, and an all-project schedule may initially have no
  project states.
- **Sidebar ownership:** confirmed in `apps/web/src/components/Sidebar.tsx`; project scope,
  partitioning, search, selection, and thread-row navigation live in one shared web component used
  by Electron.
- **Installer path:** confirmed in the root `package.json`; `dist:desktop:win:x64` builds the NSIS
  artifact under `release/`.

## File targets

| path                                            | role                                             | touch_type | owner_task |
| ----------------------------------------------- | ------------------------------------------------ | ---------- | ---------- |
| `apps/web/src/state/schedules.ts`               | environment-scoped schedule snapshot aggregation | create     | T1         |
| `apps/web/src/state/entities.ts`                | schedule projection hook                         | edit       | T1         |
| `apps/web/src/components/Sidebar.logic.ts`      | scheduled-row and badge projection helpers       | edit       | T1         |
| `apps/web/src/components/Sidebar.logic.test.ts` | focused projection tests                         | edit       | T1         |
| `apps/web/src/components/Sidebar.tsx`           | segmented control and Scheduled result rendering | edit       | T2         |
| `docs/user/scheduled-chats.md`                  | sidebar-filter user guidance                     | edit       | T2         |

## Task DAG

### T1: Project schedule definitions into sidebar-ready state

- blocked_by: []
- blocks: [T2]
- dag_level: 1
- files_touched: [apps/web/src/state/schedules.ts, apps/web/src/state/entities.ts, apps/web/src/components/Sidebar.logic.ts, apps/web/src/components/Sidebar.logic.test.ts]
- acceptance:
  - One stable atom aggregates schedules from the same connected environment catalog as projects and thread shells without adding a subscription.
  - Pure helpers count active schedules, match schedule-origin threads by environment, expand never-run schedule targets, and expose missing-project states.
  - Focused tests cover aggregation inputs, badge semantics, project filtering, and null-thread schedule rows.
- dispatch_model: sonnet
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: []
- shard_writes: []

### T2: Render, verify, and package the approved sidebar modes

- blocked_by: [T1]
- blocks: []
- dag_level: 2
- files_touched: [apps/web/src/components/Sidebar.tsx, docs/user/scheduled-chats.md]
- acceptance:
  - The compact Projects and Scheduled control occupies the former project-filter row and preserves the existing project menu and new-project action.
  - Scheduled mode renders only schedule-derived rows across the sidebar catalog, keeps existing thread navigation, and links threadless definitions to schedule management.
  - Rows expose project, timing, status, and Not initialized yet states, with coherent loading, unsupported, missing-project, and empty copy.
  - Mode changes preserve project scope, clear invisible thread selections, and keep search scoped to the rendered mode.
  - Focused tests, web typecheck, a real-client web pass, and the Windows x64 NSIS installer build succeed.
- dispatch_model: sonnet
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: [pulse-web-preview, desktop-installer-build]
- shard_writes: []

## Goal DoD

- G1: The red-square location in the reference image contains the compact Projects / Scheduled control, not a standalone All projects row. — satisfied_by: [T2]
- G2: Projects is selected by default and retains the current All projects or specific-project dropdown behavior. — satisfied_by: [T2]
- G3: A specific project selection filters ordinary and scheduled threads to that project. — satisfied_by: [T1, T2]
- G4: Scheduled ignores the saved project selection and shows scheduled chats from all projects in the current environment. — satisfied_by: [T1, T2]
- G5: The Scheduled badge equals the number of non-deleted, unpaused schedules. — satisfied_by: [T1, T2]
- G6: A non-deleted schedule with no thread appears with **Not initialized yet**. — satisfied_by: [T1, T2]
- G7: Returning to Projects restores the previous project selection. — satisfied_by: [T2]
- G8: Scheduled rows expose project identity, timing, and status without duplicating the full settings editor. — satisfied_by: [T1, T2]
- G9: Empty, loading, unsupported-server, and missing-project states are coherent on web and desktop. — satisfied_by: [T1, T2]
- G10: Focused tests cover aggregation, badge semantics, project filtering, selection persistence, and `threadId: null`. — satisfied_by: [T1, T2]

## Gap classification

- No new product gap is opened. Mobile navigation remains outside this approved sidebar scope.
- The existing incomplete workspace overlay may prevent ProductOps workspace regeneration; it is
  pre-existing documentation debt and does not change the implementation or installer result.

## Close-of-execution contract

- Run only focused web tests, targeted formatting, and the web package typecheck.
- Verify Projects and Scheduled once in a disposable worktree-local Pulse Code environment.
- Build `dist:desktop:win:x64` and report the local NSIS artifact path, size, and checksum.
- Do not install, publish, or create a release without a separate explicit request.

---

**Created:** 2026-08-26 . **Last opened:** 2026-08-26 . **Last edited:** 2026-08-26 . **Status:** active . **Owner:** Engineering
