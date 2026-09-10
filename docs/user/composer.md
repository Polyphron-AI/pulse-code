# Message composer

Messages can contain up to 120,000 characters. If a draft is longer, Pulse Code keeps it in the
composer and shows how many characters need to be removed. Shorten the draft or split it into
multiple messages, then send again in the same thread.

## Messages while the agent is working

On web and desktop, scrolling a conversation can shorten a single-line composer draft to leave
more room for reading. The footer controls stay visible. Click the composer, start typing, or
return to the end of the conversation to expand it. Multiline drafts and pending approval or
answer controls stay expanded. Moving focus away does not collapse the desktop composer.

Turn off **Collapse composer on scroll** under **Settings → General** to keep the composer expanded.
The mobile keyboard and composer keep their existing behavior.

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

On web and desktop, the circular context window indicator is off by default. Restore it under
**Settings → General → Legacy features → Context window indicator**. This only changes the
indicator's visibility; context tracking, usage information and `/compact` remain available.

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

## Reveal a file on your computer

On web or desktop connected locally, open a chat file chip's menu and choose **Reveal in Finder**, **Reveal in File Explorer**, or **Reveal in Files**. The action selects the file where supported; Linux opens its containing folder. The menu uses the environment that owns the conversation or pull request. Remote connections and older environments without reveal support omit this action. Media preview and download remain available through their existing menus.

## Choose where web links open

In desktop **Settings ? Integrations ? Browser**, set **Open links in** to your default browser or **Pulse Code**. Chat and terminal web links follow this preference. Links beside a thread in a pull request panel can use the same in-app browser; a standalone pull request page uses your default browser.

Hold Command or Ctrl while clicking a chat link to open it in your default browser. Terminal links already use a modifier to activate, so they follow the saved preference. Links to a known pull request still open its review panel. Media previews keep their existing behavior.

Your default browser is selected initially. Web clients without an integrated browser and mobile continue using their normal external link behavior. If an in-app open fails, Pulse Code tries your default browser; cancelling an in-app open does not open another browser.

## Quote an assistant response

On web and desktop, select text in an assistant response, then choose **Cite in composer** from the
menu that appears when you release the selection. This inserts an inline quote chip at your cursor
and opens an optional comment bubble beside the selected text; press `Enter` or choose **Save** to
attach the comment, or leave it blank and save to keep just the quote. Use `Command/Ctrl+Enter`
to save the comment and send the message. Cancelling a newly inserted quote removes it; cancelling
an edit keeps the existing quote and comment. You can type before and after the
chip, such as a quote followed by "what do you mean?". A selection must stay within one response
and fit in 8,000 characters.

The chip shows your comment when it has one, or a short quote preview otherwise. Use the pencil
button to add or change the comment, and the remove button to delete the quote and its comment from
the draft. Copying, reloading, and restoring a [stashed prompt](#prompt-stash) keep each comment
with its quote, and sending tells the agent which words were quoted and which comment you wrote.
The quoted text and comment count toward the message limit.

Select a chip in the composer or a sent message to open the source thread, scroll to the response,
and highlight the quoted passage — including in older history. The
highlight pulses, holds for a moment, then fades on its own; press `Escape` to stop the navigation
or clear it early. If the source is unavailable or its text has changed, the saved quote stays
readable and Pulse Code shows a warning.

Mobile shows the full saved quote and its comment in sent messages. It does not offer
**Cite in composer** or navigation to a quote's source.

## Images read by agents

When an agent reads an image, its tool result can show an image preview. The preview loads from the connected environment and supports the same viewing actions as images in messages.

Open file previews, the file tree, Git status, and working-tree diffs refresh after agent commands or file changes. A file with a pending edit waits until the edit finishes before refreshing.

Skill and command suggestions attach to the top of the composer and follow it when panels resize. Skill-source icons distinguish app, repository, project, personal, and system skills on desktop, web, and mobile.

## Mobile drafts and queued tasks

Mobile keeps unfinished new-task drafts beside pending tasks in the thread list. You can keep several drafts for one project, reopen a draft, or discard it. Switching environments carries the current draft to the corresponding project without sending it.

When you submit a task while connected, its thread opens with your prompt while setup runs. If setup fails, **Edit task** reopens the saved draft. Offline submissions stay queued until the environment reconnects. Queued follow-up messages remain visible in the conversation; you can edit one before delivery starts.

## Composer drawers

Approvals, questions, and ready plans appear in a drawer attached to the composer. Approval details stay readable alongside the provider's available actions. Running task plans have a Tasks control that expands their steps and completed-step durations; closing the drawer keeps the progress control, while dismissing it hides tasks for that turn. Stashed prompts open in an attached drawer and remain accessible from the composer controls.
