# Schedule recurring chats

Scheduled chats let an environment run the same instruction on a recurring
interval without an open browser or app. The host running Pulse Code must be
awake and the environment must remain available when the schedule is due.

Open **Settings → Scheduled chats** to create or manage schedules. A schedule
contains:

- A project scope, or all projects in the environment.
- An interval in minutes, hours, days, or weeks.
- A time zone used for run labels and handoff dates.
- An optional model override with that model's reasoning and context options.
- The instruction sent to the agent.
- An option to skip projects with uncommitted changes.
- A handoff Git policy:
  - **Add to .gitignore** commits a date-shaped rule such as
    `/handoff/????-??-??.md` to the project.
  - **Commit** creates a handoff-only commit after each successful run.

Choose a unit button and change its value to build intervals such as 15 minutes,
1.5 hours, 2 days, or 3 weeks. The compatibility message confirms the normalized
whole-minute interval before the schedule can be saved. Existing daily-at-time
schedules continue to run unchanged until their interval is edited.
An interval starts when the schedule is saved and restarts when that interval
is changed; editing other fields does not shift the cadence.

Each occurrence creates a normal, durable chat and starts it in a fresh provider
session. By default, a schedule follows each project's model. Choose a model in
**Agent setup** to apply one model, reasoning level, and context setting to every
run instead. Use **Use project default** to remove the override. The prompt also
directs the agent to use `handoff/YYYY-MM-DD.md` for lightweight continuity
between runs. Sub-daily runs can read the most recent successful handoff from
earlier on the same day.
Pulse Code never includes unrelated staged or working-tree files in its handoff
commits. If `.gitignore` already has uncommitted changes or Git rejects a
commit, the occurrence fails with the detailed reason shown in Scheduled chats.

For an **All projects** schedule, each targeted project keeps its own handoff at
`<project-root>/handoff/YYYY-MM-DD.md`. The selected Git policy is applied
independently in each project; there is no shared environment-level handoff
directory.

## Keep recurring instructions in a task file

For project maintenance that changes over time, keep the detailed instructions
in a committed Markdown file and use a short schedule prompt that points to it:

```text
Read tasks/my-recurring-task.md from the project root and follow it exactly.
```

Each occurrence reads the current file, so reviewed task changes apply to the
next run without recreating the schedule. Pulse Code stores the prompt, not a
copy of the referenced file. It does not import or validate a task-file format;
the scheduled agent reads the file from the selected project's workspace.

Use project scope unless every selected project contains the same relative task
path. If a task should remain read-only, say so in the file, turn off **Skip
dirty projects**, and choose **Add to .gitignore** for handoffs so the generated
run summary does not leave the checkout dirty.

## Find scheduled chats from the sidebar

Use the **Projects / Scheduled** control in the main sidebar to switch between
normal project browsing and scheduled chats. **Projects** keeps the current
**All projects** or single-project filter, including scheduled chats that belong
to that project. **Scheduled** ignores the saved project filter and shows
schedule-derived rows from all connected projects.

The Scheduled badge counts active, unpaused schedules. A schedule is visible
before its first run; its row says **Not initialized yet** until Pulse Code
creates the durable chat. Select an initialized row to open its chat, or select
an uninitialized row to manage the schedule in Settings. Returning to Projects
restores the project filter you were using.

## Status and controls

The Scheduled chats page shows whether a schedule is active, paused,
automatically paused, or currently running. It also shows the latest occurrence
and failure message.

Use **Run now** to request an immediate occurrence without changing the next
scheduled interval. You can also edit, pause, resume, or delete a schedule.
After the first occurrence creates a chat, use **Open thread** to go directly to
it. Schedules covering multiple projects show a separate project link for each
chat that has been created.
Pausing or deleting a schedule does not remove chats or files created by earlier
occurrences.

Pulse Code automatically pauses a schedule after three consecutive failures.
Fix the reported problem, then resume it from Settings. Common causes include:

- The selected provider is signed out.
- The selected model or the project's default model is missing or unavailable.
- The project was removed.
- The working tree is dirty when **Skip dirty projects** is enabled.

Only one scheduled occurrence starts per scheduler pass. If that schedule's
persistent thread is already running when another interval becomes due, the due
run is skipped instead of queued. Scheduled chats records the skipped-run count,
time, and reason so the overlap remains visible. Environment-wide schedules
continue to run their project threads sequentially.

## Remote use

Schedules belong to the environment that created them. Once saved, they run on
that environment's server regardless of which client is connected. You can
close the web or desktop app, but stopping or sleeping the host also stops
scheduled work until the server is running again.
