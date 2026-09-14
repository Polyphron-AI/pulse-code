import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SynchronizedRef from "effect/SynchronizedRef";
import * as UrlParams from "effect/unstable/http/UrlParams";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";

export const MCP_OAUTH_SCOPE = "mcp:preview";
export const MCP_OAUTH_SUBJECT_PREFIX = "mcp-oauth:";

const PENDING_TTL_MS = Duration.toMillis(Duration.minutes(10));
const CODE_TTL_MS = Duration.toMillis(Duration.minutes(5));
const MAX_REGISTERED_CLIENTS = 256;

interface RegisteredClient {
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectUris: ReadonlySet<string>;
  readonly issuedAt: number;
}

interface AuthorizationRequest {
  readonly requestId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectUri: string;
  readonly state?: string;
  readonly codeChallenge: string;
  readonly expiresAt: number;
}

interface AuthorizationCode {
  readonly code: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectUri: string;
  readonly state?: string;
  readonly codeChallenge: string;
  readonly expiresAt: number;
}

interface OAuthState {
  readonly clients: ReadonlyMap<string, RegisteredClient>;
  readonly requests: ReadonlyMap<string, AuthorizationRequest>;
  readonly codes: ReadonlyMap<string, AuthorizationCode>;
}

export interface McpOAuthShape {
  readonly register: (input: {
    readonly clientName: string;
    readonly redirectUris: ReadonlyArray<string>;
  }) => Effect.Effect<RegisteredClient>;
  readonly begin: (input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly state?: string;
    readonly codeChallenge: string;
  }) => Effect.Effect<AuthorizationRequest | undefined>;
  readonly approve: (requestId: string) => Effect.Effect<AuthorizationCode | undefined>;
  readonly deny: (requestId: string) => Effect.Effect<AuthorizationRequest | undefined>;
  readonly exchange: (input: {
    readonly code: string;
    readonly clientId: string;
    readonly redirectUri: string;
    readonly codeVerifier: string;
  }) => Effect.Effect<AuthorizationCode | undefined>;
}

export class McpOAuth extends Context.Service<McpOAuth, McpOAuthShape>()("t3/mcp/McpOAuth") {}

const bytesToBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

const isAllowedRedirectUri = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
};

const prune = (state: OAuthState, now: number): OAuthState => ({
  clients: state.clients,
  requests: new Map(Array.from(state.requests).filter(([, request]) => request.expiresAt > now)),
  codes: new Map(Array.from(state.codes).filter(([, code]) => code.expiresAt > now)),
});

