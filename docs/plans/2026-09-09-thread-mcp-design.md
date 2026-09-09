# MCP defaults and thread selection

Approved scope: saved MCP connections, provider-specific Always available defaults, and immediate thread toggles. Spawned subagent configuration is outside this change.

The existing provider launch adapters already inject Pulse's browser MCP. Extend those adapters with selected external connections. Keep definitions in server settings, connection payloads in ServerSecretStore, and non-secret per-thread overrides in server settings. Null restores the provider default; false explicitly disables a default connection. This avoids putting credentials in event history or provider config changes that rebuild all live instances.

Settings → Providers owns connection creation, replacement, removal and provider defaults. A compact composer popover owns thread switches, Use defaults, and a Manage MCPs entry point. Reuse Pulse's buttons, switches, dialogs and tokens. No new navigation destination or visual theme.

At session start and recovery, resolve a thread's selection. Before sendTurn compare its connection fingerprint with the launched snapshot. If changed, preserve the durable resume cursor and working directory and restart only that idle thread. Do not stop active work. Errors stay visible and never silently grant a different toolset.

Codex uses process environment references for headers and a stdio bridge to isolate colliding environment names. Claude uses SDK connection objects; Cursor and Grok use ACP session MCP fields. OpenCode's shared registry and OMP are explicitly unavailable pending isolation/support. Web and Electron share the UI. Mobile consumes server behavior but has no new controls in this desktop feature.

Validation: settings round-trip and credential redaction; defaults, disable and reset semantics; per-thread isolation; converters and stdio child process test; resumable reconnect and no interruption of an active turn; config import validation; affected typechecks, adapter tests and preview packaging checks. Browser acceptance requires separate authorization under AGENTS.md.
