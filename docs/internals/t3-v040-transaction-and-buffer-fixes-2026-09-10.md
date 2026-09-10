# V40 transaction and buffer correctness

## Attachment cleanup after commit

Source 716069f40 is adapted without changing Pulse command decisions, event payloads, or receipts. Projection now returns deferred attachment cleanup to the orchestration engine. The engine runs it only after its outer transaction, including the accepted command receipt, commits. Cleanup rechecks final attachment references and later thread recreation so subsequent events in the same command retain their files. A filesystem cleanup failure remains a logged post-commit failure and does not turn an accepted command into a retryable rejection.

The source's acquired domain-event subscription is retained: ProviderCommandReactor subscribes before parking for server activation. This keeps immediately dispatched turns until activation. Existing event streaming still gives each consumer an independent subscription.

Focused tests cover rollback after projection and receipt failure, cleanup after successful retry, later attachment references, and immediate dispatch while activation is pending. Pulse-specific schedule/import/startup mocks implement the acquired subscription service member. Tests use disposable synthetic files and in-memory databases only.

Relay restart backoff (b90898077) and terminal history byte bounds (cf9729d5e plus 3bbbc1d9f) remain separate followup batches.