export const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const state = yield* SynchronizedRef.make<OAuthState>({
    clients: new Map(),
    requests: new Map(),
    codes: new Map(),
  });

  const randomId = crypto.randomBytes(32).pipe(Effect.map(bytesToBase64Url), Effect.orDie);

  const register: McpOAuthShape["register"] = Effect.fn("McpOAuth.register")(function* (input) {
    const now = yield* Clock.currentTimeMillis;
    const clientId = yield* randomId;
    const client: RegisteredClient = {
      clientId,
      clientName: input.clientName,
      redirectUris: new Set(input.redirectUris),
      issuedAt: now,
    };
    yield* SynchronizedRef.update(state, (current) => {
      const next = prune(current, now);
      const clients = new Map(next.clients).set(clientId, client);
      if (clients.size > MAX_REGISTERED_CLIENTS) {
        const oldest = [...clients.values()].toSorted(
          (left, right) => left.issuedAt - right.issuedAt,
        )[0];
        if (oldest) clients.delete(oldest.clientId);
      }
      return { ...next, clients };
    });
    return client;
  });

  const begin: McpOAuthShape["begin"] = Effect.fn("McpOAuth.begin")(function* (input) {
    const now = yield* Clock.currentTimeMillis;
    const requestId = yield* randomId;
    return yield* SynchronizedRef.modify(state, (current) => {
      const next = prune(current, now);
      const client = next.clients.get(input.clientId);
      if (!client || !client.redirectUris.has(input.redirectUri)) return [undefined, next] as const;
      const request: AuthorizationRequest = {
        requestId,
        clientId: client.clientId,
        clientName: client.clientName,
        redirectUri: input.redirectUri,
        ...(input.state ? { state: input.state } : {}),
        codeChallenge: input.codeChallenge,
        expiresAt: now + PENDING_TTL_MS,
      };
      return [
        request,
        { ...next, requests: new Map(next.requests).set(requestId, request) },
      ] as const;
    });
  });

  const takeRequest = (requestId: string) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return yield* SynchronizedRef.modify(state, (current) => {
        const next = prune(current, now);
        const request = next.requests.get(requestId);
        const requests = new Map(next.requests);
        requests.delete(requestId);
        return [request, { ...next, requests }] as const;
      });
    });

  const approve: McpOAuthShape["approve"] = Effect.fn("McpOAuth.approve")(function* (requestId) {
    const request = yield* takeRequest(requestId);
    if (!request) return undefined;
    const now = yield* Clock.currentTimeMillis;
    const codeValue = yield* randomId;
    const code: AuthorizationCode = {
      code: codeValue,
      clientId: request.clientId,
      clientName: request.clientName,
      redirectUri: request.redirectUri,
      ...(request.state ? { state: request.state } : {}),
      codeChallenge: request.codeChallenge,
      expiresAt: now + CODE_TTL_MS,
    };
    yield* SynchronizedRef.update(state, (current) => {
      const next = prune(current, now);
      return { ...next, codes: new Map(next.codes).set(codeValue, code) };
    });
    return code;
  });

  const deny: McpOAuthShape["deny"] = Effect.fn("McpOAuth.deny")(takeRequest);

  const exchange: McpOAuthShape["exchange"] = Effect.fn("McpOAuth.exchange")(function* (input) {
    const verifierHash = yield* crypto
      .digest("SHA-256", new TextEncoder().encode(input.codeVerifier))
      .pipe(Effect.map(bytesToBase64Url), Effect.orDie);
    const now = yield* Clock.currentTimeMillis;
    return yield* SynchronizedRef.modify(state, (current) => {
      const next = prune(current, now);
      const code = next.codes.get(input.code);
      const codes = new Map(next.codes);
      codes.delete(input.code);
      const matches =
        code?.clientId === input.clientId &&
        code.redirectUri === input.redirectUri &&
        code.codeChallenge === verifierHash;
      return [matches ? code : undefined, { ...next, codes }] as const;
    });
  });

  return McpOAuth.of({ register, begin, approve, deny, exchange });
});

export const layer = Layer.effect(McpOAuth, make);

const requestUrl = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return Option.getOrUndefined(HttpServerRequest.toURL(request));
});

const json = (body: unknown, status = 200) =>
  HttpServerResponse.jsonUnsafe(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const approvalHtml = (input: {
  readonly requestId: string;
  readonly clientName: string;
}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Allow MCP access | Pulse Code</title><style>
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f5f5f5}.card{width:min(28rem,calc(100% - 2rem));border:1px solid #2d2d31;border-radius:16px;padding:24px;background:#151518;box-shadow:0 24px 70px #0008}.brand{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#999}h1{font-size:24px;margin:12px 0 8px}p{color:#b5b5bb;line-height:1.55}.scope{border:1px solid #303035;border-radius:10px;padding:12px;margin:20px 0;color:#ddd}.actions{display:flex;gap:8px;justify-content:flex-end}button{border:1px solid #3b3b42;border-radius:8px;padding:9px 14px;background:#222228;color:#eee;font-weight:600;cursor:pointer}button.primary{border-color:#4778ff;background:#3568ed;color:white}
</style></head><body><main class="card"><div class="brand">Pulse Code</div><h1>Allow MCP access?</h1><p><strong>${escapeHtml(input.clientName)}</strong> wants to connect to this Pulse environment.</p><div class="scope">View and control the shared browser preview.</div><form method="post" action="/oauth/authorize"><input type="hidden" name="request_id" value="${escapeHtml(input.requestId)}"><div class="actions"><button name="decision" value="deny">Deny</button><button class="primary" name="decision" value="approve">Allow access</button></div></form></main></body></html>`;

const authenticateBrowser = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const auth = yield* EnvironmentAuth.EnvironmentAuth;
  return yield* auth.authenticateHttpRequest(request).pipe(Effect.option);
});

type MetadataPath =
  | "/.well-known/oauth-protected-resource"
  | "/.well-known/oauth-protected-resource/mcp"
  | "/.well-known/oauth-authorization-server";

const metadataRoute = (path: MetadataPath, kind: "resource" | "server") =>
  HttpRouter.add(
    "GET",
    path,
    Effect.gen(function* () {
      const url = yield* requestUrl;
      if (!url) return oauthError("invalid_request", "The request URL is invalid.");
      const origin = url.origin;
      return kind === "resource"
        ? json({
            resource: `${origin}/mcp`,
            authorization_servers: [origin],
            scopes_supported: [MCP_OAUTH_SCOPE],
            bearer_methods_supported: ["header"],
          })
        : json({
            issuer: origin,
            authorization_endpoint: `${origin}/oauth/authorize`,
            token_endpoint: `${origin}/oauth/mcp/token`,
            registration_endpoint: `${origin}/oauth/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            scopes_supported: [MCP_OAUTH_SCOPE],
          });
    }),
  );

