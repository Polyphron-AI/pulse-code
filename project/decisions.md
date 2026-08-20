# Product decisions

## Proposed

### D-2026-08-19-server-owned-integrations

- **Decision:** The owning Pulse Code Server stores credentials and calls provider APIs; clients and
  agent subprocesses receive only normalized data, provenance, previews, and receipts.
- **Why:** This preserves the existing remote/multi-client trust boundary and prevents credential
  distribution across web, desktop renderer, mobile, and agents.
- **Status:** proposed pending `CR-2026-08-19-pulse-integrations-foundation` approval.

### D-2026-08-19-thin-provider-adapters

- **Decision:** Normalize connection health, identity, mapping, errors, freshness, and receipts while
  retaining provider/domain semantics behind thin adapters.
- **Why:** A universal ticket model would lie about workflows and make the shared layer unstable.
- **Status:** Pulse reference proof and GitHub discovery support the seam; still proposed until the
  read-only GitHub proof resolves externally managed credentials and shared-server ownership.

### D-2026-08-19-pulse-issues-reference-adapter

- **Decision:** Use the independently landed native Pulse Issues integration as the reference adapter
  and wrap its lifecycle rather than replacing its tables or embedding a Pulse dashboard.
- **Why:** Commit `ac8d94397` proves secrets, mapping, capability skew, evidence bounds, native
  clients, remote environments, and fix-thread links; T4 projects only credential-free
  connection/health/mapping state through the shared seam.
- **Status:** reference-adapter proof complete; GitHub discovery supports the boundary with named
  reshapes, and a read-only second-adapter implementation proof remains pending.

### D-2026-08-19-additive-capability-compatibility

- **Decision:** New integration contracts remain additive and optional behind server capabilities.
- **Why:** Older servers, clients, mobile connections, and legacy Pulse/T3 identifiers must continue
  to work during staged rollout.
- **Status:** verified by T8 compatibility fixtures and
  `docs/internals/integrations-compatibility-matrix.md`; formal PRD approval remains pending.

## Locked

None yet. Approval of the initial PRD should promote accepted decisions explicitly rather than
silently treating this draft as locked.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-20 . **Last edited:** 2026-08-20 . **Status:** draft . **Owner:** Product
