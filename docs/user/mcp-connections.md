# MCP connections

Open **Settings → Providers → MCP connections**, then choose **Add MCP**. Enter a name and unique server ID, and paste the connection JSON. Pulse accepts an HTTP URL with optional headers, a local command with arguments and environment variables, or a `mcpServers` object containing one server.

Local commands run on the selected environment. Install their dependencies there first. Connection credentials are kept in the environment's protected secret store and hidden after saving. To replace credentials, edit the connection and paste the updated JSON. Leave that field blank to retain the saved connection.

Choose providers under **Always available** to give their threads access by default. Otherwise the connection starts off. Availability does not bypass the provider's tool approval rules.

In a thread, open **MCP** beside the model picker. Toggle individual connections, or choose **Use defaults** to remove the thread's overrides. **Manage MCPs** opens the connection settings without leaving the conversation. New threads use provider defaults until a thread exists to store overrides.

The dropdown lists enabled connections first and lets you search by name or server ID. Scroll to browse the remaining connections; it shows up to three rows on narrow screens and four on desktop, with search and management controls kept outside the scrolling list.

Changes apply before the next turn. Pulse reconnects the provider using the saved conversation when needed. An active turn keeps its current connections. If another message is sent while a changed selection is pending and a turn is still active, Pulse asks you to wait. A failed reconnect appears as a session error; the MCP count means selected connections, not a successful connection check.

Codex, Claude, Cursor and Grok have thread-scoped MCP wiring. OpenCode and OMP do not yet support these selections. OpenCode's shared MCP registry needs session isolation before it can offer independent thread controls. Provider-managed connections outside Pulse remain controlled by that provider.

These controls are available in the desktop and web clients. Mobile uses the same server settings and session behavior, but does not yet have the MCP editor or dropdown.

Remove an MCP from its editor to delete its saved connection and clear its thread overrides. Running turns retain their current tools until the next turn.
