# Warden in the V40 preview

The combined preview includes Warden contracts `49e841c33` and runtime `7260c2897`, verified against the remote Warden branch on 2026-09-10. It preserves the fixed T3 v0.0.40 target and the preview's Office, Talk, dictation and file-download work.

Warden saved Grafana reads require explicit environment opt-in, catalog version 3, workload enrollment and an independently deployed compatible Go broker. Version 1 and 2 catalogs are rejected. Operators must migrate the catalog and enrollment using [the configuration guide](../operations/infrastructure.md); the installer does not migrate credentials or grant infrastructure access.

The provider merge retains V40 compaction, usage and startup changes. Warden access closes before publishing terminal events, including V40's `turn.aborted` event. Managed Codex, Claude, Cursor, Grok, OpenCode and Antigravity sessions receive the appropriate local handoff. External OpenCode sessions have MCP access only where configured. OMP has no Warden transport integration in this preview. Mobile uses its connected environment's setting; its client has no dedicated Warden toggle.

Focused synthetic checks cover contracts, broker validation, session credentials, CLI handoff, settings and provider lifecycle. The cross-repository test explicitly uses Go checkout `418a823645704b2ebd4c843d1aa46f0b0bd48ff6` and Go 1.26.3. It exercises Pulse MCP, mTLS, the actual Go broker and a synthetic Grafana fixture, including independent approval, digest matching, receipts and replay protection. This is not a live Grafana or real provider acceptance result.

Warden PR #9's full CI is not green: its run reports formatting failures in existing scheduler state files and two timeouts in unchanged client-runtime integration tests. These are outside the Warden patch; they are not evidence of a passing full suite. Scoped verification for the combined preview is recorded separately with the release artifacts.

Full V40 compatibility, installed-app update acceptance, production Warden deployment, real provider discovery/cancellation, remote/tunnel Warden acceptance and Windows credential-directory ACL review remain unverified.
