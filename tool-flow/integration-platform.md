# Integration platform — Tool flow

> Define the smallest server-owned adapter boundary that can support durable provider connections,
> mapped context, deliberate actions, and capability-skewed clients.

## Owning modules

- **Contracts:** `packages/contracts/src/integrations.ts`, with provider-specific resource contracts
  retained beside their domains.
- **Shared client runtime:** `packages/client-runtime/src/state/integrations.ts`, capability-gated and
  environment-scoped.
- **Server domain:** `apps/server/src/integrations/`, including additive shared persistence and a
  provider-neutral lifecycle service.
- **Reference adapter:** native `apps/server/src/issues/`, landed independently in `ac8d94397` and
  wrapped through `IntegrationAdapter.ts` without moving its records.
- **Clients:** `apps/web`, desktop wrapper, and `apps/mobile` capability-appropriate surfaces.

The integration domain owns connection/mapping/capability primitives. It does not own Issue, pull
request, trace, or usage semantics; adapters and domain contracts do.

## Models touched

| Model                       | Key fields                                                                     | Notes                                                          |
| --------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `IntegrationConnection`     | environment, provider, account hint, endpoint, state, health times, secret ref | New provider-neutral record; no credential value.              |
| `IntegrationMapping`        | connection, Pulse Code project, provider workspace/project IDs                 | Explicit many-project mapping with provider metadata snapshot. |
| `IntegrationResourceLink`   | project/thread, provider, resource kind and stable ID                          | Non-secret continuity link.                                    |
| `IntegrationAuditReceipt`   | actor, capability, target, result, timestamp                                   | Append-only action evidence; retention TBD.                    |
| Current Pulse Issue records | endpoint, project mapping, thread link                                         | Reference behavior to migrate without data loss.               |

Migration remains intentionally additive. Shared records/contracts were introduced alongside the
native Pulse Issue tables. The reference adapter reads and mutates the existing Issues lifecycle as
its authority and projects credential-free shared snapshots; no destructive rename, ID rewrite, or
secret migration occurs. The legacy-shape compatibility fixture and native store regressions prove
old connection, project-mapping, and thread-link records remain readable.

## External services

| Service                     | Purpose                                              | Client boundary                                                        |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Pulse                       | Reference tickets/Reports/projects/evidence provider | Existing `PulseIssuesClient` adapter.                                  |
| Source hosts                | Pull requests and future work items                  | Existing host CLI/API adapters; do not force into Pulse Issues shapes. |
| Future Linear/Sentry/etc.   | Roadmapped work/evidence providers                   | New adapters only after discovery.                                     |
| OAuth authorization servers | Durable delegated authorization                      | Server callback and `ServerSecretStore`; client receives state only.   |

## Background work

| Work            | Trigger                                                      | Behavior                                                       |
| --------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Health check    | settings open, explicit retry, bounded schedule if justified | Validate credential/capabilities; update non-secret health.    |
| Refresh         | resource open or stale bounded cache                         | Fetch only requested page/detail; emit typed result.           |
| Webhook receipt | verified provider delivery                                   | Dedupe and invalidate/refresh; never trust as canonical state. |
| Audit receipt   | completed connection or provider action                      | Persist non-secret actor/target/result metadata.               |

No permanent polling loop is assumed. Adapter-specific polling requires a measured freshness need and
must remain bounded when no consumer is active.

## API and transport boundary

| Operation                                                 | Purpose                                                          | Pulse Code auth       |
| --------------------------------------------------------- | ---------------------------------------------------------------- | --------------------- |
| `integrations.listConnections`                            | credential-free connection state, health, and capabilities       | orchestration read    |
| `integrations.disconnect`                                 | remove the server-owned secret and disconnect the shared record  | orchestration operate |
| `integrations.setProjectMapping` / `removeProjectMapping` | map a Pulse Code project to provider scope                       | orchestration operate |
| `integrations.issueContext`                               | bounded summary/detail context through the native Issues adapter | orchestration read    |
| `integrations.issuePreviewStatus`                         | create an expiring, session-scoped mutation preview              | orchestration operate |
| `integrations.issueConfirmStatus`                         | confirm the exact preview and return an audit receipt            | orchestration operate |

The authenticated WebSocket session constructs the integration lifecycle/context services around the
owning environment's native Issues service. Reconnect invalidates pending confirmation tokens. The
client runtime routes every request through that environment supervisor, so direct, relay, and tunnel
connections share one typed boundary. Mobile binds the same runtime and aggregates redacted snapshots
without moving credentials into client state.

Existing native Issues methods remain supported as compatibility aliases. Servers advertise the
optional `integrations` capability additively; older or unsupported environments mount no integration
queries and receive no integration methods.

## Happy-path sequence

```text
User/Agent -> Client -> typed environment RPC -> authorization + capability gate
                                              -> integration connection + mapping
                                              -> provider domain adapter -> External provider
                                              <- validated bounded response
            <- source/freshness/action preview <- audit receipt on mutation
```

## Failure modes

| Failure                      | User-visible impact                      | Retry/recovery                                                            |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Missing/expired credential   | Provider unavailable for one environment | Reauthorize; do not send blind retries.                                   |
| Mapping absent/stale         | Project-scoped operation blocked         | Explicit map/remap.                                                       |
| Capability absent            | Surface/action unavailable               | Hide call, show version/provider limitation.                              |
| Rate limit                   | Data stale with typed retryability       | Honor provider reset/backoff; preserve other providers.                   |
| Invalid provider response    | Resource not rendered                    | Reject at adapter boundary and record diagnostics without sensitive body. |
| Conflict/version mismatch    | Mutation not applied                     | Refresh and ask user to review preserved intent.                          |
| Webhook spoof/replay         | No state change                          | Reject signature/duplicate before processing.                             |
| Client disconnect mid-action | Result may be unknown to client          | Idempotency/action receipt lets reconnect reconcile.                      |

## Cross-references

- PRD: [Pulse integrations](../prd/10-pulse-integrations.md)
- Sitemap: [Integration surfaces](../sitemap/integrations.md)
- Workflows: [Connect and map](../workflows/connect-and-map-integration.md),
  [Use integration context](../workflows/use-integration-context.md)
- AC: [Integration foundation](../prd/20-acceptance-criteria/integration-foundation.md)

## Open questions

- Audit retention, shared-server connection ownership, and OAuth callback origin strategy are TBD.
- A second adapter must still prove whether the demonstrated connection/health/mapping seam is the
  correct long-term abstraction before it is declared stable.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-20 . **Last edited:** 2026-08-20 . **Status:** draft . **Owner:** Engineering
