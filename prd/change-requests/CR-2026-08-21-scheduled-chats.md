---
id: CR-2026-08-21-scheduled-chats
status: proposed
impact: additive
author: Claude Fable 5
created_at: 2026-08-21
files_touched:
  - prd/README.md
  - prd/12-scheduled-chats.md
  - project/state/shards/roadmap.yaml
baseline_sha: 3d98e215e
implementation_sha: null
approval_tag: null
related_crs: []
---

# CR-2026-08-21-scheduled-chats

## Summary

Add Scheduled Chats: one unattended daily agent check-in per schedule, running as a
new turn in a persistent thread with a fresh provider session, whose memory
contract is a per-day handoff file. Includes project and environment (multi-repo
fan-out) scopes, decider-enforced exactly-once, server-enforced time leashes, and a
pre-flight credential probe.

## What changed (human-readable)

- `prd/README.md` — adds Scheduled Chats to the requirement set.
- `prd/12-scheduled-chats.md` — new requirement doc: daily loop, two scopes, trust
  rails, surfaces, provider decisions, non-goals, constraints. Full design in
  `docs/plans/2026-08-21-scheduled-chats-design.md`.
- `project/state/shards/roadmap.yaml` — new item `R-2026-08-21-scheduled-chats`
  (theme T1, horizon next, stage shaped). Promotion to now requires an explicit
  slot tradeoff against the active integration items.

## Locked decisions touched

- None reopened. Stays inside the `R-2026-08-19-agent-context-actions` no-gos:
  every scheduled mutation is reviewable via per-turn checkpoint diffs, prompts are
  user-authored, and no generic workflow engine is introduced.

## Evidence

- User direction (2026-08-21 session): daily scheduled check-in with a handoff
  file as next-day context; persistent thread per schedule; fresh provider session
  per fire; run-time and per-turn limits; multi-repo environment schedules
  (e.g. nightly commit-vs-PR sweep); settings centralized, threads inline.
- External research (2026-08-21, secondhand — verify before quoting): dominant
  failure modes of cron'd unattended agents are silent auth expiry, runaway
  spend/time, and missing idempotency — each addressed by a named trust rail.
- Repository evidence: no scheduling machinery exists today; the design reuses the
  established reactor/decider/projector patterns and existing UI primitives.

## Sign-off required

- [ ] Product owner
- [ ] Baseline seal after the human-initiated commit

## Linked gaps

- Host availability: no Windows/macOS background host today; scheduled runs on
  those platforms are catch-up-on-launch (documented user-facing constraint).

## History

- 2026-08-21 proposed (Claude Fable 5, from the maintainer's design session).

---

**Created:** 2026-08-21 . **Status:** proposed . **Owner:** Product
