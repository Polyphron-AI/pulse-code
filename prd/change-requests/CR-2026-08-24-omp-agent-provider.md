---
id: CR-2026-08-24-omp-agent-provider
status: proposed
impact: additive
author: Codex GPT-5.6
created_at: 2026-08-24
files_touched:
  - .agents/skills/goal-assistant/SKILL.md
  - docs/plans/2026-08-24-omp-agent-provider-design.md
  - prd/README.md
  - prd/16-omp-agent-provider.md
  - project/state/shards/roadmap.yaml
baseline_sha: 27884b744
implementation_sha: null
approval_tag: null
related_crs:
  - CR-2026-08-21-scheduled-chats
---

# CR-2026-08-24-omp-agent-provider

## Summary

Plan OMP as a first-class ACP-backed agent provider after Scheduled Chats/CRON is
complete, preserving OMP-native execution while Pulse owns the durable thread and
multi-surface control plane.

## What changed (human-readable)

- `docs/plans/2026-08-24-omp-agent-provider-design.md` — decides the provider/ACP
  boundary, process and session ownership, approvals, surfaces, failure behavior,
  and dependency-gated build order.
- `prd/16-omp-agent-provider.md` — records the user-visible and testable scope.
- `prd/README.md` — indexes the proposed requirement.
- `project/state/shards/roadmap.yaml` — adds a shaped Next item blocked by Scheduled
  Chats.
- `.agents/skills/goal-assistant/SKILL.md` — registers the design authority so future
  goal cycles can resume it after the dependency gate opens.

## Locked decisions touched

- Pulse remains the owner of threads, transport, checkpoints, and canonical events.
- Provider-specific complexity remains at the adapter/process boundary.
- Remote clients act through the environment server; provider CLIs are not exposed
  as network services.
- Scheduled turns start a fresh provider session for every occurrence.

## Evidence

- User direction on 2026-08-24: investigate how OMP can control a Pulse thread like
  an agent, then plan the work for after CRON.
- OMP exposes a native ACP command with session load, modes/configuration, models,
  prompts, cancellation, MCP, permissions, and existing-agent authentication.
- Pulse already has a shared ACP runtime and ACP-backed Cursor, Grok, and Hermes
  adapters, making a first-party provider the smallest integration boundary.
- OMP's approval documentation shows that ambient `yolo` configuration can bypass
  the ACP client gate, requiring an explicit per-thread safety decision.

## Sign-off required

- [ ] Product owner design and sequencing review
- [ ] Promotion from blocked Next after Scheduled Chats completion
- [ ] Baseline seal after the human-initiated commit

## Linked gaps

- The compatibility spike must select the tested minimum OMP version and confirm
  the approval overlay before production adapter work.
- Rich Agent Hub visualization is deliberately separated from provider MVP.

## History

- 2026-08-24 created as a proposed post-CRON goal following internet and repository
  architecture research.

---

**Created:** 2026-08-24 . **Status:** proposed . **Owner:** Product
