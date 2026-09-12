# Architecture

> For maintainers. Using Pulse Code? See [docs/user](../user/).

Pulse Code is a server runtime that owns agent sessions, workspaces, and version control, plus clients
(web, desktop, mobile) that talk to it over one authenticated Effect RPC WebSocket. The server is the
execution boundary: every provider process, terminal, git operation, and filesystem read happens
there, never in the client.

```
┌────────────────────────────────────────────────┐
│ Clients: apps/web, apps/desktop, apps/mobile   │
│ shared runtime: packages/client-runtime        │
│  connection supervisor, RPC session, Atom state│
└──────────────────┬─────────────────────────────┘
                   │ Effect RPC over WebSocket (/ws)
                   │ contract: packages/contracts
┌──────────────────▼─────────────────────────────┐
│ apps/server                                    │
│  orchestration engine (event-sourced)          │
│  provider driver registry (5 built-in drivers) │
│  checkpointing, VCS, terminals, filesystem     │
└──────────────────┬─────────────────────────────┘
                   │ per-driver transport
┌──────────────────▼─────────────────────────────┐
│ Agent CLIs: Codex, Claude, Cursor, Grok,       │
│ OpenCode                                       │
└────────────────────────────────────────────────┘
```

## The RPC boundary

The client/server contract is an Effect RPC group, not a hand-rolled push protocol. [`rpc.ts`][rpc]
declares `WS_METHODS` and assembles `WsRpcGroup`; each member is either unary or a server stream
(`stream: true`). Streaming members such as `orchestration.subscribeShell`,
`orchestration.subscribeThread`, `subscribeServerConfig`, and `terminal.attach` replace what used to
be a broadcast push bus: a client subscribes to what it needs and the server pushes only on that
subscription.

[`ws.ts`][ws] serves the group. `websocketRpcRouteLayer` mounts `GET /ws`, authenticates the upgrade
through `EnvironmentAuth.authenticateWebSocketUpgrade`, then hands the socket to
`RpcServer.toHttpEffectWebsocket`. Authorization is per method: `RPC_REQUIRED_SCOPE` maps each method
to a scope, and `authorizeEffect`/`authorizeStream` enforce it. Holding a valid socket is not
authorization to call everything on it. See [environment-auth.md](./environment-auth.md).

On the client, [`session.ts`][session] opens the socket and builds the typed client.
`RpcSessionFactory` is the service; a session exposes `client`, `initialConfig`, `ready`, `probe`,
and `closed`. It performs one attempt and does not retry. Retry, backoff, and offline policy belong
to the connection supervisor.

## Shared client runtime

`packages/client-runtime` holds every non-visual client concern: connection lifecycle,
authentication, RPC, cached environment data, and domain state as Atom factories. Web and mobile
compose it the same way (`apps/web/src/connection/runtime.ts` and
`apps/mobile/src/connection/runtime.ts` mirror each other, differing only in platform-specific
background-activity layers) and differ beyond that only in the platform layer they supply and the
UI they build on top. React components never construct transports, retry loops,
or RPC clients. See [connection-runtime.md](./connection-runtime.md).

## Orchestration is event-sourced

The server does not mutate app state directly. Clients dispatch typed commands; the engine turns them
into persisted events; projections derive the read model.

[`OrchestrationEngine.ts`][engine] serializes this. `dispatch` offers a `CommandEnvelope` onto
`commandQueue` and awaits its result; a single worker fiber takes envelopes one at a time, so command
processing is totally ordered. For each envelope `processEnvelope`:

1. checks the durable command receipt, making retries idempotent;
2. runs `decideOrchestrationCommand` ([`decider.ts`][decider]) to produce events from command plus
   current state, pure and side-effect free;
3. inside one SQL transaction, appends events to the event store, applies them to the in-memory read
   model via [`projector.ts`][projector], projects them into persisted tables, and writes the
   accepted receipt;
4. after commit, swaps in the new read model and publishes committed events to subscribers.

Because persistence and projection share a transaction, the read model cannot durably disagree with
the event log. On dispatch failure the engine rereads persisted events past the starting sequence and
reconciles.

Command and event names live in [`orchestration.ts`][contracts]. Some commands are client
dispatchable (`thread.create`, `thread.turn.start`, `thread.approval.respond`); others are internal
and produced only by server-side reactors (`thread.message.assistant.delta`,
`thread.turn.diff.complete`).

A turn is complete when its session leaves `running` status, projected by
`settledTurnStateForSessionStatus` in [`projector.ts`][projector]. Checkpoint work settling later
does not define turn end.

## Drainable workers

Follow-up work runs asynchronously in queue-backed workers built on [`DrainableWorker`][worker]:
[`ProviderRuntimeIngestion`][ingest] normalizes provider runtime streams into orchestration commands,
[`ProviderCommandReactor`][cmd] dispatches provider calls in response to intent events,
[`CheckpointReactor`][checkpoint] captures and reverts workspace checkpoints, and
[`WatchdogReactor`][watchdog] answers pending approval and user-input gates on threads with an
enabled watchdog. It subscribes to `thread.activity-appended` events carrying an
`approval.requested` or `user-input.requested` activity, the actual "gate opened" signal, asks
`TextGeneration.generateWatchdogDecision` under the thread's rules, and dispatches
`thread.approval.respond`, `thread.user-input.respond`, `thread.watchdog.record-intervention`, or
`thread.watchdog.escalate`. It escalates outright once a thread's intervention count reaches
`WATCHDOG_MAX_INTERVENTIONS`, without calling the model.

