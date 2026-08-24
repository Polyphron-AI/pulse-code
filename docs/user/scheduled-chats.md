# Scheduled chats

A scheduled chat sends one prompt to a project every day at a time you pick. Each run happens in the
schedule's own thread, and the run leaves a handoff file behind so tomorrow's run can pick up where
today's stopped.

Use it for the standing work you would otherwise ask for by hand every morning: check CI and open
issues, sweep dependency updates, summarize what changed overnight, keep a changelog current.

## Create one

1. Open **Settings → Scheduled chats**.
2. Choose **New**.
3. Pick the project it runs in, the time of day, and the time zone.
4. Write the prompt it sends every day.
5. Choose **Create**.

The prompt is sent verbatim, every day, so write it as a standing instruction rather than a one-off
request. "Check CI, triage anything red, and open issues for what you cannot fix" ages well. "Fix the
bug I mentioned yesterday" does not.

On mobile, the same list lives in **Settings → Scheduled Chats**. Mobile creates and edits the time,
the prompt, and the paused state; the model override, handoff path, run limits, and
environment-wide targets are desktop-only, and mobile leaves them exactly as they are.

## What a run does

Each run is one turn in the schedule's thread:

1. Pulse Code reads the most recent handoff file the schedule wrote, if there is one.
2. It sends a short preamble stating the run's time budget and asking for a closing handoff summary,
   then yesterday's handoff, then your prompt.
3. The agent works until it finishes or hits the time limit.
4. When the turn settles cleanly, Pulse Code writes the closing summary to today's handoff file.

Each run starts a fresh provider session, so the agent does not carry a growing context window from
day to day. The handoff file is the memory, and it is a plain file in your repository that you can
read, edit, or commit.

A run that is interrupted or errors out writes no handoff file. Tomorrow's run then reads the last
file that was written successfully, so a bad day does not erase the thread's memory.

## The handoff file

By default each run writes `handoff/{date}.md` inside the project, where `{date}` is the run's local
date. Pulse Code looks back up to two weeks for the newest file that exists, so a gap of a few days
is fine.

Two things worth knowing:

- The path is always relative to the project. It cannot start at the filesystem root.
- A template with no `{date}` in it is allowed, and means one rolling file that every run overwrites.
  That is a legitimate choice if you would rather not accumulate a file per day.

## While it runs

A scheduled thread looks like any other thread and appears in the sidebar with a small alarm-clock
mark. You can open it, read the run, and reply in it yourself — it is a normal conversation that
happens to get one message a day.

Two limits keep an unattended run from running away: 15 minutes for the whole run and 10 for a
single turn, by default, and anything from 1 to 120 minutes if you change them. When a run passes its
limit, Pulse Code interrupts it and records the failure rather than letting it sit.

## Time, and the host being off

The time you set is wall-clock time in the time zone you picked, so a schedule set to 06:00
Europe/Amsterdam fires at 06:00 there through daylight-saving changes.

Runs happen while that environment's Pulse Code server is running. If the machine was asleep or the
server was closed at the scheduled time, the run fires the next time the server starts, and a
multi-day gap fires once per missed day rather than all at once. Nothing is silently dropped, but a
schedule is not a substitute for a machine that stays on — if you want a run at 06:00 sharp, the host
needs to be up at 06:00.

## Pause, fix, and delete

Pause a schedule to stop it running without losing it or its thread; resume puts it back on its
normal time. A run already in flight still finishes and still writes its handoff, so pausing
mid-run never leaves a half-finished day.

Pulse Code pauses a schedule for you after three failed runs in a row and says which failure caused
it. That is deliberate: a schedule failing the same way every morning is noise, and the pause makes
you look at it once instead of ignoring it daily. Fix the cause, then resume.

Runs fail visibly rather than quietly, and the list names the reason:

- **Skipped — uncommitted changes.** Environment-wide schedules skip a project with a dirty working
  tree by default, so an unattended run never sweeps up half-done work someone left behind. You can
  turn this on or off per schedule.
- **Provider sign-in expired.** The provider the schedule needs has no usable credentials right now.
  Sign in again and resume.
- **Provider unavailable.** The provider or model the schedule pinned is no longer configured. Pulse
  Code fails loudly rather than falling back to whatever else is set up, because a silent fallback
  could land on a far more expensive model.
- **Hit the run time limit**, or **a turn hit its time limit.** The run passed its budget and was
  interrupted.

Deleting a schedule stops it from now on. The threads and handoff files it already created stay
where they are.

## Cost

A scheduled chat spends tokens every day whether or not you read the result, and it is easy to
forget one is running. Two habits keep this boring:

- Pick a cheaper model for routine sweeps. A schedule can pin its own model, separate from what the
  project uses interactively.
- Keep the prompt scoped. "Check CI and report" costs a fraction of "audit the codebase", every
  single day.

**Settings → Usage** shows what the environment spent, so a schedule that got expensive is visible
there.

## Related

- [Organizing threads](./thread-sidebar.md)
- [Review usage](./usage.md)
- [Permission modes](./permission-modes.md)
