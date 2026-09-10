# V40 bounded live subscriptions

Adapted 7e4ce3bbb (thread tool-update coalescing), 108f295cc (slow-client budgets), and the live-payload portions of ce4712d5b. New helper modules match the fixed V40 target 09e8de9c6. Existing ws.ts and server tests were adapted through bounded hunks; unrelated source refactors were excluded.

Each shell/thread live subscription has a 1,000-item / 8 MiB serialized-payload budget, including a batch waiting for an RPC acknowledgement. Overflow stops the PubSub consumer, releases queued data and fails with the existing OrchestrationGetSnapshotError. Durable replay and the existing gap/size guards supply recovery; events are not removed from persisted history.

Thread coalescing uses a 50 ms window and stable toolCallId plus turn identity. Only consecutive tool.updated rows are superseded; anonymous calls and non-update boundaries remain. A synchronization marker flushes pending progress first. Source chunks enter the coalescer atomically, preserving synchronization ordering.

Projected client activity payloads enter the thread budget. Shell queues retain aggregate metadata and refetch the current projection. This is the required ce4712d5b correction: large stored tool output must not exhaust a live-client budget before trimming. Pulse schedule shell handling, provider-independent event delivery, replay caps, immediate startup attachment, and opt-in configuration streams remain intact.

Synthetic tests cover item/byte overflow, held-ACK cleanup, scope ownership, same-label parallel calls, turn identity, marker ordering, multi-chunk flushes, deletion recovery, replay, initial snapshot races and 9 MiB raw tool payloads. No live provider or persistent user state was accessed. WebSocket seam tests run local test transports only; no development server or browser was launched.

Client shell batching source 252df7742 is independent: it consumes source chunks in order and preserves synchronized markers. No wire/schema change or new client capability is required by this server batch.
