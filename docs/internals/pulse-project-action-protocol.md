# Pulse project-action protocol

Pulse Code exposes `pulse issues action --input -` as a local bridge to the
running server. The CLI mints a short-lived local admin session, exchanges it
for a WebSocket ticket, and calls the typed issues RPC. Pulse credentials and
project mappings stay in the server process.

## Wire contract

Requests use this envelope:

```json
{
  "protocol_version": 1,
  "request_id": "reports-1",
  "action": "bugs.list",
  "params": {
    "limit": 100
  }
}
```

Responses repeat the three identity fields, include `ok`, and contain exactly
one of `data`, `selection_required`, or `error`. The bridge redacts underlying
transport errors and never returns credentials.

## Capability boundary

The server advertises `issuesProjectActions` only when its build contains the
authorized `listProjectReports` handler. The first version executes
`bugs.list`. It rejects other registry actions with `unsupported_action` and
reports a missing server method as `capability_unavailable`.

`IssuesService` resolves the current project mapping, rejects cross-project
results, and delegates to `PulseIssuesClient`. The client calls `/api/bugs`
with `projectId`, `created_after`, `limit`, and `offset`. Pulse Code translates
PulseGo's offset pagination into a stable opaque cursor and returns summary
rows. Evidence is loaded only by later detail calls.

The RPC contract accepts `cursor` and `limit`. It applies a 30-day lookback to
the first page. It does not accept a caller-provided lookback or all-history
mode yet, so the CLI rejects those parameters.

## Recovery and version skew

| condition                             | response                                   |
| ------------------------------------- | ------------------------------------------ |
| server is not running                 | `transport_unavailable`                    |
| connected server lacks the capability | `capability_unavailable`                   |
| project mapping is missing or invalid | typed selection or mapping error           |
| action or parameter is unsupported    | `unsupported_action` or `validation_error` |
| upstream Pulse call fails             | redacted typed upstream error              |

Retry after starting the server, updating Pulse Code, or repairing the project
mapping. Never fall back to passing the server's Pulse token through the CLI.

## Verification

```bash
vp test run apps/server/src/cli/issues.test.ts apps/server/src/bin.test.ts \
  packages/contracts/src/environment.test.ts \
  apps/server/src/auth/RpcAuthorization.test.ts
vp run --filter t3 typecheck
vp run --filter @t3tools/contracts typecheck
```

**Created:** 2026-08-27 . **Last opened:** 2026-08-27 . **Last edited:** 2026-08-27 . **Status:** stable . **Owner:** Pulse Code
