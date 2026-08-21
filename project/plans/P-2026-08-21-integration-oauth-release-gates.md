---
plan_id: P-2026-08-21-integration-oauth-release-gates
created_by: Codex
created_at: 2026-08-21
target_executor: Codex
project: Pulse Code
baseline_sha: c297b4ad7
baseline_tag: prd-approved-2026-08-21
dispatcher_hint: frontier
estimated_tasks: 5
opus_session_turns: 0
roadmap_item: R-2026-08-19-integration-compatibility-safety
---

# Integration OAuth release-gate implementation plan

Close the four named security blockers without weakening the approved server-owned credential
boundary, then run one release review that may enable OAuth only when every applicable receipt is
green.

## Locked decisions

- The owning Pulse Code Server is the only provider API and credential boundary.
- Existing PAT setup and server startup remain available when OAuth eligibility is held.
- OAuth state is short-lived, server-owned, session/environment bound, and consumed exactly once.
- A successful `chmod` call is not Windows ACL evidence.
- Provider revocation behavior stays adapter-specific and is reported through typed receipts.
- OAuth/general release remains held until the final barrier records every applicable gate as pass.

## Research summary

- `ServerSecretStore` creates `userdata/secrets`, applies `0700`/`0600`, and redacts expected
  errors, but the current `chmod` assertion is not effective Windows ACL evidence.
- Pulse Connect has loopback and out-of-band PKCE precedent in `CliTokenManager`; the integration
  layer has no provider-neutral, atomically consumed OAuth attempt store.
- Database-only update snapshots exclude secrets. Whole-directory backup disclosure and diagnostic
  exclusion evidence remain documentation/test work.
- The Pulse PAT adapter has local deletion semantics but no provider OAuth revocation contract.
- The approved foundation remains unreleased; no task in this plan may imply OAuth availability
  before the final barrier passes.

## File targets

| Path                                                 | Role                                     | Touch type   |
| ---------------------------------------------------- | ---------------------------------------- | ------------ |
| `apps/server/src/auth/SecretStoreHostProtection.ts`  | Effective host-isolation assessment      | create       |
| `apps/server/src/auth/ServerSecretStore.ts`          | Expose server-internal protection state  | modify       |
| `apps/server/src/integrations/OAuthAttemptStore.ts`  | Bound, expiring, one-time OAuth attempts | create       |
| `apps/server/src/integrations/IntegrationAdapter.ts` | Adapter revocation declaration           | modify       |
| `apps/server/src/integrations/IntegrationService.ts` | Ordered revoke/local-delete lifecycle    | modify       |
| `packages/contracts/src/integrations.ts`             | Credential-free disconnect receipt       | modify       |
| `docs/operations/server-backups.md`                  | Credential-bearing backup guidance       | create       |
| `docs/internals/integrations-secret-review.md`       | Gate evidence and dispositions           | modify at T5 |
| `project/state/shards/roadmap.yaml`                  | Release-review receipt                   | modify at T5 |

## Task DAG

### T1: Prove host protection and Windows ACL readiness

- kind: protective
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 120 minutes
- dag_level: 1
- blocked_by: []
- files_touched: [apps/server/src/auth/SecretStoreHostProtection.ts, apps/server/src/auth/SecretStoreHostProtection.test.ts, apps/server/src/auth/ServerSecretStore.ts, apps/server/src/auth/ServerSecretStore.test.ts]
- exclusive_resources: [secret-store-host-protection]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The server can report whether the secret directory meets the target platform's effective owner/isolation policy without exposing paths or credentials through public integration snapshots.
  - Windows readiness is based on effective ACL evidence, not a successful `chmod` call or a self-attested environment flag.
  - Unsupported or unverifiable host protection produces a typed OAuth-ineligible result without breaking existing PAT or server startup behavior.
  - Focused tests cover isolated, shared/untrusted, Windows-unverifiable, and inspection-failure outcomes.

### T2: Add an atomic, session-bound OAuth attempt store

