# Workspace spaces

Choose Workspace to open Projects. Communications, Meetings, Calendar, Email, Tasks and Projects share the workspace navigation. A view that needs a newer server explains its availability. Choose Code to restore your previous Code location in the selected environment for this app session. The command palette also offers Open Workspace, Open Mail and Open Projects. Open local Office tools keeps the existing local Office and Pulse Talk tools reachable.

Each space shares an environment breadcrumb and a header naming the current view. Email and Communications have a resizable list beside the selected item. Drag the divider, or focus it and use the arrow keys, Home or End. Each space remembers its width on this device. Other spaces use the full center. On a phone, open the navigation menu to change spaces, and use Back to list to return from an item without clearing the list's search or scroll position.

## Resources and Linked context

Resources shows the project you choose, even before you select an item. Its tabs are Files, Browser, Agents, Tasks, Docs and PRs. A tab explains when its contents are unavailable. Choosing or browsing a project does not create a link or give an agent access to its contents.

The project picker shows Auto: followed by the project name when it infers one project from the current item. Choose a project yourself to keep Resources on that project as you select other items. Choose Auto in the picker to resume inference. If no single project resolves, choose one explicitly. A removed project stays unavailable until you choose another.

Linked context opens the selected item's confirmed links, suggestions and their origins. Use the header's link control, or Workspace actions on a phone. It holds the item you opened it for. If you select another item, Held item identifies the original target; choose Show current item to switch. A deleted task closes its held context. Changing a task's column keeps its links open.

Back to resources returns to the chosen project and tab. The X in Linked context closes that context and restores the previous Resources visibility. The X in Resources closes the tool; reopen it from the header. Closing Resources on a wide screen remembers that preference. On a phone or a narrower window, Resources opens over the current view and closing it returns focus to its trigger. Resizing an open panel transfers it between the side panel and sheet. Resource drafts are kept through resizing and Linked context; explicitly closing Resources stops its tool. An open Browser preview closes when Linked context opens and is not restored by Back to resources.

The command palette entries Resources and Linked context use the same controls. Their default shortcuts are `mod+alt+o` and `mod+alt+l`. `mod` means Ctrl on Windows and Linux, or Command on macOS. These shortcuts do not run while typing in an editable field or using a terminal.

Connection status unavailable means Pulse Code has no supported health information for the selected project's sources. It does not establish whether those sources are connected or have failed. The footer's settings control opens workspace settings for that project.

## Mail

Mail reads the accounts added in Settings, Email accounts. It works in desktop and remote browsers when the connected server supports Mail. Its navigation contains your accounts and folders. Choose a folder, search within it, and use Refresh to load the newest messages. Bodies load on demand as plain text. Attachments show their names and sizes.

The Conversations view groups messages by their provider thread or reply headers. Messages with the same subject can still be separate conversations. Switch to Messages to see individual rows. Your device remembers the choice. When a folder is too large to scan completely, the list says that counts and conversations may be incomplete.

Open a conversation to read its messages. Linked can show connections from those individual messages; a conversation itself is not a link target. Conversation actions use its newest message.

Message links use Message-ID to find mail after it moves. If a message cannot be found, the reader explains why. Messages without Message-ID use their original folder location and may become unavailable after moving.

Draft reply with agent checks the project's email access and offers models that support the required mail tools. The draft includes removable source references and a request to prepare a reply. Sending that request to the agent does not send email. Review the exact message on the approval card and approve it once, or decline. See [Email](email.md) for approval and uncertain-send behavior.

After your mail server accepts a reply, its Message-ID connects the sent message to the original and the agent thread. If saving those links fails, retry saving the links. That retry does not send the email again.

## Linked items

Linked shows confirmed connections, their type and title, how they were made, and the original viewing location. Open an item or choose Unlink. Removed or unavailable items stay visible. The info control explains what linked context allows agents to read.

