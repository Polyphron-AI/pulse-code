---
plan_id: P-2026-09-10-warden-first-read
status: proposed
execution_mode: frontier
---

# Warden first read task graph

Source: [readiness](readiness.md), [design](first-read.md), [decisions](decisions.md). The Go copy owns task identity; the identical Pulse copy is a cross-product reference, not a second execution queue. Stable IDs are P-2026-09-10-warden-first-read/Tn.

Planning authorized; runtime tasks are pending. D1 controls live-provider order. Each task is a 1-2 hour review/implementation unit estimate, not a guaranteed duration. Stop and split if its evidence or diff exceeds one focused unit. Existing infrastructure branch adoption and full client UI work must retain their own reviewed task graphs; this plan does not label them complete. Owners are responsible teams, not invented named assignees.

Dependency edges below are canonical. Tasks sharing a runtime file serialize. T18 is the completion join. T19/T20 are feasibility gates; their fixtures/inventory can be prepared independently. No production deployment or real-vault test is scheduled here.

## Task DAG

### T1: Review Go branch and migration compatibility

- owner: Go platform
- blocked_by: []
- files_touched: [docs/plans/2026-09-09-warden-live-logs.md, internal/storage/migrations]
- estimate: 1-2 hours, provisional

Reuse the existing infrastructure implementation without colliding with applied migration history.

Acceptance:

- Record main and branch OIDs, deployment schema evidence source and a compatible additive migration sequence.
- Identify changes worth adopting from 8c994bf; preserve live-schema uncertainty and do not run migrations.
- Produce a reviewed adoption diff or explicit blockers before T4-T9; split runtime adoption into existing branch tasks.

### T2: Review Pulse infrastructure client overlap

- owner: Pulse server
- blocked_by: []
- files_touched: [apps/server/src/infrastructure/WardenBroker.ts, apps/server/src/infrastructure/catalog.ts, apps/server/src/mcp/McpInvocationContext.ts]
- estimate: 1-2 hours, provisional

Reuse the branch mTLS client while preserving the owning environment and provider attempt.

Acceptance:

- Compare 0ca7151 with develop and the existing connection/auth task ledgers.
- Document usable client seam, thread/attempt source and certificate custody; reject tokenEnv fallback.
- Record adoption prerequisites and avoid a second HTTP client or policy implementation.

### T3: Define canonical requests and shared hash fixtures

- owner: Go contracts and Pulse contracts
- blocked_by: []
- files_touched: [prd/warden/first-read.md, prd/warden/fixtures/read-v1.json, prd/warden/schemas/read-v1.schema.json]
- estimate: 1-2 hours, provisional

Make the proposed request/digest contract executable before handlers consume it.

Acceptance:

- Define closed schemas, explicit null/omission rules, integer time units and canonical UTF-8 hash encoding.
- Include golden allow/deny/pending fixtures, changed payload, Unicode, wrong authority and extra-field cases.
- Validate fixtures with a pinned JSON Schema validator; cross-language digest expectations are independent fixture values.

### T4: Specify public status mapping with focused tests

- owner: Go broker
- blocked_by: [T1, T3]
- files_touched: [internal/warden/status.go, tests/warden_status_test.go]
- estimate: 1-2 hours, provisional

Map existing durable states without claiming a revoked in-flight read was stopped.

Acceptance:

- Witness failing cases for revoked-before-reserve, revoked-running, expired-ready and terminal outcomes.
- Implement the first-read status precedence and separate execution outcome from authorization status.
- Run go test ./tests/warden_status_test.go -count=1; never reset abandoned running uses to ready.

### T5: Add immutable request and approval provenance

- owner: Go storage
- blocked_by: [T4]
- files_touched: [internal/warden/grants.go, internal/storage/migrations, tests/warden_grants_test.go]
- estimate: 1-2 hours, provisional

Extend the adopted use store rather than adding a duplicate grant table.

Acceptance:

- Select migration number only after T1; bind digest, actual approver identity and reviewed versions.
- Test duplicate request ID with same binding returns same use and changed binding fails.
- Run focused grants tests; use one reservation across concurrent requests and preserve existing terminal records.

### T6: Verify current policy and credential revalidation

- owner: Go security
- blocked_by: [T5]
- files_touched: [internal/warden/identity.go, internal/warden/broker.go, tests/warden_identity_test.go, tests/warden_broker_test.go]
- estimate: 1-2 hours, provisional

Close authority gaps between authenticated workload, selected query and reservation.

Acceptance:

