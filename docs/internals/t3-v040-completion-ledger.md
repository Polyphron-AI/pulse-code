# T3 v0.0.40 completion ledger

Target: `09e8de9c655ae85410bf6b00446f272a01da81c7`. The [source disposition inventory](t3-v040-disposition.json) accounts for every commit in the original 1,054-commit interval. Its pending rows require semantic review. File overlap and successful patch application do not prove compatibility.

The target changes 2,389 paths from the declared baseline: 728 web, 507 server, 454 mobile, 155 client runtime, 132 desktop, 81 marketing, 73 shared, and 48 contracts. These counts describe source scope, not missing features. The audit inspected migration sources, all changed contract filenames, provider history, native dependency/configuration diffs, and selected implementations. It did not independently verify every path.

## Dependency order and evidence

| Group                                  | Source                                                                                                           | Status and integration direction                                                                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness and initial protocol fixes | Prior [correctness](upstream-sync-2026-09-09.md) and [protocol](t3-protocol-compatibility-2026-09-09.md) ledgers | 17 selected changes landed and verified.                                                                                                                                                                                                      |
| Async questions                        | `d76b24dd1`, narrow lookup from `b17cc3d1b`, `d7fe47fd0`, `7ac93e300`, `e63ddb48e`, `7112697e8`                  | Coordinated backend/client implementation underway. Preserve OMP blocking callbacks, schedules, request finality, and pending retention.                                                                                                      |
| App/MCP approvals                      | `7c6163c67`                                                                                                      | Confirmed protocol gap: request kinds, app names, approval options, and answer mapping need adapters, contracts, and web/mobile UI together.                                                                                                  |
| Pairing metadata                       | `9d28c21a2`                                                                                                      | Integrated as `2886564a7`. Credentials only come from creation responses. Older clients with required credential fields need coordinated updates.                                                                                             |
| Used-provider restoration              | `06de9e90a`                                                                                                      | Implementation underway. Restore previously used providers after upgrades while preserving explicit disabled state and OMP.                                                                                                                   |
| Bounded reconnect replay               | `7e460f429`                                                                                                      | Integrated as `d272b7661`. SQL row and 8 MiB serialized-byte preflight runs before decoding replay. The earlier projector-backlog fix does not cover this.                                                                                    |
| Restart continuation                   | `0929907ff`, `5b7d72aad`, `b906ce2d7`, `1abc717f0`, `f47a3fe90`                                                  | Persisted opt-in, startup reconciliation, interrupted-session recovery, and shared-setting propagation. Preserve explicit provider capabilities and scheduled occurrence history.                                                             |
| Provider permissions and stop          | `43f723f80`, `994bd7373`, `d2b6f3b92`, `01f3e50ec`, `6134b90ff`                                                  | Review and port Cursor/OpenCode permissions, stop, and transport-error behavior.                                                                                                                                                              |
| Discovery and CLI fidelity             | `ea71a19d4`, `18573d60a`, `80a14b658`, `bc918e74a`, `15fea6c5f`, `2152d44de`, `a434677ec`                        | Coordinate Claude/project skills, large OpenCode skill results, and Grok CLI protocol. Preserve OMP registration.                                                                                                                             |
| Claude SDK/results                     | `560afffde`, `a5bbad910`, `940e8233c`, `4c7cd17a8`, `3d00cfd5a`, `3bf74eb6d`                                     | Upgrade SDK ^0.3.170 to target ^0.3.260 together with result/error/usage handling and bundled binary overrides.                                                                                                                               |
| Compaction/models/usage                | `c7222ca4d`, `c5ba51d62`, `5fa35d211`, `035428368`, `5a433244d`, `1587f248d`, `19d8ab2ae` and limit follow-ups   | Coordinate adapter capabilities, contracts, and clients. Preserve Pulse usage behavior; do not port reverted `535557b3f` alone.                                                                                                               |
| Project/thread persistence             | Migration groups below                                                                                           | Changes need decider/projector, snapshots, and clients, with schedule regressions.                                                                                                                                                            |
| Scoped defaults and balancing          | `9f40b2f56`, `420fd76f6`                                                                                         | Larger coordinated groups with explicit environment ownership and retained schedules/Office.                                                                                                                                                  |
| Mobile native stack                    | `3e6ab36f6`, `aab404964`, `b5a09e13f`                                                                            | Expo 57.0.18, RN 0.86.3, Reanimated 4.5.1, Worklets 0.10.1, Metro 57/screens 4.26.2 patches, exact sharing 57.0.17. Upgrade native binaries and lockfile together. Preserve Pulse fingerprints and schemes. iOS acceptance needs macOS/Xcode. |
| Remote diagnostics                     | `94f194816`                                                                                                      | Add DPoP reason fields across server/relay/clients; preserve Pulse client identities.                                                                                                                                                         |
| Media/import/setup/browser             | `8f4913221`, `beae2147a`, `775129984`, `09aac7156`, browser-profile/import series                                | Feature parity requires separate review. These are not prerequisites for decoding Codex protocol messages.                                                                                                                                    |

## Migration allocation

Pulse has shipped `041_Issues` and `042_Integrations`. Preserve them. Allocate the upstream migrations in the same relative order using the following free IDs, only when their dependent behavior is ready.

| Upstream ID | Pulse ID | Migration                           | Source      |
| ----------- | -------- | ----------------------------------- | ----------- |
| 41          | 43       | AuthSessionClientConnection         | `11f051373` |
| 42          | 44       | ProjectionThreadLinkedPullRequest   | `3c75eb113` |
| 43          | 45       | ProjectionThreadsUnsettledAt        | `3b86ef941` |
| 44          | 46       | ClearAutomaticProjectModelDefaults  | `5392c9bb9` |
| 45          | 47       | ProjectionProjectsAutoPull          | `ba3cb0773` |
| 46          | 48       | RepairAutomaticSettlementTimestamps | `2971ec320` |
| 47          | 49       | ProjectionProjectIcon               | `f6c04c552` |
| 48          | 50       | ProjectionThreadBranchPullRequest   | `223ff4490` |
| 49          | 51       | ProjectionThreadsActiveOrderKey     | `2d645df47` |

The project-model repair rewrites historical creation events based on an upstream UI assumption. Check whether Pulse let users choose a model at project creation before applying that rewrite. Settlement repair must preserve scheduled-thread history. No migration is approved merely by allocating an ID here.

## Pulse ownership

Retain branding, CLI aliases, public endpoints, release channels, schemes, and relay identities accepting Pulse and legacy T3 clients. Preserve OMP, schedules, Office/Talk, mail dependencies, and applicable Office fixes promoted to main after preview .3.

Upstream marketing, analytics destinations, hosted infrastructure, and stable-release automation are not requirements for application compatibility. Upstream thread-feedback upload `3db38b881` is a separate data-flow decision; do not enable automatic content transmission as a side effect of protocol updates. Browser-cookie import and paid usage redemption remain explicit user actions even if their implementation is imported.

The upstream baseline remains unchanged until pending source dispositions and cross-surface verification support advancing it.
