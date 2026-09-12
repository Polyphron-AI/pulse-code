# MCP behavior proposal

Status: proposal for discussion. Existing launch defaults remain approved; failure
handling below still needs a user decision. No MCP runtime changes are implemented.

## Ownership and selection

The connected environment owns connection configuration, credentials and local
processes. Pulse-managed connections and provider-native connections are distinct
sources. Reuse provider-native configuration and authentication where supported;
do not copy secrets into browser settings or overwrite a provider's global files.
Discover native connections only through supported provider interfaces. Otherwise
show discovery as unavailable, not an empty inventory or an invented health state.

Per-thread selection resolves an explicit override before the provider-instance
default. New connections default off. Use defaults removes an override; it does
not disable the provider default. Drafts need selection before the first send;
persist it when the thread is created. The older Pulse UI required an existing
thread, so it is not a complete implementation of this behavior.

The composer count means selected connections, not connected servers or tool count.
Each entry shows its source, selection scope and provider support. Provider-native
entries are read-only unless that provider exposes safe per-session control.
Do not offer a toggle that changes other projects or provider sessions globally.

## Runtime states

Keep selection separate from application and health:

- Off: not requested for the next turn.
- Selected: requested, but not yet applied to the provider session.
- Pending next turn: selection differs from the running session.
- Available: the provider has reported the tools available in this session.
- Error or sign-in required: show a recoverable problem without changing selection.
- Unsupported or status unknown: show the limitation explicitly.

Freeze effective connection selection for a running turn. Apply changes before
the next turn, reconnecting the provider only if required and preserving its
continuation identity. Never silently discard a failed reconnect and submit with
different tools. Switching a toggle does not execute a tool or bypass approval.
Disabling a connection is not an emergency cancellation of an in-flight tool call;
Stop retains its existing upstream meaning. Show this distinction when a turn runs.

Proposed failure policy: when a selected connection cannot be applied, stop before
sending and offer Retry, Fix connection or Continue without it for this turn.
That last action requires an explicit choice and must not silently change saved
defaults. If the provider cannot report per-connection readiness, show Unknown
rather than promising this preflight can detect every downstream failure.

## Configuration and UI

Support existing HTTP and stdio shapes first. Local commands run on the environment,
not the browser device. Saving configuration does not authorize arbitrary tool
calls. An explicit connection test may start the configured stdio process and
contact its endpoint; describe that action before running it. Reuse existing secret
storage and authentication paths. Do not add a second OAuth implementation just
for Pulse or claim generic OAuth support before verifying each provider path.

Use the approved composer position after Skills. The dropdown provides search,
per-connection switches, selected count, Use defaults and Manage MCPs. Keep native
and Pulse-managed sources distinguishable. Expanding a connection to inspect its
reported tools is useful, but individual-tool filtering is deferred until provider
support is demonstrated. Selection is not proof that a model used a tool. Show
actual calls through upstream tool activity, not a separate activity log.

MCP tools are not slash skills. Do not invent /tool-name execution commands as part
of this integration. Existing provider-native commands remain unchanged.

## Compatibility and acceptance

Use a Pulse-owned selection/configuration module and small adapters into provider
session preparation. Sequence shared settings and contracts with the skills batch;
do not implement concurrent edits to those shared files. Client-managed state must
not round-trip through older native clients in a way that erases Pulse fields.

The old Pulse snapshot reports thread MCP wiring for Codex, Claude, Cursor and
Grok, with OpenCode unsupported. Treat this as historical evidence, not the Pulse
Next capability matrix. Verify each current adapter, including Antigravity. OMP
is excluded. Do not enable a global OpenCode registry as per-thread isolation.

Mobile web gets full management. Released native mobile keeps normal sessions;
no new editor is assumed. Verify server-enforced selection on native-mobile turns
and that ordinary native settings writes preserve managed configuration. Local,
remote, relay and tunnel requests use existing environment routing/authentication.

Focused tests must cover first-turn selection, per-instance defaults, overrides
and reset, concurrent threads with different tools, next-turn changes, failed
reconnect, explicit continue-without choice, unsupported providers, secret
redaction, duplicate IDs, old-client round trips and environment switching.
