import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";

import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpOAuth from "./McpOAuth.ts";

const verifier = "pulse-code-mcp-oauth-verifier-with-enough-entropy-1234567890";
const challenge = NodeCrypto.createHash("sha256").update(verifier).digest("base64url");

it("accepts HTTPS and loopback callbacks only", () => {
  expect(McpOAuth.__testing.isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(
    true,
  );
  expect(McpOAuth.__testing.isAllowedRedirectUri("http://127.0.0.1:43123/callback")).toBe(true);
  expect(McpOAuth.__testing.isAllowedRedirectUri("http://localhost:43123/callback")).toBe(true);
  expect(McpOAuth.__testing.isAllowedRedirectUri("http://example.com/callback")).toBe(false);
  expect(McpOAuth.__testing.isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
});

it.effect("binds one-time authorization codes to the client, redirect, and PKCE verifier", () =>
  Effect.gen(function* () {
    const oauth = yield* McpOAuth.make;
    const redirectUri = "https://claude.ai/api/mcp/auth_callback";
    const client = yield* oauth.register({ clientName: "Claude", redirectUris: [redirectUri] });

    expect(
      yield* oauth.begin({
        clientId: client.clientId,
        redirectUri: "https://attacker.example/callback",
        codeChallenge: challenge,
      }),
    ).toBeUndefined();

    const pending = yield* oauth.begin({
      clientId: client.clientId,
      redirectUri,
      state: "claude-state",
      codeChallenge: challenge,
    });
    expect(pending?.clientName).toBe("Claude");
    const approved = yield* oauth.approve(pending!.requestId);
    expect(approved?.state).toBe("claude-state");

    const exchanged = yield* oauth.exchange({
      code: approved!.code,
      clientId: client.clientId,
      redirectUri,
      codeVerifier: verifier,
    });
    expect(exchanged?.clientId).toBe(client.clientId);
    expect(
      yield* oauth.exchange({
        code: approved!.code,
        clientId: client.clientId,
        redirectUri,
        codeVerifier: verifier,
      }),
    ).toBeUndefined();
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("consumes an authorization code after a failed verifier attempt", () =>
  Effect.gen(function* () {
    const oauth = yield* McpOAuth.make;
    const redirectUri = "http://localhost:43123/callback";
    const client = yield* oauth.register({
      clientName: "Claude Code",
      redirectUris: [redirectUri],
    });
    const pending = yield* oauth.begin({
      clientId: client.clientId,
      redirectUri,
      codeChallenge: challenge,
    });
    const approved = yield* oauth.approve(pending!.requestId);

    expect(
      yield* oauth.exchange({
        code: approved!.code,
        clientId: client.clientId,
        redirectUri,
        codeVerifier: "wrong-verifier",
      }),
    ).toBeUndefined();
    expect(
      yield* oauth.exchange({
        code: approved!.code,
        clientId: client.clientId,
        redirectUri,
        codeVerifier: verifier,
      }),
    ).toBeUndefined();
  }).pipe(Effect.provide(NodeServices.layer)),
);

it("advertises browser reauthentication from MCP authorization failures", () => {
  const response = McpHttpServer.mcpUnauthorizedResponse(
    "https://pulse.example/.well-known/oauth-protected-resource/mcp",
  );
  expect(response.status).toBe(401);
  expect(response.headers["www-authenticate"]).toContain(
    'resource_metadata="https://pulse.example/.well-known/oauth-protected-resource/mcp"',
  );
  expect(response.headers["www-authenticate"]).toContain('scope="mcp:preview"');
});
