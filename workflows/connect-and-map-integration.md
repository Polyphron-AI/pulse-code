# Connect and map an integration

> Let an authorized user establish a durable provider connection and map provider workspaces to
> Pulse Code projects without exposing the credential to a client or agent.

## Actors

- **Environment administrator** — manages connections on the owning Pulse Code Server.
- **Pulse Code client** — web/desktop UI that collects intent and renders server-owned state.
- **Pulse Code Server** — owns secrets, provider calls, mappings, validation, and audit receipts.
- **External provider** — authenticates the user and remains system of record.

## Preconditions

- The client is paired to an environment and has the scope required to manage connections.
- The server advertises the requested integration-management capability.
- The user can authorize the required provider capabilities.

## Trigger

The user chooses a provider in `/settings/integrations` for a selected environment.

## Happy path

1. The client asks the server for provider metadata and requested capabilities.
2. The user reviews the scope and starts authorization.
3. For OAuth, the server creates short-lived bound state and returns the authorization handoff; for a
   scoped-token adapter, the client submits the token once over the paired server connection.
4. The server completes or validates authorization, stores credential material in
   `ServerSecretStore`, and persists only a secret reference plus non-secret account metadata.
5. The adapter discovers provider workspaces/projects and returns bounded, validated summaries.
6. The user maps one or more Pulse Code projects to provider workspaces/projects.
7. The server persists mappings, checks health, and returns a credential-free connection snapshot.
8. Capable resource surfaces refresh and show source, mapping, and freshness.

## Edge cases

| Case                                    | Behavior                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| OAuth callback opened on another client | Bound state completes on the owning server; initiating UI resumes from server state.               |
| State expired or replayed               | Reject authorization, retain no credential, and offer restart.                                     |
| Token lacks a capability                | Connect with truthful reduced capabilities or block when the adapter minimum is missing.           |
| Provider project later disappears       | Keep mapping identity, mark it unavailable, and require remap; do not guess a replacement.         |
| One remote environment is offline       | Other environments remain manageable and the selected environment shows offline recovery.          |
| Reauthorization fails                   | Preserve the prior connection only if it remains valid; otherwise show disconnected/expired state. |
| Disconnect                              | Attempt provider revocation, delete local secret and active mappings, preserve non-secret history. |

## Post-conditions

- The owning server can access only the approved provider capabilities.
- The client sees health and mappings but cannot retrieve the credential.
- Every mapped project has explicit environment and provider identity.
- A connection audit receipt records success or the typed failure reason.

## Cross-references

- PRD: [Experience contract](../prd/10-pulse-integrations.md#experience-contract),
  [Security, privacy, and compatibility](../prd/10-pulse-integrations.md#security-privacy-and-compatibility)
- Sitemap: [Integration surfaces](../sitemap/integrations.md) — `/settings/integrations`
- AC: [Connection lifecycle](../prd/20-acceptance-criteria/integration-foundation.md#connection-lifecycle)
- Tool flow: [Integration platform](../tool-flow/integration-platform.md)

## Open questions

- Shared-server connection ownership and administrator delegation are TBD.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-19 . **Last edited:** 2026-08-19 . **Status:** draft . **Owner:** Product
