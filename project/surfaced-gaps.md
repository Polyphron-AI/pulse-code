# Surfaced gaps

This file is the session gap-watch inbox. Durable integration gaps live in
[known-gaps.md](known-gaps.md) and `project/state/shards/gaps.yaml`.

## Open

- **2026-08-21 · G-2026-08-21-windows-secret-acl-inspector · high:** INT-SEC-01 now exposes a
  bounded, fail-closed host-protection report, but Windows remains OAuth-ineligible until the
  packaged server can inspect effective ACL grants and identify untrusted principals. A successful
  `chmod` call is intentionally not accepted as evidence; PAT auth and server startup remain
  available while this release gate is open.

- **2026-08-20 · G-2026-08-20-externally-managed-credential-mode · medium:** T9 found that GitHub's
  existing server-owned `gh` profile is neither an absent credential nor a `ServerSecretStore`
  secret. Define ownership/mode and disconnect semantics before building the GitHub work adapter.

## Consumed

- **2026-08-23:** `G-2026-08-21-workspace-endpoints-yaml-parser` was resolved by converting the
  endpoint shard to supported block mappings; deterministic render, freshness, and Minion checks
  now pass.

- **2026-08-20:** `G-2026-08-20-integration-transport-bridge-unassigned` was resolved by T11's typed
  server bridge and T12's client/mobile runtime binding. Mixed-version verification continues in T8.

- **2026-08-19:** `G-2026-08-19-tokenizer-definition`,
  `G-2026-08-19-shared-server-connection-ownership`, and
  `G-2026-08-19-secret-store-guarantees` were linked into
  `CR-2026-08-19-pulse-integrations-foundation` and retained in the durable gap register.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-23 . **Last edited:** 2026-08-23 . **Status:** active . **Owner:** Product
