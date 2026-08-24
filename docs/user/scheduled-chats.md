# Schedule daily chats

Scheduled chats let an environment run the same instruction once a day without
an open browser or app. The host running Pulse Code must be awake and the
environment must remain available when the schedule is due.

Open **Settings → Scheduled chats** to create or manage schedules. A schedule
contains:

- A project scope, or all projects in the environment.
- A local time and time zone.
- The instruction sent to the agent.
- An option to skip projects with uncommitted changes.

Each occurrence creates a normal, durable chat and starts it in a fresh provider
session using the project's default model. The prompt also directs the agent to
use `handoff/YYYY-MM-DD.md` for lightweight continuity between daily runs.

## Status and controls

The Scheduled chats page shows whether a schedule is active, paused,
automatically paused, or currently running. It also shows the latest occurrence
and failure message.

You can edit, pause, resume, or delete a schedule. Pausing or deleting a
schedule does not remove chats or files created by earlier occurrences.

Pulse Code automatically pauses a schedule after three consecutive failures.
Fix the reported problem, then resume it from Settings. Common causes include:

- The selected provider is signed out.
- The project's default model is missing or unavailable.
- The project was removed.
- The working tree is dirty when **Skip dirty projects** is enabled.

Only one scheduled occurrence starts per scheduler pass, and a project that
already has a running chat is left alone. These limits keep unattended work
serial and visible.

## Remote use

Schedules belong to the environment that created them. Once saved, they run on
that environment's server regardless of which client is connected. You can
close the web or desktop app, but stopping or sleeping the host also stops
scheduled work until the server is running again.
