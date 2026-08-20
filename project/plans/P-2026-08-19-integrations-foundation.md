---
plan_id: P-2026-08-19-integrations-foundation
created_by: Codex
created_at: 2026-08-19
target_executor: Codex
project: Pulse Code
baseline_sha: 3fe2eb0989a25875a69977133f9e62946f7afc97
baseline_tag: none
dispatcher_hint: frontier
estimated_tasks: 12
opus_session_turns: 0
roadmap_item: R-2026-08-19-integration-foundation
---

# Pulse integrations foundation implementation plan

Implement the smallest provider-neutral connection lifecycle around a verified Pulse Issues
reference adapter, then prove bounded agent context and compatibility before expanding providers.

## Locked decisions

- The owning Pulse Code Server remains the only provider API and credential boundary.
- Domain semantics stay provider-specific; only lifecycle, mapping, health, provenance, errors, and
  receipts are shared.
- The current Issues work is preserved and landed independently before extraction assumes its schema
  is stable.
- Every new client call is additive, optional, and capability-gated.
- First-release agent writes require an exact action preview and user confirmation.
- Existing pairing/mobile records, Pulse/T3 aliases, package identities, and persisted IDs are not
  renamed or removed by this program.

## Research summary

- `AGENTS.md` requires open-core, performance, remote-ready, and web/desktop/mobile coverage; typed
  WebSocket contracts and capability skew are established patterns.
- `/settings/integrations` and `/pull-requests` are existing routes. Native `/issues`, mobile Issues,
  contracts, server adapter, and docs are present in the dirty worktree but are not treated as
  shipped or stable.
- Pulse Issues already demonstrates server-side secret storage, explicit project mapping, bounded
  lazy evidence, optimistic versions, typed failures, capability advertisement, multi-environment
  partial failure, and durable fix-thread links.
- Existing source control supports multiple hosts through host-specific boundaries. The integration
  platform should reuse that taste rather than absorb pull-request semantics.
- No Product Ops artifact tree existed before this planning pass. The PRD, sitemap, workflows,
  tool-flow, roadmap, gap register, and proposed change request now define the program.
- Capacity is an explicit assumption: one maintainer with agent support. Confirm it before execution;
  the roadmap reserves at least one Now slot for protective compatibility/security work.

## File targets

| Path                                                        | Role                                                  | Touch type                      |
| ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| `packages/contracts/src/integrations.ts`                    | Shared lifecycle/capability/error/receipt schemas     | create                          |
| `packages/contracts/src/index.ts`                           | Public contract exports                               | modify                          |
| `apps/server/src/integrations/`                             | Server-owned records, service, and adapter interfaces | create                          |
| `apps/server/src/persistence/Migrations.ts`                 | Register additive persistence migration               | modify                          |
| `apps/server/src/issues/`                                   | Reference adapter seam                                | modify after current work lands |
| `packages/client-runtime/src/state/integrations.ts`         | Shared queries and commands                           | create                          |
| `apps/web/src/components/settings/IntegrationsSettings.tsx` | Provider catalog/lifecycle UX                         | modify after current work lands |
| `apps/mobile/src/features/issues/`                          | Capability and secret-boundary parity                 | modify after current work lands |
| `docs/internals/integrations-platform.md`                   | Implemented architecture and compatibility contract   | create                          |
| `docs/user/integrations.md`                                 | Shipped connection/recovery behavior                  | create at release task          |

## Task DAG

### T1: Define additive integration lifecycle contracts

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-integration-foundation
- estimate: 90 minutes
- dag_level: 1
- blocked_by: []
- files_touched: [packages/contracts/src/integrations.ts, packages/contracts/src/integrations.test.ts, packages/contracts/src/index.ts, packages/contracts/src/environment.ts]
- exclusive_resources: []
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Connection snapshots contain provider, environment, non-secret account/endpoint hints, health, mappings, and advertised capabilities.
  - Schemas include stable lifecycle errors, context provenance, action previews, and audit receipts without inventing a universal work-item shape.
  - Capability fields are additive/optional and decode when absent for an older server.
  - Focused schema tests reject embedded credential fields and unbounded identifiers/payload metadata.

