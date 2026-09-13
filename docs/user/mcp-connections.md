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
none is an explicit override, not a request to restore defaults. Save as provider
defaults saves the current selection for that provider instance; it does not
remove the current thread's override.

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

This integration is in development. Codex, Claude Code, and locally managed
OpenCode sessions support managed connection preparation. OpenCode sessions that
use a shared external server cannot use Pulse-managed connections because changing
that server would affect other threads. Their native MCP connections remain
unchanged. An unknown connection state is not proof that
tools are available, and selection is not proof that the model used a tool.

The new picker targets desktop and web, including mobile web. Released native
mobile clients do not gain a new picker from a server update. When creating a new
worktree, deselect managed connections for the first turn, then select them once
its workspace exists.
Packaged-app and real-provider acceptance are still required before release.

Older clients use the server's saved selection. The server checks connections
before a turn that needs preparation. If preparation fails, sending fails rather
than silently omitting a connection. Use an updated web client to manage the
selection or continue without a failed connection for one turn.

For Codex, selected local-command connections cannot assign different values to
the same environment variable. Pulse reports that conflict before sending; use
compatible values or select those connections in separate turns.
