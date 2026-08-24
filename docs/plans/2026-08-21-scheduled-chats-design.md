# Scheduled Chats — feature design

Status: proposal (not on roadmap; requires a change request under `prd/change-requests/`
and a `roadmap.yaml` slot tradeoff before build)
Date: 2026-08-21

## One-line pitch

A project can run one agent chat per day at a chosen time, from a fixed prompt, that
reads yesterday's handoff file and writes today's — a daily check-in loop, not a
workflow engine.

## Why this and not more

`R-2026-08-19-agent-context-actions` names "generic autonomous workflow engine" as a
rabbit hole and forbids agent mutation without explicit preview. This feature stays
inside that fence deliberately:

- **One trigger shape**: daily at `{hour, minute, timezone}` per schedule. No cron
  expressions, no event triggers, no chaining.
- **Read-mostly by default**: the scheduled run's job is to summarize and prepare — its
  only sanctioned write is the handoff file. Broader mutation stays behind the same
  preview story as interactive turns.
- **Ordinary threads**: every scheduled run is a normal thread with full history,
  diff, and checkpoint. Nothing is hidden; everything is reviewable after the fact.
  The "preview" for an unattended run is the checkpoint diff, which already exists.

## Thread model (revised 2026-08-21): one persistent thread per schedule

A schedule owns **one long-lived thread** (per targeted project, for environment
scope). Each cron fire starts a **new turn in that same thread**, with the current
handoff file read and prepended at fire time. No new thread per day.

- The schedule stores its `threadId`(s); `bootstrap.createThread` runs only on the
  first occurrence, plain `thread.turn.start` after that.
- An occurrence is a **turn**, not a thread. Occurrence keys and exactly-once are
  unchanged; per-turn checkpoints still give a reviewable diff for every run.
- Thread list impact: one stable badged thread per schedule that bumps to the top
  each morning — no daily clutter, no auto-archive knob needed.
- If the user deletes the thread, the next fire recreates it (decider re-runs the
  bootstrap path); pause does not touch the thread.
- **Fresh provider session every fire** (decided 2026-08-21): scheduled turns never
  resume the previous provider session. Each cron fire spawns a clean session whose
  only inherited context is the handoff doc prepended to the prompt. The handoff
  file is the entire memory contract — deterministic cost per run (no unbounded
  transcript growth), no provider-session resume dependency across days/restarts,
  and it forces the summary to actually be good, since tomorrow's run knows only
  what today's run wrote down. The domain thread stays one thread: turns append to
  the same visible history even though each maps to a fresh provider session.
  Applies uniformly across all provider adapters.

## The daily loop

1. At the scheduled time, the server starts a new turn in the schedule's persistent
   thread with the schedule's prompt, prefixed with the contents of the most recent
   handoff file (e.g. `handoff/2026-08-20.md`) if present.
2. The agent does its check-in work (summarize yesterday, surface open items, prep
   today's task list — whatever the prompt says).
3. When the turn settles, the server writes the agent's final summary to
   `handoff/2026-08-21.md` (atomic write) and marks the occurrence complete.
4. The thread appears in a "Scheduled" section of the thread list on every client;
   mobile is the primary consumption surface (read your morning summary from bed).

The handoff file is the memory mechanism. There is no separate learning store: the
loop compounds because each run reads the previous run's output. Small, inspectable,
greppable, and it lives in the project like any other file.

## Architecture — how orchestration stays the source of truth

Design rule: **the cron worker is dumb; orchestration is aware.** The schedule and
every occurrence are event-sourced domain state. The timer never holds truth; it only
asks the read model "what is due?" and dispatches ordinary commands. This is what
makes later orchestration plans (multi-agent, workflow scripts, integrations acting on
threads) able to see and reason about scheduled work — it's all in the same event log.

### Contracts (`packages/contracts`)

- `ScheduleId` brand in `baseSchemas.ts`.
- Commands: `project.schedule.create | update | pause | resume | delete`.
- Events: `project.schedule.created/updated/paused/resumed/deleted`,
  `schedule.occurrence.started`, `schedule.occurrence.completed`,
  `schedule.occurrence.failed`.
- Schedule payload: `{ hourLocal, minuteLocal, timezone, prompt | workflowScriptRef,
projectId, handoffPathTemplate, lastOccurrenceKey }`.
- Thread gains an `origin` field (`user | schedule:<scheduleId>`), so every consumer —
  UI, future orchestration features, integrations — can distinguish scheduled work.

### Decider (pure, `apps/server/src/orchestration/decider.ts`)

- Validates schedule payloads (timezone, time bounds — same style as the snooze
  future-check).
- **Exactly-once lives here**: rejects `schedule.occurrence.started` when
  `lastOccurrenceKey === occurrenceKey`. Combined with a deterministic
  `commandId = scheduled:<scheduleId>:<occurrenceKey>` flowing through the existing
  command-receipt idempotency, a restart, double tick, or catch-up sweep cannot
  double-fire a day.

### ScheduleReactor (new, registered in `Layers/OrchestrationReactor.ts`)

A sweep fiber shaped like `ProviderSessionReaper` but **not** `forkParked` — a parked
scheduler defeats the point. Every ~30s it:

1. Reads active schedules from the projection.
2. Computes all occurrence keys due since each schedule's `lastOccurrenceKey`
   ("everything due since", not "did we just cross the time") — this gives free
   catch-up after host sleep, server restart, or background-service update.
3. Consults `BackgroundPolicy` / `HostPowerMonitor`; if the host is suspending,
   defers and lets catch-up fire the run on wake.
4. Dispatches `thread.turn.start` on the schedule's persistent thread (with
   `bootstrap.createThread` only when the thread doesn't exist yet — first fire or
   user-deleted) using the deterministic commandId.

