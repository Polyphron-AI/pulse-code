# Product decisions

## Proposed

None currently. OAuth release, shared-server ownership, externally managed credentials, and later
provider implementation remain open roadmap gates rather than locked decisions.

## Locked

### D-2026-08-21-upstream-t3-fidelity

- **Decision:** Official T3 source, features, CI, desktop packaging, releases, and updates remain
  owned by the official T3 main repository. Pulse does not build or publish a modified T3 product.
- **Why:** T3 must remain true to its upstream product instead of becoming a second profile compiled
  from Pulse source.
- **Status:** locked on 2026-08-21; last opened 2026-08-21; last edited 2026-08-21.

### D-2026-08-21-selective-pulse-downstream

- **Decision:** Pulse owns an independent repository history and release train, may selectively pull
  released T3 features through explicit reviewed upstream-intake pull requests, and may add
  Pulse-only features without preserving feature parity or a shared commit.
- **Why:** Selective downstream evolution lets Pulse serve its team roadmap without changing or
  misrepresenting official T3.
- **Status:** locked on 2026-08-21; last opened 2026-08-21; last edited 2026-08-21.

### D-2026-08-21-desktop-identity-isolation

- **Decision:** Pulse desktop is a permanent, independently installable Windows, macOS, and Linux
  product with distinct application identity, installation paths, state, protocols, shortcuts,
  signing, updater, and artifacts. It must run beside official T3 and start fresh; any future T3
  import is explicit, selective, copy-only, and non-destructive.
- **Why:** Team-wide Pulse adoption must not replace, activate, mutate, or uninstall a developer's
  official T3 installation.
- **Status:** locked on 2026-08-21; last opened 2026-08-21; last edited 2026-08-21.

### D-2026-08-21-shared-web-mobile-initially

- **Decision:** Web and mobile remain shared clients initially; the independent product identity
  boundary applies only to packaged desktop applications.
- **Why:** This preserves the existing multi-surface client investment while allowing capability-
  gated Pulse-only desktop and server features.
- **Status:** locked on 2026-08-21; last opened 2026-08-21; last edited 2026-08-21.

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
