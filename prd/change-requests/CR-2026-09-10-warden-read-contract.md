# CR-2026-09-10: Executable Warden read binding

Status: implemented contract increment, runtime adoption pending. The owner selected the saved-query Grafana reader as the first end-to-end Warden operation and authorized proceeding with its implementation.

Add identical closed request/authority schemas, independently hashed fixtures, a pinned-validator script and a fixed-order UTF-8 binding specification in Pulse Go and Pulse. Go implements strict parsing and SHA-256 binding; Pulse implements shared value validation and canonical serialization. This resolves the encoding ambiguity in the proposed MCP/CLI contract without changing its authorization ownership.

The [binding specification](../warden/read-v1.md) records required/null rules, ASCII reference grammar, binary64 number normalization, integer seconds, exact field order and safe public error behavior. The [reconciliation report](../warden/reconciliation-2026-09-10.md) records migration and turn-identity prerequisites for runtime adoption.

No endpoint, command, database, deployment or client UI is enabled by this change. Full T3 policy/status fixtures and the end-to-end Pulse/MCP/CLI proof remain open. Validate the paired fixture/schema bytes and focused native tests before adoption; a syntactically valid binding does not authorize execution.