[`ManagerReactor`][managerreactor] is not queue-backed: it sweeps every 30 seconds, like
`ScheduleReactor`. Each sweep it runs one cycle for every watching manager (Argo) whose
`intervalMinutes` has elapsed, ensuring the environment's system project through
`project.ensure-system`, lazily creating and binding the manager's own `manager:<id>` thread,
composing the cycle prompt in the pure [`managerCyclePrompt.ts`][managerprompt], and starting a
turn authored by `schedule`. The manager acts through the MCP manager toolkit in
[`src/mcp/toolkits/manager/`][managertoolkit] (`manager_list_children`, `manager_spawn_child`,
`manager_message_child`, `manager_stop_child`, `manager_log`), whose handlers refuse any caller
whose MCP session is not a manager's own thread.

[`AssistantReactor`][assistantreactor] is event-driven rather than swept: it subscribes to
domain events and reacts to `assistant.message-requested`. The first message ensures the system
project, creates the assistant's thread under the `assistant:<id>` origin with the read-only
`ASSISTANT_THREAD_ALLOWED_TOOLS` allow-list, binds it with `assistant.thread.bind`, and starts a
turn authored by `user`; later messages reuse the bound thread, and a reset makes the next message
open a new one. It publishes the `assistant.thread.ready` runtime receipt. The standing
instructions reach the model through `assistantSystemPrompt`, composed in
`buildSendTurnRequestForThread` alongside the trust wrapper, so the panel and the ordinary
composer both get it.

`DrainableWorker` pairs a transactional queue with a transactional count of outstanding items.
`enqueue` atomically offers and increments; processing always decrements. `drain` retries until the
count reaches zero, so a test can await "queue empty and current item finished" instead of sleeping.
Each of the three services exposes `drain` for exactly this.

Runtime receipts are a test-only mechanism. `RuntimeReceiptBusLive` in
[`RuntimeReceiptBus.ts`][receipts] publishes nothing; only the test layer is PubSub-backed. Do not
build production behavior on receipts.

## Provider drivers

Five drivers ship built in, registered in [`builtInDrivers.ts`][drivers] as `BUILT_IN_DRIVERS`:
Codex, Claude, Cursor, Grok, and OpenCode. A driver declares its kind and config schema and creates a
scoped adapter; `ProviderInstanceRegistry` owns live instances and `ProviderAdapterRegistry` resolves
an instance to its adapter, so `ProviderService` routes session and turn operations without knowing
which agent is behind them. See [providers.md](./providers.md).

## Checkpointing

Each turn is bracketed by workspace checkpoints so diffs and reverts are exact. `CheckpointStore`
captures state as hidden Git refs through the VCS driver's checkpoint operations;
`CheckpointDiffQuery` answers turn and full-thread diff requests; `CheckpointReactor` coordinates
baseline capture, completed-turn capture, diff projection, and reverting both the workspace and the
provider conversation. The storage contract is `VcsCheckpointOps` in
[`VcsDriver.ts`](../../apps/server/src/vcs/VcsDriver.ts), implemented for Git in the same directory.

## Startup

[`serverRuntimeStartup.ts`][startup] runs a fixed lifecycle: start keybindings, settings, and
reactors; publish welcome; signal command readiness (logged as `Accepting commands`); wait for the
HTTP listener via `markHttpListening`; publish ready; fork the heartbeat; then either print headless
output or open the browser. Command readiness precedes the listener, so a socket that opens can
already dispatch.

## Related

- [Pulse Code compatibility contract](./pulse-code-compatibility.md)
- [Workspace layout](./workspace-layout.md), [Glossary](./glossary.md)
- [Remote environments](./remote.md), [Server updates](./server-updates.md)
- [Resource telemetry](./resource-telemetry.md)
- [Scripts](./scripts.md), [CI gates](./ci.md)

[rpc]: ../../packages/contracts/src/rpc.ts
[contracts]: ../../packages/contracts/src/orchestration.ts
[ws]: ../../apps/server/src/ws.ts
[session]: ../../packages/client-runtime/src/rpc/session.ts
[startup]: ../../apps/server/src/serverRuntimeStartup.ts
[engine]: ../../apps/server/src/orchestration/Layers/OrchestrationEngine.ts
[decider]: ../../apps/server/src/orchestration/decider.ts
[projector]: ../../apps/server/src/orchestration/projector.ts
[worker]: ../../packages/shared/src/DrainableWorker.ts
[ingest]: ../../apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts
[cmd]: ../../apps/server/src/orchestration/Layers/ProviderCommandReactor.ts
[watchdog]: ../../apps/server/src/orchestration/Layers/WatchdogReactor.ts
[managerreactor]: ../../apps/server/src/orchestration/Layers/ManagerReactor.ts
[assistantreactor]: ../../apps/server/src/orchestration/Layers/AssistantReactor.ts
[managerprompt]: ../../apps/server/src/orchestration/managerCyclePrompt.ts
[managertoolkit]: ../../apps/server/src/mcp/toolkits/manager/
[checkpoint]: ../../apps/server/src/orchestration/Layers/CheckpointReactor.ts
[receipts]: ../../apps/server/src/orchestration/Layers/RuntimeReceiptBus.ts
[drivers]: ../../apps/server/src/provider/builtInDrivers.ts
