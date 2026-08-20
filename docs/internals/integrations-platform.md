# Pulse integrations platform

## Delivery status

The Pulse integration walking skeleton is implemented and verified in the current worktree. Native
Pulse Issues is independently committed at <code>ac8d94397</code>. The provider-neutral foundation,
typed transport, bounded context/action path, and compatibility work are not yet committed or
released, so roadmap items remain active rather than shipped.

The final Node 24 release-gate recheck passes contracts, server, client-runtime, web, and mobile
typechecks. OAuth connect/reauthorize is still held by the security and ownership gaps listed below;
the existing Pulse personal-access-token connection remains the reference setup path.

## What “sign in once” means

Pulse Code does not share a browser login cookie with Pulse. Instead, the user submits a Pulse
endpoint and personal access token once to the Pulse Code server that owns the environment. That
server stores the credential behind <code>ServerSecretStore</code> and persists only a secret
reference plus redacted connection/mapping state.

Any authenticated Pulse Code client connected to that same environment—web, desktop, or mobile—can
then read the permitted Issues, Reports, projects, mappings, and bounded context without receiving
the provider credential. The connection survives client restarts and server restarts until it is
disconnected, revoked, invalidated, or replaced.

Connections are currently environment-owned, not globally synchronized. A second independent Pulse
Code server must be configured separately. User-owned versus environment-admin-owned connections on
shared servers remains an explicit product decision.

## Architecture

| Layer                        | Owning code                                                                             | Responsibility                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Domain contracts             | <code>packages/contracts/src/integrations.ts</code>, <code>integrationContext.ts</code> | Credential-free snapshots, mappings, health, provenance, preview, confirmation, receipt, and stable errors    |
| Native reference domain      | <code>apps/server/src/issues/</code>                                                    | Pulse connection setup, Issue/Report/project semantics, evidence bounds, and durable fix-thread links         |
| Shared persistence/lifecycle | <code>apps/server/src/integrations/</code>                                              | Additive connection/mapping/link records and provider-neutral lifecycle operations                            |
| Authenticated transport      | <code>packages/contracts/src/rpc.ts</code>, <code>apps/server/src/ws.ts</code>          | Seven typed integration methods constructed around the owning server adapter                                  |
| Client runtime               | <code>packages/client-runtime/src/state/integrations.ts</code>                          | Capability gate, environment ownership, partial-failure aggregation, serialized mutations, and scoped refresh |
| Product surfaces             | Settings, native Issues workspace, mobile Issues/state                                  | Connection/mapping UI and bounded resource access appropriate to each client                                  |

The shared layer owns lifecycle behavior, not provider resource semantics. Issue status remains an
Issue contract; pull requests remain source-host contracts; future evidence and usage providers keep
their own domain types.

## Typed transport

The server exposes these additive methods:

- <code>integrations.listConnections</code>
- <code>integrations.disconnect</code>
- <code>integrations.setProjectMapping</code>
- <code>integrations.removeProjectMapping</code>
- <code>integrations.issueContext</code>
- <code>integrations.issuePreviewStatus</code>
- <code>integrations.issueConfirmStatus</code>

Read methods require orchestration read scope. Lifecycle mutations, preview, and confirmation require
orchestration operate scope. Pending previews are session-scoped, expire, bind the expected Issue
version, and become invalid after reconnect. Confirmation returns a typed audit receipt and refreshes
only the owning environment's connection and Issue context.

Native <code>issues.\*</code> RPCs remain unchanged beside the additive integration methods.

## Security and compatibility

- Provider credentials are server-owned. Shared RPC inputs and outputs contain no token, refresh
  token, client secret, or authorization value.
- Initial native Pulse setup sends the submitted token once over the authenticated environment
  connection; the input is cleared from Settings immediately after submission.
- Unsupported and older servers advertise no <code>integrations</code> capability. New clients mount
  no integration queries and send no integration RPCs to them.
- Older clients ignore the new optional capability and continue using native Issues methods.
- Direct, relay, managed-tunnel, SSH-tunnel, and mobile paths all terminate at an
  environment-scoped supervisor and preserve the owning environment ID.
- Mobile retains legacy <code>t3code</code> URL schemes, catalog keys, Expo slug, iOS bundle IDs, and
  Android package IDs. Persisted Issue/thread IDs are not rewritten.

See the full [compatibility matrix](./integrations-compatibility-matrix.md) and
[secret review](./integrations-secret-review.md).

## Verification receipts

| Work                     | Receipt                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Contracts                | T1: contracts typecheck; 2 files/13 tests                                                                               |
| Secret boundary          | T2: server typecheck; 1 file/8 secret-store tests                                                                       |
| Persistence              | T3: server typecheck; 1 file/4 additive-store tests                                                                     |
| Reference adapter        | T4: native Issues committed independently; 6 files/38 adapter/store/domain tests after the 10-file/36-test native suite |
| Shared runtime           | T5: client-runtime typecheck; 1 file/5 tests                                                                            |
| Settings                 | T6: web typecheck; 1 file/9 tests; 1280×800 and 390×844 preview verification                                            |
| Context/action           | T7: contracts/server typechecks; 9 files/54 focused tests                                                               |
| Server transport         | T11: contracts typecheck; 6 files/41 focused tests                                                                      |
| Client/mobile transport  | T12: client-runtime/mobile typechecks; 2 files/7 tests                                                                  |
| Compatibility            | T8: 9 files/45 tests; three package typechecks; all three generated Expo variants                                       |
| Second-adapter discovery | T9: 5 existing GitHub suites/128 tests; reshape recommendation, no production adapter                                   |
| Final gate               | T10: contracts, server, client-runtime, web, and mobile package typechecks pass                                         |

Focused commands and their exact receipts remain in
<code>project/state/tasks/P-2026-08-19-integrations-foundation\_\_T\*.json</code>.

## Release decision and open gates

The walking skeleton is technically verified, but the broader durable-authorization promise is not
approved for OAuth release. Roadmap items remain active until implementation is committed/released
and real metrics are available.

| Now outcome                                  | Review result                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Durable integration connection foundation    | Verified in the worktree; not committed or released                                                                   |
| Pulse Issues reference adapter               | Independently committed and verified                                                                                  |
| Agent-readable context and deliberate action | Bounded Issue context and one confirmed status action verified; no claim of automatic agent-tool exposure             |
| Compatibility and credential safety          | Capability skew, remote/mobile paths, aliases, package IDs, and persisted IDs verified with zero detected regressions |

**Manual decision:** pass the technical walking skeleton; hold OAuth/general release and keep every
roadmap item active. No later provider is represented as implemented.

Open gates:

- secret-store host isolation, redirect replay, diagnostic/backup exclusion, and provider revocation;
- shared-server connection ownership and authorization;
- externally managed credential mode before a GitHub work adapter;
- a measured provider-demand baseline;
- definition of “tokenizer” and its source of truth.

The GitHub discovery result is documented in
[github-work-adapter-spike.md](./github-work-adapter-spike.md). It recommends reshaping the
credential-ownership seam before a bounded read-only repository Issues proof.

---

**Created:** 2026-08-20 . **Last edited:** 2026-08-20 . **Status:** verified, unreleased . **Owner:** Engineering
