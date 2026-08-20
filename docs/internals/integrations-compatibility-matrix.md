# Pulse integrations compatibility matrix

This matrix locks the compatibility contract for adding the provider-neutral integration bridge to
Pulse Code. The result is **pass**: the product name can be Pulse Code while stable mobile, package,
storage, RPC, and persisted-resource identifiers remain unchanged.

## Version and capability skew

| Client / server         | Expected behavior                                                                                                                                                                  | Verification                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| New client / old server | Missing <code>capabilities.integrations</code> is unsupported; no integration query mounts and no integration RPC is sent. Native Issues and all unrelated RPCs continue normally. | <code>packages/contracts/src/integrations.test.ts</code>; <code>packages/client-runtime/src/state/integrations.test.ts</code>                    |
| New client / new server | The additive capability enables seven typed integration methods. Responses contain redacted lifecycle/context data, previews, and receipts only.                                   | Contracts, authorization, server-environment, and client-runtime focused suites                                                                  |
| Old client / new server | An older descriptor fixture ignores the unknown additive capability. Existing native <code>issues.\*</code> method names and handlers remain registered unchanged.                 | <code>packages/contracts/src/integrations.test.ts</code>; <code>packages/contracts/src/issues.test.ts</code>; <code>apps/server/src/ws.ts</code> |
| Mixed environments      | Capable environments remain visible when another environment is unsupported or offline. Every result and unavailable entry retains its environment ID.                             | Client-runtime and mobile integration-state tests                                                                                                |

## Connection path ownership

Integration requests use the same <code>EnvironmentRegistry</code> and
<code>EnvironmentSupervisor</code> as every other environment RPC. Transport selection prepares a
session but does not change the target environment ID.

| Path                              | Compatibility lock                                                                                                               | Verification                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Local / primary                   | The primary target reaches its own server session and preserves its environment ID.                                              | <code>ConnectionResolver</code> primary fixture |
| Direct remote / bearer            | The persisted bearer target authorizes against the expected environment and returns that same ID.                                | <code>ConnectionResolver</code> bearer fixture  |
| Relay / managed Cloudflare tunnel | Relay bootstrap and DPoP authorization are scoped to the requested environment; the prepared session retains that ID.            | <code>ConnectionResolver</code> relay fixture   |
| SSH tunnel                        | The platform opens the SSH gateway before remote authorization; the prepared session retains the tunnel target's environment ID. | <code>ConnectionResolver</code> SSH fixture     |

The integration atom family keys reads and serialized writes by environment ID. The authenticated
server session then constructs the adapter around that server's native Issues service. Consequently,
the route cannot silently fall through to another environment's adapter.

## Mobile and rename compatibility

The visible product names and new URL schemes are additive. Installed-app identity and legacy deep
links remain stable:

| Variant     | Display name       | URL schemes                                                 | iOS bundle ID                           | Android package                         |
| ----------- | ------------------ | ----------------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| Development | Pulse Code Dev     | <code>pulsecode-dev</code>, <code>t3code-dev</code>         | <code>com.t3tools.t3code.dev</code>     | <code>com.t3tools.t3code.dev</code>     |
| Preview     | Pulse Code Preview | <code>pulsecode-preview</code>, <code>t3code-preview</code> | <code>com.t3tools.t3code.preview</code> | <code>com.t3tools.t3code.preview</code> |
| Production  | Pulse Code         | <code>pulsecode</code>, <code>t3code</code>                 | <code>com.t3tools.t3code</code>         | <code>com.t3tools.t3code</code>         |

The Expo slug remains <code>t3-code</code>. Changing a bundle ID or Android package would create a
different installed app and break upgrade/keychain continuity, so these identifiers are deliberately
not renamed. All three generated Expo configurations are checked during T8 verification.

Mobile connection persistence dual-reads and dual-writes:

- current catalog: <code>pulsecode.connection-catalog.v1</code>
- rollback alias: <code>t3code.connection-catalog.v1</code>
- pre-catalog migration source: <code>t3code.connections</code>

Legacy bearer and relay-managed pairing records migrate without changing their environment IDs.
Mobile receives connection health, mappings, provenance, and capability state, but no provider token,
refresh token, client secret, or authorization value.

## Persisted resource and package identities

- Native <code>IssueId</code>, <code>ThreadId</code>, project mappings, and Issue/thread links are
  retained in their existing tables and contracts; the integration adapter projects them without
  rewriting IDs.
- Disconnect removes the current endpoint and mappings while preserving historical Issue/thread
  links.
- Native <code>issues._</code> RPCs remain compatibility aliases beside the additive
  <code>integrations._</code> RPCs.
- Existing package scopes, the <code>t3</code> CLI/package identity, Expo project identity, and
  persisted T3 configuration aliases remain stable. “Pulse Code” is the product-facing name.

## Verification receipt

- Node 24 focused suite: 8 files, 39 tests passed across contracts, environment routing,
  client/mobile state, mobile catalog migration, server environment identity, and Issue/thread
  persistence.
- Generated Expo config assertions passed for development, preview, and production.
- Client-runtime, contracts, mobile, and server compatibility files are formatter/diff checked at
  task close.

This compatibility pass does not approve OAuth connect/reauthorize for release. Secret-store,
shared-server ownership, tokenizer definition, provider demand, and externally managed credential
mode remain separate explicit gaps.

---

**Created:** 2026-08-20 . **Last edited:** 2026-08-20 . **Status:** verified . **Owner:** Engineering