### T2: Verify secret-store and OAuth threat boundaries

- kind: verification
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 90 minutes
- dag_level: 1
- blocked_by: []
- files_touched: [docs/internals/integrations-secret-review.md, apps/server/src/auth/ServerSecretStore.test.ts]
- exclusive_resources: []
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Review records at-rest protection, backup behavior, rotation, deletion, logging, error, and diagnostic paths for refresh-token suitability.
  - A focused test proves stored secret bytes never appear in public snapshots or expected error serialization.
  - OAuth redirect state requirements cover expiry, environment/session binding, one-time use, and replay rejection.
  - Any unmet release gate is recorded as a named blocker rather than hidden by a fallback design.

### T3: Add server-owned connection and mapping persistence

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-integration-foundation
- estimate: 120 minutes
- dag_level: 2
- blocked_by: [T1, T2]
- files_touched: [apps/server/src/integrations/IntegrationStore.ts, apps/server/src/integrations/IntegrationStore.test.ts, apps/server/src/persistence/Migrations/042_Integrations.ts, apps/server/src/persistence/Migrations.ts]
- exclusive_resources: [sqlite-schema]
- writes_shared_state: true
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Additive tables store provider/account metadata, secret references, health, and explicit project mappings but no credential values.
  - Migration is forward-only, leaves existing Pulse Issue tables and IDs untouched, and passes a fixture built from the prior schema.
  - Store operations are environment-scoped and cannot return a mapping owned by another environment.
  - Disconnect can atomically remove active mappings and the connection record while leaving non-secret resource history available.

### T4: Wrap the landed Pulse Issues lifecycle as the reference adapter

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-pulse-issues-reference
- estimate: 120 minutes
- dag_level: 3
- blocked_by: [T1, T3]
- files_touched: [apps/server/src/integrations/IntegrationAdapter.ts, apps/server/src/integrations/IntegrationService.ts, apps/server/src/integrations/IntegrationService.test.ts, apps/server/src/issues/IssuesService.ts, apps/server/src/issues/PulseIssuesClient.ts]
- exclusive_resources: [issues-reference-adapter]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Current Pulse Issues connection, mapping, list/detail/evidence, mutation, and thread-link behavior remains domain-owned and test-compatible.
  - Shared lifecycle service delegates only demonstrated connection/health/mapping behavior to the adapter.
  - Provider validation, project-boundary checks, optimistic versions, evidence limits, and stable Issue errors are not weakened.
  - Existing Pulse Issue persistence is wrapped or migrated with an explicit compatibility fixture and no destructive rename.

### T5: Add capability-gated shared client runtime state

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-integration-foundation
- estimate: 90 minutes
- dag_level: 2
- blocked_by: [T1]
- files_touched: [packages/client-runtime/src/state/integrations.ts, packages/client-runtime/src/state/integrations.test.ts, packages/client-runtime/package.json]
- exclusive_resources: []
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Queries and commands always name the owning environment and do not run when the server lacks the integration capability.
  - Aggregation retains healthy-environment results when another environment is offline, unsupported, or unauthorized.
  - Runtime state carries credential-free health, mappings, provenance, and typed action results.
  - Focused tests cover older-server absence, reconnect, partial failure, and invalidation after connect/disconnect.

### T6: Present one provider lifecycle in Settings

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-integration-foundation
- estimate: 120 minutes
- dag_level: 3
- blocked_by: [T3, T5]
- files_touched: [apps/web/src/components/settings/IntegrationsSettings.tsx, apps/web/src/components/settings/IntegrationsSettings.test.tsx, apps/web/src/components/settings/settingsSearch.ts]
- exclusive_resources: [settings-integrations-surface]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The existing Pulse Issues UI is expressed as provider status, capability summary, connect/reauthorize, mapping, and disconnect without losing current recovery guidance.
  - Environment selection and mixed-capability states are explicit; unsupported servers receive no integration RPC.
  - Credential input is one-way and cleared after submission; snapshots and diagnostics show only configured/not-configured state.
  - Keyboard/search access and compact/mobile-width web layout remain usable with focused component tests.

