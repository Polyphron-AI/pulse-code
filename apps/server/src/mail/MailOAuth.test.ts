// @effect-diagnostics preferSchemaOverJson:off nodeBuiltinImport:off -- The fake token endpoint replies with literal JSON, and the loopback callback is hit over Node HTTP.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";

import * as NodeServices from "@effect/platform-node/NodeServices";
import type { MailAccountInput } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as MailConfig from "./MailConfigService.ts";
import * as MailOAuth from "./MailOAuth.ts";

interface TokenEndpoint {
  readonly requests: Array<{ readonly url: string; readonly params: URLSearchParams }>;
  readonly replies: Array<{ readonly status: number; readonly body: unknown }>;
}

/** A synthetic token endpoint standing in for the preset hosts. */
const tokenEndpointLayer = (endpoint: TokenEndpoint) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        const body =
          request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
        endpoint.requests.push({ url: request.url, params: new URLSearchParams(body) });
        const reply = endpoint.replies.shift() ?? { status: 500, body: {} };
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(reply.body), {
            status: reply.status,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    ),
  );

const makeLayer = (endpoint: TokenEndpoint) => {
  const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mail-oauth-test-" });
  const mailConfig = MailConfig.layer.pipe(
    Layer.provide(ServerSecretStore.layer.pipe(Layer.provide(configLayer))),
    Layer.provide(configLayer),
    Layer.provide(Layer.mock(Orchestrator.OrchestratorV2)({})),
  );
  return MailOAuth.layer.pipe(
    Layer.provideMerge(mailConfig),
    Layer.provide(tokenEndpointLayer(endpoint)),
    Layer.provideMerge(NodeServices.layer),
  );
};

const googleAccount = {
  nickname: "Work",
  address: "me@example.com",
  imap: { host: "imap.gmail.com", port: 993 },
  smtp: { host: "smtp.gmail.com", port: 465 },
  auth: { kind: "oauth-google", clientId: "client-123", clientSecret: "client-secret" },
} satisfies MailAccountInput;

