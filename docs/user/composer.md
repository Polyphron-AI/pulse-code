# Message composer

Messages can contain up to 120,000 characters. If a draft is longer, Pulse Code keeps it in the
composer and shows how many characters need to be removed. Shorten the draft or split it into
multiple messages, then send again in the same thread.

## Messages while the agent is working

Choose how messages behave during an active turn under **Settings → General → Messages while
working**:

- **Queue** (default) waits for the active turn to finish, then starts the message as a separate
  follow-up turn.
- **Steer** sends the message into the active turn so the agent can adjust its current work.

The composer stays available while the agent works. Its send button is labeled **Queue message** or
**Steer current turn** while a turn is active, matching the selected behavior.

On mobile, the **+** control offers Photos and adds Files when the connected server supports file uploads. Share a file into Pulse Code through the system share sheet. Files upload when the message sends; queued messages retain their files until delivery. Select a received file to save it or open it in another app.

# Voice dictation

The microphone above Send adds a Parakeet transcript to your draft. Ctrl+Shift+Space starts or stops recording. Configure the shortcut and Windows hover mode in Settings → General → Voice capture. See [Voice capture](voice-capture.md).

## Model defaults

Pulse Code remembers the last provider, model and model options you selected for new threads. An explicit project default overrides that remembered selection; resetting the project setting restores it. Existing project defaults are preserved during updates.

Provider default options remain display values until you choose them in Pulse Code. Only explicitly selected options are sent, allowing an unset reasoning level or service tier to come from the provider configuration.

### Workspace skills

The skill and command menus use the selected provider and workspace, including a thread's worktree.
They refresh after a provider is reconfigured. Skills disabled by the provider or reserved for the
agent are hidden from composer picks. Use `$` to find a skill, or `/` to browse skills alongside
provider commands. Native provider commands must start the message.

On web and desktop, skill rows show a source badge such as Repo, Personal, Project, or App. The
slash menu includes skills by default. Turn off **Show skills in slash menu** in **Settings →
General** to keep it command-only. Skills remain available through `$`.

Slash skill results show `/skill:Skill Name` and insert the same `$name` token as the `$` menu.
Search by either the display name or original skill name. When a skill is visible, its matching
native provider command is hidden to avoid duplicates. Turning off slash-menu skills restores that
native command.

Mobile offers these menus in existing threads and while composing a new task. Switching drafts
moves the text selection to the end of the newly selected draft.

## Compact an existing conversation

Enter `/compact` in an idle thread to summarize its context before continuing. Codex, Claude, Cursor, Grok, and OpenCode support this action. Wait for compaction to finish before sending the next message. A new thread needs conversation history first; OMP does not currently support this action.

## Compaction controls

Send `/compact` in an existing conversation to reduce its context when the connected provider supports it. On web and desktop, the context meter also offers **Compact context**; send or clear your draft first. On mobile, choose `/compact` from the command menu. Compaction runs without attachments, shows **Compacting…** while active, and leaves a separate result in the conversation. Unsupported providers do not offer the command.

## Custom models

Custom models can have a display name and model options in Settings → Providers. Edit a custom model to define its available options or copy options from a built-in model. Existing custom model slugs keep working. These settings belong to the selected provider instance and are available to connected web, desktop, and mobile clients. The model slug sent to the provider stays unchanged.

## Preview files and media

On web and desktop, select an image to expand it. Videos play in the conversation, and a video attached to a draft has a preview button. Markdown can show images and videos from the thread's host environment without downloading the whole video before playback. Playback depends on the formats supported by your browser.

Use a media context menu to copy its original path or URL, save it, or copy an image. A remote host must allow browser access for save and copy operations.

PDF and HTML attachments open in the file panel with a separate download action. Workspace PDF and HTML files can also be viewed there; HTML offers a source view. HTML previews are isolated from Pulse Code's session and storage.

On mobile, Photos includes videos when the connected server supports file uploads. You can also choose videos from Files. Tap an image, PDF, or video in a draft or conversation to preview it; the media menu offers the available copy and share actions. Video playback pauses when the app or screen loses focus, and offscreen conversation videos do not load until needed.

## Editing files

Edits in the web or desktop file panel save automatically to the selected environment. Closing the file saves pending edits without resending an already-saved revision.

If a thread cannot finish loading, Pulse Code displays a synchronization error and keeps any cached conversation visible. A temporary connection loss can still recover when the environment reconnects.
