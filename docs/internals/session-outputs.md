# Session output storage and access

The provider-neutral runtime ingestion path queues output capture after completing an assistant message. A separate drainable worker copies files without blocking provider event ingestion. Its drain participates in the ingestion service's test drain. Failures are logged without discarding messages. On-demand access can complete a missing snapshot for an older message.

The existing authenticated `assets.createUrl` RPC accepts `session-output` resources containing thread ID, message ID, path and download mode. The server reads one projected message, verifies its thread and assistant/completed status, and allows only paths linked by that message. It does not hydrate full thread history. New clients require an updated source server for saved-output actions; existing workspace-file resources are unchanged.

Outputs live under `userdata/session-outputs`. IDs hash the thread ID, message ID and original message link reference, independent of the current workspace path. Metadata records source path, turn ID, file sizes, SHA-256 hashes and creation time. A persisted absolute preview path can resolve through the original message reference and the saved source-path metadata after a workspace switch.

Each output is copied into a private pending directory and published by atomic directory rename. Concurrent capture/open requests accept the first committed snapshot. Source size and modification time are checked across copying. HTML/CSS asset discovery is bounded; external URLs and page navigation are ignored, traversal and escaping symlinks are rejected. The stored ZIP uses streaming yazl generation. No entire workspace copy is made.

The asset URL is a short-lived signed transport credential. Download mode enforces the exact download filename and returns Content-Disposition attachment. Preview mode serves only manifest-listed files. Client caches retain resource references, not credentials, for saved preview refresh. Existing automatic webview recreation can initially show the old URL; explicit Refresh renews it. Saved copies are local to the owning environment and have no automatic retention cleanup in this release.

Errors distinguish missing, denied, unsupported, too-large and unavailable output access. Existing connection/authentication handling reports disconnected or expired sessions. File errors are not automatically retried. Reopening is an explicit user action.