Uses Effect `Clock`/`DateTime` throughout so `TestClock` drives tests; no sleeps or
polling in tests — receipts are test-only sync and **must not** carry production
behavior, so completion detection uses the settled-turn path
(`settledTurnStateForSessionStatus`), not `turn.processing.quiesced`.

### Handoff writer (extension of the same reactor)

Subscribes to `streamDomainEvents`, filters settled turns on threads with
`origin: schedule:*`, writes the handoff file via the workspace filesystem's atomic
write, then dispatches `schedule.occurrence.completed` (or `.failed` with a reason
that surfaces in the UI — a lying "ran successfully" label is worse than no feature).

### How future orchestration sees cron workers

Because occurrences are domain events on the same log:

- Any future workflow engine can subscribe to `schedule.occurrence.*` like any other
  event — the scheduler needs no changes to participate.
- The read model can answer "what ran, when, and did it finish" for any client or
  integration without a side channel.
- Scope model: the reactor is an in-process actor of the server, so it acts under the
  server's own authority — but occurrences are attributed (`origin`) so the
  operate-scope story from `P-2026-08-19-integrations-foundation` extends naturally
  if scheduled runs are ever triggered by external actors.
- Workflow scripts (`getWorkflowScript`) are the intended prompt source long-term;
  v1 accepts raw prompt text but the contract carries `workflowScriptRef` from day one.

## Surfaces

- **Web + desktop**: single editor at Settings → Scheduled Chats; command palette
  entry deep-linking there; scheduled runs inline in the normal thread list with an
  origin badge; occurrence status (last run, next run, failed) on the schedule row.
- **Run history strip** (added 2026-08-23, from market research — per-run
  observability is the most demanded scheduled-agent feature everywhere): each
  schedule row shows its last N occurrences as compact status marks with duration,
  failure reason on hover, each linking to the run's thread/turn. No new
  storage — occurrence events are already in the event log; this is a read-model
  projection (`recentOccurrences` on the schedule row). Per-run cost analytics is
  deliberately later: provider CLIs report tokens unevenly, so v1 is
  status + duration only.
- **Mobile**: threads inline in the home list with a badge; full editor in a
  settings route screen; the handoff summary renders well on a phone.
- **Reverse states**: pause/resume on every surface that shows a schedule; delete
  keeps the historical threads.
- **Connection modes**: all server-side, so remote/relay/tunnel work unchanged. A
  future "morning run finished" push hangs off `AgentAwarenessRelay`, respecting the
  outbound-only constraint of `R-2026-08-19-collaboration-notifications` (later, and
  explicitly not a notification hub — default silent). Scheduled-run outcomes
  (completed / failed / timed out) should be listed as a named event source on that
  roadmap item — market research (2026-08-23) shows run-completion push is the top
  user-facing ask for scheduled agents, but it belongs to the notifications work,
  not here.

## Runtime limits (decided 2026-08-21): every scheduled run has a leash

Unattended runs must not be able to run away — a bad prompt, a looping agent, or a
misbehaving provider CLI cannot be interrupted by a user who is asleep. Two limits,
both stored on the schedule contract and enforced server-side:

- **`maxRunMinutes`** — total wall-clock budget for the occurrence, measured from
  cron fire. Covers everything the run does, including any follow-up turns it
  spawns. Default 15 minutes, configurable per schedule, hard cap enforced by the
  server (not the prompt).
