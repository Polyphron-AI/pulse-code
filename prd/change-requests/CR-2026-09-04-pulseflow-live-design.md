---
id: CR-2026-09-04-pulseflow-live-design
status: proposed
impact: additive
author: Codex
created_at: 2026-09-04
files_touched:
  - prd/README.md
  - prd/16-pulseflow-live-design.md
  - prd/20-acceptance-criteria/pulseflow-live-design.md
  - sitemap/README.md
  - sitemap/pulseflow-live-design.md
  - workflows/README.md
  - workflows/run-pulseflow-live-design.md
  - tool-flow/README.md
  - tool-flow/pulseflow-live-design.md
  - vite.config.ts
  - project/decisions.md
  - project/known-gaps.md
  - project/state.json
  - project/state/shards/core.yaml
  - project/state/shards/apps.yaml
  - project/state/shards/endpoints.yaml
  - project/state/shards/journeys.yaml
  - project/state/shards/surfaces.yaml
  - project/state/shards/decisions.yaml
  - project/state/shards/gaps.yaml
  - project/state/shards/roadmap.yaml
  - project/workspace-overlay.json
  - project/workspace.json
  - project/workspace.html
baseline_sha: 1bb53a0e6bfe457cbdeb29afcbb85c2126d6e19d
implementation_sha: null
approval_tag: null
related_crs:
  - PulseFlow:CR-2026-09-04-impeccable-live-integration
---

# CR-2026-09-04-pulseflow-live-design

## Summary

Specify how Pulse Code can host PulseFlow's complete Impeccable-driven live-design loop in the
existing thread Preview while keeping PulseFlow authoritative for picker semantics, variants,
validation, document mutation, receipts, and undo.

## What changed (human-readable)

- `prd/16-pulseflow-live-design.md` defines the experience, additive capability, ownership,
  complete pinned live-surface mapping, transport, compatibility, rollout, estimate, and feasibility
  verdict.
- `prd/20-acceptance-criteria/pulseflow-live-design.md` adds deterministic gates for capability
  skew, handshake and tab binding, complete controls, copy Apply and repair, registry parity,
  existing Preview behavior, skill-picker parity, explicit acceptance, recovery, local and remote
  routing, accessibility, payload safety, mobile honesty, and the real cross-repository journey.
- `sitemap/pulseflow-live-design.md`, `workflows/run-pulseflow-live-design.md`, and
  `tool-flow/pulseflow-live-design.md` locate the experience in Preview and assign its browser,
  broker, adapter, and failure boundaries.
- Canonical indexes, proposed decisions, known gaps, state shards, and the later-horizon roadmap now
  carry the same scope and dependencies.
- Workspace presentation metadata now covers every currently derived PRD row, which closes the
  stale presentation gap and allows the stable viewer and JSON authority to regenerate.
- The formatter excludes the two generated workspace outputs, leaving their byte-stable form under
  the ProductOps renderer instead of creating a formatter-versus-freshness loop.

## Locked decisions touched

- No locked decision is reopened.
- `D-2026-08-21-selective-pulse-downstream` is preserved because PulseFlow remains an independent
  repository and Pulse Code adds only an optional integration contract.
- `D-2026-08-19-additive-capability-compatibility` is preserved through an optional versioned
  capability that older clients and servers ignore.

## Proposed decisions

- `D-2026-09-04-pulseflow-preview-host`: use the existing Preview and keep document authority in
  PulseFlow.
- `D-2026-09-04-live-design-transport`: bind the optional protocol to exact identity and require an
  authenticated environment-side gateway for public or relay-only targets.

## Evidence

- User direction: preserve all Impeccable Start, Iterate, Polish, Maintain, picker, and interactive
  behavior, run PulseFlow inside Pulse Code, use the live dev server, evaluate feasibility, and
  publish both documentation changes.
- Pulse Code repository evidence: existing Preview tabs, environment-port targeting, viewport and
  appearance controls, screenshots, recordings, annotations, pop-out, browser automation broker,
  and composer skill picker provide most host primitives.
- Pulse Code repository evidence: the browser target resolver rejects public environment addresses
  and names an authenticated Preview gateway as missing.
- Upstream evidence: Impeccable commit `4c5243fcd42d39c1fc281adcaf10be0913095f74`
  is Apache-2.0 and exposes 23 commands, a root router, live picker, progressive variants, tuning,
  steering, acceptance, discard, checkpoints, and reconnect behavior.
- Verification evidence: the pinned upstream Windows run completed 900 live tests with 862 passing,
  35 failing, and 3 skipped. The red baseline is recorded as a release gate rather than presented
  as maintained parity.
- Cross-repository evidence: the matching PulseFlow CR defines the document adapter and the broader
  28 engineering-week R9 train. This Pulse Code slice is estimated at 6 to 9 engineering-weeks.

## Sign-off required

- [ ] Product owner
- [ ] PulseFlow owner
- [ ] Pulse Code engineering owner
- [ ] Security owner for the public Preview gateway
- [ ] Baseline seal after approval and implementation

## Linked gaps

- **high:** `G-2026-09-04-pulseflow-adapter-unimplemented`
- **high:** `G-2026-09-04-public-preview-gateway`
- **high:** `G-2026-09-04-impeccable-windows-live-baseline`

## Raw diff

<details><summary>Proposed ProductOps diff against prd-approved-2026-08-21-desktop-boundary</summary>

```diff
diff --git a/prd/README.md b/prd/README.md
--- a/prd/README.md
+++ b/prd/README.md
@@
+Add the PulseFlow live-design PRD, acceptance criteria, sitemap, workflow, and tool flow.

diff --git a/prd/16-pulseflow-live-design.md b/prd/16-pulseflow-live-design.md
new file mode 100644

diff --git a/prd/20-acceptance-criteria/pulseflow-live-design.md b/prd/20-acceptance-criteria/pulseflow-live-design.md
new file mode 100644

diff --git a/sitemap/pulseflow-live-design.md b/sitemap/pulseflow-live-design.md
new file mode 100644

diff --git a/workflows/run-pulseflow-live-design.md b/workflows/run-pulseflow-live-design.md
new file mode 100644

diff --git a/tool-flow/pulseflow-live-design.md b/tool-flow/pulseflow-live-design.md
new file mode 100644
```

Canonical decisions, gaps, state, and roadmap changes are summarized above and remain proposed.

</details>

## History

- 2026-09-04 proposed (Codex) from the cross-repository Impeccable and PulseFlow feasibility pass.

---

**Created:** 2026-09-04 . **Last opened:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** proposed . **Owner:** Product
