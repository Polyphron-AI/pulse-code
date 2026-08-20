# Known integration gaps

## Open

### G-2026-08-19-tokenizer-definition — medium

- **Summary:** “Tokenizer” is not defined well enough to choose a product surface or provider
  contract.
- **Impact:** The usage/tokenizer roadmap item cannot move beyond concept without knowing whether the
  user means token telemetry, a Pulse entity, or another system.
- **Proposed resolution:** Confirm the object, source of truth, and desired read/action workflow.
- **Artifacts:** `prd/10-pulse-integrations.md`, `project/state/shards/roadmap.yaml`.

### G-2026-08-19-shared-server-connection-ownership — medium

- **Summary:** User-owned versus environment-admin-owned connections are undecided for shared
  servers.
- **Impact:** OAuth subject identity, visibility, revocation, and project mapping authorization may
  change materially.
- **Proposed resolution:** Model the two highest-value shared-server scenarios before finalizing
  persistence.
- **Artifacts:** `prd/10-pulse-integrations.md`, `workflows/connect-and-map-integration.md`.

### G-2026-08-19-secret-store-guarantees — high

- **Summary:** The focused review verified server-only rotation, deletion, snapshot redaction, and
  expected-error redaction. The store is filesystem-protected rather than encrypted at rest; host
  isolation, redirect replay, backup/diagnostic disclosure, and provider revocation gates remain.
- **Impact:** Credential-free platform work may proceed, but OAuth connect/reauthorize cannot ship
  until blockers INT-SEC-01 through INT-SEC-04 are closed for the target provider and platforms.
- **Proposed resolution:** Attach Windows/deployment ACL evidence, redirect-state replay tests,
  backup/diagnostic exclusions, and provider-specific revocation behavior to the release review.
- **Artifacts:** `docs/internals/integrations-secret-review.md`,
  `apps/server/src/auth/ServerSecretStore.test.ts`, `prd/10-pulse-integrations.md`,
  `tool-flow/integration-platform.md`.

### G-2026-08-19-provider-demand-baseline — medium

- **Summary:** Provider ordering beyond Pulse/Git hosting is based on workflow fit, not measured user
  demand.
- **Impact:** Linear, Sentry, Slack, Jira, docs, and deployment sequencing may be wrong.
- **Proposed resolution:** Tag integration requests/support evidence by provider before promoting a
  second or third adapter into Now.
- **Artifacts:** `project/state/shards/roadmap.yaml`.

### G-2026-08-20-externally-managed-credential-mode — medium

- **Summary:** GitHub's proven provider path uses a host-scoped `gh` profile managed outside
  `ServerSecretStore`. A null `secretRef` currently cannot distinguish that configured external
  credential from a connection with no credential.
- **Impact:** Health and disconnect could lie or accidentally imply Pulse Code owns/revokes the CLI
  credential. The GitHub work adapter cannot move beyond read-only discovery until lifecycle mode,
  ownership, and disconnect behavior are explicit.
- **Proposed resolution:** Add an internal credential ownership/mode contract (for example,
  Pulse-Code-managed versus externally-managed), keep public snapshots credential-free, and test
  that disconnect never deletes or exposes the OS user's `gh` credential.
- **Artifacts:** `docs/internals/github-work-adapter-spike.md`,
  `apps/server/src/integrations/IntegrationStore.ts`,
  `apps/server/src/sourceControl/GitHubCli.ts`.

## Resolved

### G-2026-08-20-integration-transport-bridge-unassigned — medium

- **Resolution:** T11 added seven typed integration RPC methods, authorization policy, authenticated
  WebSocket handlers, environment service construction, and additive capability advertisement. T12
  bound the shared client and mobile state to those methods through the owning environment runtime.
- **Outcome:** Credential-free connection/context/action data now traverses the live bridge; older
  servers remain gated, native Issues RPCs remain unchanged, and T8 can verify mixed-version and
  transport compatibility against an implemented path.
- **Artifacts:** `packages/contracts/src/rpc.ts`, `apps/server/src/ws.ts`,
  `apps/server/src/environment/ServerEnvironment.ts`,
  `packages/client-runtime/src/state/integrations.ts`, `apps/mobile/src/state/integrations.ts`.

### G-2026-08-19-reference-adapter-unmerged — high

- **Resolution:** Native Pulse Issues landed independently in commit `ac8d94397` after its focused
  10-file/36-test suite, web typecheck, mobile typecheck, and staged format checks passed.
- **Outcome:** T4 may now wrap the stable Issues lifecycle without coupling its base implementation
  to the provider-neutral integration foundation.
- **Artifacts:** `apps/server/src/issues/`, `packages/contracts/src/issues.ts`,
  `docs/internals/issues-integration.md`.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-20 . **Last edited:** 2026-08-20 . **Status:** active . **Owner:** Product
