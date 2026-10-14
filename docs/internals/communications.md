# Communications adapters

Communications accounts belong to the desktop environment. The sandboxed client invokes a typed IPC request; the main process validates the request and exact top-frame origin, loads encrypted credentials, and calls the provider adapter. No credentials or Telegram sessions appear in public account metadata or browser storage. OS secure storage must be available; Linux plaintext fallback is refused.

Email reuses Office accounts and provider calls. Gmail and Microsoft use native conversation identifiers; IMAP presents an individual message. Explicit mailSend consent enables Gmail/Microsoft compose and native reply operations. Drafts persist before send and survive uncertain results. Sending never retries automatically; IMAP send remains unsupported.

Slack and Discord use fixed HTTPS API origins with bounded requests, cancellation, rate-limit handling and native pagination. Discord requires bot credentials and applies guild/channel permissions. Telegram uses a personal MTProto account through teleproto. Login challenges expire after ten minutes; codes and two-step verification passwords are transient. StringSession credentials are encrypted, and primary data-center changes refresh saved credentials. The native cifrante dependency stays external and is staged with the desktop runtime.

Chat sends return only provider acknowledgements. Retries retain a destination-aware nonce, and no automatic send retry occurs. A credential-refresh failure after acknowledgement cannot convert the message into an unsent result. History and metadata failures retain the previously loaded UI data.

This version supports desktop-local text conversations. Remote web and mobile clients cannot access the desktop-local accounts. Attachments, reactions, push activity, Telegram secret chats and archived Discord thread enumeration are outside this version. Slack channel-thread reads require user-token history permissions.

Focused adapter and service tests use synthetic transport/SDK responses. Account login must additionally be verified in the installed desktop client with provider credentials; tests do not contact customer services.

## Project associations

Existing orchestration projects carry optional `office` metadata: one Google Drive account/folder reference, linked provider/account/conversation tuples, assigned agent thread IDs, and an optional browser utility thread. `project.meta.update` persists it through the existing event and projection flow. Migration 055 adds the nullable JSON projection column. Omitted metadata preserves prior values; explicit null clears it. Older events and snapshots remain valid.

New agent assignments must refer to existing threads in the same environment. Browser utility threads must belong to the project. Previously deleted references do not block unrelated metadata updates, and the UI allows unavailable assignments to be removed. A browser utility thread has no agent turn; tagging an agent only stores its reference.

Google Drive uses the existing Office OAuth and encrypted credential store with an explicit read capability upgrade. Listing and export calls use fixed Google origins, bounded responses, timeouts and shared-drive support. Documents are exported as bounded plain text for reading; full editing and comments use the source document in the existing native browser panel. Separate driveWrite consent uses drive.file for explicit plaintext meeting-note creation. An existing linked folder may lack app authorization; export fails visibly and never silently changes destination.

`members.list` reads source membership from a persisted conversation reference after validating fresh source access. Slack lists channel members and enriches profiles in bounded batches. Missing profile permission leaves role metadata unavailable. Discord returns server membership and roles, explicitly not channel-level effective permissions, and requires the Server Members privileged intent. Pulse does not create its own invitations or enforce source roles.

The web/desktop UI uses one right project panel for resources and settings; provider reply views remain in the centre. Office Projects and Communications routes share the same project records. No provider CLI adapter changes are required. Desktop-local account availability remains the boundary for remote web/mobile; project metadata travels through the normal server snapshot contract.

## Shared tasks and meeting notes

Migrations 056 and 057 add server-owned task and meeting-note records. Typed subscribe/mutate RPCs use existing read/operate scopes, revision checks and subscription updates after persistence. Task recurrence creates one successor atomically. Fixed schedules retain the recurrence anchor and skip missed dates; after-completion recurrence uses the host-local completion date. Dependency and subtask cycles are rejected. Unfinished dependencies produce a UI warning rather than a completion prohibition.

Task people reference linked Slack/Discord conversations. The picker requests channelOnly membership, including Discord effective channel access or thread membership. The server validates project/channel references; it does not independently query desktop credentials to verify current membership. These references grant no provider access. Custom project columns map onto shared statuses in office metadata.

Meeting notes are keyed by account/event and support an optional project. Reviewed task creation saves notes first and links tasks to the durable Pulse note. Chat/email sources retain bounded app-relative destinations and editable excerpts. Calendar writes use explicit calendarWrite consent and provider invitations; full recurring-event authoring is excluded.

Durable Activity and external notifications are pending. No task mutation currently sends desktop, chat or email notifications. Native mobile has no new Office screens; shared task/note contracts remain available through the environment connection.
