# V40 mobile background attachment uploads

Adapts the remaining upload slice of `9bc7a5684`, the reference-aware cleanup from `ce4712d5b`, and nonblocking submission from `66a24d6c1`. The earlier account archive port remains a prerequisite. Pulse keeps inline image writers and version 4 outbox records; image upload IDs and owning environment IDs are optional additive fields.

One worker mounted with the outbox worker uploads connected drafts across environments, with at most three simultaneous transfers and progress updates in five-percent steps. It supports retry, disconnect cancellation, and disposal. Native transfers accept AbortSignal; inline image bytes use temporary upload files, and existing owned file-backed images upload directly. Environments without image upload capability retain inline sends. File limits and provider gates are unchanged.

Finished uploads stamp matching attachment IDs and bytes without replacing draft text or other attachments. The stamp must flush to disk before the queue reports ready. Account changes dispose active jobs, and late persistence checks the account owner before touching drafts. Draft, outbox, and signed-out account references all protect shared upload IDs, including inline images without a local file URI. Delivery removes durable ownership through existing revision and editor checks; it no longer unconditionally deletes reused uploads.

Both mobile composers accept submission during an active upload. Pulse preserves its existing persist-first outbox flow, pending-task recovery, and native keyboard behavior. A failed attachment requires retry or removal while connected. New tasks queued during upload return to the task list rather than displaying a premature started task.

## Verification

181 tests passed across nine focused suites: upload queue, attachment transfer, composer drafts, outbox drain, project start input, outbox storage, outbox removal, pending-task edits, and image writers. Mobile types and scoped lint passed. Tests cover concurrency, progress, retry, cancellation, reuse and expiry, legacy inline fallback, durable stamp failure, changed bytes, account switches, archived upload ownership, cross-environment retargeting, and delivery compare-and-set races.

No runtime or provider turn was launched. Primary acceptance can attach synthetic files to a connected draft without sending, observe upload state, then disconnect before queueing and verify navigation/restart retention. A queued message backed by a real provider must remain disconnected during that check. Synthetic transport tests cover delivery and upload races without invoking any provider.
