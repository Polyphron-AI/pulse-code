# Communications

Open **Office > Communications** for Slack and Discord on Pulse desktop. Use **Telegram bots** for the server-backed Telegram reader on web or desktop. The account selector identifies the service and the identity used to send messages.

Read mail in the [Mail space](workspace-spaces.md), and manage accounts and reply approvals in [Email](email.md).

Use **Connect chat** for these services:

- **Slack:** supply a user or bot token. Available channels, DMs, history, and sending depend on its permissions. Channel thread replies require a user token with history permissions. See [Slack token types](https://api.slack.com/authentication/token-types).
- **Discord:** supply a bot token. Pulse shows team channels and active threads available to that bot. Archived thread discovery is not available. Enable the bot’s Message Content intent to read message text. It does not provide your personal Discord inbox. See [Discord bot setup](https://discord.com/developers/docs/quick-start/getting-started).

Credentials are sent through the desktop connection. Slack and Discord tokens are stored by the desktop service, not in browser storage. **Disconnect** removes a chat account from Pulse.

Choose a channel or DM to load its history. Use the paging controls for more conversations or older messages, and Refresh to update the source. Slack threads and available Discord threads open beside the conversation. The composer shows the destination and sending identity. A message appears only after the source confirms it; failures keep your text for retry. Reactions and chat activity notifications are not supported.

Chat search filters loaded conversations. Later saves references on this device; its view shows saved messages present in the loaded account or chat history. Refresh failures preserve previously loaded messages and show an error.

No sample conversations appear when accounts are missing or unavailable. Remote web connections cannot access desktop-local Slack and Discord accounts. Telegram bots belong to the selected environment and can be read remotely with read access; managing connections and pairing requires operate access.

Use **Code** to return to your coding workspace.

## Telegram bots

In **Settings > Integrations > Telegram**, choose the environment, paste a token from BotFather, and select **Connect bot**. The token stays in that server's secret store. A bot already using a webhook or another poller must be disconnected from that service first.

Select **Start pairing**, then use **Pair direct messages** or **Pair a group**, or send the displayed `/start pair_CODE` command in that chat. Codes expire after ten minutes and can be canceled. Only approved paired chats are cached. The bot sees only messages Telegram delivers to it, so its privacy settings and group permissions still apply. It cannot import earlier chat history.

Select **Open chats** to read received messages. Pages are bounded, with **Older received messages** when more stored messages are available. Text and media captions are shown; other media appear as labels and are not downloaded. Edited messages retain their identity. Chat text, including commands from other group members, never runs agents. There is no Telegram send tool or reply composer.

A chat or an individual message can be linked to a project or thread. Agents can read only that exact confirmed source through the Linked tools. Linking one message does not grant its siblings or the whole chat. Linking a chat permits bounded pages of its received messages.

**Remove paired chat**, a pairing owner's `/unpair`, or removing the bot from Telegram makes its links unavailable. **Disconnect bot** removes its token and stops receiving. Stored messages and user links remain; reconnecting the same bot and pairing again makes retained content readable. No automatic history pruning is applied.

Personal Telegram login has been retired. Existing personal account records and credentials remain on the desktop and show a migration notice. They are not converted to bot tokens. Connect a bot and pair chats separately to use the new reader.
