# T3 correctness integration, 9 September 2026

This batch ports 11 upstream changes selected from T3 v0.0.40 into Pulse. It starts at Pulse `f3d6b59b2` and uses upstream stable `09e8de9c655ae85410bf6b00446f272a01da81c7` as the source boundary. Three agents implemented independent Git, replay/buffering, and Claude/settings batches. The coordinator implemented reconnect fixes and integrated the results. The agents independently reviewed one another's changes.

This is a partial sync. It does not establish v0.0.40 compatibility or change the recorded upstream baseline. Of the 1,054 upstream commits inventoried since the declared v0.0.33 baseline, this ledger accounts for 11 landed changes. The remaining 1,043 are outside this batch, not implicitly accepted or rejected.

## Provenance

| Upstream commit | Behavior                                                        | Integration decision                                                                                                                                            |
| --------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `12c497083`     | Allow large worktree checkouts to exceed 30 seconds             | Ported; timeout remains bounded at five minutes. Added a deterministic timeout regression.                                                                      |
| `be3da50e9`     | Initialize submodules in new worktrees                          | Ported; retain best-effort failure semantics. Repaired the regression fixture to create an actual gitlink so failed checkout is exercised.                      |
| `e6a109b9f`     | Treat already-removed worktrees as absent                       | Adapted pruning locally rather than importing the larger worktree-recreation feature. Filesystem access errors preserve failure instead of authorizing pruning. |
| `994372ba4`     | Publish feature branches without overwriting their tracked base | Ported; added explicit push-remote precedence checks. Keep base-branch metadata when upstream tracking changes.                                                 |
| `a6797b3b9`     | Replay the complete unapplied event backlog on bootstrap        | Ported; added verification that the final event reaches the read model, beyond checking the cursor. Storage still reads bounded pages.                          |
| `c034f51bb`     | Avoid full thread-history reads for routine events              | Ported; preserve user-message and pending-request summary updates.                                                                                              |
| `702a6ade3`     | Avoid quadratic Codex input buffering                           | Ported; preserve split UTF-8, CRLF, multiple lines, final unterminated lines, and parse-error behavior.                                                         |
| `95834d68a`     | Disable executable capabilities in Claude metadata generation   | Adapted to Pulse's existing model selection. Keep provider environment and source-control cwd. Isolate title cwd with scoped cleanup.                           |
| `ac4f1a2b6`     | Preserve inline provider secrets during redacted saves          | Adapted tests to Pulse's file-backed settings rather than importing upstream's newer SQLite test layer. Explicit replacement and clearing remain supported.     |
| `afa830980`     | Retry temporary authentication rejection during update restart  | Ported; retry remains paced and scoped to the update command. Permission and configuration failures stay blocked.                                               |
| `589a9d0e2`     | Recover queries after connection interruption                   | Ported; shared query state observes both connection state and session replacement and preserves cached successful values.                                       |

Each source change's commit message retains upstream attribution. Follow-up test and review fixes are separate commits.

## Verification

The coordinator verified the original reconnect baseline, 31 tests, then the changed suite, 38 tests. Replay and history regressions failed against original production code before passing with the port. Claude/settings regressions likewise failed against original code before passing with the port.

Focused checks cover 193 applicable tests across the integrated scopes. The Git agent's final source and tests are byte-identical to the integrated files; the coordinator also reran a nine-test Git/handoff selection on the combined branch.

| Scope                                                                      | Result                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Shared reconnect state                                                     | 38 tests passed                                                                                                  |
| Projection pipeline, scheduled-chat decider, and schedule shell projection | 44 tests passed                                                                                                  |
| Codex protocol                                                             | 14 tests passed                                                                                                  |
| Claude metadata, provider settings, and OMP metadata                       | 34 tests passed                                                                                                  |
| Git and scheduled Git handoffs                                             | 63 passed, one Windows-invalid baseline fixture excluded; nine selected cases also passed on the combined branch |
| Changed-file lint and format                                               | Passed for all 14 changed TypeScript files                                                                       |
| Server, shared client-runtime, and Codex package typechecks                | Passed; existing Effect suggestions outside this change remain                                                   |

Reproducible focused commands, run from the sync worktree:

```powershell
vp test run apps/server/src/vcs/GitVcsDriverCore.test.ts apps/server/src/orchestration/Layers/ScheduleHandoffGit.test.ts -t '^(?!.*preserves newline characters in worktree paths)'
vp test run apps/server/src/orchestration/Layers/ProjectionPipeline.test.ts apps/server/src/orchestration/decider.schedules.test.ts apps/server/src/orchestration/shellScheduleProjection.test.ts
vp test run apps/server/src/textGeneration/ClaudeTextGeneration.test.ts apps/server/src/serverSettings.test.ts apps/server/src/textGeneration/OmpTextGeneration.test.ts
vp test run packages/effect-codex-app-server/src/protocol.test.ts
vp test run packages/client-runtime/src/state/runtime.test.ts packages/client-runtime/src/state/server.test.ts
vp run --filter t3 typecheck
vp run --filter @t3tools/client-runtime typecheck
vp run --filter effect-codex-app-server typecheck
```

The native Windows full Git run encountered an existing test that creates a worktree path containing a newline. Windows rejects that path. The Git agent reproduced the same failure using unchanged `f3d6b59b2` source and test, and the other 63 tests passed. Applicable Git runs exclude only `preserves newline characters in worktree paths`; no application change or weakened assertion hides the baseline failure.

Tests use temporary repositories, disposable databases, and synthetic executable provider stubs. They do not access the live Pulse database or send messages through real provider sessions. Actual installed Claude CLI flag compatibility and integrated browser/mobile behavior are not proven by these checks. No browser, dev server, native mobile build, repo-wide test run, or release was needed for this batch.

## Clients, providers, and retained behavior

Web, desktop, and mobile share the changed reconnect runtime. Their entry points, navigation, and IPC contracts are unchanged. Server correctness fixes benefit local, remote, relay, and tunnel clients. Connection-state tests cover session replacement and restart authentication; an end-to-end tunnel deployment was not exercised.

Claude changes apply only to metadata generation. Codex changes apply to protocol input framing. Cursor, Grok, OpenCode, and OMP adapters are unchanged. OMP metadata regression tests and scheduled-chat tests pass alongside the ports. Git changes retain the driver result contracts used by scheduled handoffs. There are no new one-way UI actions or lifecycle states.

No database migration, package version, dependency manifest, lockfile, service endpoint, branding, updater feed, or provider registration changes belong to this batch. Before local integration, SHA-256 checks confirmed all 48 pre-existing modified files in develop remained unchanged, including voice and upstream-baseline display work.

## Deferred compatibility work

The next batches still need separate implementation and validation:

- Reconcile upstream migration 41..49 with Pulse's shipped Issues and Integrations migrations. Do not reuse Pulse IDs 41 or 42.
- Adapt provider capabilities and Antigravity ACP without removing OMP.
- Upgrade Expo 56/React Native 0.85 to the matching upstream native stack before dependent mobile features.
- Reconcile scoped settings, manual ordering, usage pooling, and machine balancing with scheduled chats and Pulse's existing usage view.
- Adapt update/restart continuity to Pulse's installer, rollback, and remote identity behavior.
- Port Windows terminal CPU improvements with their Rust monitor and telemetry-contract changes as one batch.
- Review hosted model manifests, analytics, Connect/auth configuration, and broad export cleanup against Pulse ownership and consumers.

The original compatibility review and full commit inventory remain in `output/upstream-review-2026-09-09/` in the main workspace. Do not advance `evaluatedThrough` across these deferred changes merely because this first batch is tested.