const registrationRoute = (oauth: McpOAuthShape) =>
  HttpRouter.add(
    "POST",
    "/oauth/register",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const body = Option.getOrUndefined(yield* request.json.pipe(Effect.option));
      if (!body || typeof body !== "object")
        return oauthError("invalid_client_metadata", "Expected JSON client metadata.");
      const record = body as Record<string, unknown>;
      const redirectUris = Array.isArray(record.redirect_uris)
        ? record.redirect_uris.filter((value): value is string => typeof value === "string")
        : [];
      if (redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
        return oauthError("invalid_redirect_uri", "Use an HTTPS or loopback HTTP redirect URI.");
      }
      const clientName =
        typeof record.client_name === "string" && record.client_name.trim()
          ? record.client_name.trim().slice(0, 120)
          : "MCP client";
      const client = yield* oauth.register({ clientName, redirectUris });
      return json(
        {
          client_id: client.clientId,
          client_id_issued_at: Math.floor(client.issuedAt / 1_000),
          client_secret_expires_at: 0,
          client_name: client.clientName,
          redirect_uris: [...client.redirectUris],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
          response_types: ["code"],
        },
        201,
      );
    }),
  );

const authorizeGetRoute = (oauth: McpOAuthShape) =>
  HttpRouter.add(
    "GET",
    "/oauth/authorize",
    Effect.gen(function* () {
      const url = yield* requestUrl;
      if (!url) return oauthError("invalid_request", "The request URL is invalid.");
      const browserSession = yield* authenticateBrowser;
      if (Option.isNone(browserSession)) {
        const returnTo = `${url.pathname}${url.search}`;
        return HttpServerResponse.redirect(`/pair?returnTo=${encodeURIComponent(returnTo)}`, {
          status: 302,
        });
      }
      if (!browserSession.value.scopes.includes(AuthOrchestrationReadScope)) {
        return oauthError("access_denied", "This Pulse session cannot authorize MCP access.", 403);
      }
      const responseType = url.searchParams.get("response_type");
      const clientId = url.searchParams.get("client_id") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const codeChallenge = url.searchParams.get("code_challenge") ?? "";
      const codeChallengeMethod = url.searchParams.get("code_challenge_method");
      const requestedScope = url.searchParams.get("scope") ?? MCP_OAUTH_SCOPE;
      if (
        responseType !== "code" ||
        codeChallengeMethod !== "S256" ||
        codeChallenge.length < 43 ||
        !requestedScope.split(/\s+/u).includes(MCP_OAUTH_SCOPE)
      ) {
        return oauthError(
          "invalid_request",
          "Pulse requires authorization code, PKCE S256, and the mcp:preview scope.",
        );
      }
      const pending = yield* oauth.begin({
        clientId,
        redirectUri,
        codeChallenge,
        ...(url.searchParams.get("state") ? { state: url.searchParams.get("state")! } : {}),
      });
      if (!pending)
        return oauthError("invalid_request", "The client or redirect URI is not registered.");
      return HttpServerResponse.text(approvalHtml(pending), {
        contentType: "text/html; charset=utf-8",
        headers: {
          "cache-control": "no-store",
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
          "x-frame-options": "DENY",
        },
      });
    }),
  );

