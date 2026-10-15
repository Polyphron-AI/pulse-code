# Communications

Open **Office → Communications** to work with email, Slack, Discord, and Telegram accounts on Pulse desktop. The account selector identifies the service and the identity used to send messages.

Use **Email accounts** to connect Gmail, Microsoft or an IMAP mailbox. Select an account to load its messages. Gmail and Microsoft conversations use their native thread identifiers. IMAP shows individual messages. Email conversations show at most the latest 50 messages and identify when older messages are omitted.

Use **Connect chat** for these services:

- **Slack:** supply a user or bot token. Available channels, DMs, history, and sending depend on its permissions. Channel thread replies require a user token with history permissions. See [Slack token types](https://api.slack.com/authentication/token-types).
- **Discord:** supply a bot token. Pulse shows team channels and active threads available to that bot. Archived thread discovery is not available. Enable the bot’s Message Content intent to read message text. It does not provide your personal Discord inbox. See [Discord bot setup](https://discord.com/developers/docs/quick-start/getting-started).
- **Telegram:** connect your personal account using an API ID and API hash from [Telegram API development tools](https://my.telegram.org/apps), then enter your phone number and the code Telegram sends. If Telegram requests your two-step verification password, enter it in the next step. Login challenges show their expiry; closing the dialog cancels the challenge. Cloud chats and text history are supported; secret chats and media downloads are not.

Credentials are sent through the desktop connection. Account tokens and Telegram sessions are stored by the desktop service, not in browser storage. **Disconnect** removes a chat account from Pulse.

Choose a channel or DM to load its history. Use the paging controls for more conversations or older messages, and Refresh to update the source. Slack threads and available Discord threads open beside the conversation. Telegram supports replying to a message within its chat. The composer shows the destination and sending identity. A message appears only after the source confirms it; failures keep your text for retry. Reactions and chat activity notifications are not supported.

Email search filters currently loaded subjects, senders and previews. Email Activity shows unread state from the provider. Chat search filters loaded conversations. Later saves references on this device; its view shows saved messages present in the loaded account or chat history. Refresh failures preserve previously loaded messages and show an error.

Email access is read-only. **Save local draft** saves your reply on the desktop computer and restores it when you reopen that message. It does not send email. Unsupported send and reaction controls are absent.

No sample conversations appear when accounts are missing or unavailable. Remote web connections cannot access desktop-local communications accounts.

Use **Code** to return to your coding workspace. Meetings, Calendar, and Email remain available in Office.
