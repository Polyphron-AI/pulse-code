# Use integration context and take action

> Let a user or agent read bounded external work context, start or resume a fix, and perform a
> deliberate provider action with a recoverable audit trail.

## Actors

- **User** — selects work, directs the agent, and confirms consequential actions.
- **Agent** — consumes normalized context and may propose provider actions.
- **Pulse Code client** — renders source, freshness, permissions, previews, and recovery.
- **Pulse Code Server** — enforces project mapping, authorization, adapter calls, and receipts.
- **External provider** — owns the resource and final version.

## Preconditions

- The environment has a healthy connection with the needed capability.
- The Pulse Code project is mapped to the provider scope containing the resource.
- The client is authorized for read or operate as required.

## Trigger

The user opens a resource from `/issues`, `/pull-requests`, a project surface, or a thread reference;
or asks the agent to retrieve mapped work context.

## Happy path

1. The client or agent request names environment, Pulse Code project, provider, resource type, and
   stable resource identity.
2. The server verifies client authorization, advertised capability, connection health, and project
   mapping before calling the adapter.
3. The adapter fetches and validates a bounded summary; heavy evidence stays lazy.
4. The client shows source, last refresh, mapping, and partial-data state. Agent context carries the
   same provenance but no secret.
5. The user starts/resumes a linked fix thread or asks for analysis.
6. If the agent proposes a mutation, the server returns a typed action preview rather than executing.
7. The client shows exact target and changes; the user confirms.
8. The server rechecks authorization and version, executes through the adapter, emits a typed receipt,
   and refreshes the resource.

## Edge cases

| Case                                       | Behavior                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Resource belongs to another mapped project | Reject before the downstream action and reveal no cross-project detail.              |
| Provider data is stale                     | Show refresh state; writes use provider version/precondition where available.        |
| Concurrent change                          | Return conflict, refresh current state, and preserve the proposed action for review. |
| Permission revoked                         | Mark the capability unhealthy and link to reauthorization; do not retry mutations.   |
| Provider unavailable                       | Return retryability and retain the user's intent; other environments remain visible. |
| Heavy evidence exceeds limits              | Fetch summaries first and reject or truncate according to explicit adapter bounds.   |
| Older server lacks capability              | Hide/disable the action and keep the rest of the client usable.                      |

## Post-conditions

- The thread or panel retains a non-secret typed resource reference.
- The user can see whether the provider action succeeded and what changed.
- The audit receipt identifies actor, capability, target, result, and timestamp.
- A failed action remains understandable and recoverable without blind replay.

## Implemented reference proof

- `IntegrationContextService` reads one mapped Pulse Issue through the native Issues boundary and
  returns provenance plus a 2,000-character summary excerpt. Explicit detail reads cap description
  at 20,000 characters and labels at 50; Reports and heavy evidence remain lazy native calls.
- The first deliberate action is a Pulse Issue status change. Preview records the exact before/after
  value and native `expectedVersion`, expires after five minutes, and requires a one-time
  confirmation token. The server rechecks connection, mapping, capability, version, and current
  status before mutation.
- Confirmations produce a credential-free typed success/failed audit receipt. Wrong, expired, and
  replayed tokens never call Pulse; provider permission loss and optimistic conflicts return failed
  receipts without blind replay.
- Pending previews are memory-only and bounded to 100 per service instance. Server restart safely
  invalidates them. Audit receipt retention remains TBD.
- This is currently a service/contract proof. `capabilities.integrations` remains unadvertised until
  `G-2026-08-20-integration-transport-bridge-unassigned` is resolved with typed RPC/auth/layer wiring.

## Cross-references

- PRD: [Platform contract](../prd/10-pulse-integrations.md#platform-contract),
  [Experience contract](../prd/10-pulse-integrations.md#experience-contract)
- Sitemap: [Integration surfaces](../sitemap/integrations.md) — `/issues`, `/pull-requests`, thread/right panel
- AC: [Context and actions](../prd/20-acceptance-criteria/integration-foundation.md#context-and-actions)
- Tool flow: [Integration platform](../tool-flow/integration-platform.md)

## Open questions

- The first set of agent actions eligible for policy-based pre-approval is intentionally TBD.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-20 . **Last edited:** 2026-08-20 . **Status:** draft . **Owner:** Product
