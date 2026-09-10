# Known integration gaps

## Open

### G-2026-09-04-pulseflow-adapter-unimplemented (high)

- **Summary:** PulseFlow is currently a specification repository. The page handshake, stable node
  identity, variant service, document adapter, transaction receipts, and chrome-free Preview route
  required by this integration do not exist as running software.
- **Impact:** Pulse Code can specify and later implement its host boundary, but it cannot run a real
  PulseFlow live-design session until the PulseFlow R9 implementation reaches the host-proof gate.
- **Proposed resolution:** Implement the PulseFlow `PulseFlowDocumentAdapter` and deterministic host
  fixture first, then use that fixture for the Pulse Code local Preview slice before gateway work.
- **Artifacts:** Pulse Code `prd/16-pulseflow-live-design.md`; PulseFlow
  `prd/21-design-intelligence.md` and `prd/20-acceptance-criteria/AC-P-design-intelligence.md`.

### G-2026-09-04-public-preview-gateway (high)

- **Summary:** The existing Preview target resolver supports local and directly reachable private
  environment hosts but explicitly rejects public environment addresses because an authenticated
  Preview gateway is not implemented.
- **Impact:** Local desktop feasibility is high, but a public hosted or relay-only PulseFlow dev
  server cannot safely run inside Pulse Code Preview today.
- **Proposed resolution:** Implement an environment-side gateway bound to user, environment, tab,
  exact target, origin, expiry, and byte limits; complete SSRF, replay, backpressure, reconnect, and
  redaction review before enabling it.
- **Artifacts:** `apps/server/src/mcp/browserTargetResolver.ts`,
  `prd/20-acceptance-criteria/pulseflow-live-design.md`, and
  `tool-flow/pulseflow-live-design.md`.

### G-2026-09-04-impeccable-windows-live-baseline (high)

- **Summary:** At upstream Impeccable commit `4c5243fcd42d39c1fc281adcaf10be0913095f74`,
  `bun run test:live` reports 900 tests with 862 passing, 35 failing, and 3 skipped on Windows.
  Failures include Windows path assumptions and source-shape assertions.
- **Impact:** The upstream CLI and protocol are suitable reuse candidates, but PulseFlow cannot claim
  full maintained parity or a release-ready Windows picker while this pinned baseline is red.
- **Proposed resolution:** Classify each failure as platform-only, fixture drift, or behavior defect;
  patch or constrain the pinned compatibility layer; and require a green Windows matrix before the
  integrated release gate.
- **Artifacts:** upstream Impeccable `skill/scripts/command-metadata.json`, `live/`, and PulseFlow
  `prd/21-design-intelligence.md`.

### G-2026-08-21-desktop-identity-not-isolated — high

- **Summary:** Pulse-only desktop identifiers, state roots, protocols, updater coordinates, and
  package values are implemented, and an unsigned Windows x64 candidate passes package inspection.
  Installed lifecycle evidence is not complete on Windows, macOS, or Linux.
- **Impact:** The Windows candidate is ready for the next local side-by-side installation test, but
  Pulse cannot yet be declared ready for signed team-wide distribution across all desktop platforms.
- **Proposed resolution:** Install the Windows candidate beside official T3 and prove simultaneous
  launch, fresh state, protocol/shortcut ownership, update isolation, and uninstall isolation. Build
  signed macOS and Linux candidates and run the equivalent per-platform lifecycle proofs.
- **Artifacts:** `prd/11-product-line-and-distribution-boundary.md`,
  `prd/20-acceptance-criteria/desktop-product-line-boundary.md`, `apps/desktop/src/app/`,
  `apps/desktop/src/electron/ElectronProtocol.ts`, `scripts/build-desktop-artifact.ts`, and local
  candidate `release/Pulse-Code-0.0.33-x64.exe` (SHA-256 `A87DB57...F313513`).

### G-2026-08-21-windows-wsl-node-pty-prebuild — medium

- **Summary:** The verified Windows x64 installer was built without a Linux `pty.node` prebuild for
  its packaged WSL backend.
- **Impact:** The normal Windows backend and side-by-side identity candidate are usable, but a user
  cannot start the packaged WSL backend from this artifact.
- **Proposed resolution:** Supply the matching x64 Linux node-pty prebuild through `--wsl-prebuild`
  or `PULSE_CODE_DESKTOP_WSL_PREBUILD`, rebuild, and run a focused packaged WSL startup check before
  presenting the Windows candidate as feature-complete for WSL teams.
- **Artifacts:** `scripts/build-desktop-artifact.ts`,
  `apps/desktop/src/wsl/DesktopWslEnvironment.ts`, `release/Pulse-Code-0.0.33-x64.exe`.

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

### G-2026-08-21-desktop-boundary-presentation-metadata (high)

- **Resolution:** Added explicit `health`, `covers`, `action`, `authority`, `live`, and `register`
  metadata for every currently derived PRD row, including the previously missing Scheduled Chats
  rows and the new PulseFlow live-design rows, then regenerated the stable workspace viewer and JSON
  authority.
- **Outcome:** `workspace_render.py --check` reports no PRD presentation gap. Its remaining
  `view-unavailable` notices are non-blocking absent-view disclosures for sitemap, roadmap, Content
  Bible, and SEO.
- **Artifacts:** `project/workspace-overlay.json`, `project/workspace.json`, and
  `project/workspace.html`.

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

**Created:** 2026-08-19 . **Last opened:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** active . **Owner:** Product