- **`maxTurnMinutes`** — budget for any single turn within the run. Default 10
  minutes. Catches a hung provider process even when the total budget is large.

- **Turn-count cap (deliberate punt)**: an occurrence's follow-up turns are bounded
  by wall clock only, not by turn count or spend. Acceptable for v1 because the
  time leashes bound cost indirectly and fresh sessions bound per-turn context; a
  `maxTurns`/spend budget is a compatible later addition to the same contract.
  Market research (2026-08-23) confirms per-run/per-day spend caps are the #2
  requested control after time limits — the punt stands until provider CLIs expose
  usable cost signals, with the time leashes as the accepted proxy.

- **Tell the agent its budget** (added 2026-08-23, from a field report of 25+
  cron'd agents run for a month): the enforced leash works better when the agent
  knows about it. The reactor prefixes the scheduled prompt with a server-owned
  line — "You have N minutes; scope your work to finish within it." — so the model
  budgets its own work instead of getting cut off mid-task. The watchdog stays the
  hard guarantee; this just makes hitting it rare. One string in the reactor, no
  contract change.

- **Auto-pause after a failure streak** (decided 2026-08-23): a schedule that
  fails 3 consecutive occurrences for the same project is paused by the server,
  with the row stating why ("paused after 3 failures: auth"). Nobody watches a
  settings row daily; without this a broken schedule burns a subscription window
  every morning forever. A consecutive-failure counter lives on
  `ScheduleProjectState` (reset on success), and the decider emits the pause
  when the streak hits 3. Resume clears the streak.
- **Skip-if-dirty for mutating runs** (decided 2026-08-23): a per-schedule
  `skipIfDirty` flag (default **on** for environment scope, off for project
  scope). Before firing a project's turn, the reactor checks the working tree;
  if it's dirty, the occurrence lands as a visible failure with reason
  `"dirty"` — never a silent skip, and never a 6:00 sweep committing the
  half-done work a human left at midnight. Dirty skips do not count toward the
  auto-pause streak (a busy tree is not a broken schedule).
- **Server-owned handoff output contract** (decided 2026-08-23): the reactor's
  server-owned prompt prefix (which already states the time budget) also fixes
  the handoff shape: end with a summary covering what was done, what's blocked,
  and what tomorrow should check first. Consistent structure is what makes
  day-15's agent able to use day-14's file; prompt string only, no contract
  change.
- **Stale `modelSelection` fails loudly** (decided 2026-08-23): if a schedule's
  model selection references a provider instance that no longer exists, the
  occurrence fails with reason `"provider"` and a message — no silent fallback
  to the project default, which could quietly land on a far more expensive
  model. The auto-pause streak then catches a persistently stale selection.

Enforcement is a watchdog in the ScheduleReactor: on fire it records the deadline;
a sweep interrupts the provider session through the normal turn-interrupt path when
either limit passes (same mechanism as a user pressing stop — no new kill
machinery, and rule-1-safe since it targets the session it owns, never a PID by
pattern). The occurrence lands as `schedule.occurrence.failed` with reason
`"timeout:run"` or `"timeout:turn"`, shown honestly in the settings row and on the
thread. Whatever partial work happened stays reviewable in the thread with its
checkpoint diff; the handoff file is NOT written on timeout — tomorrow reads the
last successful handoff. Limits are validated in the decider (bounds: 1 minute to
2 hours) like every other schedule field.

## Schedule scope: project and environment

Decided 2026-08-21: schedules come in two scopes.

- **Project schedule** — the daily check-in described above. Lives in project
  settings, one thread per occurrence, handoff file in that project.
- **Environment schedule** — lives in the global Settings → Scheduled Chats page
  and targets **a selected set of projects** (or "all projects"). The motivating
  example: a nightly sweep that checks every repo for uncommitted work and decides
  commit-and-push vs open-a-PR per repo.

An environment schedule **owns one persistent thread per targeted project**, and an
occurrence fans out one turn into each. Threads are project-rooted in the domain
model, and a single multi-root thread would fight that; per-project threads keep
every run an ordinary reviewable turn with its own checkpoint
diff — which is exactly the preview story that makes unattended runs acceptable
under `R-2026-08-19-agent-context-actions`. Each per-project thread writes its own
handoff; the schedule's occurrence row in the read model aggregates status
(`3/5 complete, 1 failed`). Contract shape: `scope: { _tag: "project", projectId }
| { _tag: "environment", projectIds: ProjectId[] | "all" }`; occurrence keys become
`scheduled:<scheduleId>:<date>:<projectId>` so per-project exactly-once holds.

Mutating environment schedules (the commit/push example) are the highest-risk
variant: v1 ships them behind the same trust rails (full diff per thread), and the
prompt is user-authored — Pulse Code does not ship canned mutation prompts.

- **Propose-only toggle** (added 2026-08-23, from market research — the consensus
  best practice for unattended agents is "no consequential external actions at
  3 a.m."): a per-schedule boolean `proposeOnly` (default **on** for environment
  scope). When set, the schedule's prompt is suffixed with a server-owned
  instruction block: open PRs / leave work on branches, never push to the default
  branch. It is a prompt-level rail, not a sandbox — the hard guarantee remains the
  checkpoint diff — but it makes the safe path the default and fits the
  no-unpreviewed-mutation fence of `R-2026-08-19-agent-context-actions`. One field
  on the contract, one switch row in the editor's Advanced section.

## UI decisions (2026-08-21)

- **Time input: hybrid.** Preset popover (6:00/7:00/8:00/9:00, snooze-popover
  idiom) with a "Custom…" row revealing hour/minute `number-field` steppers plus a
  timezone `combobox` over `Intl.supportedValuesOf("timeZone")`.
- **No special thread section** (revised 2026-08-21, supersedes the collapsed
  section): scheduled runs appear inline in the normal thread list, recency-sorted,
  marked only by an origin badge. Failures surface through the normal thread status
  indicator. The `origin` classifier in `Sidebar.logic.ts` remains for
  filter/palette queries. If daily runs get noisy, a later knob can auto-archive
  cleanly-settled scheduled threads after N days — not v1.
- **Mobile: full editor sheet** built from the existing
  `settings/components/SettingsRow.tsx` / `SettingsSwitchRow.tsx` primitives,
  hosted in a `SettingsScheduledChatsRouteScreen` in the settings stack; threads
  inline in the home list with a `StatusPill` badge.
- **Date handling: native.** `Intl` + `effect/DateTime` only; no moment/dayjs.
  All formatting flows through `timestampFormat.ts` to honor the user's
  `TimestampFormat` setting.
- **Running scheduled threads are fully normal** (decided 2026-08-21): spinner in
  the list, streaming when opened, top-of-list while active. No special casing;
  auto-archive is the future pressure valve if mornings get noisy.
- **Limits in the editor**: an "Advanced" collapsible in the schedule editor with
  two `number-field`s — max run time (default 15 min) and max turn time (default
  10 min) — plus helper text ("stops runaway runs; partial work stays reviewable").
- **Settings centralized** (revised 2026-08-21): Settings → Scheduled Chats
  (`routes/settings.scheduled-chats.tsx`) is the single editor for both scopes —
  one list of all schedules with target project(s), time, last/next run, and pause.
  Project settings gets only a link row ("2 scheduled chats → Settings"), never a
  second editor. The command palette entry deep-links to the section via
  `scrollToSettingsTarget`. Environment-schedule project multi-select uses
  `combobox` + selected-project chips.

## Constraints and open questions

- **Host availability is the real limiter.** Scheduled runs only fire when a server is
  running. The Linux systemd background service is the natural host; Windows/macOS
  users get catch-up-on-launch semantics, which must be stated honestly in
  `docs/user/` ("runs when your Pulse Code server is running; missed runs fire on
  next start").
- **Credentials**: unattended runs inherit the provider credentials the server already
  holds; the externally-managed-credential gap (`G-2026-08-20`) and the Windows
  secret-ACL gate apply unchanged — no new credential surface.
- **Pre-flight credential check** (added 2026-08-21, from external research on
  unattended agents — silently expired auth is the #1 killer of cron'd agent runs):
  the ScheduleReactor probes provider auth at fire time, before starting the turn.
  On failure it emits `schedule.occurrence.failed` with reason `"auth"` — a visible
  skip in the settings row and on the thread, never a silent one. ClaudeProvider
  already models apiKey-vs-subscription auth
  (`apps/server/src/provider/Layers/ClaudeProvider.ts`); other adapters expose the
  cheapest equivalent probe they have, or "unknown" (fire anyway, fail loudly).
  Extended 2026-08-23 (graceful degradation, from market research): a provider that
  is unavailable at fire time — CLI missing, spawn fails, service down — is a
  distinct failure reason `"provider"`, not generic `"error"`, so the settings row
  can say what actually happened. Never a crash, never a silent gap.
- **Per-provider support is an explicit decision** (AGENTS.md "Providers" rule).
  Scheduled runs require headless, non-interactive turn execution with a fresh
  session per fire. Decision table to be validated during build step 2 against each
  adapter: Claude Code — supported (headless `-p` semantics exist); Codex —
  expected supported (exec mode); OpenCode — expected supported; Cursor — verify
  headless viability, else "not supported here"; Grok — verify, else "not
  supported here". The schedule editor only offers providers whose adapter declares
  scheduled-run support; an unsupported provider is a stated decision, not a gap.
- **Capacity**: one maintainer; this needs a `now`-slot tradeoff in `roadmap.yaml`
  under T1 ("Connected work loop", where a daily loop naturally belongs) and a PRD
  change request before any build.
- **Environment fan-out is sequential** (decided 2026-08-23, resolves the
  concurrency open question; from the same field report — 20+ parallel morning
  runs blow straight through subscription concurrency and usage limits, and the
  fix everyone lands on is staggering): an environment occurrence runs its
  per-project turns one at a time, in a stable order, each under its own
  `maxTurnMinutes`, all under the occurrence's `maxRunMinutes`. Sequential is the
  simplest correct v1 — no concurrency knob, no scheduler within the scheduler —
  and per-project exactly-once keys make a partial sweep resume cleanly.
- **Cross-schedule spacing: fires are at least 10 minutes apart** (decided
  2026-08-23): the reactor keeps a single in-memory "last fire started at" gate
  and will not start a new schedule's occurrence within 10 minutes of the
  previous one starting — due schedules simply stay due and the next sweep picks
  them up once the gate opens. This is stagger-by-default: users can set every
  schedule to 6:00 and the server serializes them safely instead of slamming
  provider concurrency and subscription limits. Enforced at fire time in the
  reactor (timezone-proof, no editor rejection UX, restart-safe because
  occurrence keys are date-based); the editor may later warn about clustered
  times, but the reactor gate is the guarantee.
- **Per-schedule model choice is v1** (revised 2026-08-23, supersedes the
  docs-only stance): the field report found cheap models (Sonnet/Haiku tier)
  match expensive ones on daily check-in work while preserving subscription
  headroom — that lever belongs in the schedule editor, not a docs footnote. The
  contract carries an optional `modelSelection` (the existing `ModelSelection`
  shape: provider instance + model); absent means the project's defaults, so
  nothing breaks and the field stays one optional struct. The editor reuses the
  existing provider/model picker, filtered to scheduled-run-capable providers.
- **Self-editing instructions: off by default, experimental opt-in** (revised
  2026-08-23): the default schedule is immune to the field report's worst failure
  mode — "workflow explosion", where an agent that can grow its own
  instructions/memory accretes scope until it can't finish — because the prompt is
  user-authored and memory is the server-written one-file-per-day handoff with a
  bounded 14-day lookback. But the same report credits agent self-improvement
  (recording better sources, dropping dead ones) with compounding quality gains,
  so a per-schedule **experimental** flag `allowPromptSelfEdit` lets the agent
  propose an updated prompt at run end. Guarded like everything else: the edit
  lands as an ordinary `schedule.update` command (visible in the schedule's
  history and diffable), the prompt has a hard length cap in the decider so it
  cannot accrete without bound, and the editor labels the switch "Experimental".
  Not in the v1 build order — it slots in after step 4 once the plain loop is
  proven. The report ranks durable end-of-run memory as the single
  highest-leverage feature, which is exactly the handoff loop — validation that
  the simple default is the right one.
- **DST is tested, not assumed** (2026-08-23): occurrence keys are
  local-date-based; `computeDueLocalDates` carries explicit spring-forward
  (2:30 a.m. does not exist) and fall-back (2:30 a.m. happens twice) TestClock
  tests. The dedupe key already prevents doubling; the tests prove no day is
  skipped.
- **Open**: whether a failed
  occurrence retries (propose: no — surface the failure, next day reads the last
  successful handoff); buffered assistant delivery has no user-input flush boundary in
  unattended runs — verify spill behavior for long summaries.

## Build order

1. Contracts + decider + projector (schedules, occurrences, thread origin) with
   focused decider tests.
2. ScheduleReactor sweep + idempotent dispatch, TestClock-driven tests.
3. Handoff writer + occurrence completion.
4. Web settings UI + thread-list section; then mobile; then command palette.
5. `docs/user/` page + glossary entries (schedule, occurrence, handoff file).
