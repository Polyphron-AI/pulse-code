# Bootstrap retry compatibility

Upstream `8824f8f24` adds an optional `bootstrapThreadDisposition: "deleted"`
field to dispatch errors. The server sets it only after a failed bootstrap's
thread deletion succeeds. Failed cleanup and interrupted bootstrap requests do
not claim deletion. Cleanup runs uninterruptibly once required.

Web and desktop rotate only the matching local draft's thread ID after this
confirmed outcome. Prompt, workspace options, and the draft identity remain;
the previous promotion is cleared. Older errors without the field keep existing
retry behavior. Pulse's pending uploaded attachments remain available after
bootstrap cleanup.

Mobile assessment:

- Ordinary New Task submission allocates fresh turn metadata on each attempt.
- Background queued creation failures normally restore content to a new-task
  draft, whose next send allocates fresh metadata.
- Manually sending an edited pending task rotates its thread and command IDs
  after confirmed deletion. The update is durable before another online send or
  offline requeue; its message ID, queue ordering, editor lock, and draft key stay
  unchanged. CAS retries preserve concurrently accepted edits and never recreate
  a removed entry. A storage failure keeps the task queued and blocks sending
  until the editor can persist the retry identity.
- A confirmed deleted bootstrap restores the background queue entry even when
  the underlying failure text resembles a transport error; it must not keep
  retrying the deleted thread ID.

Validation covers the dispatch schema, typed error recognition, draft-preserving
ID rotation, cleanup success and failure, and pending-upload preservation.
The mobile followup adds 46 focused outbox/editor tests and a passing mobile
typecheck. No client checks use live data.
