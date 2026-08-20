# Pulse integrations

> Define how Pulse Code connects users, environments, projects, agents, and external work systems
> without duplicating each provider's control plane.

## Problem and outcome

People directing coding agents lose time and context moving among Pulse Code, ticket trackers, bug
systems, source hosts, observability tools, project workspaces, and usage/tokenizer views. Existing
connections use different authentication, mapping, refresh, and error models, which makes “connect
once” unreliable and makes agent access difficult to reason about.

The desired outcome is:

> A user authorizes a provider once per appropriate scope, maps it to Pulse Code projects, and can
> reliably view or deliberately act on permitted work from web, desktop, and mobile without handing
> provider credentials to an agent or client.

Primary users are maintainers working locally, operators connecting to remote environments, and
mobile users resuming work away from the host. The system must also remain understandable to fork
maintainers and users on mixed client/server versions.

### Goals

- One visible connection lifecycle: connect, health, reauthorize, remap, and disconnect.
- Native, bounded views of tickets, bugs, projects, workspaces, pull requests, evidence, and provider
  metadata instead of embedded third-party dashboards.
- Agent-readable context assembled by the owning Pulse Code Server with source and freshness shown.
- Explicit authorization for mutations; no ambient agent access to provider tokens.
- Local, direct-remote, relay, and tunnel operation with partial failure isolation.

### Non-goals

- Rebuilding provider administration, analytics, billing, or workflow designers in Pulse Code.
- A universal data model that erases provider-specific semantics.
- Shipping every provider at once or promising provider parity before capability evidence exists.
- Sending long-lived credentials to web, desktop renderer, mobile, or agent subprocesses.

## Scope and provider boundary

Pulse Code owns the connection record, secret reference, health state, project mapping, capability
manifest, normalized summaries, audit events, and thread/context links. The external provider remains
the system of record for its resources and owns provider-specific permissions and administration.

Each adapter exposes only capabilities it can support truthfully. Initial capability groups are:

| Capability       | Examples                            | Minimum normalized behavior                      |
| ---------------- | ----------------------------------- | ------------------------------------------------ |
| `work.read`      | tickets, bugs, issues, projects     | list, detail, source link, freshness             |
| `work.write`     | status, assignee, comment, create   | explicit action, typed result, conflict handling |
| `code.read`      | repositories, pull requests, checks | list/detail and project association              |
| `evidence.read`  | errors, traces, captured media      | bounded summaries with lazy detail               |
| `workspace.read` | provider workspaces/teams           | discovery and mapping only                       |
| `usage.read`     | tokenizer or usage data             | read-only summary; exact semantics are TBD       |
| `events.receive` | webhook or provider events          | verified, deduplicated refresh hints             |

Provider prioritization uses five criteria: fit with the code-to-fix loop, evidence of user demand,
reuse of existing Pulse Code infrastructure, safe authentication options, and ongoing adapter cost.
Pulse Issues is the reference implementation because current in-flight work already proves secret
storage, project mapping, capability skew, native views, evidence limits, and multi-environment reads.

## Experience contract

The canonical management surface is web/desktop `Settings → Integrations`. Mobile may show status,
mapped project, and recovery guidance, but entering or rotating long-lived secrets on mobile is not a
first-release requirement.

1. The user selects an environment and provider.
2. Pulse Code explains the requested capabilities and where the credential will live.
3. The provider authorization completes through OAuth when available; a scoped token is an adapter
   fallback, not a reason to change the product model.
4. The owning server discovers provider workspaces/projects and stores explicit Pulse Code project
   mappings.
5. Connection health shows last successful check, permission/capability gaps, and a recovery action.
6. Native surfaces query only capable environments and show partial failures without blanking data
   from healthy environments.
7. Disconnect revokes upstream authorization where supported, removes the local secret and active
   mappings, and preserves non-secret historical references for safe reconnection.

Context shown to a user or agent must carry provider, environment, mapped project, stable resource
identity, last refresh time, and whether the data is a summary or full detail. Provider deep links are
always available when Pulse Code does not own the full workflow.

Mutations use a two-tier rule:

- Low-risk, user-clicked actions execute under the current user's Pulse Code authorization.
- Agent-proposed or high-impact actions present a concrete preview and require confirmation unless a
  future policy explicitly grants that exact action and scope.

## Platform contract

The owning Pulse Code Server is the only component that talks to external provider APIs. A shared
integration domain should define connection snapshots, mappings, capability manifests, stable error
reasons, and audit receipts; provider adapters translate those contracts at the boundary.

The minimum durable model is:

