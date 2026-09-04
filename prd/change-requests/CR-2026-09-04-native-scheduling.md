---
id: CR-2026-09-04-native-scheduling
status: proposed
impact: additive-with-compatible-contract-extension
author: Codex GPT-5.6
created_at: 2026-09-04
files_touched:
  - prd/12-scheduled-chats.md
  - project/state/shards/roadmap.yaml
  - docs/plans/2026-08-21-scheduled-chats-design.md
baseline_sha: 38e061e5f
implementation_sha: null
approval_tag: null
related_crs:
  - CR-2026-08-21-scheduled-chats
---

# CR-2026-09-04-native-scheduling

## Summary

Expand Scheduled Chats from elapsed recurring project check-ins into native Pulse scheduling. A
user can create a one-off or recurring schedule from any thread, through `/schedule`, or from a
global scheduler board. A schedule can return to the current thread or use a schedule-owned chat.
Pulse remains the durable scheduler and invokes any supported provider when work becomes due.

The change preserves the current interval schedules, handoff files, project/environment fan-out,
run leashes, exactly-once protection, and checkpoint review. It adds trigger and destination types,
calendar recurrence, a provider-neutral schedule tool, completed one-off history, and an on-demand
run ledger.

## Problem with the current requirement

The existing requirement is intentionally narrow: a daily or elapsed-interval check-in owns one
persistent thread, starts a fresh provider session, and uses a handoff file for continuity. It does
not represent the common request “return to this thread tomorrow,” cannot finish a true one-off,
cannot express monthly or quarterly calendar rules, and cannot be invoked through the composer or
an agent tool.

The narrow model also leaves schedule management split between Settings and sidebar rows. It
retains only the latest per-project occurrence in the shell projection, which is correct for
performance but insufficient for an auditable scheduler board.

## Proposed requirement changes

- Replace the single implicit cadence with a trigger union covering legacy elapsed intervals, an
  exact one-off instant, and RFC 5545 recurrence with an IANA timezone.
- Add a destination union for an existing thread, a schedule-owned thread in one project, or the
  existing project/environment fan-out.
- Make fresh versus resumed provider context an explicit execution choice supported only where the
  destination and provider can honor it.
- Add natural-language and `/schedule` entry points that populate one structured review card.
- Add a provider-neutral, thread-scoped Pulse MCP capability for proposing and creating schedules
  from explicit user intent.
- Evolve the existing Scheduled navigation into a global board with active, running, paused,
  completed, failed, and delayed states.
- Keep full run history out of shell snapshots; retrieve bounded pages from a schedule-run RPC.
- Publish missed-run, overlap, failure, completion, pause, delete, and host-unavailable behavior.

## Locked decisions retained

- The Pulse server owns canonical schedule state and execution. Provider-native schedulers and OS
  cron are not sources of truth.
- Every scheduled coding turn remains an ordinary orchestration turn with checkpoint and diff.
- Occurrence identity and command idempotency prevent duplicate execution after restart or replay.
- Clients never receive provider credentials, and remote clients do not need to remain connected.
- Existing schedules decode and execute without migration or silent behavior changes.
- Event triggers, chaining, and a general workflow engine remain outside this change.

## Locked decisions changed

- Fresh provider sessions are no longer mandatory for every schedule. Existing scheduled chats
  retain fresh sessions; an existing-thread follow-up may resume when the adapter supports it.
- Daily/elapsed recurrence is no longer the only trigger. Exact one-off and calendar recurrence are
  admitted.
- Settings is no longer the only creation surface. The composer, command palette, agent MCP tool,
  scheduler board, and mobile thread UI become supported entry points.
- Completed one-offs remain visible instead of behaving like permanently active recurring jobs.

## Compatibility boundary

New clients must never send new trigger or destination semantics to an older server that would
interpret them as a legacy recurring schedule. The server advertises separate optional
capabilities for native schedule triggers, thread destinations, run history, and agent schedule
tools. Missing capability means the client hides or disables only that behavior.

Existing create/update commands remain for legacy schedules. Native schedule mutations use new
command tags or another reject-safe version boundary so an old server fails closed rather than
dropping fields and creating the wrong cadence.

## Evidence

- [Market and user research](../../docs/research/scheduled-ai-agents-and-chats.md) compares OpenAI,
  Cursor, Claude Code, GitHub Copilot, Devin, Zapier, and OpenClaw and inventories public scheduler
  reliability requests.
- [Technical design](../../docs/plans/2026-09-04-native-scheduling-design.md) maps the proposal onto
  the current contracts, decider, projector, reactor, MCP server, client runtime, and three clients.
- Repository inspection at `38e061e5f` confirms interval-only schedule contracts, fresh-session
  scheduled turns, latest-only occurrence projection, existing web/mobile editors, a cross-
  environment schedule catalog, and preview-only MCP credentials.

## Plans

- [Phase 1: scheduled follow-ups](../../project/plans/P-2026-09-04-scheduled-followups.md)
- [Phase 2: calendar recurrence and scheduler board](../../project/plans/P-2026-09-04-calendar-scheduler-board.md)

Phase 2 is blocked by the Phase 1 trigger/destination contract. Phase 3 guardrails remain estimated
in the research report and require a separate change request after usage evidence exists.

## Sign-off required

- [ ] Product owner approves reopening the original fresh-session and cadence constraints.
- [ ] Engineering accepts the reject-safe mixed-version command strategy.
- [ ] Roadmap owner reshapes `R-2026-08-21-scheduled-chats` before implementation begins.
- [ ] Baseline seal is recorded after the human-initiated planning commit.

## History

- 2026-09-04 proposed from maintainer direction and source-backed scheduler research.

---

**Created:** 2026-09-04 . **Status:** proposed . **Owner:** Product
