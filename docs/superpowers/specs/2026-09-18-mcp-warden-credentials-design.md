# MCP connections: Pulse Go Warden as a credential source

Date: 2026-09-18
Status: approved design, awaiting implementation plan
Scope: Pulse Next managed MCP layer (server, contracts, web settings). Skills
management is a later, separate feature.

## Problem

Managed MCP connections store secrets in the server secret store and hand them
to Codex and Claude in memory at turn preparation. Operators who keep MCP
credentials in Pulse Go Warden currently have to copy material into Pulse Code
by hand, which duplicates the secret and bypasses Warden receipts and grants.

## Decision

Add Warden as a third value kind next to plain text and stored secret. Material
is released from Pulse Go at turn preparation under one Pulse Go personal
access token (PAT) per environment and is never persisted by Pulse Code. Pulse
Go is used as it ships today: MCP tool calls on `POST /mcp` for metadata and
`POST /api/warden/release` for material. No pulse-go changes.

Alternatives rejected:

- Cache released material until grant expiry. Fewer receipts and faster sends,
  but revocation is unobserved until expiry and material lives in memory for up
  to seven days. Kept as the fallback if the latency acceptance case fails; the
  material source is a single interface so the swap is local.
- Resolve on the provider side through a CLI wrapper. The shipped CLI lacks the
  Warden verbs, the Claude in-memory MCP config has no exec hook, and material
  would land in subprocess argv.

## Defaults settled during design

- No active grant at send time fails preflight for that connection. Pulse Code
  never files a Warden use request. Grants are issued and accepted in Pulse Go.
- Version one honours grants whose scope equals the credential URN. Project
  scoped grants are a follow-up because release requires the grant scope string
  verbatim and Pulse Code holds no Pulse Go project mapping.
- The PAT is entered by the operator in Settings, stored in the server secret
  store, and never returned to a client.

## 1. Data model and contracts

`packages/contracts/src/pulseMcp.ts`

- Value input union gains `{ type: "warden", credentialRef }` where
  `credentialRef` matches
  `^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$`.
- Public value union gains `{ type: "warden", credentialRef }`. The URN is the
  configuration; there is no configured flag.
- Stored value in `pulse-mcp.json` is `{ type: "warden-ref", credentialRef }`.
  Persisted state stays version 2; the union widens.
- `PulseMcpWardenSettings`: `{ origin: string, patConfigured: boolean,
principal?: { id: string, name: string } }`. `principal` is recorded by the
  last successful test call.
- `PulseMcpWardenCredential`: `{ credentialRef, resourceRef, available,
grant: { status: "active" | "pending" | "none", expiresAt?: string } }`.
- Prepared connection `failed` gains optional `reason`:
  `"warden-not-configured" | "warden-unauthorized" | "warden-grant-required" |
"warden-unavailable"`. Absent reason keeps the current behaviour.
- Methods added to `PULSE_MCP_METHODS`: `pulse.mcp.warden.get`,
  `pulse.mcp.warden.set` (origin plus optional PAT; empty string clears the
  PAT), `pulse.mcp.warden.test`, `pulse.mcp.warden.listCredentials`.
  Read methods require the orchestration read scope, writes and test the
  operate scope, matching the existing MCP methods.
- `pulseCapabilities.wardenCredentials: boolean`, set true in `ws.ts` beside
  the other MCP flags.

## 2. Server

### PulseWardenClient (new, `apps/server/src/mcp/PulseWardenClient.ts`)

Thin typed client, Node `fetch`, no MCP SDK.

- `callTool(name, args)` posts JSON-RPC `tools/call` to `<origin>/mcp` with
  `Authorization: Bearer <pat>` and `Accept: application/json`, and decodes
  the structured tool result. Used for `warden_capabilities` (test),
  `warden_credentials_list`, and `warden_grants_list`.
- `release(body)` posts `{ requestId, grantId, credentialRef, scope }` to
  `<origin>/api/warden/release` and returns `material`.
- Timeout five seconds per call. Error union `PulseWardenError` with `kind`:
  `not-configured | unauthorized | unavailable | denied | protocol`. HTTP 401
  and Pulse Go `unauthorized` map to `unauthorized`; 503 `warden_unsupported`,
  `warden_unavailable`, network and timeout map to `unavailable`; other 4xx
  including `invalid_project_id` map to `denied`; malformed JSON maps to
  `protocol`. Errors never carry the PAT or material.

### Settings storage

Origin and principal live in `pulse-mcp.json` under a new `warden` key. The
PAT lives in the server secret store as `pulse-warden-pat`, written and
removed the way `serverSettings.ts` handles sensitive provider environment
variables.

