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
- Manually sending an edited pending task retains its queued metadata. A
  confirmed deleted bootstrap needs a separate durable identity rotation for
  that path, preserving its message ID, editor ownership, and draft content.
  This source adaptation does not claim that Pulse-specific edge is fixed.

Validation covers the dispatch schema, typed error recognition, draft-preserving
ID rotation, cleanup success and failure, and pending-upload preservation.
