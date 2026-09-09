# T3 protocol compatibility, 9 September 2026

This batch follows the published Pulse preview .3 and starts from reconciled develop `3f18c538c`. Its source boundary is T3 v0.0.40, `09e8de9c655ae85410bf6b00446f272a01da81c7`. The recorded upstream baseline remains unchanged: these selected ports do not establish full v0.0.40 compatibility.

## Selected changes

| Upstream commit | Compatibility problem                                                               | Integration scope                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `f925d6394`     | New Codex multi-agent event values fall outside older literal unions.               | Accept the added values in generated schemas and retain generator overrides.                                                    |
| `94401d01b`     | New Codex account-plan values can fail decoding or lack display labels.             | Expand schema values and provider labels without replacing Pulse's model or provider classification.                            |
| `75ab5ab3f`     | Rate-limit error variants are missing from several response schemas.                | Keep thread read/resume/rollback/fork and turn-completion decoding consistent.                                                  |
| `95139254b`     | Policy-error variants are missing from the same response paths.                     | Update both generated schemas and their generator input overrides.                                                              |
| `230c5d4a5`     | A stale Codex approval callback is reported as a generic provider error.            | Normalize the stale-callback error while retaining generic ACP stale-permission behavior; do not silently resolve the approval. |
| `ea646c083`     | Windows terminal activity polling repeatedly starts external process-list commands. | Add a native process-table request and route terminal polling through the shared monitor, with fallback on failure.             |

The schema problems follow from strict decoding of values outside known literal unions. No failure against a live Codex session was needed or claimed to identify them.

## Deployment boundary

The native protocol changes from 2 to 3. The server and native monitor executable must ship together. An older executable fails the handshake and leaves telemetry unavailable while terminal polling uses its slower fallback. Existing desktop packaging builds and stages the monitor from the same source.

This protocol belongs to the server's local child process. Web, desktop, mobile, and remote clients keep their existing telemetry and terminal wire contracts. Provider adapters and scheduled-thread lifecycle decisions must not depend on terminal activity samples. The shared monitor layer must remain memoized so terminal polling and telemetry do not spawn separate monitors.

The already published preview .3 contains the preceding correctness batch. It does not contain this later compatibility batch.

## Verification

The Codex branch passed 22 focused tests covering schema values, provider behavior, collaboration events, and both ACP and Codex stale callbacks. Running the selected regressions against unchanged production files produced six expected failures while the existing generic ACP case passed; restoring the ports passed all seven selected cases. Changed-file lint and the Codex/server package typechecks passed. A separate integrated pass covered 30 OMP and scheduled-thread tests.

The native branch passed 105 tests across native-client lifecycle, terminal management, diagnostics, telemetry models, and history. Fifteen Rust tests and the locked release build passed. The actual Windows x64 executable completed a protocol-3 handshake, returned 633 process rows containing only PID, parent PID, and name, and shut down with exit code zero. Its SHA-256 is `ef81026391a22bc256177163ee84390e30f3de8fad39752d0be2993e83ba4199`. The receipt and verification script are retained in the main workspace's `output/upstream-review-2026-09-09/native-protocol3/`.

Independent review added cleanup around request registration, a timeout covering both stdin writes and replies, and pending-request failure on service shutdown. Regressions exercise concurrent request IDs, late replies, stalled writes, cancellation, exit, event-stream closure, and service-scope closure. The combined integration passed another 31 schema, native-protocol, and scheduled-decider tests. Source commits are `8c2050396` for Codex and `d4c2b313f` for the native batch.

The combined server and contracts typechecks passed, retaining unrelated existing Effect suggestions. Both implementation branches passed changed-file lint. No dependency, database migration, provider registry, or live environment state changed.

The full reactor-suite attempt produced no output and was stopped through its owned tool session. Both changed reactor cases passed with two workers and explicit worker drains. This is focused verification, not a claim that the full reactor suite passed.

Generator overrides were preserved and independently reviewed against the generated schemas. Full regeneration was attempted twice but the pinned source returned HTTP 503 before any generated output was written. The alternate GitHub contents API returned the exact pinned file successfully, but fetching all 273 files would exceed the remaining anonymous request budget. Full regeneration remains unverified; neither the pinned revision nor dependencies were changed to work around the outage.

## Remaining work toward v0.0.40

| Area                                | Required direction                                                                                                                                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Async Codex questions               | Port message-mode request contracts, durable lookup, atomic settlement with normal turn submission, pending retention, freeform web/mobile answers, cleanup and finality together. Keep OMP's blocking ACP responses and scheduled occurrence completion intact. |
| Restart continuation                | Use a separate persisted-session recovery change with environment-owned opt-in. Codex supports promptless continuation; other providers need their existing explicit path.                                                                                       |
| Database migrations                 | Reconcile upstream migrations 41–49 with Pulse's shipped Issues and Integrations migrations; never reuse occupied IDs 41 and 42.                                                                                                                                 |
| Mobile stack                        | Upgrade Expo 56/React Native 0.85 to the matching upstream native stack before dependent mobile changes.                                                                                                                                                         |
| Provider and settings features      | Adapt capabilities, scoped settings, ordering, usage pooling, and machine balancing around OMP, scheduled chats, and Pulse's existing usage view.                                                                                                                |
| Hosted services and release tooling | Preserve Pulse-owned endpoints, auth, branding, analytics choices, and installer behavior when importing upstream changes.                                                                                                                                       |

The larger compatibility inventory remains in `output/upstream-review-2026-09-09/` in the main workspace. Deferred source commits are not implicitly accepted or rejected.
