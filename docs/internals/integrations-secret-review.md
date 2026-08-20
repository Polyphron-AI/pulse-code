# Integration secret-store and OAuth threat review

Status: approved with constraints for a single-owner Pulse Code Server; release-blocked for shared
or untrusted hosts until the blockers below are resolved.

This review covers provider access and refresh tokens used by the integration lifecycle. It does
not change the core ownership rule: the owning server is the only provider API client. Web,
desktop, mobile, relay, and agent surfaces receive credential-free connection snapshots only.

## Decision

`ServerSecretStore` is suitable for integration refresh tokens when the server data directory is
private to one trusted operating-system account and the product describes the protection
accurately. The current store is filesystem-protected, not encrypted at rest. It already persists
Pulse Connect OAuth credentials and rotates refreshed credentials through the same boundary.

Do not add a second token store for the first provider. Do not claim platform-keychain,
hardware-backed, or encrypted-at-rest protection. A shared or multi-user deployment needs a
stronger credential backend or a dedicated, isolated service account before provider OAuth is
enabled.

## Evidence by control

| Control            | Observed behavior                                                                                                                                               | Release consequence                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| At rest            | Raw bytes live at `userdata/secrets/<name>.bin`; the directory is chmod `0700` and files `0600`.                                                                | Accept for an isolated owner account. This is not encryption, and POSIX modes are not a portable Windows ACL guarantee.                  |
| Writes             | `set` writes a UUID-named temporary file, secures it, renames it over the active file, and secures the result. `create` uses exclusive `wx`, syncs, and chmods. | Rotation cannot report success after the tested rename failure. Platform rename semantics still belong in compatibility testing.         |
| Reads              | Missing files become `Option.none`; other failures become typed errors. Returned bytes remain inside the server process.                                        | Connection snapshots expose only a configured flag and non-secret hints.                                                                 |
| Rotation           | Pulse Connect refreshes early, then persists the refreshed access/refresh pair through `set` while holding a semaphore.                                         | Each provider adapter must persist a rotated refresh token before returning the new credential as durable. No token history is retained. |
| Deletion           | `remove` is idempotent for a missing file and surfaces other failures.                                                                                          | Disconnect must revoke upstream when supported, then remove the local secret. A failed local removal is not success.                     |
| Logging and errors | Store spans name the operation, not the value. Expected errors contain a resource label and platform cause, not secret bytes.                                   | Resource names must remain non-secret. Provider response bodies and authorization headers must never enter public errors.                |
| Backups            | The server-update rollback snapshots only SQLite files. SQLite tooling also backs up only the database. A whole `userdata` copy includes `secrets`.             | Document whole-directory backups as credential-bearing and require equally restrictive storage and deletion.                             |
| Diagnostics        | No current diagnostic export copies the secret directory.                                                                                                       | A future exporter must explicitly exclude `userdata/secrets`, token values, authorization codes, and provider response bodies.           |

## Snapshot and error boundary

The shared integration snapshot contains provider/environment identity, non-secret account and
endpoint hints, health, capabilities, project mappings, and `credentialConfigured`. Strict schema
decoding rejects `token`, `accessToken`, `refreshToken`, and `secret` fields. Unknown capabilities
from a newer server are dropped for an older client.

The focused store regression injects a rename failure after secret bytes are passed to `set`. It
asserts that the resulting expected error has no `value` or `bytes` property, retains no direct
reference to the byte array, and serializes without the secret sentinel. Together these tests prove
the public snapshot and expected-error paths. They do not permit arbitrary logging of a provider
exception: adapters must translate upstream failures into bounded typed reasons and diagnostic IDs.

## OAuth redirect-state contract

Authorization redirect state is an initiation nonce, not the durable sign-in credential. A
refresh token keeps the server signed in; state exists only long enough to bind and consume one
authorization response.

Every provider OAuth implementation must meet all of these conditions:

1. Generate state and a PKCE verifier from a cryptographically secure source. State must have at
   least 128 bits of entropy and must never encode a credential.
2. Bind the pending attempt to `providerId`, `environmentId`, the initiating Pulse Code auth
   session or user, the exact redirect URI, and the PKCE verifier. Do not trust these values from
   the callback query.
