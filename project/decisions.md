# Product decisions

## Proposed

None currently. OAuth release, shared-server ownership, externally managed credentials, and later
provider implementation remain open roadmap gates rather than locked decisions.

## Locked

### D-2026-08-19-server-owned-integrations

- **Decision:** The owning Pulse Code Server stores credentials and calls provider APIs; clients and
  agent subprocesses receive only normalized data, provenance, previews, and receipts.
- **Why:** This preserves the existing remote/multi-client trust boundary and prevents credential
  distribution across web, desktop renderer, mobile, and agents.
- **Status:** locked by approval of `CR-2026-08-19-pulse-integrations-foundation` on 2026-08-21.

### D-2026-08-19-thin-provider-adapters

- **Decision:** Normalize connection health, identity, mapping, errors, freshness, and receipts while
  retaining provider/domain semantics behind thin adapters.
- **Why:** A universal ticket model would lie about workflows and make the shared layer unstable.
- **Status:** locked for the shared lifecycle seam by approval of
  `CR-2026-08-19-pulse-integrations-foundation` on 2026-08-21. Externally managed credentials and
  shared-server ownership remain release gates for later adapters.

### D-2026-08-19-pulse-issues-reference-adapter

- **Decision:** Use the independently landed native Pulse Issues integration as the reference adapter
  and wrap its lifecycle rather than replacing its tables or embedding a Pulse dashboard.
- **Why:** Commit `ac8d94397` proves secrets, mapping, capability skew, evidence bounds, native
  clients, remote environments, and fix-thread links; T4 projects only credential-free
  connection/health/mapping state through the shared seam.
- **Status:** locked by approval of `CR-2026-08-19-pulse-integrations-foundation` on 2026-08-21;
  commit `ac8d94397` remains the reference proof. A second-adapter implementation is not implied.

### D-2026-08-19-additive-capability-compatibility

- **Decision:** New integration contracts remain additive and optional behind server capabilities.
- **Why:** Older servers, clients, mobile connections, and legacy Pulse/T3 identifiers must continue
  to work during staged rollout.
- **Status:** locked by approval of `CR-2026-08-19-pulse-integrations-foundation` on 2026-08-21 and
  verified by T8 compatibility fixtures and
  `docs/internals/integrations-compatibility-matrix.md`.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** stable . **Owner:** Product
