---
id: CR-2026-09-07-pulse-warden
status: proposed
impact: schema
author: Codex
created_at: 2026-09-07
baseline_tag: prd-approved-2026-08-21-desktop-boundary
baseline_sha: 066ba5cbb11fe0c211f26ccc6b3390368fcadd72
files_touched:
  - prd/README.md
  - sitemap/README.md
  - workflows/README.md
  - tool-flow/README.md
  - prd/17-pulse-warden.md
  - prd/20-acceptance-criteria/pulse-warden.md
  - prd/10-pulse-integrations.md
  - prd/16-pulse-workspace.md
  - sitemap/pulse-warden.md
  - workflows/pulse-warden.md
  - tool-flow/pulse-warden.md
  - project/decisions.md
  - project/known-gaps.md
  - project/state.json
  - project/workspace-overlay.json
  - project/workspace.html
  - project/workspace.json
  - docs/research/pulse-warden-review-2026-09-07.md
  - project/state/shards/apps.yaml
  - project/state/shards/core.yaml
  - project/state/shards/decisions.yaml
  - project/state/shards/gaps.yaml
  - project/state/shards/journeys.yaml
  - project/state/shards/roadmap.yaml
  - project/state/shards/surfaces.yaml
---

# Pulse Warden cross-product PRD expansion

## Change

Add 24 stable Warden requirements and matching acceptance scenarios, six workflows, seven logical surfaces, shared operation ownership and a staged release sequence. Align the existing integration/workspace PRDs with a separate user-unlocked credential class while preserving server integration secrets. Register confirmed choices, open release gates and proposed roadmap placement. Preserve unrelated existing edits.

## Authority

Owner explicitly chose both existing and Pulse-managed credentials, Bitwarden/Vaultwarden first, and long-term Pulse branding/commercial use. The owner requested coordinated PRD updates on 2026-09-07. These choices are confirmed. Detailed custody, recovery, platform, contract and rollout design remains proposed; this CR is not automatically approved. No new approval tag or runtime completion status is created.

## Scope amendments and retained boundaries

The older blanket no-client-secret wording continues to apply to integration credentials. The proposed trusted user-unlocked password/passkey class introduces a separate purpose-limited client boundary. The August Warden browser-metadata-only plan is extended explicitly, not silently treated as a delivered password manager. Go tenant grants, Vaultwarden human storage and Pulse environment execution retain distinct ownership. OpenBao machine identity and official T3 distribution remain unchanged.

Vaultwarden is selected for human-vault storage; it is not assumed to supply Bitwarden Secrets Manager or scoped machine leases. Brandable commercial clients must use permitted components, preserve notices/source obligations and pass a pinned build inventory. Independent extension/native deliverables do not implicitly fork official T3 mobile/web products.

## Paired repository

Pulse Go owns `prd/29-pulse-warden.md`, its acceptance and paired CR. Proposed shared contract identifier is `pulse-warden/v1`; normalized request/approval/execution/revocation and failure fixtures must agree. Historical Beat prerequisites remain unresolved until verified in their own CR/history. This change does not approve them.

## Evidence and remaining gates

Research: `docs/research/pulse-warden-review-2026-09-07.md`. Acceptance: `prd/20-acceptance-criteria/pulse-warden.md`. New open gaps are custody/recovery, platform/isolation, commercial components, cross-product broker and mail secret migration. Runtime tests are future release evidence; no browser, account or real vault is accessed by this authoring pass.

Scoped before/after evidence uses snapshots taken before this turn's edits, so prior dirty PRD changes are not attributed to this CR. Validation receipt: `project/reviews/warden-prd-2026-09-07-validation.json`. The existing workspace has older dangling roadmap references and missing Content Bible/SEO sources; this pass must distinguish those from Warden link integrity.

**Created:** 2026-09-07 . **Last opened:** 2026-09-07 . **Last edited:** 2026-09-07 . **Status:** proposed . **Owner:** Product / Engineering
