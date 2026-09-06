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

# Voice dictation

The microphone above Send adds a Parakeet transcript to your draft. Ctrl+Shift+Space starts or stops recording. Configure the shortcut and Windows hover mode in Settings → General → Voice capture. See [Voice capture](voice-capture.md).
