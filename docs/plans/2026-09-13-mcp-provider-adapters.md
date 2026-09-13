# Claude and OpenCode managed MCP adapters

User approved extending the existing MCP feature to Claude and OpenCode.
The active record in `docs/internals/pulse-next-migration.json` owns progress and
acceptance. Follow `docs/operations/pulse-feature-delivery.md` for delivery.

## Decision

Reuse the existing picker, durable configuration, preparation claims and send
gate. Translate configuration and native status inside each provider adapter.
Keep the existing Codex capability and add optional provider-specific flags so
old servers default to unsupported without changing ordinary sends.

Claude uses SDK session configuration and MCP status. Preserve native setting
sources and the existing `t3-code` connection when replacing SDK-owned servers.
OpenCode uses MCP configuration and status on its thread-owned server. Do not
modify an externally shared OpenCode server: it cannot isolate each thread's
managed selection. Report this limitation before submitting the prompt.

OpenCode cannot represent a different working directory for each stdio server.
Reject an incompatible explicit directory rather than silently ignoring it or
introducing shell wrappers. Keep unknown readiness distinct from confirmed
connection failure. Native errors must not expose configuration secrets.

## Alternatives not selected

- Writing provider home or project configuration would leak thread choices into
  other sessions and make deselection unreliable.
- A separate Pulse MCP proxy would duplicate connection ownership, authentication
  and lifecycle machinery that the providers already supply.

## Verification

One Sol owns the combined contracts, adapters, UI gates and focused tests in an
isolated worktree. Astra integrates and another Sol reviews the frozen feature.
Tests cover native configuration preservation, HTTP and stdio translation,
readiness failure and recovery, thread isolation, session reuse and cleanup,
modern and tokenless sends, and the provider capability matrix. Register adapter
coverage in the upstream-update pipeline. Do not contact live providers or MCP
services for synthetic tests. Packaged and real-provider evidence remains a
separate release gate.