3. Expire the attempt after a short fixed interval. The existing Pulse Connect loopback flow uses
   ten minutes; a provider may require a shorter interval, never a longer silent fallback.
4. Consume state atomically before token exchange. Consumption succeeds only when the value is
   known, unexpired, unconsumed, and matches every binding. Mark it consumed even if the subsequent
   token exchange fails.
5. Reject missing, mismatched, expired, or replayed state with the same bounded public failure. A
   replay must never return the prior result or retry the exchange.
6. Keep state in server memory when the callback does not need to survive restart. If restart
   survival becomes a requirement, persist a digest and binding metadata in the server database;
   keep the PKCE verifier in the secret boundary and delete both on consume or expiry.
7. Never log or export raw state, authorization codes, PKCE verifiers, access tokens, refresh
   tokens, authorization headers, or token endpoint response bodies.

The callback may complete the attempt created by the initiating session, but it must not create a
new ambient session. The durable connection record is owned by the named environment and provider,
and only an authorized Pulse Code session may start, inspect, reauthorize, or disconnect it.

## Named release blockers

These blockers apply to shipping provider OAuth, not to additive lifecycle contracts or
credential-free connection persistence.

### INT-SEC-01 — Host isolation policy

OAuth is blocked on a shared or untrusted host until deployment either proves a dedicated private
OS account and protected data directory or supplies a reviewed encrypted credential backend.
Windows packaging must verify the effective ACL; a chmod call alone is not acceptable evidence.

### INT-SEC-02 — Redirect-state replay suite

OAuth is blocked until server tests cover valid consume, environment mismatch, initiating-session
mismatch, expiry, duplicate callback, and replay after a failed token exchange. There is no
state-less or session-less fallback.

### INT-SEC-03 — Backup and diagnostic disclosure

OAuth release documentation must state that a whole-data-directory backup contains credentials.
Any diagnostic-bundle feature must prove that `userdata/secrets` and the prohibited OAuth fields
are excluded before that exporter is enabled.

### INT-SEC-04 — Provider disconnect semantics

Each OAuth adapter must declare whether upstream revocation exists and test its ordering. When
revocation is supported, disconnect attempts it before local deletion and surfaces partial failure;
when unsupported, the UI must say that local credentials were removed but provider-side grants may
need manual revocation.

## Release checklist

- [x] Secret values stay server-owned and outside integration snapshots.
- [x] Expected store errors do not retain or serialize the supplied secret bytes.
- [x] Rotation and deletion primitives return typed failures.
- [x] Database-only update snapshots exclude the secret directory.
- [ ] INT-SEC-01 deployment/Windows ACL evidence is attached for the target release platforms.
- [ ] INT-SEC-02 redirect-state replay tests pass in the integration service.
- [ ] INT-SEC-03 user backup wording and diagnostic exclusion evidence are attached.
- [ ] INT-SEC-04 provider-specific revocation behavior is implemented and documented.

T3 may build server-owned, credential-free connection and mapping records while these OAuth release
gates remain open. No adapter may expose a connect/reauthorize action as shipped until its applicable
boxes are closed.

## Source evidence

- [`ServerSecretStore.ts`](../../apps/server/src/auth/ServerSecretStore.ts) — file location,
  permissions, atomic replacement, exclusive creation, typed failures, and idempotent removal.
- [`ServerSecretStore.test.ts`](../../apps/server/src/auth/ServerSecretStore.test.ts) — permissions,
  concurrent creation, failure propagation, and secret-redaction regression.
- [`CliTokenManager.ts`](../../apps/server/src/cloud/CliTokenManager.ts) — existing Pulse Connect
  PKCE/state timeout, refresh rotation, semaphore, and persisted OAuth precedent.
- [`server-updates.md`](server-updates.md) — database-only rollback snapshot boundary.
- [`issues-integration.md`](issues-integration.md) — current server-only Pulse credential boundary.
- [`integrations.ts`](../../packages/contracts/src/integrations.ts) and
  [`integrations.test.ts`](../../packages/contracts/src/integrations.test.ts) — credential-free
  snapshot, strict public shapes, stable errors, action previews, receipts, and version skew.

---

**Reviewed:** 2026-08-19 · **Owner:** Pulse Code security boundary · **Status:** approved with constraints
