# MCP browser reauthentication

## Goal

When an MCP client receives an authentication failure from Pulse, it can discover Pulse's OAuth endpoints, open a browser, authorize against the current Pulse environment, and return to the client automatically. The same flow works for first-time access and expired or revoked credentials.

## Design

Pulse exposes OAuth protected-resource metadata for `/mcp`, authorization-server metadata, dynamic client registration, an authorization endpoint, and a token endpoint. The flow uses authorization code with PKCE. Pulse validates redirect URIs against the client's registration and consumes every authorization code once.

The browser authorization endpoint uses the existing Pulse environment session. If the browser is not paired, it redirects to `/pair` with a same-origin return path. The pairing page resumes the OAuth request after authentication. An authenticated user sees a focused approval page naming the requesting client and the preview access being requested. Approving redirects to the registered client callback with a short-lived code and the original state. Denying returns an OAuth access-denied error.

OAuth access tokens use Pulse's existing revocable client-session store with read-only scope and an MCP-specific label. The `/mcp` middleware first checks the existing provider-scoped credential registry, preserving current Codex, Claude, Cursor, Grok, and OpenCode behavior. It then accepts a valid Pulse session token issued through OAuth and builds an external MCP invocation context for the preview toolkit.

All OAuth metadata and challenges derive their origin from the incoming request so local, LAN, tunnel, and relay-hosted access advertise the reachable endpoint. Tokens and authorization codes never appear in logs. Focused server tests cover discovery, redirect validation, PKCE exchange, one-time codes, approval authentication, and MCP bearer acceptance. Web tests cover the post-pair return path.
