# Configure agent access to infrastructure telemetry

Pulse Code exposes `infrastructure_list_targets` and `infrastructure_query` through its authenticated provider MCP endpoint. This first version reads saved Prometheus and Loki queries through the open-source Grafana MCP server. It does not deploy infrastructure, restart services, query traces, or install telemetry instrumentation.

## Prepare Grafana MCP

Use an existing Grafana instance with Prometheus and/or Loki data sources. Run a reviewed, pinned release of [Grafana MCP](https://github.com/grafana/mcp-grafana) with streamable HTTP, `--disable-write`, and `--enabled-tools prometheus,loki`. Set `GRAFANA_URL` and a read-only `GRAFANA_SERVICE_ACCOUNT_TOKEN` on that service. Set `MCP_GRAFANA_SERVER_TOKEN` to a separate caller-authentication secret. Pulse receives that caller secret, not the Grafana service-account token.

Use the MCP service's `/mcp` endpoint. Remote endpoints require HTTPS; HTTP is allowed only for loopback. Pulse rejects embedded URL credentials, query strings, fragments, and redirects. Match the endpoint to the installed Grafana MCP release. The adapter negotiates MCP 2025-03-26, 2025-06-18, or 2025-11-25 and accepts JSON and finite SSE request responses. It does not implement legacy HTTP+SSE, OAuth, resumable streams, or server-initiated requests.

## Configure targets

Create `infrastructure.json` under the environment's resolved userdata/state directory. In an isolated worktree this is normally `.t3/userdata/infrastructure.json`. Do not edit the live developer database or start a test server against it.

```json
{
  "version": 1,
  "targets": [
    {
      "id": "techtraders-production",
      "label": "TechTraders production",
      "stage": "production",
      "service": "inventory-worker",
      "repository": "techtraders",
      "enabled": true,
      "allowedThreadIds": ["REPLACE_WITH_THREAD_ID"],
      "mcpEndpoint": "https://REPLACE_WITH_GRAFANA_MCP_HOST/mcp",
      "tokenEnv": "TECHTRADERS_GRAFANA_MCP_TOKEN",
      "queries": [
        {
          "id": "worker-errors",
          "label": "Inventory worker errors",
          "kind": "loki",
          "datasourceUid": "REPLACE_WITH_LOKI_UID",
          "expression": "{service_name=\"inventory-worker\",deployment_environment_name=\"production\"} |= \"error\""
        },
        {
          "id": "worker-up",
          "label": "Worker scrape availability",
          "kind": "prometheus",
          "datasourceUid": "REPLACE_WITH_PROMETHEUS_UID",
          "expression": "up{job=\"inventory-worker\",environment=\"production\"}"
        }
      ]
    }
  ]
}
```

This is an illustrative configuration, not a discovered TechTraders topology. Replace labels and expressions with those present in your telemetry. The `up` metric describes scrape success, not business-process health. Configure a separate target ID, data source or stage-filtered expression, and thread grant for development. Target stage is descriptive metadata: the saved expression and data-source permissions enforce actual data isolation. PromQL offsets and range selectors can read outside the evaluation window, so review saved expressions accordingly.

Supply the referenced token in the environment of the Pulse server. In desktop mode this is the backend server process; client-side environment variables do not configure it. Granting a thread allows its configured provider to receive query results. Protect the configuration and token using the host's permissions, and instrument/redact logs at the source before granting access. Agents with unrestricted shell access under the server's OS account are outside this tool-level isolation boundary.

The thread ID appears in its chat URL. After configuration, ask that thread's agent to list infrastructure targets, then run `worker-errors` over the last five minutes. A new provider session may be needed after upgrading Pulse to discover the new tools.

## Limits and revocation

- No file means no access. Invalid configuration fails closed without returning its contents.
- Catalogs are limited to 256 KiB, 50 targets, 20 queries per target, and 100 thread grants per target.
- Remove a thread grant, set `enabled` to false, or remove the target to revoke subsequent calls. Configuration reloads per invocation. Calls already in flight can finish.
- Rotate the caller token and restart the Pulse server to replace an environment-variable credential.
- Queries cover the last 1 to 60 minutes. Metrics use at most 121 evaluation timestamps per series for the supplied interval. Loki requests at most 100 lines; upstream limits may be lower.
- Upstream response bodies are limited to 1 MiB. Returned text is clipped at 24,000 characters with `outputTruncated: true`. Other upstream sampling or truncation remains in the evidence text.
- Calls time out after 20 seconds; session cleanup has a separate two-second maximum. Query failures return a generic error. Completion/failure logs include target/query/thread identifiers without query results or credentials.

Evidence appears in the existing thread tool history on web, desktop, and mobile. Codex, Claude, Cursor, Grok, and managed OpenCode reuse their existing Pulse MCP wiring. Externally managed OpenCode does not receive automatic MCP injection. No dedicated infrastructure settings page or mobile navigation is shipped in this version.

## Telemetry collection

Instrument the application using OpenTelemetry and label signals with service name, deployment stage, and deployed revision. An [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) receives and routes signals to your monitoring backends. Keep telemetry storage, retention, alerting, and detailed dashboards outside Pulse Code.

For a disposable local pilot, [Grafana's otel-lgtm image](https://github.com/grafana/docker-otel-lgtm) bundles the Collector, Grafana, and signal backends. It is explicitly for development/testing. Do not use that single-container pilot as the production monitoring deployment. Production collection and retention depend on TechTraders' hosting platform, which has not yet been specified.

## Verification

Run the focused server tests:

```sh
vp test run src/infrastructure/Infrastructure.test.ts src/infrastructure/GrafanaMcp.test.ts src/mcp/McpHttpServer.test.ts src/mcp/McpInvocationContext.test.ts src/mcp/McpSessionRegistry.test.ts
```

Run this command from `apps/server`. Tests use disposable state and synthetic Grafana MCP responses. A real Grafana/TechTraders connection still needs acceptance testing after configuration. No production access is implied by passing these tests.