const kindOf = <A>(effect: Effect.Effect<A, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

const run = <A, E>(
  endpoint: TokenEndpoint,
  body: Effect.Effect<A, E, MailOAuth.MailOAuth | MailConfig.MailConfigService>,
) => body.pipe(Effect.provide(makeLayer(endpoint)));

describe("MailOAuth", () => {
  it.effect("rejects a redirect with the wrong state, then exchanges with PKCE", () => {
    const endpoint: TokenEndpoint = {
      requests: [],
      replies: [
        {
          status: 200,
          body: { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 },
        },
      ],
    };
    return run(
      endpoint,
      Effect.gen(function* () {
        const config = yield* MailConfig.MailConfigService;
        const oauth = yield* MailOAuth.MailOAuth;
        const account = yield* config.upsertAccount(googleAccount);
        const { flowId, authorizeUrl } = yield* oauth.startOAuth(account.id);
        const authorize = new URL(authorizeUrl);
        expect(authorize.origin + authorize.pathname).toBe(
          "https://accounts.google.com/o/oauth2/v2/auth",
        );
        expect(authorize.searchParams.get("scope")).toBe("https://mail.google.com/");
        expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
        const redirectUri = authorize.searchParams.get("redirect_uri") ?? "";
        expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

        const forged = `${redirectUri}?code=stolen&state=wrong`;
        expect(yield* kindOf(oauth.completeOAuth(flowId, forged))).toBe("invalid-input");
        expect(endpoint.requests).toEqual([]);

        const state = authorize.searchParams.get("state");
        const completed = yield* oauth.completeOAuth(
          flowId,
          `${redirectUri}?code=good&state=${state}`,
        );
        expect(completed.credentialConfigured).toBe(true);

        const [request] = endpoint.requests;
        expect(request?.url).toBe("https://oauth2.googleapis.com/token");
        expect(request?.params.get("grant_type")).toBe("authorization_code");
        expect(request?.params.get("client_secret")).toBe("client-secret");
        const verifier = request?.params.get("code_verifier") ?? "";
        expect(NodeCrypto.createHash("sha256").update(verifier).digest("base64url")).toBe(
          authorize.searchParams.get("code_challenge"),
        );
        const stored = yield* config.readCredential(account.id);
        expect(Option.getOrUndefined(stored)).toMatchObject({
          type: "oauth",
          refreshToken: "refresh-1",
          accessToken: "access-1",
        });
        expect(yield* kindOf(oauth.completeOAuth(flowId, forged))).toBe("not-found");
      }),
    );
  });

  it.effect("completes through the loopback callback", () => {
    const endpoint: TokenEndpoint = {
      requests: [],
      replies: [{ status: 200, body: { access_token: "access-1", refresh_token: "refresh-1" } }],
    };
    return run(
      endpoint,
      Effect.gen(function* () {
        const config = yield* MailConfig.MailConfigService;
        const oauth = yield* MailOAuth.MailOAuth;
        const account = yield* config.upsertAccount(googleAccount);
        const authorize = new URL((yield* oauth.startOAuth(account.id)).authorizeUrl);
        const callback = new URL(authorize.searchParams.get("redirect_uri") ?? "");
        callback.search = new URLSearchParams({
          code: "good",
          state: authorize.searchParams.get("state") ?? "",
        }).toString();
        const status = yield* Effect.callback<number | undefined>((resume) => {
          NodeHttp.get(callback, (reply) => {
            reply.resume();
            resume(Effect.succeed(reply.statusCode));
          });
        });
        expect(status).toBe(200);
        expect(endpoint.requests).toHaveLength(1);
        expect((yield* config.getAccount(account.id)).credentialRef).toBeDefined();
      }),
    );
  });

  it.effect("refreshes a token near expiry and stores the new one", () => {
    const endpoint: TokenEndpoint = {
      requests: [],
      replies: [{ status: 200, body: { access_token: "access-2", expires_in: 3600 } }],
    };
    return run(
      endpoint,
      Effect.gen(function* () {
        const config = yield* MailConfig.MailConfigService;
        const oauth = yield* MailOAuth.MailOAuth;
        const account = yield* config.upsertAccount(googleAccount);
        yield* config.setCredential(account.id, {
          type: "oauth",
          refreshToken: "refresh-1",
          accessToken: "access-1",
          expiresAt: 60_000,
        });
        expect(yield* oauth.accessToken(account.id)).toBe("access-2");
        expect(endpoint.requests[0]?.params.get("refresh_token")).toBe("refresh-1");
        expect(Option.getOrUndefined(yield* config.readCredential(account.id))).toMatchObject({
          refreshToken: "refresh-1",
          accessToken: "access-2",
          expiresAt: 3_600_000,
        });
        // The fresh token is reused without another request.
        expect(yield* oauth.accessToken(account.id)).toBe("access-2");
        expect(endpoint.requests).toHaveLength(1);
      }),
    );
  });

  it.effect("marks the account for sign-in again on invalid_grant, with no password (A19)", () => {
    const endpoint: TokenEndpoint = {
      requests: [],
      replies: [{ status: 400, body: { error: "invalid_grant" } }],
    };
    return run(
      endpoint,
      Effect.gen(function* () {
        const config = yield* MailConfig.MailConfigService;
        const oauth = yield* MailOAuth.MailOAuth;
        const account = yield* config.upsertAccount(googleAccount);
        yield* config.setCredential(account.id, { type: "oauth", refreshToken: "revoked" });
        expect(yield* kindOf(oauth.accessToken(account.id))).toBe("auth-failed");
        expect((yield* config.getAccount(account.id)).health.status).toBe("reauth-required");

        const password = yield* config.upsertAccount({
          ...googleAccount,
          nickname: "Legacy",
          auth: { kind: "password" },
        });
        yield* config.setCredential(password.id, { type: "password", password: "hunter2" });
        expect(yield* kindOf(oauth.accessToken(password.id))).toBe("invalid-input");
        expect(endpoint.requests).toHaveLength(1);
      }),
    );
  });
});