### T7: Prove bounded agent context and one action preview

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-agent-context-actions
- estimate: 120 minutes
- dag_level: 4
- blocked_by: [T4, T5]
- files_touched: [packages/contracts/src/integrationContext.ts, packages/contracts/src/integrationContext.test.ts, apps/server/src/integrations/IntegrationContextService.ts, apps/server/src/integrations/IntegrationContextService.test.ts]
- exclusive_resources: [integration-action-contract]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - One Issue context read returns bounded summary/detail data with provider, environment, mapping, source, freshness, and resource identity.
  - Tool/context output cannot contain credential material or full heavy evidence by default.
  - One reversible Issue mutation returns an exact preview first and requires a confirmation token/receipt before execution.
  - Version conflict, permission loss, provider failure, and reconnect preserve understandable intent without blind replay.

### T11: Wire typed integration RPCs through the owning server

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-integration-foundation
- estimate: 120 minutes
- dag_level: 4
- blocked_by: [T4, T5]
- files_touched: [packages/contracts/src/rpc.ts, apps/server/src/auth/RpcAuthorization.ts, apps/server/src/ws.ts, apps/server/src/server.ts, apps/server/src/environment/ServerEnvironment.ts]
- exclusive_resources: [integration-rpc-contract]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Credential-free lifecycle snapshots, mappings, Issue context, and confirmed Issue status actions cross typed WebSocket RPCs owned by the target server.
  - Read methods require orchestration read scope; disconnect, mapping, preview, and confirmation methods require orchestration operate scope.
  - Every server response preserves the persisted owning environment ID and rejects mismatched adapter identity.
  - The integrations capability remains absent until the complete server bridge is live, then is advertised additively without changing the native Issues capability.

### T12: Bind integration client and mobile state to the typed RPC bridge

- kind: feature
- status: pending
- roadmap_item: R-2026-08-19-integration-foundation
- estimate: 120 minutes
- dag_level: 5
- blocked_by: [T11]
- files_touched: [packages/client-runtime/src/state/integrations.ts, packages/client-runtime/src/state/integrations.test.ts, apps/mobile/src/state/integrations.ts, apps/mobile/src/state/integrations.test.ts]
- exclusive_resources: [integration-client-transport]
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - The default client runtime uses typed environment RPC requests and never accepts or serializes provider credentials.
  - Unsupported or older environments mount no integration queries and send no integration methods.
  - Mobile can aggregate capable connection health and bounded Issue context across environments while preserving partial failures and environment identity.
  - Mutations remain serialized per environment and refresh only their owning environment's connection/context state.

### T8: Lock mobile, remote, and mixed-version compatibility

- kind: verification
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 120 minutes
- dag_level: 6
- blocked_by: [T12]
- files_touched: [apps/mobile/src/state/integrations.test.ts, apps/mobile/src/connection/storage.test.ts, packages/client-runtime/src/connection/resolver.test.ts, packages/contracts/src/integrations.test.ts, apps/server/src/environment/ServerEnvironment.test.ts, docs/internals/integrations-compatibility-matrix.md]
- exclusive_resources: []
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - New-client/old-server and old-client/new-server fixtures prove additive capability behavior.
  - Mobile can read capable resource/health state but never receives provider secret or refresh material.
  - Direct-remote, relay, and tunnel requests terminate at the owning server adapter and preserve environment identity.
  - Existing pairing records, Pulse/T3 aliases, package IDs, and persisted Issue/thread identifiers remain readable and unchanged.

### T9: Run second-adapter discovery against GitHub work items

