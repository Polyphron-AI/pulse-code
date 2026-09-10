# V40 transaction and buffer correctness

## Attachment cleanup after commit

Source 716069f40 is adapted without changing Pulse command decisions, event payloads, or receipts. Projection now returns deferred attachment cleanup to the orchestration engine. The engine runs it only after its outer transaction, including the accepted command receipt, commits. Cleanup rechecks final attachment references and later thread recreation so subsequent events in the same command retain their files. A filesystem cleanup failure remains a logged post-commit failure and does not turn an accepted command into a retryable rejection.

The source's acquired domain-event subscription is retained: ProviderCommandReactor subscribes before parking for server activation. This keeps immediately dispatched turns until activation. Existing event streaming still gives each consumer an independent subscription.

Focused tests cover rollback after projection and receipt failure, cleanup after successful retry, later attachment references, and immediate dispatch while activation is pending. Pulse-specific schedule/import/startup mocks implement the acquired subscription service member. Tests use disposable synthetic files and in-memory databases only.

## Relay restart backoff

Source b90898077 now bounds crash-loop restarts. The first rapid exit restarts immediately, then delays begin at one second and double to a sixty-second cap. Thirty seconds of stable uptime resets the delay. The delay is outside the reconciliation semaphore, so disabling or changing the endpoint preempts it; the supervisor checks connector identity and desired configuration before restarting. Existing token redaction and connector shutdown ownership remain intact.

Eleven focused tests use fake child handles, Deferred signals and TestClock. They cover rapid failures, stable-uptime reset and a config change during backoff without a duplicate restart. No real relay process or network connection is used.

## Bounded terminal history

Sources 3bbbc1d9f and cf9729d5e retain at most 5,000 lines and 8 MiB of UTF-8 history using incremental chunks. Snapshots and coalesced persistence materialize text only when needed. Current and legacy history restore reads only the bounded file tail, handles short reads and UTF-8 boundaries, and closes the file before rewriting it.

All live output events remain complete; only retained scrollback drops its oldest text at either limit. Pulse environment-aware terminal launch and restart resolution, process polling, labels, and clear/restart behavior remain intact. The existing restart wrapper required manual adaptation because upstream inlined that operation.

The complete 79-test terminal manager suite passes with synthetic PTY handles and disposable files, including long partial lines, split surrogate pairs, line/byte bounds, restored tails, short reads, closed-file rewrites, and full live output. Server typecheck and scoped lint validate the internal history representation change. This server behavior applies equally to web, desktop and mobile and does not change their wire contracts.
