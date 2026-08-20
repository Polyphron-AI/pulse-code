# Native Issues integration

Pulse Code integrates Pulse as an Issues layer, not as an embedded Pulse application. The boundary
is deliberate: Pulse remains the system of record and advanced control plane, while Pulse Code owns
the environment-scoped connection, workspace mapping, evidence presentation, triage actions, and
fix-thread relationship.

```text
web / desktop / mobile client
        │ typed, capability-gated Issues RPC
        ▼
owning Pulse Code Server
  ├─ server secret store: Pulse PAT
  ├─ SQLite: endpoint, mappings, ingest keys, thread links
  └─ Pulse adapter
        ├─ PAT-authenticated admin API
        └─ public ingest + presigned media upload
                 ▼
               Pulse
```

## Vocabulary and identity

Pulse's captured `bug` is exposed as a Pulse Code **Report**. Pulse's `ticket` is exposed as an
**Issue**. Contracts retain distinct branded IDs for both. Every client query is keyed by the
owning environment before the Pulse Code project and Pulse identifier; identical project or Issue
IDs on two servers cannot collide.

An Issue reference contains the environment-local Pulse Code `projectId` and Pulse `issueId`. The
mapping resolves that project to a `pulseProjectId`. Referenced right-panel tabs additionally retain
the environment and Pulse project identity so they survive reconnects safely.

## Ownership and persistence

The server is the only Pulse API client.

| Data                                                    | Owner             | Persistence                                 |
| ------------------------------------------------------- | ----------------- | ------------------------------------------- |
| Pulse personal access token                             | Pulse Code Server | `ServerSecretStore`, key `pulse-issues-pat` |
| Pulse endpoint                                          | Pulse Code Server | `pulse_issue_connection`                    |
| Workspace → Pulse project mapping and public ingest key | Pulse Code Server | `pulse_issue_project_mappings`              |
| Issue ↔ fix thread link                                 | Pulse Code Server | `pulse_issue_thread_links`                  |
| Issue, Report, evidence, activity, membership           | Pulse             | Fetched through the adapter                 |
| Referenced panel tabs and pending draft context         | Client            | Existing panel/draft state patterns         |

The PAT is never stored in SQLite, returned in a connection snapshot, logged, or forwarded to a
web or mobile client. Snapshots expose only `tokenConfigured`. The ingest key is Pulse's public
project key; it is stored with the mapping because only the server capture path needs it.

Disconnect removes the secret, endpoint, and project mappings in one server-scoped operation.
Historical thread links intentionally survive. They contain no credential and preserve continuity
for a later reconnect/remap.

## Verified Pulse API surface

The adapter is based on the current Pulse handler shapes and validates every response before it
crosses the typed RPC boundary. The verified PAT-authenticated operations are:

- `GET /api/projects`, paginated, for project discovery and ingest public keys;
- `GET /api/tickets` with project, search, status, severity, assignee, archive, sort, limit, and
  offset filters;
- `GET /api/tickets/:issueId` for Issue detail;
- `GET /api/tickets/:issueId/members` for linked Report summaries;
- `GET /api/bugs/:reportId` for full Report evidence and signed media URLs;
- `GET /api/tickets/:issueId/activity` for activity;
- `GET /api/projects/:pulseProjectId/members` for assignee candidates;
- `PATCH /api/tickets/:issueId` and `PATCH /api/bugs/:reportId` with `If-Match` versions; and
- `POST /api/tickets` with `memberBugIds` to promote a Report into an Issue.

The server resolves the workspace mapping before every Issue-scoped operation. Detail, evidence,
activity, triage, Report update, and Report promotion preflight the requested Issue or Report against
that mapped Pulse project before the downstream operation runs. List and activity adapters also
reject rows that Pulse returns outside the requested project or Issue. This keeps guessed IDs and a
malformed upstream response from crossing workspace boundaries.

Capture uses Pulse's public ingest contract rather than the PAT:

