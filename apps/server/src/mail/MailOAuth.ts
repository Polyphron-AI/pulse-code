// @effect-diagnostics nodeBuiltinImport:off - The loopback OAuth callback is a Node HTTP boundary.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";

import { MailError, type MailAccount } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { MailConfigService, type StoredMailAccount } from "./MailConfigService.ts";

const FLOW_LIFETIME = Duration.minutes(10);
const HTTP_TIMEOUT = Duration.seconds(15);
const REFRESH_MARGIN_MS = 5 * 60 * 1_000;
const CALLBACK_PATH = "/callback";

type OAuthKind = "oauth-google" | "oauth-microsoft";

/** Endpoints come only from these presets, so a stored account can never point a token at another host. */
const preset = (auth: { readonly kind: OAuthKind; readonly tenant?: string | undefined }) => {
  if (auth.kind === "oauth-google") {
    return {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scope: "https://mail.google.com/",
      // Google returns a refresh token only for offline access with explicit consent.
      extra: { access_type: "offline", prompt: "consent" },
    };
  }
  const base = `https://login.microsoftonline.com/${auth.tenant ?? "common"}/oauth2/v2.0`;
  return {
    authorizeUrl: `${base}/authorize`,
    tokenUrl: `${base}/token`,
    scope:
      "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access",
    extra: {},
  };
};

const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optionalKey(Schema.String),
  expires_in: Schema.optionalKey(Schema.Number),
});
const decodeTokenResponse = Schema.decodeUnknownEffect(TokenResponse);
const decodeTokenError = Schema.decodeUnknownEffect(Schema.Struct({ error: Schema.String }));

const fail = (kind: MailError["kind"], message: string) => new MailError({ kind, message });

interface Flow {
  readonly accountId: string;
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
  /** Set once a return URL with the right state arrives; later ones are refused. */
  settled: boolean;
  readonly returned: Deferred.Deferred<URL>;
  readonly result: Deferred.Deferred<MailAccount, MailError>;
  /** The browser waiting on the loopback callback, answered once sign-in finishes. */
  response?: NodeHttp.ServerResponse;
}

/** Accepts only a URL back to this flow's own redirect URI carrying its state. */
const matchReturn = (flow: Flow, raw: string): URL | undefined => {
  if (!URL.canParse(raw)) return undefined;
  const url = new URL(raw);
  const expected = new URL(flow.redirectUri);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) return undefined;
  return url.searchParams.get("state") === flow.state ? url : undefined;
};

const requireOAuth = (account: StoredMailAccount) =>
  account.auth.kind === "password"
    ? Effect.fail(fail("invalid-input", "This account signs in with a password, not OAuth."))
    : Effect.succeed({ ...account.auth, kind: account.auth.kind });

export class MailOAuth extends Context.Service<
  MailOAuth,
  {
    /** Starts a browser sign-in with a loopback callback; the URL can also be pasted back. */
    readonly startOAuth: (
      accountId: string,
    ) => Effect.Effect<{ readonly flowId: string; readonly authorizeUrl: string }, MailError>;
    /** Finishes a sign-in from the redirect URL the browser landed on. */
    readonly completeOAuth: (
      flowId: string,
      redirectUrl: string,
    ) => Effect.Effect<MailAccount, MailError>;
    /** A current access token, refreshed when it expires within five minutes. Never a password. */
    readonly accessToken: (accountId: string) => Effect.Effect<string, MailError>;
  }
>()("t3/mail/MailOAuth") {}

