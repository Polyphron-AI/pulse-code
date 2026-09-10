# Mail integration

Mail is an environment-owned alpha domain exposed by typed `mail.*` RPCs in the shared contracts. The optional `mail` environment capability advertises the protocol. `mail.getStatus` reports activation and account readiness independently of client-local visibility and update channel.

`MailService` adapts the promise-based `MailEngine` to Effect and the existing secret store. `MailEngine` owns draft revision checks, metadata, activation, and send receipts. `MailAdapter` owns IMAP/SMTP protocol behavior. Web and mobile use `createMailEnvironmentAtoms` from client-runtime; desktop uses the web client. No model-provider adapter participates in sending.

Metadata and durable drafts live in `<stateDir>/mail/state.json`. Mutations serialize through one server-lifetime store, write a temporary file, sync it, and replace the saved file before acknowledgement. The state file has a schema version. Corruption produces a recovery error instead of replacing saved state with an empty mailbox. Credentials use separate versioned entries in `ServerSecretStore`. This domain has its own receipt records; it does not reuse provider execution tasks or inject email bodies into agent thread history.

Received bodies are fetched on demand and not persisted into the durable mail state. IMAP searches examine bounded UID windows and return continuation cursors even for sparse result batches. Draft summaries omit bodies and attachment bytes. Saved drafts share a 25 MB serialized budget, with at most 200 drafts and 5 MB of attachment data per draft. Replacing JSON storage with indexed persistence and separate attachment files will be necessary before increasing those limits.

Message references include account, folder, UIDVALIDITY, and UID. Header Message-ID alone never establishes shared identity. Confirmed server move mappings create aliases to existing metadata; suppression keys survive those aliases. For a move without a verified destination mapping, the UI cannot promise automatic undo or metadata reconciliation. External folder changes need a future reconciliation worker.

Before SMTP submission, the engine persists a receipt and freezes the draft revision. Both operation identity and existing nonfailed receipts guard repeat requests. A restart with an abandoned Sending receipt is reported as uncertain. SMTP acceptance, partial recipient acceptance, and Sent-folder filing are separate results. Raw MIME is compiled once; Bcc stays in the SMTP envelope and is absent from transmitted headers. A Sent-folder append failure cannot cause resubmission.

Setup/activation require access-administration scope. Mail reads require environment read scope; sends, triage, and annotations require operation scope. This is environment-level account access, not a per-user mailbox ACL system. The normal authenticated environment transport supports local and remote clients. Server-side feature gates enforce external operations independently of navigation visibility.

Focused tests cover transport envelopes and filing, UID pagination, persistent draft races, restart and send recovery, identity/suppression, activation, credential updates, RPC scopes, cross-environment query identity, and shared reply recipient behavior. Browser and native-device validation are separate from these automated tests.

The larger Office specification remains the target. OAuth, IMAP IDLE/background indexing, full offline recovery, conversation grouping, rich composition, subscriptions for inferred links, universal Tasks, and calendar/SOP integration remain separate unfinished capabilities. They must not be advertised as implemented by the Mail alpha.

## Implementation verification, 6 September 2026

The combined focused suite passed 66 tests across 11 files. It covers the mail engine and transport, RPC authorization, shared mail queries and recipient helpers, alpha settings, web URL handling and Settings integration, and native composer recovery/preferences. The server's public-environment startup test passed separately. Server, web, shared client-runtime, and native mobile typechecks passed. Scoped lint passed with `NODE_OPTIONS=--experimental-strip-types` for the repository's TypeScript lint plugin.

Three agent reviews covered consistency, UI efficiency, and completing mail actions. Fixes included preserving unsaved drafts through external disable, invalidating draft detail caches, allowing repair after definitive SMTP rejection, locking unresolved sends on reopen, and explicit conflict recovery.

Entry points include Settings, the web sidebar and command palette, and native Home. Desktop uses the web interface. Mail uses the authenticated environment RPC transport for local and remote clients; it does not depend on a coding provider adapter. Reverse actions include re-enable, reconnect, unflag/unread, and verified move undo. Browser, Electron, native-device, and live-provider round trips have not been verified in this implementation session.