- Fail public-seam tests for changed membership, revoked certificate, query/credential version and wrong attempt.
- Authenticate from verified TLS/enrollment and recheck current policy before committed reservation.
- Run focused identity and broker tests; credentials never enter results and operator identity cannot execute workload actions.

### T7: Add paginated approval and denial receipts

- owner: Go audit
- blocked_by: [T6]
- files_touched: [internal/warden/audit.go, tests/warden_audit_test.go, internal/storage/migrations]
- estimate: 1-2 hours, provisional

Persist reviewable metadata without retaining provider content.

Acceptance:

- Test approval/denial/revocation/terminal correlations and no secret canaries.
- Define stable cursor ordering and caller visibility, with page50/max100.
- Run go test ./tests/warden_audit_test.go -count=1; retention remains D5 production configuration.

### T8: Expose metadata and versioned use envelopes

- owner: Go API
- blocked_by: [T7]
- files_touched: [internal/warden/http.go, tests/warden_http_test.go]
- estimate: 1-2 hours, provisional

Add missing capabilities and metadata around the branch service through one authority.

Acceptance:

- Test closed input, digest-required execution, state mapping and hidden foreign references.
- Return versioned authority-qualified use/receipt references and safe unsupported/action-required results.
- Run focused HTTP tests through synthetic mTLS; keep provider I/O outside ambient tenant transactions.

### T9: Design narrow CLI and provider identity bootstrap

- owner: Go auth and Pulse server
- blocked_by: [T2, T3, T8]
- files_touched: [prd/warden/bootstrap.md, tests/warden_bootstrap_test.go, apps/server/src/infrastructure/WardenBroker.test.ts]
- estimate: 1-2 hours, provisional

Prove how existing human login yields an attempt-scoped worker identity without lending operator authority.

Acceptance:

- Compare protected local IPC exchange and scoped remote token exchange; select one supported path per connection mode.
- Record issuer/audience, proof of possession, expiry, revoke, enrollment ownership and secret-free configuration.
- Produce failing boundary fixtures and an implementable exchange contract; no approval capability from ordinary PAT, TTY or --yes.

### T10: Add CLI metadata and status commands

- owner: Go CLI
- blocked_by: [T8, T9]
- files_touched: [cmd/cli/warden.go, cmd/cli/warden_status.go, cmd/cli/warden_status_test.go]
- estimate: 1-2 hours, provisional

Expose harmless discovery/status using the existing pulse-cli conventions.

Acceptance:

- Test explicit authority/environment selection, conflicting flags and metadata-only output.
- Preserve table/json/jsonl defaults and successful pending-status exit0.
- Run go test ./cmd/cli -run WardenStatus -count=1; no secret flags or stdout diagnostics.

### T11: Add CLI use lifecycle commands

- owner: Go CLI
- blocked_by: [T10]
- files_touched: [cmd/cli/warden_use.go, cmd/cli/warden_use_test.go]
- estimate: 1-2 hours, provisional

Support bounded use request/execute/wait/revoke through the public broker seam.

Acceptance:

- Test approval-needed exit3, denied/expired/revoked exit6, unsupported8 and timeout/unknown9.
- Verify cancellation reconciles the use and replay cannot reexecute or reconstruct missing output.
- Run go test ./cmd/cli -run WardenUse -count=1; human approval uses T9 trusted context.

### T12: Add CLI MCP host and configuration preview

- owner: Go CLI
- blocked_by: [T11]
- files_touched: [cmd/cli/warden_mcp.go, cmd/cli/warden_mcp_test.go]
- estimate: 1-2 hours, provisional

Host the selected Warden tools over stdio without granting broad inherited identity.

Acceptance:

- Test protocol-only stdout, bounded stderr and negotiation using pinned Go SDK.
- Preview/apply/remove only owned provider entries; doctor performs a harmless authorized read.
- Run go test ./cmd/cli -run WardenMCP -count=1; secrets never appear in generated config.

### T13: Add Pulse Warden MCP capability

- owner: Pulse server
- blocked_by: [T2, T3, T8, T9]
- files_touched: [apps/server/src/mcp/McpInvocationContext.ts, apps/server/src/mcp/WardenToolkit.ts, apps/server/src/mcp/WardenToolkit.test.ts, packages/contracts/src/warden.ts]
- estimate: 1-2 hours, provisional

Bind Warden tools to the actual provider invocation independently of preview capability.

Acceptance:

- Write failing tests for preview-only callers, invented attempt IDs and foreign environments.
- Register metadata/use/status/revoke/receipts tools only through current Warden authorization.
- Run focused toolkit tests and package typecheck; do not expose human approve or raw-secret tools.

