# Durable session outputs

Approved by the maintainer on 2026-09-09. Target the Windows preview based on the combined Talk/Office branch. Publish a new prerelease after focused verification.

## Design

Keep source file editing unchanged. Delivered file links get a separate saved-output action. The owning server saves immutable output files and metadata in its private state directory. A record is identified by thread, message and original path, with a content checksum, timestamp and turn ID. This preserves the delivered version even if a later turn edits or deletes the original. Copy only explicitly linked files, with bounded local HTML/CSS dependencies. Do not copy whole workspaces.

The authenticated asset RPC resolves a session-output reference to a newly signed URL. URLs are transport credentials, never the durable identity. Downloads work without the integrated browser or a remote editor. HTML preview resources retain their relative paths. Requests do not retry permanent failures. The client distinguishes connection/authentication failures from output-not-found, denied, unsupported and size-limit failures.

Capture linked files when assistant messages complete, using the provider-neutral ingestion path. Capture failure must not lose the assistant message or prevent turn completion. Older messages can save a still-existing linked file on demand. Missing historical files cannot be recovered without a saved copy. Remote offline access requires a downloaded copy; cloud replication is outside this release.

## Implementation checklist

- [x] Inspect exact preview source and approve design.
- [x] Create isolated feature worktree.
- [x] Verify baseline and install dependencies.
- [x] Add saved-output contracts, bounded atomic storage, URL delivery and tests.
- [x] Capture assistant output links and retain message/turn provenance.
- [x] Fix web/desktop environment routing and add saved-output download actions; cover mobile.
- [x] Verify focused tests, scoped typechecks/lint, and review integrated change.
- [x] Document output retention and recovery behavior.
- [ ] Build Windows preview, verify packaged payload, push branch and publish prerelease.

## Acceptance

Open/download the delivered version after original deletion or worktree removal. Resolve a fresh URL after expiry or origin changes. Never send a remote path to the active local environment. Support spaces and Windows paths. Stop on missing/denied outputs. Keep files from different messages/threads separate. Reject traversal and escaped dependencies. Preserve supported HTML/CSS relative dependencies. Shared contracts retain compatibility for existing workspace-file callers.

## Verification before packaging

117 focused asset/client tests and four provider ingestion tests passed. Server, web and client-runtime scoped typechecks passed. Targeted lint has one pre-existing mobile index-key warning. The unchanged baseline ingestion suite also has timeout failures; the focused completion/capture cases pass. Mobile full typecheck has pre-existing navigation errors. Authenticated live RPC and HTTP checks passed for CSV content, download headers, ZIP dependencies, source-folder removal, missing output and unlinked-file rejection. Browser verification was authorized but the computer-use tool exposed no available browsers, so no visual acceptance is claimed.
