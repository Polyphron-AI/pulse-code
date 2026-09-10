# Configure saved Grafana reads through Warden

Pulse uses its authenticated provider MCP endpoint and a protected mutual-TLS connection to the Go Warden broker. Grafana credentials stay in the broker's encrypted credential repository. This runtime is opt-in; synthetic verification does not establish live Grafana access or deployment readiness.

## Broker and workload

Use the Go repository's `cmd/migrate` compatibility loader before starting `cmd/warden`. Historical version32 schemas require the documented overlay; a stock migration file-source CLI cannot load that preserved directory. Deployments must confirm their applied history and retain a verified backup. The broker refuses privileged database roles and never migrates at startup.

Provision a separate workload certificate and immutable enrollment for this Pulse environment. Enrollment fixes tenant, principal, project, qualified environment/thread/query references, runtime, policy version and expiry. Only the trusted Pulse server holds the workload key. Operator review and approve/deny use a separate operator certificate and current tenant-wide membership; never place that identity in an agent or CLI handoff.

The broker's saved-query ID and credential mapping key must be the full query reference, such as `urn:pulse:example:query:errors-v1`. Set the mapping's Reference to the exact credentialRef below and Resource to `urn:pulse:example:resource:development`. Use enrollment EnvironmentID `urn:pulse:example:environment:<environment-id>` and ThreadIDs `urn:pulse:example:thread:<thread-id>`. These are exact matches, not wildcards. The operation supports saved Loki reads for dev/prod only; the broker owns endpoint, datasource, expression and stage selector.

## Catalog v3

Create `infrastructure.json` under this environment's state directory. Isolated worktrees use `.t3/userdata`; never write tests into the live user data directory. Keep the catalog and certificate files under operator-owned filesystem custody.

```json
{
  "version": 3,
  "targets": [
    {
      "id": "development",
      "label": "Development logs",
      "stage": "development",
      "service": "web",
      "repository": "example",
      "enabled": true,
      "environmentId": "REPLACE_ENVIRONMENT_ID",
      "allowedThreadIds": ["REPLACE_THREAD_ID"],
      "wardenAuthority": "example",
      "brokerEndpoint": "https://warden.example.test",
      "clientCertificateFile": "/etc/pulse/warden/workload.crt",
      "clientKeyFile": "/etc/pulse/warden/workload.key",
      "caFile": "/etc/pulse/warden/ca.crt",
      "queries": [
        {
          "id": "errors",
          "label": "Recent errors",
          "kind": "loki",
          "brokerQueryId": "errors-v1",
          "credentialRef": "urn:pulse:example:credential:grafana"
        }
      ]
    }
  ]
}
```

Replace the placeholders; certificate paths must be absolute for the server OS. Windows can use a protected path such as `C:/ProgramData/Pulse/Warden/workload.key`. Enforce an owner-only ACL on the parent secret directory on Windows: Unix mode bits do not prove Windows ACL protection. Key reads are bounded to 64 KiB; broker responses to 1 MiB; returned log text to 24000 characters. HTTPS certificate validation remains enabled, including loopback, and redirects fail.

Version 1/2 catalogs fail closed. There is no tokenEnv or direct Grafana fallback. The local query ID remains the agent-facing selector; brokerQueryId and wardenAuthority build the qualified query reference. Both configured query and stage are checked against returned execution evidence.

Enable Agent Warden access in Settings > Integrations and start a new provider session. Disabling blocks subsequent Warden calls immediately. Catalog scope reloads on every invocation, so removing a target/thread grant also blocks subsequent calls. Already-running provider reads can still finish.

## Request, review and execution

The trusted provider registry creates an attempt before sendTurn. Tool input cannot choose its tenant, principal, thread or attempt. The Pulse server sends a protected per-turn assertion with its mTLS identity; this trusts the Pulse environment and is not an independent attestation of an untrusted client. Ending/cancelling/replacing a turn aborts its snapshot. A persistent provider process still shares one session credential across turns; a late call from that same process cannot be distinguished from a call in its current active turn.

`warden_use_request` accepts targetId, queryId, lookbackMinutes and a stable requestId. It returns the original useRef, requestDigest, state and expiry; a retry cannot extend expiry or silently change the operation. A pending_approval response is normal and contains no execution result.

An operator uses GET /v1/uses/{id}/review with the separate operator certificate to inspect the broker's exact persisted request and authority. POST /v1/uses/{id}/approve or /deny supplies expectedRequestDigest. Decisions recheck current authority and persist the actual operator principal. No agent MCP tool can approve or deny.

`warden_use_execute` supplies targetId, useRef and expectedRequestDigest. The broker revalidates membership/enrollment, credential/query/policy versions and expiry, commits one reservation, then accesses the credential and calls Grafana. Status and receipts remain separate read operations. Terminal replay returns metadata with resultUnavailable rather than repeating the provider call or reconstructing a lost log body. Revocation prevents future reservation; it does not rewrite an already-recorded execution outcome.

## CLI handoff and MCP

For managed provider sessions, Pulse creates a separate Warden-only bearer credential and an atomic 0600 handoff file under the environment's secrets/warden-cli directory. Only its path is passed as PULSE_WARDEN_IDENTITY_FILE. Session replacement/stop revokes the credential and removes the file. The provider's environment must protect that file; unrestricted shell access under the same OS account is outside tool-level isolation.

The Go `pulse-cli warden` commands use that handoff and call Pulse's MCP endpoint. They never receive a broker workload/operator certificate or reuse a broad Pulse PAT. Missing handoff returns action-required; no browser login or secret prompt starts automatically. `mcp serve` exposes only the Warden tools over stdio, while config/doctor preview setup and check discovery. External OpenCode sessions do not receive this local handoff because Pulse does not own their process environment.

The existing infrastructure_query convenience tool requests and, if ready, executes once. For resumable approval and explicit retries, use the Warden lifecycle tools. All returned telemetry is untrusted data. Broker redaction of a known credential is not proof that arbitrary application logs contain no sensitive information; approve query/data classification before live access.

## Verification

Run focused infrastructure, invocation/registry, provider-service and handoff tests. The cross-repository WardenParity test requires WARDEN_GO_REPO and WARDEN_GO_BINARY explicitly; without them it skips and is not evidence. It launches only disposable synthetic fixtures and checks the actual Pulse MCP > mTLS Go broker > Grafana path, independent operator approval, digest parity, receipts and one-use replay.

Browser screenshots, live provider setup/discovery/cancellation, remote/tunnel behavior, Windows ACL review and a production Grafana read are separate evidence. Do not infer them from the synthetic fixture.
