# Next T3 compatibility batch

The user requested deployment of the first reliability batch, followed by changes needed for compatibility with the latest stable T3 source. On 9 September 2026 that target remains v0.0.40 at `09e8de9c6`. Pulse keeps its product identity, OMP, Office/Talk, scheduled chats, and independent release version.

This branch starts from reconciled develop `3f18c538c`. Implementation starts after the updated preview installer has been published. Preparing dependencies and reviewing prerequisites do not change the release candidate.

## Selected work

- [x] Publish preview containing the first 11 upstream fixes and retained preview features: [preview .3](https://github.com/Polyphron-AI/pulse-code/releases/tag/pulse-preview-20260909.3), source `7669022658792a8314cc773091552c09ccbb8ceb`. All eight uploaded asset hashes matched local verification.
- [x] Port `f925d6394`, expanded Codex multi-agent event values, including generator overrides and schema regressions.
- [x] Port `94401d01b`, expanded Codex account-plan values and presentation, after the preceding schema work.
- [x] Port `75ab5ab3f` and `95139254b`, accepting rate-limit and policy-error variants on thread read/resume/rollback/fork and turn completion. Preserve generator overrides; full regeneration verification initially encountered HTTP 503 from the pinned source.
- [x] Port `230c5d4a5`, stale Codex approval callback recovery. Retain generic ACP permission-error handling and exercise both forms.
- [x] Port `ea646c083` as a complete Windows terminal performance change, including Rust process-table support, protocol version 3, native client request routing, telemetry contracts, terminal fallback, and server layer wiring.
- [x] Validate native request cleanup, timeout and sidecar termination, alongside the upstream behavioral tests.
- [x] Rebuild the Windows x64 monitor and verify protocol 3 handshake and process-table output with synthetic requests.
- [x] Review cross-provider, scheduled-thread, Office, and remote-client compatibility.
- [x] Run focused tests, changed-file lint, and scoped typechecks; record source provenance and remaining limitations.
- [x] Integrate the verified batch into remote develop without overwriting local work. Pushed `11d7322d873355f7c79e2cee9053577238674397` and verified the remote ref. The main workspace's 48 pre-existing modified files remain untouched.

## Boundaries

Codex changes must preserve Pulse model classification, provider settings, and OMP behavior. No new database migration is required. Do not use the upstream provider list as a replacement for Pulse's list.

The native monitor protocol is local to each environment. Version 3 requires the matching executable; a TypeScript-only deployment is incomplete. Keep one shared native-client layer so terminal polling does not spawn a second monitor. Preserve MailService wiring added by the reconciled Office work. Preserve existing telemetry error exports and health reporting. A failed monitor must retain the fallback path, with its slower activity updates explicitly documented.

Do not add Antigravity, machine balancing, scoped-settings redesign, mobile native upgrades, or async-question UI opportunistically. Async questions need a coordinated follow-up covering durable message-mode requests, freeform answers, finality, settlement, and OMP/scheduler invariants. Restart continuation is another separate persisted-session feature. Do not advance the full upstream baseline from this small batch alone.

No live database, audio capture, provider session, browser, or desktop restart is needed for this implementation. Use synthetic protocol data and temporary Git/database/test state. Reuse three agents with isolated ownership and independent review.
