---
id: CR-2026-08-19-pulse-integrations-foundation
status: approved
impact: schema
author: Codex
created_at: 2026-08-19
files_touched:
  - prd/README.md
  - prd/10-pulse-integrations.md
  - prd/20-acceptance-criteria/integration-foundation.md
baseline_sha: f194c9661c2eec85f17e972da77772a915d483cd
related_crs: []
---

# CR-2026-08-19-pulse-integrations-foundation

## Summary

Propose a provider-neutral Pulse Code integration lifecycle, reference-adapter boundary, safety
contract, metrics, rollout, and first-release acceptance criteria.

## What changed (human-readable)

- `prd/README.md`
  - Establishes the PRD authority and links the integration requirement set to its architecture and
    roadmap artifacts.
- `prd/10-pulse-integrations.md`
  - Defines the connect-once outcome, provider boundary, experience, platform, security/privacy,
    backward compatibility, metrics, rollout, and open questions.
  - Proposes additive connection, mapping, capability, provenance, error, action-preview, and receipt
    shapes without defining a universal work-item model.
- `prd/20-acceptance-criteria/integration-foundation.md`
  - Adds testable connection, context/action, multi-surface, remote, secret-safety, migration, and
    mixed-version criteria for the first release.

## Locked decisions touched

None. This is the initial PRD baseline; related product decisions remain proposed until this CR is
approved.

## Evidence

- Repository evidence: existing `/settings/integrations` and `/pull-requests` surfaces.
- In-flight evidence: native Pulse Issues contracts, server adapter, mapping/secret patterns, web and
  mobile surfaces, and `docs/internals/issues-integration.md` in the current dirty worktree.
- User evidence: the requested outcome is persistent Pulse/Pulse Code sign-in and access to tickets,
  bugs, projects, workspaces, and tokenizer context with full backward compatibility.

## Sign-off required

- [x] Product owner
- [x] Client contact
- [x] Engineering lead

## Linked gaps

- **medium** — G-2026-08-19-tokenizer-definition — “Tokenizer” is ambiguous — confirm its object,
  source of truth, and required workflow before shaping the roadmap item.
- **medium** — G-2026-08-19-shared-server-connection-ownership — user versus environment-admin
  ownership is undecided — model shared-server scenarios before finalizing persistence.
- **high** — G-2026-08-19-secret-store-guarantees — OAuth refresh-token protection is unverified —
  complete the secret-store threat-model/review before an OAuth adapter ships.

## Raw diff

<details><summary>New PRD files in this proposed batch</summary>

```diff
diff --git a/prd/README.md b/prd/README.md
new file mode 100644
diff --git a/prd/10-pulse-integrations.md b/prd/10-pulse-integrations.md
new file mode 100644
diff --git a/prd/20-acceptance-criteria/integration-foundation.md b/prd/20-acceptance-criteria/integration-foundation.md
new file mode 100644
```

The complete proposed content is carried in the three files above because no approved PRD baseline
exists yet.

</details>

## History

- 2026-08-19 proposed (Codex)
- 2026-08-21 approved — user authorized the recommended approval checkpoint; foundation commit
  `89ea16641` and T1–T12 verification receipts accepted with OAuth/general release gates retained.
- 2026-08-21 tracker filing deferred pending explicit external tracker-write authorization.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** approved . **Owner:** Product
