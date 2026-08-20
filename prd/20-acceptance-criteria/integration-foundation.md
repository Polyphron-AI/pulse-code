# Integration foundation acceptance criteria

> Define the testable release contract for the shared integration foundation and its reference
> adapter without pre-committing later providers.

## Integration foundation acceptance criteria

### Connection lifecycle

- A capable environment can connect, check health, reauthorize, map/unmap projects, and disconnect
  through one typed connection model.
- A returning valid connection refreshes without asking the user to sign in again.
- The connection snapshot exposes configuration and health metadata but never a credential.
- Disconnect removes active credential material and mappings; upstream revocation is attempted when
  supported and its result is visible.

### Context and actions

- A mapped project can list and open bounded provider resources with provider, environment, stable
  identity, freshness, and source link.
- Heavy evidence is loaded only on demand and stays within explicit payload limits.
- Agent context contains normalized resource data, never credentials or unbounded raw payloads.
- An agent-proposed mutation shows the exact provider, target, field changes, and expected effect
  before the user confirms it.
- Successful and failed mutations produce a typed audit receipt and preserve retry intent.

### Multi-surface and remote behavior

- Web and desktop manage the connection; mobile can consume supported resource and health views
  without receiving provider secrets.
- Local, direct-remote, relay, and tunnel clients use the same owning-server adapter path.
- One failing or unsupported environment does not erase results from healthy environments.
- All new client calls are gated by optional server capabilities.

### Compatibility and safety

- Current Pulse Issues flows remain behaviorally compatible while they move behind the shared
  contract.
- New clients remain usable with older servers and older clients ignore additive integration fields.
- Existing Pulse/T3 pairing URLs, mobile connection records, persisted IDs, package coordinates, and
  legacy aliases are not changed by the integration foundation.
- Focused tests cover secret non-disclosure, redirect-state replay protection, webhook validation
  where applicable, project-boundary checks, stale writes, bounded payloads, disconnect, and mixed
  capability versions.
- The second adapter can implement connection health, mapping, one bounded read, and one typed error
  without changing orchestration or client transport primitives.

### Cross-references

- PRD: [Pulse integrations](../10-pulse-integrations.md)
- Sitemap: [Integration surfaces](../../sitemap/integrations.md)
- Workflows: [Connect and map](../../workflows/connect-and-map-integration.md),
  [Use integration context](../../workflows/use-integration-context.md)
- Tool flow: [Integration platform](../../tool-flow/integration-platform.md)

### Open questions

- Exact provider-specific OAuth and revocation acceptance tests remain TBD until the first OAuth
  provider is selected.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-19 . **Last edited:** 2026-08-19 . **Status:** draft . **Owner:** Product . **Layer:** tactical
