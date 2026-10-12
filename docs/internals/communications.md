# Communications adapters

Communications accounts belong to the desktop environment. The sandboxed client invokes a typed IPC request; the main process validates the request and exact top-frame origin, loads encrypted credentials, and calls the provider adapter. No credentials or Telegram sessions appear in public account metadata or browser storage. OS secure storage must be available; Linux plaintext fallback is refused.

Email reuses Office accounts and provider calls. Gmail and Microsoft use native conversation identifiers; IMAP presents an individual message. Email permission remains read-only, with replies saved as local drafts.

Slack and Discord use fixed HTTPS API origins with bounded requests, cancellation, rate-limit handling and native pagination. Discord requires bot credentials and applies guild/channel permissions. Telegram uses a personal MTProto account through teleproto. Login challenges expire after ten minutes; codes and two-step verification passwords are transient. StringSession credentials are encrypted, and primary data-center changes refresh saved credentials. The native cifrante dependency stays external and is staged with the desktop runtime.

Chat sends return only provider acknowledgements. Retries retain a destination-aware nonce, and no automatic send retry occurs. A credential-refresh failure after acknowledgement cannot convert the message into an unsent result. History and metadata failures retain the previously loaded UI data.

This version supports desktop-local text conversations. Remote web and mobile clients cannot access the desktop-local accounts. Attachments, reactions, push activity, Telegram secret chats and archived Discord thread enumeration are outside this version. Slack channel-thread reads require user-token history permissions.

Focused adapter and service tests use synthetic transport/SDK responses. Account login must additionally be verified in the installed desktop client with provider credentials; tests do not contact customer services.
