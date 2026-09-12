# Glossary

> For maintainers. Using Pulse Code? See [docs/user](../user/).

This is a living glossary for Pulse Code. It explains what common terms mean in this codebase.

## Table of contents

- [Project and workspace](#project-and-workspace)
- [Thread timeline](#thread-timeline)
- [Orchestration](#orchestration)
- [Provider runtime](#provider-runtime)
- [Agent roles](#agent-roles)
- [Checkpointing](#checkpointing)
- [Mail](#mail)

## Concepts

### Mail

Mail is an optional environment-owned IMAP/SMTP client. A mail account holds provider connection settings; received message references combine account, folder, UIDVALIDITY, and UID. Drafts and send receipts are separate from coding threads and provider turns. See [Mail integration](mail.md) for storage, identity, and delivery semantics.

### Project and workspace

#### Project

The top-level workspace record in the app. In [the orchestration contracts][1], a project has a `workspaceRoot` and a title. It does not contain threads: `OrchestrationProject` and `OrchestrationThread` are separate arrays on the read model, and a project can have zero threads. See [workspace-layout.md][2].

#### Workspace root

The root filesystem path for a project. In [the orchestration model][1], it is the base directory for branches and optional worktrees. See [workspace-layout.md][2].

#### Worktree

A Git worktree used as an isolated workspace for a thread. If a thread has a `worktreePath` in [the contracts][1], it runs there instead of in the main working tree. Git operations live behind the VCS driver contract in `apps/server/src/vcs/VcsDriver.ts`, implemented by [GitVcsDriverCore.ts][3].

### Thread timeline

#### Thread

The main durable unit of conversation and workspace history. In [the orchestration contracts][1], a thread holds messages, activities, checkpoints, and session-related state. See [projector.ts][4].

#### Turn

A single user-to-assistant work cycle inside a thread. It starts with user input and ends when the session leaves `running` status, which [projector.ts][4] treats as the authoritative completion signal (`settledTurnStateForSessionStatus`). Checkpoint and diff work may settle afterward without changing when the turn ended. See [the contracts][1] and [ProviderRuntimeIngestion.ts][5].

#### Activity

A user-visible log item attached to a thread. In [the contracts][1], activities cover important non-message events like approvals, tool actions, and failures. They are projected into thread state in [projector.ts][4].

### Orchestration

Orchestration is the server-side domain layer that turns runtime activity into stable app state. The main entry point is [OrchestrationEngine.ts][7], with core logic in [decider.ts][8] and [projector.ts][4].

#### Scheduled chat

A server-owned daily instruction that creates a durable thread and runs it in a fresh provider session. Its scope can be one project or all projects. Schedule state, occurrence history, failure status, and pause state are projected from orchestration events; the host environment performs due work even when no client is connected. See the [schedule contract](../../packages/contracts/src/schedule.ts).

#### Aggregate

The domain object a command or event belongs to. In [the contracts][1], that is usually `project` or `thread`. See [decider.ts][8].

#### Command

A typed request to change domain state. In [the contracts][1], commands are validated in [commandInvariants.ts][9] and turned into events by [decider.ts][8].
Examples include `thread.create`, `thread.turn.start`, and `thread.checkpoint.revert`.

#### Domain Event

A persisted fact that something already happened. In [the contracts][1], events are the source of truth, and [projector.ts][4] shows how they are applied.
Examples include `thread.created`, `thread.message-sent`, and `thread.turn-diff-completed`.

#### Decider

The pure orchestration logic that turns commands plus current state into events. The core implementation is in [decider.ts][8], with preconditions in [commandInvariants.ts][9].

#### Projection

A read-optimized view derived from events. See [projector.ts][4], [ProjectionPipeline.ts][11], and [ProjectionSnapshotQuery.ts][10].

#### Projector

The logic that applies domain events to the read model or projection tables. See [projector.ts][4] and [ProjectionPipeline.ts][11].

#### Read model

The current materialized view of orchestration state. In [the contracts][1], it holds projects, threads, messages, activities, checkpoints, and session state. See [ProjectionSnapshotQuery.ts][10] and [OrchestrationEngine.ts][7].

#### Reactor

A side-effecting service that handles follow-up work after events or runtime signals. Examples include [CheckpointReactor.ts][6], [ProviderCommandReactor.ts][12], and [ProviderRuntimeIngestion.ts][5].

#### Receipt

A typed signal emitted when an async milestone completes, such as `checkpoint.baseline.captured`, `checkpoint.diff.finalized`, or `turn.processing.quiesced`. Receipts are a test-only mechanism: the production `RuntimeReceiptBusLive` publish is a no-op and only the test layer is PubSub-backed. Do not build production behavior on them. See [RuntimeReceiptBus.ts][13] and [CheckpointReactor.ts][6].

#### Quiesced

"Quiesced" means a turn has gone quiet and stable: follow-up work such as [CheckpointReactor.ts][6] has settled. It appears in [the receipt schema][13], so in practice it is something tests wait on rather than a production signal.

### Provider runtime

The live backend agent implementation and its event stream. The main service is [ProviderService.ts][14], the adapter contract is [ProviderAdapter.ts][15], and the overview is in [providers.md][16].

#### Provider

The backend agent runtime that actually performs work. Six drivers ship built in: Codex, Claude, Cursor, Grok, OMP, and OpenCode. The list lives in `apps/server/src/provider/builtInDrivers.ts`. See [ProviderService.ts][14], [ProviderAdapter.ts][15], and [CodexAdapter.ts][17] as a representative adapter.

#### Session

The live provider-backed runtime attached to a thread. Session shape is in [the orchestration contracts][1], and lifecycle is managed in [ProviderService.ts][14].

#### Handoff

Switching a started thread to a model on another provider without leaving the thread. The server renders a plain-text **handoff digest** (recent messages verbatim, older messages summarized by the destination model, files touched) and starts a fresh session whose first prompt is the digest followed by the user's next instruction. The boundary is recorded as a `provider.handoff` activity with the digest in its payload. Pure digest logic lives in [threadHandoff.ts][25]; the RPC handlers are in `ws.ts`. Design: `docs/plans/2026-09-10-same-thread-model-switch-design.md`.

#### Runtime mode

The safety/access mode for a thread or session. [The contracts][1] define four values: `approval-required`, `auto-accept-edits`, `auto`, and `full-access`. See [permission modes][18].

#### Interaction mode

The agent interaction style for a thread. In [the contracts][1], the values are `default` and `plan`.

#### Assistant delivery mode

Controls how assistant text reaches the thread timeline. In [the contracts][1], `streaming` updates incrementally and `buffered` accumulates text. Buffered delivery is not held until the turn completes: it spills once accumulated text would exceed 24,000 characters, and flushes at approval and user-input boundaries. See [ProviderRuntimeIngestion.ts][5].

#### Snapshot

A point-in-time view of state. The word is used in multiple layers, including orchestration, provider, and checkpointing. See [ProjectionSnapshotQuery.ts][10], [ProviderAdapter.ts][15], and [CheckpointStore.ts][19].

### Agent roles

Product vocabulary for the AI roles Pulse runs on top of provider sessions. A role is a policy (scope, tools, lifecycle) layered on a thread, never a runtime. Runtimes are always providers. These terms are adopted from the Scape model (managers, watchdogs, assistants) and are defined here so Office and Code use them consistently before code does.

#### Agent

Umbrella term for any AI role Pulse runs on a provider session. Prefer the specific role name below when one applies. When you mean the runtime, say provider or session.

#### Assistant

A named, persistent, read-mostly agent that proposes and never acts. It has a stable name, a standing role briefing, and a reset that clears history but keeps identity and settings. It gets no shell, browser, network, or destructive tools. Luna, the Office extraction persona, is the first assistant. The record, its commands, and its events live in [`packages/contracts/src/assistant.ts`][28]; the reactor that opens and binds the assistant's thread is `apps/server/src/orchestration/Layers/AssistantReactor.ts`, the thread origin is `assistant:<id>`, and the read-only tool list is `ASSISTANT_THREAD_ALLOWED_TOOLS`. User docs: `docs/user/luna.md`. Not to be confused with the `assistant` message role in [the contracts][1], which is the wire name for model-authored text and stays as is.

#### Manager (Argo)

An agent that owns a mission record, runs on a schedule, and spawns up to a fixed number of child threads in their own worktrees. Children are ordinary coding threads and cannot spawn children of their own (depth 1). A manager reports each cycle into a structured log record. The record, its commands, and its events live in [`packages/contracts/src/manager.ts`][26]; the reactor that runs cycles is `apps/server/src/orchestration/Layers/ManagerReactor.ts`, and the tools a cycle uses are the MCP manager toolkit in `apps/server/src/mcp/toolkits/manager/`.

The product name is **Argo**, the Argo orchestrator. Users see Argo in the sidebar, fleet view, Office, palette, and docs. Code, contracts, and this glossary say manager (`ManagerId`, `manager:<id>` origin, `authoredBy: "manager"`). This keeps Argo apart from the orchestration layer (`apps/server/src/orchestration/`), which is plumbing and never an agent. Argo is our name; Scape's equivalent is Argus.

#### Mission

The prose brief a manager reads at the start of every cycle. One text field on the manager record. Records mentioned with `@` expand inline: notes and SOPs in full, everything else as a one-line pointer with its id. The token syntax `@[kind:id]`, the kind union, and the depth and size caps live in [`packages/contracts/src/mentions.ts`][27]; `apps/server/src/orchestration/missionMentions.ts` expands them against the read model and the reactor hands the result to `composeManagerCyclePrompt`. Design: `docs/plans/2026-09-11-agent-roles-design.md`.

#### Cycle

One timed run of a manager (Argo): read the mission, evaluate children, spawn or stop children, write one log row. Scape calls this a pulse. We do not, because Pulse is the product.

#### Watchdog

A per-thread supervisor that answers pending questions, approves permission gates, or escalates to the user under user-written rules. Skipped when a manager owns the thread. Server side lives in `apps/server/src/orchestration/Layers/WatchdogReactor.ts`; the thread carries a `watchdog` field and the client sets it with `thread.watchdog.set`.

#### Subagent

A provider-native child observed from the runtime stream, for example a Claude Code subagent. Pulse renders these in the Agents panel but does not define or persist them as records. See `apps/server/src/provider/Layers/ClaudeAdapter.ts` for the observation path.

#### Worker

Retired as a product word. Use it only for drain-queue implementation classes such as `DrainableWorker`.

### Checkpointing

Checkpointing captures workspace state over time so the app can diff turns and restore earlier points. The main pieces are [CheckpointStore.ts][19], [CheckpointDiffQuery.ts][20], and [CheckpointReactor.ts][6].

#### Checkpoint

A saved snapshot of a thread workspace at a particular turn. In practice it is a hidden Git ref in [CheckpointStore.ts][19] plus a projected summary from [ProjectionCheckpoints.ts][21]. Capture and lifecycle work happen in [CheckpointReactor.ts][6].

#### Checkpoint ref

The durable identifier for a filesystem checkpoint, stored as a Git ref. It is typed in [the contracts][1], constructed in [Utils.ts][22], and used by [CheckpointStore.ts][19].

#### Checkpoint baseline

The starting checkpoint for diffing a thread timeline. This flow is surfaced through [RuntimeReceiptBus.ts][13], coordinated in [CheckpointReactor.ts][6], and supported by [Utils.ts][22].

#### Checkpoint diff

The patch difference between two checkpoints. Query logic lives in [CheckpointDiffQuery.ts][20], diff parsing lives in [Diffs.ts][23], and finalization is coordinated by [CheckpointReactor.ts][6].

#### Turn diff

The file patch and changed-file summary for one turn. It is usually computed in [CheckpointDiffQuery.ts][20], represented in [the contracts][1], and recorded into thread state by [projector.ts][4].

## Practical Shortcuts

- If you see `requested`, think "intent recorded".
- If you see `completed`, think "result applied".
- If you see `receipt`, think "async milestone signal, for tests".
- If you see `checkpoint`, think "workspace snapshot for diff/restore".
- If you see `quiesced`, think "all relevant follow-up work has gone idle".

## Related Docs

- [Architecture overview][24]
- [Provider architecture][16]
- [Permission modes][18]
- [Workspace layout][2]

[1]: ../../packages/contracts/src/orchestration.ts
[2]: ./workspace-layout.md
[3]: ../../apps/server/src/vcs/GitVcsDriverCore.ts
[4]: ../../apps/server/src/orchestration/projector.ts
[5]: ../../apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts
[6]: ../../apps/server/src/orchestration/Layers/CheckpointReactor.ts
[7]: ../../apps/server/src/orchestration/Layers/OrchestrationEngine.ts
[8]: ../../apps/server/src/orchestration/decider.ts
[9]: ../../apps/server/src/orchestration/commandInvariants.ts
[10]: ../../apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts
[11]: ../../apps/server/src/orchestration/Layers/ProjectionPipeline.ts
[12]: ../../apps/server/src/orchestration/Layers/ProviderCommandReactor.ts
[13]: ../../apps/server/src/orchestration/Services/RuntimeReceiptBus.ts
[14]: ../../apps/server/src/provider/Layers/ProviderService.ts
[15]: ../../apps/server/src/provider/Services/ProviderAdapter.ts
[16]: ./providers.md
[17]: ../../apps/server/src/provider/Layers/CodexAdapter.ts
[18]: ../user/permission-modes.md
[19]: ../../apps/server/src/checkpointing/CheckpointStore.ts
[20]: ../../apps/server/src/checkpointing/CheckpointDiffQuery.ts
[21]: ../../apps/server/src/persistence/Services/ProjectionCheckpoints.ts
[22]: ../../apps/server/src/checkpointing/Utils.ts
[23]: ../../apps/server/src/checkpointing/Diffs.ts
[24]: ./overview.md
[25]: ../../apps/server/src/orchestration/threadHandoff.ts
[26]: ../../packages/contracts/src/manager.ts
[27]: ../../packages/contracts/src/mentions.ts
[28]: ../../packages/contracts/src/assistant.ts
