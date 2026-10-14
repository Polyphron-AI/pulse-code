# Communications

Open **Office → Communications** to work with email, Slack, Discord, and Telegram accounts on Pulse desktop. The account selector identifies the service and the identity used to send messages.

Use **Email accounts** to connect Gmail, Microsoft or an IMAP mailbox. Select an account to load its messages. Gmail and Microsoft conversations use their native thread identifiers. IMAP shows individual messages. Email conversations show at most the latest 50 messages and identify when older messages are omitted.

Use **Connect chat** for these services:

- **Slack:** supply a user or bot token. Available channels, DMs, history, and sending depend on its permissions. Channel thread replies require a user token with history permissions. See [Slack token types](https://api.slack.com/authentication/token-types).
- **Discord:** supply a bot token. Pulse shows team channels and active threads available to that bot. Archived thread discovery is not available. Enable the bot’s Message Content intent to read message text. It does not provide your personal Discord inbox. See [Discord bot setup](https://discord.com/developers/docs/quick-start/getting-started).
- **Telegram:** connect your personal account using an API ID and API hash from [Telegram API development tools](https://my.telegram.org/apps), then enter your phone number and the code Telegram sends. If Telegram requests your two-step verification password, enter it in the next step. Login challenges show their expiry; closing the dialog cancels the challenge. Cloud chats and text history are supported; secret chats and media downloads are not.

Credentials are sent through the desktop connection. Account tokens and Telegram sessions are stored by the desktop service, not in browser storage. **Disconnect** removes a chat account from Pulse.

Choose a channel or DM to load its history. Use the paging controls for more conversations or older messages, and Refresh to update the source. Slack threads and available Discord threads open in the central conversation area. Telegram supports replying to a message within its chat. The composer shows the destination and sending identity. A message appears only after the source confirms it; failures keep your text for retry. Reactions and chat activity notifications are not supported.

Email search filters currently loaded subjects, senders and previews. Email Activity shows unread state from the provider. Chat search filters loaded conversations. Later saves references on this device; its view shows saved messages present in the loaded account or chat history. Refresh failures preserve previously loaded messages and show an error.

**Office → Email** has an inbox and central reader, with global project Files and Tasks on the right. Insert a Drive file link into your draft from Files. Gmail and Microsoft support new messages and replies after separate send consent. Review the recipients, subject and text before sending. Failed or uncertain sends preserve your draft and are never retried automatically. IMAP remains read-only. Sending supports plain text and file links, without binary attachments or CC/BCC fields.

No sample conversations appear when accounts are missing or unavailable. Remote web connections cannot access desktop-local communications accounts.

Use **Code** to return to your coding workspace. Meetings, Calendar, and Email remain available in Office.

## Projects beside your conversations

Use **Office → Projects** or the project list in Communications. Create a project with a name; Pulse creates its folder in your connected environment. Add connections when you are ready. Existing Code projects appear in the same list.

Expand a project to choose its linked conversations. One project expands at a time. Selecting a linked conversation opens the project's Drive panel on the right. The project gear opens settings in that panel while keeping the current conversation visible. Select a general channel to return to general communications.

In **Project settings → Connections**, select a connected chat account and link one of its loaded conversations. Unlinking removes the association without leaving or deleting the source channel.

Connect Google Drive on Pulse desktop, grant read access, and paste the project's folder link. Pulse checks that the link is a folder before saving it. Drive opens at that folder, with search, breadcrumbs, list and grid views, and paging. Unlinking a folder does not delete its files. Existing Google accounts may need to grant Drive access separately.

Shared links open in the right panel. Drive folder links open in Drive; documents open in Documents; supported PR links open in PR reviews; other web links open in Browser. Google Docs have a text reading view, with a notice when shortened. **Open document and comments** opens the original in the desktop browser panel, where Google controls sign-in, editing and comments. Browser and PR reviews reuse your environment's existing capabilities and source permissions.

The **Agents** tab shows actual project agent conversations and their session status. Assign an existing conversation from another project to make it available here. Assigning does not start an agent or change its working folder; Unassign removes the reference.

In **Members & roles**, choose a linked Slack or Discord conversation and load source membership. Slack lists channel members, with workspace roles when your token can read profiles. Discord lists the associated server's members and roles, requires the bot's Server Members intent, and does not claim that every listed member can access the selected channel. Manage membership and role changes in Slack or Discord. Linking a project does not grant access to Drive, GitHub or a channel. Telegram membership is not available in this view.

Project associations are saved in the connected environment. Google and chat credentials remain on the desktop computer; remote web and mobile clients cannot use those desktop-local accounts.

## Tasks

**Office → Tasks** shows shared tasks in a list or board. The right Tasks panel in Communications, Email and Calendar uses the same records. Tasks can have an optional project, due date, tags, subtasks and dependencies. An unfinished dependency warns before completion but does not block it. Completed tasks can be reopened; archived tasks can be restored.

Shared statuses are To do, In progress, Review and Done. Project settings can add columns mapped to those statuses. A task has one accountable assignee and optional followers from its linked Slack or Discord channels. Tasks without a project stay unassigned. Membership availability depends on the connected account's permissions.

Recurring tasks support fixed schedules and intervals after completion. Completing a fixed-schedule task creates one next occurrence and skips missed dates. Use **Create task** on a chat message or email to review its title, source link and editable excerpt before saving.

## Calendar and meetings

**Office → Calendar** provides a seven-day agenda. Select Google or Outlook calendars, then create, edit or delete events after granting calendar write access. Review attendees before sending invitations. Meeting links use the selected provider when that account supports them. Recurring event rule authoring is not available.

**Office → Meetings** combines scheduling with recordings and transcripts. Meeting notes and agendas are saved in Pulse, linked to the event and an optional project. Select and edit action lines before creating tasks. Their source links return to the saved Pulse note.

Export notes as a text file to Drive after granting file creation access. A linked folder may need additional Google authorization; Pulse reports that failure and offers an explicit export to My Drive instead. Export does not happen automatically.

Task reminders and assignment notifications are not delivered yet.