export const make = Effect.gen(function* () {
  const config = yield* MailConfigService;
  const http = yield* HttpClient.HttpClient;
  const scope = yield* Effect.scope;
  const flows = new Map<string, Flow>();
  const refreshLock = yield* Semaphore.make(1);

  const tokenRequest = (account: StoredMailAccount, params: Record<string, string>) =>
    Effect.gen(function* () {
      const auth = yield* requireOAuth(account);
      const clientSecret = yield* config.readClientSecret(account.id);
      const body = new URLSearchParams({
        client_id: auth.clientId,
        ...params,
        ...Option.match(clientSecret, {
          onNone: () => ({}),
          onSome: (secret) => ({ client_secret: secret }),
        }),
      });
      const unavailable = fail("unavailable", "The sign-in provider could not be reached.");
      const response = yield* http
        .execute(
          HttpClientRequest.post(preset(auth).tokenUrl).pipe(
            HttpClientRequest.setHeader("accept", "application/json"),
            HttpClientRequest.bodyText(body.toString(), "application/x-www-form-urlencoded"),
          ),
        )
        .pipe(
          Effect.flatMap((result) =>
            result.json.pipe(Effect.map((json) => ({ status: result.status, json }))),
          ),
          Effect.timeoutOrElse({ duration: HTTP_TIMEOUT, orElse: () => Effect.fail(unavailable) }),
          Effect.mapError(() => unavailable),
        );
      if (response.status >= 200 && response.status < 300) {
        return yield* decodeTokenResponse(response.json).pipe(
          Effect.mapError(() => fail("unavailable", "The sign-in provider sent an invalid reply.")),
        );
      }
      const code = yield* decodeTokenError(response.json).pipe(
        Effect.map(({ error }) => error),
        Effect.orElseSucceed(() => "unknown"),
      );
      return yield* Effect.fail({ _tag: "OAuthError" as const, code });
    });

  const store = (
    account: StoredMailAccount,
    tokens: typeof TokenResponse.Type,
    previousRefreshToken?: string,
  ) =>
    Effect.gen(function* () {
      const refreshToken = tokens.refresh_token ?? previousRefreshToken;
      if (refreshToken === undefined) {
        return yield* fail(
          "auth-failed",
          "The provider did not grant offline access. Sign in again and allow it.",
        );
      }
      const now = yield* Clock.currentTimeMillis;
      return yield* config.setCredential(account.id, {
        type: "oauth",
        refreshToken,
        accessToken: tokens.access_token,
        ...(tokens.expires_in === undefined ? {} : { expiresAt: now + tokens.expires_in * 1_000 }),
      });
    });

  const exchangeCode = (flow: Flow, url: URL) =>
    Effect.gen(function* () {
      if (url.searchParams.has("error")) {
        return yield* fail("auth-failed", "Sign-in was declined or did not finish.");
      }
      const code = url.searchParams.get("code");
      if (!code) return yield* fail("invalid-input", "The redirect URL has no sign-in code.");
      const account = yield* config.getAccount(flow.accountId);
      const tokens = yield* tokenRequest(account, {
        grant_type: "authorization_code",
        code,
        code_verifier: flow.verifier,
        redirect_uri: flow.redirectUri,
      }).pipe(
        Effect.catchTag("OAuthError", () =>
          Effect.fail(fail("auth-failed", "The provider did not accept this sign-in.")),
        ),
      );
      return yield* store(account, tokens);
    });

  const listen = (flowRef: { current?: Flow }) =>
    Effect.callback<NodeHttp.Server, MailError>((resume) => {
      const server = NodeHttp.createServer((request, response) => {
        const flow = flowRef.current;
        const url = flow && matchReturn(flow, new URL(request.url ?? "/", flow.redirectUri).href);
        if (request.method !== "GET" || !flow || !url || flow.settled) {
          response.writeHead(404).end();
          return;
        }
        flow.settled = true;
        flow.response = response;
        Deferred.doneUnsafe(flow.returned, Effect.succeed(url));
      });
      server.once("error", () =>
        resume(Effect.fail(fail("unavailable", "Could not start the local sign-in callback."))),
      );
      server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)));
    });

  const close = (server: NodeHttp.Server) =>
    Effect.sync(() => {
      server.closeAllConnections();
      server.close();
    });

  const startOAuth = (accountId: string) =>
    Effect.gen(function* () {
      const account = yield* config.getAccount(accountId);
      const auth = yield* requireOAuth(account);
      const flowRef: { current?: Flow } = {};
      const server = yield* listen(flowRef);
      const { port } = server.address() as { port: number };
      const flowId = NodeCrypto.randomBytes(16).toString("base64url");
      const flow: Flow = {
        accountId,
        state: NodeCrypto.randomBytes(32).toString("base64url"),
        verifier: NodeCrypto.randomBytes(64).toString("base64url"),
        redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
        settled: false,
        returned: yield* Deferred.make<URL>(),
        result: yield* Deferred.make<MailAccount, MailError>(),
      };
      flowRef.current = flow;
      flows.set(flowId, flow);
      const { authorizeUrl, scope: oauthScope, extra } = preset(auth);
      const url = new URL(authorizeUrl);
      url.search = new URLSearchParams({
        client_id: auth.clientId,
        response_type: "code",
        redirect_uri: flow.redirectUri,
        scope: oauthScope,
        state: flow.state,
        code_challenge_method: "S256",
        code_challenge: NodeCrypto.createHash("sha256").update(flow.verifier).digest("base64url"),
        login_hint: account.address,
        ...extra,
      }).toString();

      // One fiber per flow owns the exchange, the browser reply, and cleanup.
      yield* Deferred.await(flow.returned).pipe(
        Effect.timeoutOrElse({
          duration: FLOW_LIFETIME,
          orElse: () => Effect.fail(fail("conflict", "This sign-in expired. Start it again.")),
        }),
        Effect.flatMap((returned) => exchangeCode(flow, returned)),
        Effect.exit,
        Effect.flatMap((exit) =>
          Effect.sync(() => {
            flow.response
              ?.writeHead(exit._tag === "Success" ? 200 : 400, { "content-type": "text/plain" })
              .end(
                exit._tag === "Success"
                  ? "Signed in. You can close this tab."
                  : "Sign-in did not finish. Return to the app.",
              );
          }).pipe(Effect.andThen(Deferred.done(flow.result, exit))),
        ),
        Effect.ensuring(
          Effect.sync(() => flows.delete(flowId)).pipe(Effect.andThen(close(server))),
        ),
        Effect.forkIn(scope),
      );
      return { flowId, authorizeUrl: url.toString() };
    });

  const completeOAuth = (flowId: string, redirectUrl: string) =>
    Effect.gen(function* () {
      const flow = flows.get(flowId);
      if (!flow) return yield* fail("not-found", "This sign-in is no longer active. Start again.");
      const url = matchReturn(flow, redirectUrl.trim());
      if (!url) {
        return yield* fail("invalid-input", "This redirect URL does not belong to this sign-in.");
      }
      if (flow.settled) return yield* fail("conflict", "This sign-in already finished.");
      flow.settled = true;
      yield* Deferred.succeed(flow.returned, url);
      return yield* Deferred.await(flow.result);
    });

  const accessToken = (accountId: string) =>
    refreshLock.withPermits(1)(
      Effect.gen(function* () {
        const account = yield* config.getAccount(accountId);
        yield* requireOAuth(account);
        const stored = yield* config.readCredential(accountId);
        if (Option.isNone(stored) || stored.value.type !== "oauth") {
          return yield* fail("auth-failed", "Sign in to this account in Email settings.");
        }
        const credential = stored.value;
        const now = yield* Clock.currentTimeMillis;
        if (
          credential.accessToken !== undefined &&
          credential.expiresAt !== undefined &&
          credential.expiresAt - now > REFRESH_MARGIN_MS
        ) {
          return credential.accessToken;
        }
        const tokens = yield* tokenRequest(account, {
          grant_type: "refresh_token",
          refresh_token: credential.refreshToken,
        }).pipe(
          Effect.catchTag("OAuthError", ({ code }) =>
            code === "invalid_grant"
              ? config
                  .setHealth(accountId, {
                    status: "reauth-required",
                    message: "The provider revoked or expired this sign-in.",
                    checkedAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
                  })
                  .pipe(
                    Effect.andThen(
                      Effect.fail(
                        fail("auth-failed", "Sign in to this account again in Email settings."),
                      ),
                    ),
                  )
              : Effect.fail(fail("unavailable", "The provider could not refresh this sign-in.")),
          ),
        );
        yield* store(account, tokens, credential.refreshToken);
        return tokens.access_token;
      }),
    );

  return MailOAuth.of({ startOAuth, completeOAuth, accessToken });
});

export const layer = Layer.effect(MailOAuth, make);