| Record                 | Purpose                                                                | Secret content      |
| ---------------------- | ---------------------------------------------------------------------- | ------------------- |
| Integration connection | provider, environment, endpoint/account hint, state, health timestamps | none                |
| Secret reference       | opaque lookup key in `ServerSecretStore`                               | provider credential |
| Project mapping        | Pulse Code project to provider workspace/project                       | none                |
| Resource link          | thread/project to typed provider resource identity                     | none                |
| Audit receipt          | actor, capability, target, result, timestamp                           | none                |

Reads are on-demand by default, lazy-load heavy evidence, and may use short bounded caches. Webhooks
are refresh hints, not an alternate source of truth. Polling is adapter-specific and must stop when no
client or background workflow needs it. Every response crossing the client boundary is runtime
validated and bounded to protect WebSocket performance.

New integration RPCs are optional server capabilities. Clients must not send them to older servers.
Shared contracts live in `packages/contracts`; cross-client query/command behavior lives in
`packages/client-runtime`; web, desktop, and mobile render capability-appropriate surfaces.

Adapters keep provider vocabulary where normalization would lie. The shared layer may normalize
identity, connection health, pagination, freshness, errors, and action receipts, but not arbitrary
status taxonomies or workflow rules.

## Security, privacy, and compatibility

- Credentials are encrypted or protected by the existing server secret-store boundary, never stored
  in ordinary client-visible records, logs, prompts, checkpoints, or exported thread history.
- Authorization is least-privilege by capability and connection scope. Read access does not imply
  operate access; a provider token never expands Pulse Code RPC authorization.
- Redirect state is short-lived, bound to the initiating environment and user session, and protected
  against replay. OAuth refresh and revocation behavior is adapter-owned but surfaced consistently.
- Provider responses are treated as untrusted input and validated before crossing typed contracts.
- Webhook signatures are verified, deliveries deduplicated, and payloads bounded before processing.
- Remote clients receive normalized data and action results, never the credential needed to obtain
  them directly.
- New fields and methods are additive and optional until every supported client can consume them.
- Older servers continue to work through absent capability flags; older clients ignore additive
  capability and snapshot fields. Existing Pulse/T3 pairing, mobile connection, package IDs, and
  local-data compatibility remain unchanged.
- Disconnect and permission loss have explicit reverse states. Historical non-secret links may remain
  but must render as disconnected until remapped.

Threat modeling and provider permission review are release gates for any adapter that can mutate or
read private work. Security decisions should stay proportional: avoid a centralized credential
service until multi-environment requirements prove it necessary.

## Success metrics and rollout

Initial baselines are TBD and must be measured during the reference-adapter rollout.

| Metric                                        | Desired direction | First measurement                                           |
| --------------------------------------------- | ----------------- | ----------------------------------------------------------- |
| Connect-to-first-resource success             | maximize          | successful first list within one session                    |
| Returning connection success                  | maximize          | no reauthentication on a valid refresh path                 |
| Context-to-fix start time                     | minimize          | Issue/PR open to linked thread first turn                   |
| Action recovery rate                          | maximize          | permission/conflict failures resolved without losing intent |
| Cross-environment partial-failure containment | maximize          | healthy environments remain usable                          |
| Credential exposure incidents                 | hold at zero      | secret scans, logs, payload tests                           |
| Old-client/old-server compatibility failures  | hold at zero      | capability-skew test matrix                                 |

Rollout is adapter-by-adapter behind optional capability advertisement:

1. Extract the provider-neutral connection and mapping contract while keeping Pulse Issues behavior.
2. Harden Pulse Issues as the reference adapter and measure the end-to-end loop.
3. Add agent-readable context and action previews with audit receipts.
4. Prove a second adapter before declaring the platform abstraction stable.
5. Promote providers from the roadmap only after auth, capability, UX, and maintenance discovery.

### Cross-references

- Sitemap: [Integration surfaces](../sitemap/integrations.md)
- Workflows: [Connect and map](../workflows/connect-and-map-integration.md),
  [Use integration context](../workflows/use-integration-context.md)
- Tool flow: [Integration platform](../tool-flow/integration-platform.md)
- Acceptance criteria: [Integration foundation](20-acceptance-criteria/integration-foundation.md)

### Open questions

- Does “tokenizer” mean provider token-usage telemetry, a Pulse product object, or another system?
- Which connection scopes are user-owned versus environment-admin-owned for shared servers?
- Which second adapter best tests the abstraction: GitHub work items, Linear, or Sentry?
- What refresh-token encryption and rotation guarantees does the current server secret store provide?
- Which mutations, if any, should eventually support pre-approved agent policy?

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-19 . **Last edited:** 2026-08-19 . **Status:** draft . **Owner:** Product . **Layer:** tactical
