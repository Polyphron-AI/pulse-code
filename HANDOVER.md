# Handover — Scheduled Chats feature work

Date: 2026-08-21
Session: assessment of external CRON-agents research → proceed to scoped feature + docs (interrupted before writing began).

## Where things stand

1. **Input**: the maintainer shared a research report on how people run scheduled,
   unattended Claude agents (headless `claude -p` + cron, GitHub Actions `schedule:`,
   official `/loop` / Scheduled Tasks / Routines, n8n/Trigger.dev, MCP schedulers).
   Its failure-mode catalog is the useful part: silent OAuth/token expiry killing
   runs, runaway spend, `--dangerously-skip-permissions` damage, cron PATH breakage,
   non-deterministic output, missing run-locks/idempotency, silent failures.
   Caveats: post-Jan-2026 claims (Routine run caps, Auto Mode default date,
   89%/13.6% study, specific GitHub issue numbers) are trade-press/vendor sourced
   and unverified; Reddit attributions are secondhand. Don't quote without checking.

2. **Assessment delivered** (previous turn, in conversation only — not yet in a doc):
   the report maps almost one-to-one onto requirements for a Pulse Code scheduled
   agents feature. Pulse Code's differentiated ground vs Anthropic's official
   scheduling: local filesystem, own credentials, sub-hour capable, multi-provider,
   remote/mobile visibility of runs.

3. **Key discovery**: a design doc already exists —
   `docs/plans/2026-08-21-scheduled-chats-design.md` (untracked, read in full).
   It is thorough and recent (same-day decisions). Any further work must extend it,
   not restart. Companion file: `docs/plans/2026-08-21-scheduled-chats-announcement-slides.html`.
   Sibling context: the doc references `prd/change-requests/`, `roadmap.yaml` slot
   tradeoffs (T1 "Connected work loop"), `R-2026-08-19-agent-context-actions`,
   `P-2026-08-19-integrations-foundation`, `G-2026-08-20` (credential gap).

4. **Task in flight when interrupted**: "Proceed with scoped feature with docs."
   Nothing has been written yet — no code, no doc edits. The design doc itself says
   build requires a PRD change request + roadmap slot first.

## What the existing design doc already decides (don't re-litigate)

- One persistent thread per schedule; each fire = a new **turn**; fresh provider
  session every fire; handoff file (`handoff/<date>.md`) is the entire memory contract.
- Event-sourced: `ScheduleId` brand, `project.schedule.*` commands/events,
  `schedule.occurrence.started/completed/failed`; exactly-once in the decider via
  deterministic `commandId = scheduled:<scheduleId>:<occurrenceKey>`.
- ScheduleReactor sweep (~30s, not forkParked), catch-up semantics ("everything due
  since"), TestClock-driven tests, settled-turn detection (not receipts).
- Runtime leashes: `maxRunMinutes` (default 15) / `maxTurnMinutes` (default 10),
  enforced via normal turn-interrupt path; no handoff write on timeout.
- Two scopes: project schedule and environment schedule (fan-out, one thread per
  targeted project, per-project occurrence keys).
- UI: single editor at Settings → Scheduled Chats; threads inline in normal list
  with origin badge; mobile settings-stack editor; native Intl/effect DateTime.
- Build order at the end of the doc: contracts → reactor → handoff writer → web UI
  → mobile → docs/user + glossary.

## Gaps my assessment adds on top of the design doc (candidate additions)

Cross-referencing the research report against the design doc, these are covered
implicitly or not at all — worth folding into the doc's "Constraints and open
questions" or a new section:

- **Pre-flight credential check before fire**: the report's #1 killer is auth
  expiring silently. The doc says "inherits server credentials, no new surface" but
  has no _check-before-fire_ step. Propose: probe provider auth at fire time; on
  failure emit `schedule.occurrence.failed` with reason `"auth"` — a visible skip,
  never a silent one. (ClaudeProvider already models `apiKey` vs subscription auth,
  `apps/server/src/provider/Layers/ClaudeProvider.ts:530-558`.)
- **Spend leash**: the doc has time leashes only. Consider a per-occurrence turn cap
  (the run "including any follow-up turns it spawns" is bounded by wall clock but
  not by turn count). May be fine to punt; note it explicitly.
- **Per-provider support decision** (AGENTS.md "Providers" rule): the doc says
  "applies uniformly across all provider adapters" for fresh sessions, but there is
  no explicit table of Codex/Claude/Cursor/Grok/OpenCode headless viability. Each
  needs a stated decision, even "not supported here".
- **docs/user honesty page**: the doc already mandates it (host-availability
  wording); it's step 5 of build order — flag that this was the explicit "with docs"
  part of the maintainer's request.

## Next actions (in order)

1. Fold the gap items above into `docs/plans/2026-08-21-scheduled-chats-design.md`
   (edit the existing doc; do not create a parallel one).
2. Ask the maintainer whether "proceed" means design-doc extension only, or also the
   PRD change request under `prd/change-requests/` + `roadmap.yaml` slot — the doc's
   own status line gates build on those.
3. Only then start build order step 1 (contracts + decider + projector with focused
   decider tests). No repo-wide checks; `vp test run <files>` only.

## Repo state notes

- Working tree has unrelated in-flight Hermes-provider work (many modified/untracked
  files under `apps/server/src/provider/` — see `git status`). Don't mix concerns;
  scheduled-chats changes should not touch those files.
- No scheduling machinery exists yet in the codebase (verified by grep: the
  `schedul*` hits are vcsCommandScheduler, snooze, desktop-update checks — unrelated).
