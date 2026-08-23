# Connect Pulse to Pulse Code

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

## Let agents use Pulse

Once Pulse is connected and your projects are mapped, the agents you run in Pulse Code can read and
act on that work directly, in any thread, on any client. Ask an agent "what's this ticket about?" or
"file what you just reproduced as a bug" and it has the tools to answer without you copying anything
across.

Agents can:

- List the connected Pulse projects and see which one the current thread belongs to.
- Search Issues across every mapped project, and read one Issue in full with its activity trail.
- Read the Reports attached to an Issue, including the captured evidence.
- Look up who can be assigned work in a project.
- Update an Issue's status, severity, assignee, title, description, or labels.
- Update a Report, or mark it a duplicate.
- Promote a Report into a tracked Issue.
- File a new Report with evidence — including a recording the agent just made in the collaborative
  browser, attached without leaving the thread.
- Link the current thread to an Issue, or unlink it.

When an agent omits the project, it works against the project that owns the current thread. If that
thread has no mapped project, the agent is told to name one rather than guessing.

Anything that changes your Pulse data asks for your approval first, the same way any other tool that
touches the outside world does. Reads do not. Issue and Report edits use the current version, so an
agent working from a stale read is refused rather than allowed to overwrite an edit someone else made
in the meantime.

The access token stays on the server. Agents never see it, and neither do web, desktop, or mobile
clients.

### Turning it off

**Settings → Integrations → Agent Pulse access** controls this. Turn it off and agents lose the Pulse
tools entirely — they are not offered and cannot be called — while you keep the Issues workspace and
everything else on this page. The setting belongs to the server, so it applies to every client
connected to that environment, and it is separate from the agent browser access setting: changing one
does not change the other.

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

Pulseflow appears as an unavailable web sidebar and panel option while its integration remains on
the roadmap. These entries do not send requests or claim a connection. They become actionable only
after a future Pulseflow integration can map the current workspace and advertise support.

---

**Created:** 2026-08-20 . **Last edited:** 2026-08-23