- kind: verification
- status: pending
- roadmap_item: R-2026-08-19-github-work-graph
- estimate: 90 minutes
- dag_level: 4
- blocked_by: [T4]
- files_touched: [docs/internals/github-work-adapter-spike.md, apps/server/src/pullRequest/GitHubPullRequestCli.ts]
- exclusive_resources: []
- writes_shared_state: false
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Spike maps existing GitHub CLI/auth, repository, pull-request, and rate-budget behavior to the proposed lifecycle contract.
  - It identifies the minimum issue/project read that proves or disproves the adapter boundary without shipping new UI.
  - Provider-specific concepts that must not enter the shared layer are named explicitly.
  - The result recommends build, reshape, or stop with maintenance and compatibility consequences.

### T10: Verify the walking skeleton and publish shipped behavior

- kind: verification
- status: pending
- roadmap_item: R-2026-08-19-integration-compatibility-safety
- estimate: 120 minutes
- dag_level: 7
- blocked_by: [T6, T7, T8, T9]
- files_touched: [docs/internals/integrations-platform.md, docs/user/integrations.md, docs/README.md, project/state/shards/roadmap.yaml]
- exclusive_resources: [integration-release-docs]
- writes_shared_state: true
- dispatch_model: sonnet
- render_verify_required: false
- acceptance:
  - Focused contract, server, client-runtime, web, mobile, migration, secret, and capability-skew receipts are linked from the internal guide.
  - User documentation describes only shipped connect, health, mapping, disconnect, context, and recovery behavior.
  - The roadmap records actual metrics/receipts and does not mark an item shipped without every DoD receipt.
  - Outstanding OAuth, ownership, tokenizer, and provider-demand gaps remain explicit and correctly block later promotion.
  - A manual release review confirms the four Now outcomes without claiming later providers are implemented.

## Dispatch plan

- width: 3
- level 1: T1 and T2 can run together; contracts and secret review touch no shared files.
- level 2: T3 and T5 can run together after their real blockers clear; persistence and runtime are separate.
- level 3: T4 and T6 can run together only after T3; their exclusive resources separate server adapter and Settings UI.
- level 4: T7, T9, and T11 are the widest frontier and touch distinct context, discovery, and transport files.
- level 5: T12 binds the typed bridge into the client runtime and mobile state.
- level 6: T8 locks mixed-version, remote, mobile, alias, and identifier compatibility against the live bridge.
- level 7: T10 is the integration/release barrier and owns roadmap write-back.
- critical path: T1 → T3 → T4 → T11 → T12 → T8 → T10.
- maximum width: 3.
- shared-state rule: T3 owns the SQLite schema transition; T10 is the only task that updates roadmap status/receipts.

## Gap classification

- **high** · G-2026-08-19-secret-store-guarantees — T2 must close or explicitly block OAuth refresh-token storage.
- **high** · G-2026-08-19-reference-adapter-unmerged — T4 cannot begin until the current Issues work is independently verified and landed.
- **medium** · G-2026-08-19-shared-server-connection-ownership — persistence must not hard-code user ownership before scenarios are modeled.
- **medium** · G-2026-08-19-tokenizer-definition — remains outside the foundation execution plan and blocks shaping its Next item.
- **medium** · G-2026-08-19-provider-demand-baseline — T9 is discovery only; it does not promote a provider to Now.
- **medium** · G-2026-08-20-integration-transport-bridge-unassigned — converted into T11 and T12 after T8 research proved compatibility could not be verified without a live bridge.
- **medium** · G-2026-08-20-externally-managed-credential-mode — remains outside the walking skeleton and blocks any GitHub adapter from treating an OS-managed `gh` profile like a Pulse-owned secret.

## Close-of-execution contract

- Run only focused tests for touched contracts/modules and retain their commands/results as task
  verification receipts; do not run the repository-wide suite unless explicitly requested.
- Re-read the dirty worktree before every task and preserve unrelated user changes, especially the
  current Issues implementation.
- A task closes only when its acceptance bullets pass, durable task state is updated, and any new gap
  is written with severity and artifact links.
- Do not mark a roadmap item shipped without metric/DoD receipts and cross-client compatibility
  evidence. Partial implementation remains active/building.
- Do not commit, tag, approve the PRD change request, file external tickets, or open a pull request
  without explicit user authorization.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-19 . **Last edited:** 2026-08-19 . **Status:** draft . **Owner:** Engineering
