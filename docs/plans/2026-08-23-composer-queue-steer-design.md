# Composer queue and steer design

## Goal

Let users choose what sending from the composer does while an agent is already working:

- **Queue** starts the message as a separate follow-up turn after the active turn.
- **Steer** delivers the message to the active turn so the agent can adjust its current work.

The choice must behave consistently in the web app, desktop app, and mobile app, and across Codex,
Claude, Cursor, Grok, Hermes, and OpenCode providers.

## Settings and UI

The preference is device-local because it controls composer interaction rather than project or
environment behavior. Web and desktop store it in client settings. Mobile stores the equivalent in
mobile preferences. Both default to `queue`, which avoids unexpectedly changing work already in
progress.

Web and desktop add a **Messages while working** select to Settings → General. Mobile adds the same
choice to its General section using the platform's compact settings controls. The composer send
action remains available while a turn is running; its accessible label describes whether the
message will be queued or used to steer.

## Contract and data flow

The turn-start command carries a `busyBehavior` value of `queue` or `steer`. It is optional on the
wire and decodes to `queue`, so older clients remain compatible. The decider copies it into the
durable `thread.turn-start-requested` event, and the provider command reactor passes it into
`ProviderSendTurnInput`.

Adapters own the provider-specific translation:

- Codex uses `turn/start` for queue and `turn/steer` for steer.
- Streaming/ACP adapters preserve their existing same-turn path for steer and serialize queued
  prompts behind the active provider turn so each receives a new turn boundary.
- A message sent when no turn is active starts normally regardless of the preference.

This keeps orchestration vocabulary provider-neutral and concentrates protocol differences at the
adapter boundary.

## Failure and ordering behavior

Queued messages retain submission order per thread. A failed queued send reports through the
existing provider failure activity and does not silently become a steer. Stop continues to target
the active turn; queued follow-ups remain separate work. Unsupported same-turn steering surfaces
the provider's existing failure rather than falling back to queue without telling the user.

## Verification

Focused tests cover settings defaults and persistence, command/event propagation, composer action
presentation, mobile preference sanitization and outbox gating, and each provider adapter's busy
queue/steer branch. Targeted typechecks and lint run only for the packages changed. Browser or
simulator verification is excluded unless explicitly approved, per repository instructions.
