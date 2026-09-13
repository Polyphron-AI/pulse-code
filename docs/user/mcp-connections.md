# MCP connections

MCP connections let your coding provider use tools supplied by another service or
a local process. In Settings, open Integrations, then MCP connections. Connection
details and credentials belong to the selected environment. A local command runs
on that environment's machine, not on your browser or phone.

Saving a connection does not select it or execute a tool. New connections start
off. Tool calls keep the provider's existing approval behavior.

## Select connections

Use MCP beside Skills in the composer. The count means selected connections, not
available tools. Search by name and select the connections needed for the next
turn. Use defaults restores the provider-instance default selection. Selecting
none is an explicit override, not a request to restore defaults.

Pulse-managed connections are separate from the provider's native connections.
Pulse does not overwrite the provider's global configuration. If native discovery
is unavailable, the picker says so rather than claiming there are no connections.

## Before sending

Pulse prepares selected connections before sending the prompt. If a connection
fails, the draft stays in the composer. Retry tries preparation again. Manage
connections opens the saved configuration. Continue without it excludes the failed
connections for this turn only, leaving your saved selection unchanged.

Cancel keeps the draft without sending. A change in selection takes effect on the
next turn, not halfway through a running tool call. Stop retains its normal meaning.

## Current support

This integration is in development. Codex is the first provider with managed
connection preparation. Other providers keep their native MCP behavior but do not
yet support Pulse-managed selection. An unknown connection state is not proof that
tools are available, and selection is not proof that the model used a tool.

The new picker targets desktop and web, including mobile web. Released native
mobile clients do not gain a new picker from a server update. Managed connections
in new-worktree drafts and packaged-app acceptance remain under verification.
