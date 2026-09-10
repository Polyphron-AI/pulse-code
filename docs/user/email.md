# Email alpha

Pulse Mail connects to IMAP accounts for reading and organization, with optional SMTP sending. It is an opt-in alpha feature, separate from the Stable or Nightly update track.

## Connect an account

On web or desktop, open Settings → Integrations, enable Show Mail on this device, then open Mail. On mobile, open Settings → Mail. Choose the Pulse environment that will own the account and enable Mail alpha there. Enabling the environment and managing its accounts requires account-administration access.

Enter your email address, IMAP hostname, port, username, and password or app password. Choose TLS or STARTTLS according to your mail provider's settings. You can configure SMTP now or add it later. Pulse tests the configured services before saving the connection. OAuth sign-in is not available in this alpha, so accounts requiring OAuth need a later version.

Credentials stay in the owning environment's secret store. People with access to that Pulse environment can access its mail accounts under their granted read or operation permissions. The environment must be reachable to fetch mail or send. Connecting a phone does not move these credentials onto the phone.

Use Edit to update credentials or add sending. The email address and IMAP source identity remain fixed for an existing account. Use Add account for a different mailbox.

## Read and organize

Choose an account and folder, then open a message. Search queries the selected provider folder; Unread and Flagged filters narrow results. Older pages remain available, including when a search batch contains no matches. Refresh retrieves current provider state.

Use the message actions or select several messages to mark read/unread, flag/unflag, archive, trash, or move. Archive and Trash use the provider's corresponding folders. Where the server returns a verified destination identity, a move can offer Undo. Otherwise, find the message in its destination folder and move it back. Partial failures identify which messages need attention.

Custom leaf folders can be created, renamed, and deleted when empty. System folders and folders containing subfolders are protected in this alpha.

Web and desktop provide plain text and a restricted HTML view. Remote images and active content are blocked. Mobile reads plain text. Attachments and original messages download on request. This client currently opens messages up to 20 MB and downloads individual attachments or originals up to 5 MB. These are Pulse alpha limits, not your provider's limits.

## Compose, drafts, and sending

New message, Reply, Reply all, and Forward open a plain-text composer with To, Cc, Bcc, subject, and attachments. Replies retain the source account and honor Reply-To. Forwarding includes the message text; original attachments are not included automatically.

Drafts autosave to the owning environment. Wait for the saved state before closing the app. Navigation guards protect pending edits, and conflicting revisions do not silently overwrite another device's draft. While disconnected, text in an open editor is not synchronized. Saved drafts can be reopened on another authorized client.

Draft lists load summaries; attachment bytes load only when opening the selected draft. Draft attachments may total up to 5 MB across at most 20 files. The alpha retains up to 200 saved drafts, with a 25 MB combined storage limit including encoded attachments. If a save exceeds these limits, the previous saved version remains intact. Remove unneeded drafts to free space.

Add SMTP sending to the account before pressing Send. A sending operation uses a fixed saved revision. Outbox distinguishes Sending, Accepted, Partially accepted, Failed, and Outcome unknown. Accepted means the SMTP service accepted submission, not that the recipient received or read the message.

Pulse attempts to file a Sent copy independently. A Sent-copy failure does not trigger another send. For unknown or partial outcomes, check the provider and recipient results before preparing another message. Pulse prevents automatic duplicate submission of a draft with an unresolved or accepted send.

## Context and disconnection

Add tags and manual context links while reviewing a message. These annotations persist on the environment separately from received mail bodies. Removing a link suppresses equivalent inferred links; verified moves made through Pulse preserve the metadata. External moves or servers without identity mappings may require manual reconciliation.

Automatic Luna/Haiku link extraction, universal Task creation, and SOP execution are not connected to this mail alpha yet. Manual annotations do not create projects, tasks, or other workspace records.

Hiding Mail on a device preserves account configuration and saved work. Disabling it on the environment stops new external mail operations. Disconnect removes the account credentials while retaining drafts, Outbox history, and annotations for recovery. Reconnect the existing account to use it again.

The current alpha does not yet include a unified inbox, conversation grouping, rich-text composition, provider-mirrored drafts, scheduled sending, rules, calendar invitations, or background push notifications.

# People and work

Open a message's **People and work** panel to confirm participants, record tasks or outstanding feedback, and revisit past work. See [People and work](people-and-work.md) for the current alpha behavior.
