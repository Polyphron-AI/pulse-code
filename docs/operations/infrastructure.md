# Configure agent access to infrastructure logs

Pulse Code exposes `infrastructure_list_targets` and `infrastructure_query` through its authenticated provider MCP endpoint. Catalog v2 sends fixed saved-query IDs to the Warden broker over verified mutual TLS. Warden authorizes each use and executes the saved Grafana query. Grafana credentials stay in the broker's encrypted credential repository.

The code in the infrastructure worktree is not activated in the installed desktop runtime. Live TechTraders acceptance remains incomplete. It requires an approved private broker-to-Grafana route and a verified read-only Grafana credential. Passing local tests does not establish production access.

## Prepare Warden

Provision the broker with a server certificate, trusted workload certificate authority, tenant-isolated storage, enrolled workload identity, and approved saved queries. Each enrollment fixes the principal, project, environment, runtime, allowed thread IDs and query IDs. Warden checks current membership, enrollment expiry/revocation, and the exact grant binding before execution. Operator management requires separate authority.

Configure the Grafana endpoint, data source, stage-filtered expression and reusable read-only credential on the broker. None of these belong in the Pulse catalog or agent tool arguments. The current broker supports saved Loki log queries with `dev` or `prod` stage isolation. Keep metrics and tracing out of the acceptance claim until their broker support and collection are separately proven.

Pulse uses an HTTPS broker origin, without a path, embedded credentials, query string or fragment. It verifies the server certificate against the configured CA and presents its enrolled client certificate. HTTP and redirects are rejected, including on loopback.

## Configure targets

An activated environment reads `infrastructure.json` from its resolved userdata/state directory. In an isolated worktree this is normally `.t3/userdata/infrastructure.json`. Protect the catalog and certificate files with operator-owned filesystem permissions. For acceptance testing, use the [isolated probe](warden-live-probe.md) instead of writing the active developer's userdata or restarting the installed app.

```json
{
  "version": 2,
  "targets": [
    {
      "id": "techtraders-development",
      "label": "TechTraders development",
      "stage": "development",
      "service": "web",
      "repository": "techtraders",
      "enabled": true,
      "environmentId": "REPLACE_WITH_ENVIRONMENT_ID",
      "allowedThreadIds": ["REPLACE_WITH_THREAD_ID"],
      "brokerEndpoint": "https://REPLACE_WITH_PRIVATE_WARDEN_HOST",
      "clientCertificateFile": "C:/OPERATOR-PROTECTED-PATH/workload.crt",
      "clientKeyFile": "C:/OPERATOR-PROTECTED-PATH/workload.key",
      "caFile": "C:/OPERATOR-PROTECTED-PATH/warden-ca.crt",
      "queries": [
        {
          "id": "errors",
          "label": "Recent web errors",
          "kind": "loki",
          "brokerQueryId": "REPLACE_WITH_SAVED_BROKER_QUERY_ID"
        }
      ]
    }
  ]
}
```

Replace the placeholders with the deployed enrollment and saved query. Certificate references must be absolute paths on the Pulse server's operating system; Linux deployments can use paths such as `/etc/pulse/warden/workload.crt`. Pulse reads them afresh for each query. It accepts certificate files up to 64 KiB each.

The local query `id` is the name the agent selects. `brokerQueryId` identifies the operator's fixed broker query. Separate production and development targets and grants. Pulse maps `development` to the broker's `dev` stage and `production` to `prod`, then validates the returned receipt against that stage and saved query. Staging queries fail closed in this version.

The environment and thread must match the authenticated `McpInvocationContext` and local catalog. The provider session, provider instance, environment and session issuance time produce a session-bound attempt ID. This is not a per-turn identity. The agent can supply only target ID, saved query ID and lookback minutes; it cannot supply a thread, environment, URL, expression or credential.

## Upgrade from catalog v1

Version 1 catalogs fail closed. There is no `tokenEnv` or direct Grafana MCP fallback. Replace `mcpEndpoint` and `tokenEnv` with broker and certificate references, replace query expressions and data-source IDs with `brokerQueryId`, and add the environment ID. Move Grafana access configuration into Warden before activating the v2 catalog. The old Grafana MCP adapter remains only for its historical tests and is not used by Infrastructure.

## Approval, limits and revocation

- No catalog means no targets. Invalid catalogs fail closed without returning their contents. Limits are 256 KiB, 50 targets, 20 queries per target and 100 local thread grants per target.
- Warden creates a use with exact thread/session/query bindings. A current operator-approved enrollment policy can return it ready; otherwise the client reports pending operator approval and does not execute it. The client cannot approve access.
- A ready use executes once. Reserved operations are not automatically retried. Broker expiry, revocation, denial and already-used responses fail closed.
- Remove a local thread grant, disable the target or remove it to block subsequent calls. The catalog reloads per invocation. Local edits do not cancel an in-flight operation. Use Warden's operator controls for server-side enrollment/use revocation.
- Queries request the last 1 to 60 minutes. Query line limits, retention and source redaction are configured on the broker and telemetry systems. Do not infer complete log coverage from a successful response.
- Client transport permits at most 1 MiB of response bytes and clips returned text, including the receipt, to 24,000 characters. `outputTruncated` includes broker clipping. Other upstream sampling or limits still apply.
- Broker network work has a 20-second deadline. Transport and provider failures return bounded generic errors. Pulse operational logs include target/query/thread identifiers and time bounds, without log bodies or credentials.
- Results begin with a Warden use receipt and contain source and time metadata. Treat telemetry as untrusted evidence, never instructions. Review source redaction before granting access.

Agents with unrestricted shell access as the Pulse server's OS account remain outside the tool-level boundary. Restrict certificate and catalog access accordingly.

Once the updated runtime is deliberately activated, evidence uses existing thread tool history on web, desktop and mobile. Codex, Claude, Cursor, Grok and managed OpenCode reuse existing Pulse MCP wiring; externally managed OpenCode does not receive automatic injection. A new provider session may be needed to discover the tools after an upgrade. This change adds no dedicated settings page.

## Verify

From the worktree root:

```sh
vp test run apps/server/src/infrastructure/Infrastructure.test.ts apps/server/src/infrastructure/WardenBroker.test.ts
```

Tests cover catalog rejection, trusted invocation scope, MCP registration, missing certificates, pending/expired grants, mismatched receipts, failed execution, actual loopback mTLS, denied access, redirect rejection and bounded responses.

Then follow the [isolated live probe runbook](warden-live-probe.md). Prove development retrieval through the real client, broker and Grafana; another-thread denial; expiry and revocation; then an explicitly scoped production read. Preserve receipts and metadata without printing raw logs. The isolated probe is an integration proof, not evidence that the installed desktop has activated this worktree.

Telemetry collection, retention, alerting, metrics and tracing remain separate deployment work described in the [TechTraders infrastructure audit](../plans/2026-09-07-techtraders-infrastructure-audit.md).