- kind: protective
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 120 minutes
- dag_level: 1
- blocked_by: []
- files_touched: [apps/server/src/integrations/OAuthAttemptStore.ts, apps/server/src/integrations/OAuthAttemptStore.test.ts]
- exclusive_resources: [integration-oauth-state]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Initiation generates cryptographically secure state and PKCE material and binds provider, environment, initiating session/user, and exact redirect URI.
  - Consume is atomic, one-time, expiry-aware, and marks the attempt consumed before token exchange can begin.
  - Missing, mismatched, expired, duplicate, and replay-after-failed-exchange cases return the same bounded public failure without returning prior results.
  - Raw state, authorization codes, PKCE verifiers, tokens, and provider bodies are absent from errors and serialization.

### T3: Lock backup and diagnostic exclusions

- kind: protective
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 90 minutes
- dag_level: 1
- blocked_by: []
- files_touched: [docs/operations/server-backups.md, docs/internals/server-updates.md, docs/internals/integrations-secret-review.md]
- exclusive_resources: [integration-security-docs]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - User-facing operations guidance states that whole-data-directory backups contain credentials and defines equally restrictive storage and deletion expectations.
  - Database-only rollback behavior remains explicitly credential-free.
  - Every diagnostic/export path is inventoried; existing exclusions are tested or the absent exporter is recorded as a release precondition.
  - Prohibited OAuth fields and `userdata/secrets` are named as permanent diagnostic exclusions.

### T4: Define and test provider disconnect revocation semantics

- kind: protective
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 120 minutes
- dag_level: 1
- blocked_by: []
- files_touched: [apps/server/src/integrations/IntegrationAdapter.ts, apps/server/src/integrations/IntegrationService.ts, apps/server/src/integrations/IntegrationService.test.ts, packages/contracts/src/integrations.ts, packages/contracts/src/integrations.test.ts]
- exclusive_resources: [integration-disconnect-contract]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Each adapter declares whether upstream revocation is supported without exposing credential material.
  - Supported revocation runs before local deletion and reports partial failure when either phase fails.
  - Unsupported revocation returns an explicit receipt/UI-safe reason that provider-side grants may need manual removal.
  - Existing Pulse PAT disconnect behavior remains compatible and focused contract/service tests pass.

### T5: Run the OAuth release review and publish receipts

- kind: verification
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 120 minutes
- dag_level: 2
- blocked_by: [T1, T2, T3, T4]
- files_touched: [docs/internals/integrations-secret-review.md, docs/internals/integrations-secret-review.html, docs/internals/integrations-platform.md, project/known-gaps.md, project/state/shards/roadmap.yaml]
- exclusive_resources: [integration-release-docs]
- writes_shared_state: true
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - INT-SEC-01 through INT-SEC-04 each carry a focused test or platform-evidence receipt and an honest pass/hold result.
  - OAuth connect/reauthorize is enabled only for providers and platforms whose applicable gates pass; otherwise the release hold remains explicit.
  - Known gaps and roadmap history are updated without marking the protective item shipped before release and post-release metric evidence exist.
  - Focused server/contracts checks, documentation formatting, link validation, and `git diff --check` pass.

## Dispatch plan

- width: 4
- level 1: T1, T2, T3, and T4 are independent by file ownership and may form one frontier.
- level 2: T5 is the shared-state and release-review barrier after all four blockers resolve.
- critical path: any of T1–T4 → T5.
- maximum width: 4.
- shared-state rule: only T5 updates the roadmap and durable gap disposition.

## Gap classification

- **high** · G-2026-08-19-secret-store-guarantees — decomposed into INT-SEC-01 through INT-SEC-04.
- **medium** · G-2026-08-19-shared-server-connection-ownership — remains outside this plan and can
  continue to hold shared-host OAuth even if host mechanics pass.
- **medium** · G-2026-08-20-externally-managed-credential-mode — remains a later-adapter gate; this
  plan does not treat OS-managed provider credentials as Pulse Code secrets.

## Close-of-execution contract

- Run focused tests and package typechecks only; do not run the repository-wide suite.
- Preserve PAT setup and existing server startup on hosts where OAuth eligibility is held.
- Never log secret paths, ACL principals, raw OAuth state, PKCE material, codes, or tokens.
- Do not enable OAuth or mark the roadmap item shipped until T5 records every gate disposition.

---

**Created:** 2026-08-21 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** active . **Owner:** Engineering
