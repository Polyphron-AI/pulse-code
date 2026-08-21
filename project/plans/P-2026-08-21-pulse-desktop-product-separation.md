---
plan_id: P-2026-08-21-pulse-desktop-product-separation
created_by: Codex
created_at: 2026-08-21T12:00Z
target_executor: Codex
project: Pulse Code
baseline_sha: c612ea6d2
baseline_tag: prd-approved-2026-08-21
dispatcher_hint: frontier
estimated_tasks: 7
opus_session_turns: 0
roadmap_item: R-2026-08-21-desktop-product-separation
---

# Pulse desktop product-separation implementation plan

Build the locked desktop-only product boundary without changing official T3 or splitting the shared
web/mobile clients, then leave a verified Windows installer ready for the next explicit install step.

## Locked decisions

- D-2026-08-21-upstream-t3-fidelity: official T3 remains owned and released only by upstream
  ([decisions](../decisions.md#d-2026-08-21-upstream-t3-fidelity)).
- D-2026-08-21-selective-pulse-downstream: Pulse may selectively adopt T3 releases and ship
  Pulse-only features without parity ([decisions](../decisions.md#d-2026-08-21-selective-pulse-downstream)).
- D-2026-08-21-desktop-identity-isolation: Pulse desktop must install and run independently with
  fresh state ([decisions](../decisions.md#d-2026-08-21-desktop-identity-isolation)).
- D-2026-08-21-shared-web-mobile-initially: web and mobile remain shared clients
  ([decisions](../decisions.md#d-2026-08-21-shared-web-mobile-initially)).

## Research summary

- **Desktop OS identity is not isolated.** **Confirmed:** `DesktopEnvironment.ts` defaults to
  `com.t3tools.t3code`, `t3code.desktop`, and `t3code`; the builder repeats the T3 app ID,
  executable, WM class, and protocol aliases.
- **Pulse can automatically take over T3 state.** **Confirmed:** `DesktopStatePaths.ts` defaults to
  `~/.t3`, `DesktopConfig.ts` accepts `T3CODE_HOME`, and `DesktopAppIdentity.ts` prefers
  legacy T3 user-data directories when present.
- **Protocol takeover is deliberate today.** **Confirmed:** `ElectronProtocol.ts`, `DesktopClerk.ts`,
  the Linux URL handler, and builder config register or claim both Pulse and T3 schemes.
- **Release ownership is already Pulse-oriented.** **Confirmed:** `release.yml` names Pulse releases,
  artifacts are `Pulse-Code-*`, and update repository resolution honors `Polyphron-AI/pulse-code`.
- **Shared clients must not change.** **Confirmed:** the compatibility matrix and locked PRD retain
  mobile bundle/package IDs, shared clients, wire IDs, and source-level package names.
- **Permanent ID namespace.** **Partial:** no repository-owned reverse-DNS Pulse namespace exists;
  the confirmed Scope Brief uses the explicit pre-signing assumption `ai.polyphron.pulsecode`.

## File targets

| path                                                                  | role                                  | touch_type | owner_task |
| --------------------------------------------------------------------- | ------------------------------------- | ---------- | ---------- |
| `apps/desktop/src/app/DesktopConfig.ts`                               | Pulse-only home/app identity config   | edit       | T1         |
| `apps/desktop/src/app/DesktopStatePaths.ts`                           | default Pulse state root              | edit       | T1         |
| `apps/desktop/src/app/DesktopEnvironment.ts`                          | runtime identity values               | edit       | T1         |
| `apps/desktop/src/app/DesktopEnvironment.test.ts`                     | runtime identity tests                | edit       | T1         |
| `apps/desktop/src/app/DesktopEarlyElectronStartup.ts`                 | early startup state resolution        | edit       | T1         |
| `apps/desktop/src/app/DesktopEarlyElectronStartup.test.ts`            | early startup isolation tests         | edit       | T1         |
| `apps/desktop/src/app/DesktopConnectionCatalogStore.test.ts`          | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/app/DesktopObservability.test.ts`                   | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/backend/DesktopBackendConfiguration.test.ts`        | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/backend/DesktopServerExposure.test.ts`              | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/settings/DesktopAppSettings.test.ts`                | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/settings/DesktopClientSettings.diagnostics.test.ts` | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/settings/DesktopClientSettings.test.ts`             | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/settings/DesktopSavedEnvironments.test.ts`          | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/updates/DesktopUpdates.test.ts`                     | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/wsl/DesktopWslServerTree.test.ts`                   | isolated Pulse test fixture           | edit       | T1         |
| `apps/desktop/src/app/DesktopAppIdentity.ts`                          | fresh user-data selection             | edit       | T2         |
| `apps/desktop/src/app/DesktopAppIdentity.test.ts`                     | no legacy discovery tests             | edit       | T2         |
| `apps/desktop/src/app/DesktopClerk.ts`                                | single-instance/protocol startup      | edit       | T2         |
| `apps/desktop/src/app/DesktopClerk.test.ts`                           | startup ownership tests               | edit       | T2         |
| `apps/desktop/src/app/DesktopApp.ts`                                  | Pulse-only protocol registration call | edit       | T2         |
| `apps/desktop/src/electron/ElectronProtocol.ts`                       | Pulse-only renderer protocols         | edit       | T3         |
| `apps/desktop/src/electron/ElectronProtocol.test.ts`                  | protocol tests                        | edit       | T3         |
| `apps/desktop/src/app/DesktopLinuxUrlHandler.ts`                      | Pulse Linux handler                   | edit       | T3         |
| `apps/desktop/src/app/DesktopLinuxUrlHandler.test.ts`                 | Linux handler tests                   | edit       | T3         |
| `scripts/build-desktop-artifact.ts`                                   | cross-platform package identity       | edit       | T4         |
| `scripts/build-desktop-artifact.test.ts`                              | builder configuration tests           | edit       | T4         |
| `apps/desktop/scripts/electron-launcher.mjs`                          | development/mac launcher identity     | edit       | T5         |
| `apps/desktop/scripts/electron-launcher.test.mjs`                     | launcher identity tests               | edit       | T5         |
| `README.md`                                                           | top-level installation boundary       | edit       | T6         |
| `docs/user/install.md`                                                | fresh side-by-side install guidance   | edit       | T6         |
| `docs/internals/pulse-code-compatibility.md`                          | desktop/shared-client boundary        | edit       | T6         |
| `docs/internals/t3-connect.md`                                        | Pulse bundle-ID signing guidance      | edit       | T6         |
| `project/known-gaps.md`                                               | release-gap disposition               | edit       | T7         |
| `project/state/shards/gaps.yaml`                                      | gap state                             | edit       | T7         |
| `project/state/shards/roadmap.yaml`                                   | roadmap receipt                       | edit       | T7         |
| `prd/change-requests/CR-2026-08-21-desktop-product-line-boundary.md`  | approval history                      | edit       | T7         |
| `project/state.json`                                                  | approved baseline note                | edit       | T7         |

## Task DAG

### T1: Isolate Pulse runtime identity and state roots

- kind: protective
- status: pending
- roadmap_item: R-2026-08-21-desktop-product-separation
- estimate: 120 minutes
- blocked_by: []
- blocks: [T2, T6, T7]
- dag_level: 1
- files_touched: [apps/desktop/src/app/DesktopConfig.ts, apps/desktop/src/app/DesktopStatePaths.ts, apps/desktop/src/app/DesktopEnvironment.ts, apps/desktop/src/app/DesktopEnvironment.test.ts, apps/desktop/src/app/DesktopEarlyElectronStartup.ts, apps/desktop/src/app/DesktopEarlyElectronStartup.test.ts, apps/desktop/src/app/DesktopConnectionCatalogStore.test.ts, apps/desktop/src/app/DesktopObservability.test.ts, apps/desktop/src/backend/DesktopBackendConfiguration.test.ts, apps/desktop/src/backend/DesktopServerExposure.test.ts, apps/desktop/src/settings/DesktopAppSettings.test.ts, apps/desktop/src/settings/DesktopClientSettings.diagnostics.test.ts, apps/desktop/src/settings/DesktopClientSettings.test.ts, apps/desktop/src/settings/DesktopSavedEnvironments.test.ts, apps/desktop/src/updates/DesktopUpdates.test.ts, apps/desktop/src/wsl/DesktopWslServerTree.test.ts]
- acceptance:
  - Production defaults to `~/.pulsecode/userdata`; development defaults to `~/.pulsecode/dev`.
  - `PULSE_CODE_HOME` may override Pulse state, while `T3CODE_HOME` cannot redirect packaged Pulse into T3 state.
  - Early Electron startup uses the same Pulse-only home resolution before the Effect runtime is available.
  - Desktop tests that need temporary state use `PULSE_CODE_HOME`, preventing the ignored T3 alias from falling through to a developer's real Pulse home.
  - Runtime app ID is `ai.polyphron.pulsecode` with a non-colliding development suffix.
  - Linux main entry and WM class are `pulsecode.desktop` / `pulsecode` (and dev variants).
  - Focused DesktopEnvironment tests cover defaults, Pulse override precedence, and ignored T3 identity/home aliases.
- dispatch_model: sonnet-subagent
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: []
- shard_writes: []

### T2: Remove automatic T3 user-data and protocol takeover

- kind: protective
- status: pending
- roadmap_item: R-2026-08-21-desktop-product-separation
- estimate: 90 minutes
- blocked_by: [T1, T3]
- blocks: [T7]
- dag_level: 2
- files_touched: [apps/desktop/src/app/DesktopAppIdentity.ts, apps/desktop/src/app/DesktopAppIdentity.test.ts, apps/desktop/src/app/DesktopClerk.ts, apps/desktop/src/app/DesktopClerk.test.ts, apps/desktop/src/app/DesktopApp.ts]
- acceptance:
  - Electron userData always resolves to the Pulse-owned directory and never probes T3 directories.
  - The single-instance lock is scoped only by Pulse userData.
  - Desktop startup registers only the Pulse protocol; no T3 handler is claimed.
  - The application bootstrap no longer passes any legacy T3 protocol alias.
  - Focused identity and Clerk tests prove fresh-state and Pulse-only protocol behavior.
- dispatch_model: sonnet-subagent
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: []
- shard_writes: []

### T3: Restrict renderer and Linux handlers to Pulse protocols

- kind: protective
- status: pending
- roadmap_item: R-2026-08-21-desktop-product-separation
- estimate: 90 minutes
- blocked_by: []
- blocks: [T2, T6, T7]
- dag_level: 1
- files_touched: [apps/desktop/src/electron/ElectronProtocol.ts, apps/desktop/src/electron/ElectronProtocol.test.ts, apps/desktop/src/app/DesktopLinuxUrlHandler.ts, apps/desktop/src/app/DesktopLinuxUrlHandler.test.ts]
- acceptance:
  - Production and development expose only `pulsecode` and `pulsecode-dev` respectively.
  - Privileged-scheme registration excludes `t3code` and `t3code-dev`.
  - Linux MIME handler content and xdg-mime calls claim only the active Pulse scheme.
  - Focused protocol and Linux-handler tests assert no T3 scheme registration or cleanup.
- dispatch_model: sonnet-subagent
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: []
- shard_writes: []

### T4: Give every packaged desktop target Pulse-only identity

- kind: protective
- status: pending
- roadmap_item: R-2026-08-21-desktop-product-separation
- estimate: 120 minutes
- blocked_by: []
- blocks: [T5, T6, T7]
- dag_level: 1
- files_touched: [scripts/build-desktop-artifact.ts, scripts/build-desktop-artifact.test.ts]
- acceptance:
  - Windows, macOS, and Linux configs use `ai.polyphron.pulsecode` and only Pulse protocols.
  - Linux executable and WM class use `pulsecode`; Windows executable/package metadata cannot collide with T3.
  - Artifact names and updater repository resolve only to Pulse release coordinates.
  - macOS entitlements derive from the Pulse app ID.
  - Focused builder tests assert the complete identity matrix and reject T3 OS-level values.
- dispatch_model: sonnet-subagent
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: []
- shard_writes: []

### T5: Align the desktop launcher with Pulse package identity

- kind: protective
- status: pending
- roadmap_item: R-2026-08-21-desktop-product-separation
- estimate: 60 minutes
- blocked_by: [T4]
- blocks: [T7]
- dag_level: 2
- files_touched: [apps/desktop/scripts/electron-launcher.mjs, apps/desktop/scripts/electron-launcher.test.mjs]
- acceptance:
  - Production and development launcher bundle IDs derive from `ai.polyphron.pulsecode`.
  - Launcher Info.plist URL types contain only Pulse schemes.
  - Child app/user-model environment uses Pulse identity without exporting a T3 app-identity alias.
  - Node launcher tests pass with no T3 OS-level identity expectations.
- dispatch_model: sonnet-subagent
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: []
- shard_writes: []

### T6: Publish the desktop-only compatibility boundary

- kind: documentation
- status: pending
- roadmap_item: R-2026-08-21-desktop-product-separation
- estimate: 90 minutes
- blocked_by: [T1, T3, T4]
- blocks: [T7]
- dag_level: 2
- files_touched: [README.md, docs/user/install.md, docs/internals/pulse-code-compatibility.md, docs/internals/t3-connect.md]
- acceptance:
  - Documentation distinguishes Pulse desktop identity from shared web/mobile compatibility.
  - Install guidance says Pulse starts fresh, runs beside T3, and does not offer implicit migration.
  - Registry commands that still target T3 identities are not presented as Pulse installation paths.
  - Signing/passkey guidance uses the Pulse app ID and clearly names the pre-signing namespace assumption.
  - Markdown links and focused formatting checks pass.
- dispatch_model: sonnet-subagent
- render_verify_required: false
- writes_shared_state: false
- exclusive_resources: []
- shard_writes: []

### T7: Verify the install candidate and close the product boundary

- kind: verification
- status: pending
- roadmap_item: R-2026-08-21-desktop-product-separation
- estimate: 120 minutes
- blocked_by: [T1, T2, T3, T4, T5, T6]
- blocks: []
- dag_level: 3
- files_touched: [project/known-gaps.md, project/state/shards/gaps.yaml, project/state/shards/roadmap.yaml, prd/change-requests/CR-2026-08-21-desktop-product-line-boundary.md, project/state.json]
- acceptance:
  - All focused runtime, protocol, launcher, and builder suites plus desktop typecheck pass.
  - An unsigned `release/Pulse-Code-0.0.33-x64.exe` is rebuilt from the integrated tree.
  - Package inspection proves Pulse app ID, executable, protocols, install identity, updater target, and fresh state; desktop smoke passes without installing.
  - The desktop identity gap is resolved only for the proven Windows candidate and platform-neutral config; macOS/Linux runtime evidence remains explicit.
  - PRD change control records the verified implementation, then all scoped changes are committed and pushed to `origin/main`.
- dispatch_model: sonnet
- render_verify_required: false
- writes_shared_state: true
- exclusive_resources: [desktop-windows-release-build]
- shard_writes: ["gaps.yaml: G-2026-08-21-desktop-identity-not-isolated -> resolved", "roadmap.yaml: append verification receipt"]

## Dispatch plan

- width: 3
- levels: {T1,T3,T4} {T2,T5,T6} {T7}
- max_width: 3
- critical_path: 3
- exclusive_resources_in_play: [desktop-windows-release-build]
- barriers:
  - before T7 — shared-state write and the package verification pass must see the integrated tree
- coordinator_inline_exemptions:
  - T7 — the coordinator alone owns the shared ProductOps state, final git commit/tag, and push authorization context

## Gap classification

- **high** · G-2026-08-21-desktop-identity-not-isolated · decomposed across T1–T7.
- **high** · G-2026-08-21-workspace-endpoints-yaml-parser · pre-existing renderer subset failure;
  it blocks workspace regeneration but not desktop code or package verification.
- **high** · G-2026-08-21-desktop-boundary-presentation-metadata · renderer presentation registry
  does not yet cover the new PRD sections; it blocks unified workspace presentation, not install.
- **high** · G-2026-08-21-windows-secret-acl-inspector · unrelated OAuth release hold; excluded.
- **medium** · G-2026-08-20-externally-managed-credential-mode · unrelated provider lifecycle; excluded.

## Close-of-execution contract

```
**Plan-handoff close — P-2026-08-21-pulse-desktop-product-separation, 7 tasks closed**

## Summary
<one sentence with tasks closed, observed width, Windows artifact result, commit, and push>

## Findings
- **<severity>** · <one-liner> · <file:line>

## Actions
- **Applied:** <tasks closed> · <verification receipts> · <commit/tag/push>
- **Proposed:** install the verified Pulse Windows candidate

## Surfaced gaps
- **<severity>** · G-YYYY-MM-DD-slug · <summary>

## Handoff fields
- tasks_closed: [T1, T2, T3, T4, T5, T6, T7]
- tasks_blocked: []
- escalated_to_opus: []
- archive_path: project/plans/archive/P-2026-08-21-pulse-desktop-product-separation.md
```

No endpoint, template, static, or user-visible web/mobile view is changed, so browser render
verification is not applicable. The Windows package is built and inspected but not installed.

---

**Created:** 2026-08-21 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** active . **Owner:** Engineering
