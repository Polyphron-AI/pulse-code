# Connect Pulse to Pulse Code

For IMAP accounts and SMTP sending, see [Email alpha](email.md).

Pulse Code can keep a Pulse connection on the server that owns your coding environment. You enter
the Pulse endpoint and personal access token once for that environment; web, desktop, and mobile
clients connected to the same server can then use the permitted Pulse Issues data without storing
the provider token themselves.

This is a durable server connection, not shared browser-cookie SSO. Each independent Pulse Code
server is configured separately.

**Availability:** Native Pulse Issues connection, mapping, and workspace behavior is implemented.
The provider-neutral context/action bridge is verified in the current development worktree but is not
yet a released OAuth or multi-provider feature.

## Connect

1. Open **Settings → Integrations** in Pulse Code.
2. Choose the environment that should own the Pulse connection.
3. Enter the Pulse endpoint and a personal access token with the required project/Issue permissions.
4. Select **Connect**.
5. Map each Pulse Code project to the matching Pulse project.

The token field clears after submission. Pulse Code shows configured/not configured state, connection
health, capabilities, and non-secret account/endpoint hints; it does not return the token to clients.

The connection remains available after app and server restarts until you disconnect it, revoke the
token in Pulse, or replace it by reauthorizing.

## Work with Issues

Open **Issues** to browse the mapped Pulse tickets and Reports. Pulse Code loads bounded summaries
first and fetches larger Report evidence only when requested. Fix-thread links retain the owning
environment, Pulse Code project, Pulse Issue, and thread IDs.

Mobile can read capable Issue/connection health from every connected environment. If one environment
is offline or too old, healthy environments remain available and the unavailable environment is
reported separately.

On servers that advertise the integration capability, Issue status changes use the current Issue
version. The shared action path creates an exact preview, requires confirmation, and returns a
receipt; reconnecting invalidates an unconfirmed preview.

## Reauthorize or disconnect

- Choose **Reauthorize** to replace an expired, revoked, or under-scoped token.
- Choose **Disconnect** to remove the server-owned credential and current project mappings.
- Historical Issue-to-thread links remain intact so past work does not lose traceability.

If Pulse reports an origin, permission, token, project, or network error, Settings shows targeted
recovery guidance. Correct the Pulse configuration and retry from the environment that owns the
connection.

## Compatibility

Older Pulse Code servers do not advertise the integration capability, so newer clients do not send
unknown calls. Existing mobile installs, legacy <code>t3code</code> links, saved pairing records, and
Pulse/T3 configuration aliases continue to work.

OAuth sign-in, cross-server account synchronization, GitHub/Linear/Sentry adapters, and tokenizer
context are not part of this verified slice.

---

**Created:** 2026-08-20 . **Last edited:** 2026-08-20