const authorizePostRoute = (oauth: McpOAuthShape) =>
  HttpRouter.add(
    "POST",
    "/oauth/authorize",
    Effect.gen(function* () {
      const browserSession = yield* authenticateBrowser;
      if (Option.isNone(browserSession))
        return oauthError("access_denied", "The Pulse browser session expired.", 401);
      if (!browserSession.value.scopes.includes(AuthOrchestrationReadScope)) {
        return oauthError("access_denied", "This Pulse session cannot authorize MCP access.", 403);
      }
      const request = yield* HttpServerRequest.HttpServerRequest;
      const form = UrlParams.toRecord(yield* request.urlParamsBody);
      const requestId = typeof form.request_id === "string" ? form.request_id : "";
      if (form.decision !== "approve") {
        const denied = yield* oauth.deny(requestId);
        if (!denied) return oauthError("invalid_request", "The authorization request expired.");
        const callback = new URL(denied.redirectUri);
        callback.searchParams.set("error", "access_denied");
        if (denied.state) callback.searchParams.set("state", denied.state);
        return HttpServerResponse.redirect(callback.toString(), { status: 303 });
      }
      const approved = yield* oauth.approve(requestId);
      if (!approved) return oauthError("invalid_request", "The authorization request expired.");
      const callback = new URL(approved.redirectUri);
      callback.searchParams.set("code", approved.code);
      if (approved.state) callback.searchParams.set("state", approved.state);
      return HttpServerResponse.redirect(callback.toString(), { status: 303 });
    }),
  );

const tokenRoute = (oauth: McpOAuthShape) =>
  HttpRouter.add(
    "POST",
    "/oauth/mcp/token",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const form = UrlParams.toRecord(yield* request.urlParamsBody);
      const value = (key: string) => (typeof form[key] === "string" ? form[key] : "");
      if (value("grant_type") !== "authorization_code") {
        return oauthError("unsupported_grant_type", "Pulse supports the authorization_code grant.");
      }
      const code = yield* oauth.exchange({
        code: value("code"),
        clientId: value("client_id"),
        redirectUri: value("redirect_uri"),
        codeVerifier: value("code_verifier"),
      });
      if (!code)
        return oauthError("invalid_grant", "The authorization code or PKCE verifier is invalid.");
      const auth = yield* EnvironmentAuth.EnvironmentAuth;
      const issued = yield* auth.issueSession({
        ttl: Duration.days(30),
        subject: `${MCP_OAUTH_SUBJECT_PREFIX}${code.clientId}`,
        scopes: [AuthOrchestrationReadScope],
        label: `${code.clientName} MCP`,
      });
      const now = yield* Clock.currentTimeMillis;
      return json({
        access_token: issued.token,
        token_type: "Bearer",
        expires_in: Math.max(0, Math.floor((issued.expiresAt.epochMilliseconds - now) / 1_000)),
        scope: MCP_OAUTH_SCOPE,
      });
    }).pipe(
      Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, () =>
        Effect.succeed(
          oauthError("server_error", "Pulse could not issue the MCP access token.", 500),
        ),
      ),
    ),
  );

export const routes = Layer.unwrap(
  Effect.map(McpOAuth, (oauth) =>
    Layer.mergeAll(
      metadataRoute("/.well-known/oauth-protected-resource", "resource"),
      metadataRoute("/.well-known/oauth-protected-resource/mcp", "resource"),
      metadataRoute("/.well-known/oauth-authorization-server", "server"),
      registrationRoute(oauth),
      authorizeGetRoute(oauth),
      authorizePostRoute(oauth),
      tokenRoute(oauth),
    ),
  ),
);

export const __testing = { isAllowedRedirectUri };
