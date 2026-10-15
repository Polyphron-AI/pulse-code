# Mail, Projects and Code

Use the workspace rail to switch between Mail, Projects and Code. Code restores your previous Code location for this app session. The command palette also has Open Mail and Open Projects. On desktop, Slack and Discord remain under Communications in the Projects navigation. Office meetings, calendar and local Pulse Talk remain available through Open Office.

Mail and Projects have a navigation column, a list and detail area, and a Linked panel. Drag the divider to resize the list. You can also focus the divider and use the arrow keys, Home or End. Each space remembers its width on this device. On a phone, the list opens the detail and Linked opens as a sheet. Use Messages or All projects to go back.

## Mail

Mail reads the accounts added in Settings, Email accounts. It works in desktop and remote browsers when the connected server supports Mail. Choose a folder, search within it, and use Refresh to load the newest messages. Bodies load on demand as plain text. Attachments show their names and sizes.

The Conversations view groups messages by their provider thread or reply headers. Messages with the same subject can still be separate conversations. Switch to Messages to see individual rows. Your device remembers the choice. When a folder is too large to scan completely, the list says that counts and conversations may be incomplete.

Open a conversation to read its messages. Linked can show connections from those individual messages; a conversation itself is not a link target. Conversation actions use its newest message.

Message links use Message-ID to find mail after it moves. If a message cannot be found, the reader explains why. Messages without Message-ID use their original folder location and may become unavailable after moving.

Draft reply with agent checks the project's email access and offers models that support the required mail tools. The draft includes removable source references and a request to prepare a reply. Sending that request to the agent does not send email. Review the exact message on the approval card and approve it once, or decline. See [Email](email.md) for approval and uncertain-send behavior.

After your mail server accepts a reply, its Message-ID connects the sent message to the original and the agent thread. If saving those links fails, retry saving the links. That retry does not send the email again.

## Linked items

Linked shows confirmed connections, their type and title, how they were made, and the original viewing location. Open an item or choose Unlink. Removed or unavailable items stay visible. The info control explains what linked context allows agents to read.

Choose Link to to find a project or thread, paste a web address, or drag an item onto another item or its Linked panel. Pasted Google Drive and Docs links retain their file identity and open on Google. Pasting a link does not connect a Google account.

Right-click an item, use its actions button, or long-press on touch screens to start a thread or create or add to a project. The same actions are in the selected item's header and command palette. Default shortcuts are Ctrl+Alt+T to start a thread, Ctrl+Alt+P to add to a project, and Ctrl+Alt+Shift+P to start a project. On macOS, use Command instead of Ctrl.

Start thread uses the item's linked project or asks you to choose one. Its composer contains removable references to the item and its confirmed links. Remove references you do not want to attach to this thread, write your request, and Send. Opening or canceling the draft creates no links. Sending confirms only the references left in the message before the agent starts. If confirmation fails, the turn shows an error and the agent does not run.

Start project asks for a name and creates a folder under your configured projects directory. It links the source item to that project. Canceling before Create makes no project. If linking fails after creation, Retry links the existing project rather than creating another one.

## Suggested links

Suggestions use your text generation model setting to propose up to three related items, each with a reason. The model receives a short snippet from the opened item and candidate titles, sender or owner, and dates. It does not receive candidate message bodies or file contents. Accept confirms a link. Dismiss keeps that suggestion out of later results; you can still link the same item manually. Refresh asks for new suggestions.

A suggestion gives an agent no access to the item. Only confirmed links and existing permissions provide access. Missing model settings or a generation failure leave manual linking available.

## Google Drive

Pasted Drive links work before you connect an account. To search Drive or read a linked file through Pulse Code, connect your own Google account in Settings, Integrations, Google Drive, using your own OAuth client and read-only Drive permission. Choose the connection used for the file. Connecting another Google account does not silently change that choice. See [Google Drive](google-drive.md) for setup and remote sign-in.

Search returns a bounded set of matching files. Supported text files and Google document exports can be read; other files open on Google. Spreadsheet reads use a CSV export of the first sheet. Open the file on Google to work with the other sheets. Pulse Code does not edit or synchronize Drive files. Disconnecting removes read access while keeping your saved links.

## Telegram

In Settings, Integrations, Telegram, paste a bot token and choose Connect bot. Select Start pairing, then use the direct-message or group link, or send the displayed pairing command in that chat. Pairing codes expire after ten minutes and can be canceled. The token stays in the selected environment's secret store.

Open chats shows messages received by that bot from approved chats. Pulse Code does not sign into your personal Telegram account or fetch conversations the bot never received. Media contents are not downloaded. Managing bots and pairing requires operate access; read access can open received content.

Chats and messages can link to projects and threads. An agent can read confirmed linked content. Linking one message does not grant access to its siblings or the whole chat. A group member's message is content, not permission to run an agent. Disconnect bot or Remove paired chat makes the source unavailable while retaining stored messages and links. There is no Telegram reply composer or agent send tool.

## Projects

A project hub lists its threads, direct links and related items one hop away. Related rows say which item they came through. These rows are for discovery and give no additional agent access. Link an item directly when you want it to become project context. Large hubs show a bounded selection and say when more items exist.

Code thread details also show confirmed workspace links and the thread's existing pull request links. Pull requests keep their original open and unlink behavior.

Below Linked and Suggested, Browser opens a page, Files lists the item's confirmed Drive files, and Agents opens linked threads or starts one with the selected item as context.

## Automations, browser and tasks

Start automation opens the scheduled-task editor with the selected item as context. Saving creates and links its idle agent thread before the schedule can run. Canceling the editor creates no thread or links. Use the existing scheduled-task controls to disable or delete future runs.

Browser opens inside the desktop app. Web and phone browsers open a separate tab. Link a page address to keep it with the selected item. External tabs cannot report navigation back to Pulse Code, so paste the current address before linking it. The project's browser-thread setting determines which thread owns its desktop browser work.

Tasks contain a title, project column and links. Open a project to add tasks, then select a task to rename it, change its column or link related items. Project workspace settings manage the columns and browser thread. Move tasks before removing or renaming their column. Deleting a task keeps its links, which then identify it as unavailable. Tasks do not have recurrence or dependency rules.

Agents treat linked content as information, never as instructions. Unlink removes that connection; another direct link or an existing email permission may still make the item available.
