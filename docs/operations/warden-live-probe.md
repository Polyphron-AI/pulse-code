# Isolated Warden client probe

`apps/server/scripts/warden-live-probe.ts` runs the real Infrastructure service and WardenBroker transport against an operator-provisioned broker. It copies an explicitly supplied catalog into a fresh temporary directory and removes that directory on exit. It does not open the live database, start a web server, or restart the installed desktop app.

The probe creates an operator-controlled `McpInvocationContext` with provider instance `warden-infrastructure-probe` and a fresh `operator-probe-...` session. Its receipt proves the client-to-broker-to-Grafana path. It does not prove that the installed desktop or its active provider session has the new integration.

## Provisioning

Create a separate workload certificate enrollment for this probe. Fix its tenant, principal, project, environment, runtime, allowed thread IDs and saved query IDs in Warden. Enable only approved read-only queries. Keep certificate, key and CA files outside the repository in an operator-protected directory. The broker must report query stages as `dev` or `prod`; the catalog uses `development` or `production`.

The following environment/thread pair was confirmed by a read-only inspection of the active conversation on 2026-09-09:

- Environment: `3ab66921-a128-46a5-a628-886def24b42b`
- Thread: `a78e25f3-2b15-4f3b-a411-1da61dd85209`

These identifiers alone do not grant access. Use them only in a separately approved probe enrollment. The installed runtime remains unchanged.

Create a catalog v2 file outside live userdata. Replace the hostname, certificate paths and broker query ID with the deployed values:

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
      "environmentId": "3ab66921-a128-46a5-a628-886def24b42b",
      "allowedThreadIds": ["a78e25f3-2b15-4f3b-a411-1da61dd85209"],
      "brokerEndpoint": "https://WARDEN-PRIVATE-HOST",
      "clientCertificateFile": "C:/OPERATOR-PROTECTED-PATH/workload.crt",
      "clientKeyFile": "C:/OPERATOR-PROTECTED-PATH/workload.key",
      "caFile": "C:/OPERATOR-PROTECTED-PATH/warden-ca.crt",
      "queries": [
        {
          "id": "errors",
          "label": "Recent errors",
          "kind": "loki",
          "brokerQueryId": "OPERATOR-CONFIGURED-QUERY-ID"
        }
      ]
    }
  ]
}
```

## Run

From the infrastructure worktree:

```powershell
node --experimental-strip-types apps/server/scripts/warden-live-probe.ts --catalog 'F:/Dev Ops/tmp/warden-probe/infrastructure.json' --environment-id '3ab66921-a128-46a5-a628-886def24b42b' --thread-id 'a78e25f3-2b15-4f3b-a411-1da61dd85209' --target-id techtraders-development --query-id errors --lookback-minutes 5
```

A successful command exits zero and prints JSON containing the broker use receipt, environment/thread, session-bound attempt hash, source, time bounds, content character count and SHA-256, and truncation status. It never prints log bodies, certificate material or provider error details. A failed command exits nonzero with a bounded error code. A pending operator approval is a failure for this proof, not a skipped test or a successful retrieval.

For a cross-thread broker denial, create a separate probe catalog that locally permits a second thread while the broker enrollment permits only the original thread, then invoke the second thread ID. That deliberately exercises broker authorization instead of stopping at the local catalog filter. Confirm the denial in the broker audit.

To prove enrollment expiry and revocation, expire or revoke the isolated probe enrollment through operator authority, rerun the same command, and confirm nonzero exit plus broker denial audit. Do not revoke a shared desktop workload. Neither the client nor probe retries a reserved execution.

Run development proof and denial cases before provisioning a production target. Save only the probe JSON metadata and corresponding broker audit receipts as evidence. A nonempty transport response alone does not establish that matching error entries exist; inspect the bounded query result privately if that distinction is required.
