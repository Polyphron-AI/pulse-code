# MCP connections

MCP connections let your coding provider use tools supplied by another service or
a local process. In Settings, open Integrations, then MCP connections. Connection
details and credentials belong to the selected environment. A local command runs
on that environment's machine, not on your browser or phone.

Saving a connection does not select it or execute a tool. New connections start
off. Tool calls keep the provider's existing approval behavior.

## Select connections

MCP and Skills stay visible in the chat controls even when nothing has been added.
Open their management actions to add entries. A visible control does not mean the
selected provider supports using managed entries; the menu explains any limitation.
Provider-supplied entries are shown separately from Pulse-managed entries. A
configured entry is not proof of a live connection, and a ready connection is not
proof that the model has called one of its tools.

Use MCP beside Skills in the composer. Search by name and switch on the
connections needed for the next turn. A connection shows **Checking…** while the
provider initializes or reloads it, checks authentication, and confirms its tools
are registered. The switch stays on only after every selected connection is ready,
then shows **Active · Ready**. Pulse never calls an MCP tool as part of this check.

The count means selected connections. Saved defaults and expired readiness checks
still need provider confirmation. Readiness labels expire before an idle prepared
session can be removed; Retry checks the connection again.

If the provider cannot confirm readiness, the switch stays off and the picker
shows the reason. Retry runs the check again; Manage MCPs opens the saved
configuration. Switching a connection off removes it from the next prepared
selection immediately. The provider session is not treated as reconciled until
the follow-up preparation finishes.

Use defaults restores the provider-instance default selection. Selecting none is
an explicit override, not a request to restore defaults. Save as provider defaults
saves the current selection for that provider instance; it does not remove the
current thread's override.

Pulse-managed connections are separate from the provider's native connections.
Pulse does not overwrite the provider's global configuration. If native discovery
is unavailable, the picker says so rather than claiming there are no connections.

## Import existing provider connections

In **Settings → Integrations → MCP**, choose an environment and detect existing
Claude Code, Codex and OpenCode connections. Detection reads user-level
configuration on that environment's machine, not on the device displaying the page.
Review the detected entries before importing them into Pulse-managed MCP.
Once you approve following a source, new entries added to that provider's
configuration are imported automatically while the environment is running. You
can turn following off. Entries skipped during review or later removed from Pulse
are not added back automatically.

Importing does not change the provider's files, start commands or select connections
for a chat. Existing managed entries are not overwritten. Missing credentials or
settings Pulse cannot preserve are reported instead of silently dropped. Provider
OAuth sessions are not transferred. Imported connections are independent copies;
later provider-config edits do not replace your managed configuration. Automatic
addition never selects a connection for your chats.

For example, you can review and import a Codex connection once, then select its
Pulse-managed copy for a Claude Code or locally managed OpenCode conversation.

## Pulse Go Warden credentials

A connection header or environment variable can reference a credential kept in
Pulse Go Warden instead of a value stored in Pulse Code. Pulse Code asks Pulse Go
for the material each time it prepares a turn and never saves it.

To set it up, open Settings > MCP, enter your Pulse Go origin and a personal
access token in the Pulse Go Warden card, and choose Test connection. Then edit a
connection, set a row's kind to Warden credential, and pick the credential.

Grants are issued and accepted in Pulse Go, not here. The picker shows whether
each credential has an active grant. A connection whose credential has no active
grant fails before sending with a message telling you what to fix in Pulse Go.

## Before sending

Pulse prepares selected connections again before sending the prompt to check
their current readiness. If a connection fails, the draft
stays in the composer. Retry tries preparation again. Manage
connections opens the saved configuration. Continue without it excludes the failed
connections for this turn only, leaving your saved selection unchanged.

Cancel keeps the draft without sending. A change in selection takes effect on the
next turn, not halfway through a running tool call. Stop retains its normal meaning.

## Current support

This integration is in development. Codex, Claude Code, and locally managed
OpenCode sessions support managed connection preparation. OpenCode sessions that
use a shared external server cannot use Pulse-managed connections because changing
that server would affect other threads. Their native MCP connections remain
unchanged. An unknown connection state is not proof that tools are available, and
readiness is not proof that the model used a tool.

The new picker targets desktop and web, including mobile web. Released native
mobile clients do not gain a new picker from a server update. A new worktree needs
to exist before the picker can check connections in that workspace. Existing
selections are checked before the first turn runs in the created worktree.
Packaged-app and real-provider acceptance are still required before release.

Older clients use the server's saved selection. The server checks connections
before a turn that needs preparation. If preparation fails, sending fails rather
than silently omitting a connection. Use an updated web client to manage the
selection or continue without a failed connection for one turn.

For Codex, selected local-command connections cannot assign different values to
the same environment variable. Pulse reports that conflict before sending; use
compatible values or select those connections in separate turns.

Claude Code and OpenCode run local MCP servers from the thread's working
directory. If a connection requests a different working directory, Pulse reports
the mismatch before sending instead of silently running it elsewhere.
