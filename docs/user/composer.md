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

Mobile offers these menus in existing threads and while composing a new task. Switching drafts
moves the text selection to the end of the newly selected draft.

## Compact an existing conversation

Enter `/compact` in an idle thread to summarize its context before continuing. Codex, Claude, Cursor, Grok, and OpenCode support this action. Wait for compaction to finish before sending the next message. A new thread needs conversation history first; OMP does not currently support this action.