### Turn preparation (`PulseMcpConfigService.prepareTurn`)

1. Selection resolves as today.
2. Collect distinct `credentialRef` values across selected connections. If
   empty, nothing else changes.
3. Fetch the active grant list once through `WardenGrantIndex`, cached per
   environment for 30 seconds. A grant matches when `status === "active"` and
   `scope === credentialRef`.
4. Release each credential through `WardenMaterialSource.resolve(refs)` with
   `Effect.all` at concurrency 4, a fresh UUID `requestId` per call, and the
   matching grant `id` and `scope`. Approach one does not cache material.
5. Splice material into the resolved http header or stdio env exactly where a
   stored secret value would go. `PulseMcpResolvedConnection` is unchanged, so
   the Codex and Claude adapters need no edits.

Failures mark only the affected connection `failed` with the mapped reason;
other connections in the turn proceed. Missing origin or PAT with a Warden
value present maps to `warden-not-configured`.

`WardenMaterialSource` is the swap point for the fallback approach; nothing
else in the service knows whether material is cached.

## 3. Web UI

Desktop wraps web. Mobile shows connection status only and does not edit
Warden settings.

- Settings > Integrations > MCP: a "Pulse Go Warden" card above the
  connections list for the selected environment. Origin field, PAT field
  (write-only; shows "Configured" with Replace and Clear once set), and a
  "Test connection" button that shows the principal name or the typed error.
  Hidden when `wardenCredentials` is false; editing gated by the operate scope
  like the rest of the panel.
- Connection editor value rows: the kind select gains "Warden credential".
  The text input is replaced by a picker fed by `listCredentials`. Each row
  shows the resource reference and a grant badge: "Active until <time>",
  "Pending acceptance", or "No grant". Ungranted credentials remain
  selectable; the badge is the warning.
- Connection list rows show a Warden badge when any value is a Warden
  reference, coloured by the worst grant state across its values.
- Send pause for `warden-grant-required`: "Pulse Go has no active grant for
  this credential. Issue and accept a grant-only grant in Pulse Go, then
  retry." Retry, Fix connection (opens MCP settings for the environment), and
  Continue without it are unchanged.

## 4. Error handling

| Condition                                                    | Reason                | Pause copy                                                                                                     |
| ------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| No origin or PAT                                             | warden-not-configured | Configure Pulse Go Warden in Settings > Integrations > MCP.                                                    |
| 401, expired or revoked PAT                                  | warden-unauthorized   | Pulse Go rejected the token for this environment. Replace it in Settings.                                      |
| No active grant with matching scope                          | warden-grant-required | Pulse Go has no active grant for this credential. Issue and accept a grant-only grant in Pulse Go, then retry. |
| 503 warden_unsupported, warden_unavailable, network, timeout | warden-unavailable    | Pulse Go Warden is unreachable. Retry.                                                                         |
| Other 4xx including project not allowed                      | warden-unauthorized   | Pulse Go denied the release: <server message>.                                                                 |

Logs record reason and credential URN only.

## 5. Testing and acceptance

Server, with a fake Warden HTTP server in the test:

- Grant matches only on exact scope and active status; pending and expired
  grants do not match.
- Releases for several refs run in parallel and land in the right header or
  env slot for http and stdio connections.
- Each error row above yields the mapped reason on that connection only.
- Missing PAT yields `warden-not-configured` without a network call.
- Grant index cache expires after 30 seconds under the test clock.
- `pulse.mcp.warden.set` with a PAT stores it in the secret store; the public
  settings show `patConfigured: true` and never the value; empty PAT removes
  the secret.
- Warden value round-trips through upsert, list, and public view.

Contracts: decode of the new value kind, settings, and reason codes.

Web: `mcpForm.ts` draft mapping for the new kind. No render-to-markup tests.

Latency acceptance: against a local Pulse Go with two Warden values, added
turn preparation time at p50 under 400 ms and p95 under 1 s. If it fails,
implement expiry-scoped material caching inside `WardenMaterialSource` before
shipping.

Docs: a Warden section in `docs/user/mcp-connections.md` (what it does, the
PAT setting path, that grants are issued in Pulse Go) and one paragraph in
`docs/internals/pulse-next-mcp-behavior.md` on why material is released per
turn and never persisted.

## Out of scope

Skills management, project-scoped grants, Warden use requests from Pulse
Code, mobile editing of Warden settings, OpenCode adapter changes beyond what
the shared resolved connection already provides.