1. `POST /api/ingest` sends the actual Preview page `Origin` and `X-Pulse-Project` public key.
2. Pulse returns the Report ID and any requested presigned media upload URLs.
3. The server uploads media directly with `PUT`.
4. `POST /api/ingest/:reportId/uploads-complete` finalizes captures that include media.

Pulse's generated public API schema currently trails some handler response shapes. Keep strict
runtime validation in the adapter and update it against the handlers until the upstream schema is
regenerated; do not weaken the cross-client contracts to match ambiguous responses.

## Evidence and capture constraints

Issue list and detail calls do not carry full Report evidence. Clients fetch bounded Report summaries
when the Evidence view opens, then fetch one Report only when the user opens it. Activity and
assignee candidates follow the same lazy-query pattern. This prevents large console, network,
screenshot, audio, or video payloads from flooding WebSocket snapshots.

Preview capture may include at most three media attachments under the contract. Each item is capped
at 25,000,000 bytes. Inline media must be a matching base64 data URL. Saved media paths are resolved
with real paths and must remain below the server's `browser-artifacts` directory before they are
read; arbitrary client-supplied filesystem paths are rejected.

The page's actual `http` or `https` origin is sent unchanged to Pulse. Pulse owns the project origin
policy. Pulse Code surfaces `requiredOrigin` on an `origin-not-allowed` failure and retains the local
capture draft/evidence for retry; it does not silently permit loopback origins or mutate Pulse's
allowlist.

## Optimistic versions and failures

Issue and Report updates carry the version last rendered by the client in `If-Match`. A conflict is
translated to the stable `stale-version` failure. Clients refresh the current resource and require
the user to reapply the edit; they never overwrite a newer update.

All expected failures cross the transport as `IssueOperationError` with an operation, stable reason,
human detail, retryability, and optional required origin. Reasons distinguish connection, mapping,
authentication, permission, origin, not-found, stale-version, response, upload, availability, and
input failures so each surface can offer a specific recovery path.

## Authorization, capability skew, and remote environments

Read RPCs use the orchestration read scope. Connection changes, mappings, capture, triage mutations,
Report promotion, and thread-link changes use the orchestration operate scope. The Pulse PAT never
changes this Pulse Code authorization boundary.

Servers advertise the optional `environment.capabilities.issues` flag. An absent or false flag means
the client must not mount Issues RPC queries or actions for that environment. This lets newer web,
desktop, and mobile clients stay connected to older servers without sending unknown methods.

Each local, direct-remote, relay, or tunnel environment runs the same server-side adapter with its
own secret and mappings. Client aggregators query capable environments independently, retain values
from successful environments, and report partial failures rather than blanking the combined inbox.

## Fix-thread lifecycle

Starting a fix creates a project-scoped draft with structured Issue identity and an evidence-aware
prompt. The link is persisted only after the first turn successfully creates the real server thread;
a failed bootstrap keeps the pending context for retry. A thread links to at most one Issue, and an
Issue links to at most one thread. Link, relink, unlink, and stale/deleted-thread recovery are
explicit operations.

Raw Report evidence is not copied into composer prompts or thread metadata. The thread surface shows
only the compact Issue reference, title, status, and severity and queries the native Issue panel when
the user asks for evidence.

## UI boundary

Do not mount the Pulse dashboard, feedback widget, or a webview inside Pulse Code. Extend the native
surfaces instead:

- Integrations owns connect, health, mapping, disconnect, and the handoff to Pulse administration.
- Preview owns File issue capture and local evidence retention.
- The shared right panel owns referenced Issue tabs and lazy evidence/activity.
- The Issues workspace owns cross-environment triage and filtering.
- Threads own start/resume/link/unlink and compact Issue context.
- Mobile owns list, detail, evidence summaries, lifecycle triage, and linked-thread resume; Preview
  capture and relationship editing remain web/desktop-only.

Advanced analytics, project configuration, origin administration, and other Pulse control-plane
features stay in Pulse until Pulse Code has a concrete native workflow for them.
