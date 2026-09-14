# MCP access

Pulse exposes its shared browser preview tools at `/mcp`. MCP clients that support browser authentication can connect to that URL without a manually copied bearer token.

When the client asks for access, it opens Pulse in your browser. Pair the browser with the environment if needed, then select **Allow access**. Pulse returns you to the MCP client automatically. If the saved access expires or you revoke it, the client can run the same flow again.

The authorization grants access only to the shared browser preview tools. It does not grant permission to manage Pulse settings or control agent threads.

To remove access, open **Settings → Connections** and revoke the client session whose name ends in "MCP". The MCP client must authenticate again before it can use Pulse.
