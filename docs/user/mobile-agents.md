# Watching subagents on mobile

Agents often spawn their own helpers — subagents for a focused task, or a whole
workflow of them running in phases. On your phone, that fleet gets its own
surface so a long run is never a black box.

## The fleet card in chat

When a turn spawns subagents, the work log shows a single card for the whole
batch, not one row per helper — and it names them:

> ● Kicked off 3 subagents · Research · 2 working
> ● Read the middleware · working
> ● Patch upload route · needs input
> ● Write tests · done

The card stays put where the run started and keeps updating in place. A coloured
dot carries each state at a glance: blue while work is in flight, amber when an
agent needs you, red if something failed, green when it is done. A running fleet
is always visible — it never hides behind the "+N previous" toggle.

Agents that need you are listed first, so the one waiting on an answer is never
the one that got cut. Beyond three, the last line becomes "+N more".

Tap an agent to open its transcript, or the top line to open Agents.

## The Agents screen

Agents lists every subagent in the thread, grouped by what you can do about it:

- **Needs input** — an agent is waiting on an approval or a question. These come
  first, always.
- **Working** — in flight, including agents parked mid-run.
- **Completed** — finished, failed, cancelled, or interrupted. Long lists show a
  preview with a "… N more" row so a finished fleet of thirty cannot bury the
  one agent that needs you.

Each row shows the agent's title, what it is doing right now, its status, and
its token usage. Workflow members are labelled with their phase.

You can also reach the screen from the **Agents** button in the thread header,
which appears once a thread has agents and carries the same summary
("Agents · 1 needs input").

## One agent's transcript

Tap any agent to see what it is up to, top to bottom:

- **Now** — what it is doing this second, and where in the run. Only for an
  agent that is still going; a finished agent shows its outcome here instead.
- **Outcome** — its result, or the error that stopped it.
- **Steps** — every tool call and progress update it reported. The newest three
  are shown; "+N earlier steps" opens the rest.

This is where the detail lives — the chat stays quiet on purpose, so a fleet of
subagents cannot drown out the conversation with the agent you are actually
talking to.

Approvals from a subagent arrive in the composer like any other approval, so you
can answer without leaving the chat.

## On the lock screen

If you have Live Activities enabled on iOS, a thread whose subagents are still
running keeps reporting as working rather than finished, so the lock screen does
not tell you a run is done while its fleet is still going.