Choose Link to to find a project or thread, paste a web address, or drag an item onto another item or its Linked panel. Pasted Google Drive and Docs links retain their file identity and open on Google. Pasting a link does not connect a Google account.

Right-click an item, use its actions button, or long-press on touch screens to start a thread or create or add to a project. The same actions are in the selected item's header and command palette. Default shortcuts are `mod+alt+t` to start a thread, `mod+alt+p` to add to a project, and `mod+alt+shift+p` to start a project.

Start thread uses the item's linked project or asks you to choose one. Its composer contains removable references to the item and its confirmed links. Remove references you do not want to attach to this thread, write your request, and Send. Opening or canceling the draft creates no links. Sending confirms only the references left in the message before the agent starts. If confirmation fails, the turn shows an error and the agent does not run.

Start project asks for a name and creates a folder under your configured projects directory. It names the source item it will link. Canceling before Create makes no project. If linking fails after creation, Retry links the existing project rather than creating another one. A brief reconnect keeps the form, its focus and its text. Losing permission disables actions and keeps the draft.

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

Choose a project to see its threads, tasks and workspace settings, or return to All projects. Open Linked context for its direct links and Related through linked items. A selected task's Linked context also offers its owning project's related items, labelled as project discovery. Each related row says which item it came through. These rows are for discovery and give no additional agent access. Link an item directly when you want it to become project context. Large hubs show a bounded selection and say when more items exist.

Code thread details also show confirmed workspace links and the thread's existing pull request links. Pull requests keep their original open and unlink behavior.

Linked context contains Linked and Suggested. Its Projects view shows confirmed project links. Resources keeps its project selection independently of these item links.

## Automations, browser and tasks

Start automation opens the scheduled-task editor with the selected item as context. Saving creates and links its idle agent thread before the schedule can run. Canceling the editor creates no thread or links. Use the existing scheduled-task controls to disable or delete future runs.

Browser opens inside the desktop app. Web and phone browsers open a separate tab. Link a page address to keep it with the selected item. External tabs cannot report navigation back to Pulse Code, so paste the current address before linking it. The project's browser-thread setting determines which thread owns its desktop browser work.

Tasks contain a title, project column and links. Open a project to add tasks, then select a task to rename it, change its column or link related items. Project workspace settings manage the columns and browser thread. Move tasks before removing or renaming their column. Deleting a task keeps its links, which then identify it as unavailable. Tasks do not have recurrence or dependency rules.

On a server with task date support, select a task to set or clear its due date and area. A due date is a calendar day. It stays on that day when you open the task on another device. Today and overdue labels follow midnight in the environment's workspace timezone.

On a server with task owner support, new tasks start assigned to Me. Choose Unassigned when adding or editing a task to clear its owner. Older tasks start Unassigned. In Settings, General, select one environment to save its Environment owner name and initials. Every connected device shows that display profile for Me. Renaming or clearing the profile keeps tasks assigned to Me. This display label does not identify a signed-in person or grant access to tasks or linked items.

To choose that timezone, open Settings, General, select one environment and save its Workspace timezone, such as Africa/Johannesburg. It starts with the server's timezone and keeps that choice if the server moves. Reset uses the server's current timezone. If that timezone is unsupported, the initial choice and Reset use UTC. If the server or your device cannot recognize a saved timezone, task dates use UTC and show a notice. A due date does not schedule a reminder or start an agent.

Task date, owner and completion controls become available when the connected server supports them. If project workspace settings says "Tasks need a newer server.", update that server to enable them.

On a server with task completion support, choose Completed column in project workspace settings. A custom column named Done stays open until you designate it. Changing or clearing the designation shows how many tasks change completion before you confirm; Cancel leaves the settings unchanged.

Move tasks out before renaming or removing their column. Renaming or removing the completed column clears its designation, including when saving from an older client. Choose a completed column again to restore completion controls. Tasks stay in their current columns.

Agents treat linked content as information, never as instructions. Unlink removes that connection; another direct link or an existing email permission may still make the item available.