### T14: Define shared approval and status client behavior

- owner: Pulse client runtime
- blocked_by: [T8, T9, T13]
- files_touched: [packages/client-runtime/src/warden/approval.ts, packages/client-runtime/src/warden/approval.test.ts, prd/warden/client-flows.md]
- estimate: 1-2 hours, provisional

Create the shared state model and precise UI handoff before individual client screens.

Acceptance:

- Test exact request digest, expiry, reconnect, revoked-running and unavailable approval device.
- Map Settings/task/command-palette/keybinding entry points and web/desktop/mobile owners.
- Record follow-up screen tasks and integration fixture; this task does not claim all client UIs implemented.

### T15: Prove each provider registration lifecycle

- owner: Pulse provider integration
- blocked_by: [T12, T13]
- files_touched: [prd/warden/provider-matrix.md, apps/server/src/mcp/WardenSetup.test.ts]
- estimate: 1-2 hours, provisional

Record actual transport/discovery/cancel/reconnect support for each harness.

Acceptance:

- Codex, Claude, Cursor, Grok and OpenCode each get pinned evidence or explicit unsupported/recovery.
- Test owned config preview/apply/remove without changing unrelated MCP registrations.
- Run focused setup tests; unsupported providers do not block supported ones but cannot be advertised as compatible.

### T16: Run UI CLI MCP shared policy conformance

- owner: Cross-product QA
- blocked_by: [T11, T13, T14, T15]
- files_touched: [prd/warden/fixtures/read-v1.json, tests/warden_conformance_test.go, apps/server/src/mcp/WardenConformance.test.ts]
- estimate: 1-2 hours, provisional

Use one independent fixture set to prove decisions and effect counts across callers.

Acceptance:

- Compare allow/deny/pending, stale digest, wrong tenant/environment/attempt and secret-canary absence.
- Verify concurrent one-use redemption, cancel/reconnect and unknown outcomes through actual public adapters.
- Run focused Go/Pulse conformance commands; a missing real client UI proof remains a blocker rather than a mock pass.

### T17: Verify adopted PostgreSQL isolation and recovery

- owner: Go database QA
- blocked_by: [T1, T5, T6, T7, T8]
- files_touched: [tests/warden_postgres_test.go, docs/operations/warden-restore.md]
- estimate: 1-2 hours, provisional

Validate the adopted migration chain and transaction boundary with the app role.

Acceptance:

- Use disposable PostgreSQL and independent connections/processes for tenant denial and one-use races.
- Test fresh/upgraded schema, interrupted reservation, key rotation/restore and revoked enrollment.
- Run go test ./tests/warden_postgres_test.go -count=1 with required test configuration; skips are not passes.

### T18: Review first read release evidence

- owner: Cross-product release
- blocked_by: [T16, T17, T19, T20]
- files_touched: [prd/warden/readiness.md, docs/operations/warden-first-read.md]
- estimate: 1-2 hours, provisional

Decide whether the selected first capability can be enabled from actual receipts.

Acceptance:

- Require D1 decision, relevant branch integration, client proof and scoped provider evidence.
- Record operator enable/disable/revoke/recovery procedure, exact revisions and remaining unsupported capabilities.
- Approve a release only for passed capabilities; live deployment or external account access needs its own authorized execution.

### T19: Run pinned external manager compatibility proof

- owner: Pulse credential client
- blocked_by: []
- files_touched: [prd/warden/feasibility.md, docs/operations/warden-manager-proof.md]
- estimate: 1-2 hours, provisional

Validate the first user-installed manager handoff without importing real vaults.

Acceptance:

- Prepare synthetic-only Vaultwarden1.37.2 and browser client2026.8.0; capture artifact digests and OS/browser versions.
- Run lock/save/update/fill/wrong-origin/cancel/logout/reconnect cases under separately authorized browser testing.
- Record harness-produced pass/fail/unsupported per capability; native passkeys and embedded fill remain independent.

### T20: Inventory commercial component reuse

- owner: Release engineering
- blocked_by: []
- files_touched: [prd/warden/component-inventory.csv, prd/warden/feasibility.md]
- estimate: 1-2 hours, provisional

Make the reuse decision reviewable before any upstream client code is copied.

Acceptance:

- Enumerate exact artifacts/revisions, licenses, assets, required notices and source delivery obligations.
- Separate user-installed handoff from redistributed code; exclude restricted modules until permission or replacement.
- Record unresolved items and reviewer ownership; inventory completion is not a legal clearance claim.
