# Scheduled Chats

Status: proposed (see CR-2026-08-21-scheduled-chats)
Design authority: `docs/plans/2026-08-21-scheduled-chats-design.md`

## Problem

Users start every day reconstructing yesterday's state by hand. Pulse Code can run
one unattended agent check-in per schedule that reads yesterday's handoff file and
writes today's — a daily briefing loop — without becoming a generic autonomous
workflow engine (an explicit rabbit hole of `R-2026-08-19-agent-context-actions`).

## Scope

- <a id="daily-loop"></a>**Daily loop.** A schedule fires once per day at a
  user-set local time and timezone. Each fire starts a new turn in the schedule's
  one persistent thread, in a fresh provider session, with the most recent handoff
  file prepended as the only inherited context. On settled success the server
  writes the run's summary to `handoff/<date>.md` in the project. On failure or
  timeout, no handoff is written; the next run reads the last successful handoff.
- <a id="two-scopes"></a>**Two scopes.** A project schedule targets one project.
  An environment schedule targets a selected set of projects (or all) and fans out
  one turn per targeted project into per-project persistent threads.
- <a id="trust-rails"></a>**Trust rails.** Every run is an ordinary thread turn
  with a checkpoint diff. Exactly-once per schedule per day per project is enforced
  in the decider via deterministic occurrence command ids. Wall-clock leashes
  (`maxRunMinutes` default 15, `maxTurnMinutes` default 10) are server-enforced
  through the normal turn-interrupt path. Provider auth is probed before fire;
  failures (including auth) are visible occurrence events, never silent skips.
- <a id="surfaces"></a>**Surfaces.** Scheduled threads appear inline in the normal
  thread list on web, desktop, and mobile with an origin badge. The single editor
  lives at Settings → Scheduled Chats (web/desktop) and a settings route screen
  (mobile); project settings links to it. Pause/resume/delete exist everywhere the
  schedule is shown; delete preserves thread history.
- <a id="provider-decisions"></a>**Provider decisions.** Each provider adapter
  declares scheduled-run support (headless fresh-session turns). Unsupported
  providers are excluded from the editor as a stated decision.

## Non-goals

Cron expressions, event triggers, run chaining, notification fan-out (deferred to
`R-2026-08-19-collaboration-notifications`, outbound-only), canned mutation
prompts, and any generic workflow engine.

## Constraints

Runs fire only while a Pulse Code server is running; missed occurrences catch up
on next start ("everything due since", never doubled). Credentials are the
server's existing provider credentials — no new credential surface; the Windows
secret-ACL gate and `G-2026-08-20` externally-managed-credential gap apply
unchanged. User-facing docs must state the host-availability constraint plainly.

---

**Created:** 2026-08-21 . **Status:** proposed . **Owner:** Product
