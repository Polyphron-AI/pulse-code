// @effect-diagnostics nodeBuiltinImport:off - OAuth uses a loopback Node HTTP callback.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";
import { DriveError, type DriveConnection } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { DriveApi } from "./DriveApi.ts";
import { DriveStore, type StoredDriveConnection } from "./DriveStore.ts";
const scopeName = "https://www.googleapis.com/auth/drive.readonly";
const Token = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optionalKey(Schema.String),
  expires_in: Schema.optionalKey(Schema.Number),
  scope: Schema.optionalKey(Schema.String),
});
const decodeToken = Schema.decodeUnknownEffect(Token);
const decodeTokenError = Schema.decodeUnknownOption(Schema.Struct({ error: Schema.String }));
const fail = (kind: DriveError["kind"], message: string) => new DriveError({ kind, message });
interface Flow {
  connection: StoredDriveConnection;
  state: string;
  verifier: string;
  redirectUri: string;
  settled: boolean;
  returned: Deferred.Deferred<URL, DriveError>;
  result: Deferred.Deferred<DriveConnection, DriveError>;
  response?: NodeHttp.ServerResponse;
}
const match = (flow: Flow, raw: string) => {
  if (!URL.canParse(raw)) return;
  const url = new URL(raw);
  const expected = new URL(flow.redirectUri);
  return url.origin === expected.origin &&
    url.pathname === expected.pathname &&
    url.searchParams.get("state") === flow.state
    ? url
    : undefined;
};
export const make = Effect.gen(function* () {
  const store = yield* DriveStore;
  const api = yield* DriveApi;
  const http = yield* HttpClient.HttpClient;
  const lifetime = yield* Effect.scope;
  const lock = yield* Semaphore.make(1);
  const startLock = yield* Semaphore.make(1);
  const flows = new Map<string, Flow>();
  const tokenRequest = (connection: StoredDriveConnection, params: Record<string, string>) =>
    Effect.gen(function* () {
      const secret = yield* store.readClientSecret(connection.id);
      const body = new URLSearchParams({
        client_id: connection.clientId,
        ...params,
        ...(Option.isSome(secret) ? { client_secret: secret.value } : {}),
      });
      const response = yield* http
        .execute(
          HttpClientRequest.post("https://oauth2.googleapis.com/token").pipe(
            HttpClientRequest.bodyText(body.toString(), "application/x-www-form-urlencoded"),
          ),
        )
        .pipe(
          Effect.flatMap((response) =>
            response.json.pipe(Effect.map((json) => ({ status: response.status, json }))),
          ),
          Effect.mapError(() => fail("unavailable", "Google sign-in could not be reached.")),
          Effect.timeoutOrElse({
            duration: "15 seconds",
            orElse: () => Effect.fail(fail("unavailable", "Google sign-in timed out.")),
          }),
          Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
        );
      if (response.status < 200 || response.status >= 300) {
        const code = decodeTokenError(response.json);
        if (Option.isSome(code) && code.value.error === "invalid_grant") {
          yield* store.health(
            connection.id,
            connection.generation,
            "Google sign-in expired or was revoked. Reconnect this account.",
            true,
          );
          return yield* fail(
            "auth-required",
            "Google sign-in expired or was revoked. Reconnect this account.",
          );
        }
        return yield* fail("unavailable", "Google did not accept this sign-in request.");
      }
      const tokens = yield* decodeToken(response.json).pipe(
        Effect.mapError(() => fail("unavailable", "Google returned an invalid sign-in response.")),
      );
      if (
        tokens.scope &&
        (!tokens.scope.split(" ").includes(scopeName) ||
          tokens.scope
            .split(" ")
            .some(
              (scope) =>
                scope.startsWith("https://www.googleapis.com/auth/drive") && scope !== scopeName,
            ))
      )
        return yield* fail(
          "auth-required",
          "Google did not grant the requested read-only Drive scope.",
        );
      return tokens;
    });
  const save = (connection: StoredDriveConnection, tokens: typeof Token.Type, previous?: string) =>
    Effect.gen(function* () {
      const refreshToken = tokens.refresh_token ?? previous;
      if (!refreshToken)
        return yield* fail(
          "auth-required",
          "Google did not grant offline access. Reconnect and allow read-only access.",
        );
      const identity = yield* api.identity(tokens.access_token);
      const now = yield* Clock.currentTimeMillis;
      return yield* store.setCredential(connection.id, connection.generation, identity, {
        refreshToken,
        accessToken: tokens.access_token,
        expiresAt: now + (tokens.expires_in ?? 3600) * 1000,
      });
    });
  const exchange = (flow: Flow, url: URL) =>
    Effect.gen(function* () {
      if (url.searchParams.has("error"))
        return yield* fail("auth-required", "Google sign-in was declined or canceled.");
      const code = url.searchParams.get("code");
      if (!code) return yield* fail("invalid-input", "The return URL has no sign-in code.");
      const current = yield* store.get(flow.connection.id);
      if (current.generation !== flow.connection.generation)
        return yield* fail("conflict", "This connection changed. Start sign-in again.");
      const tokens = yield* tokenRequest(flow.connection, {
        grant_type: "authorization_code",
        code,
        code_verifier: flow.verifier,
        redirect_uri: flow.redirectUri,
      });
      return yield* save(flow.connection, tokens);
    });
  const cancel = (flowId: string) =>
    Effect.gen(function* () {
      const flow = flows.get(flowId);
      if (!flow) return;
      if (flow.settled) return yield* fail("conflict", "This sign-in is already finishing.");
      flow.settled = true;
      yield* Deferred.fail(flow.returned, fail("conflict", "Sign-in was canceled."));
    });
  return {
    cancel,
    start: (connectionId: string) =>
      startLock.withPermits(1)(
        Effect.gen(function* () {
          const connection = yield* store.get(connectionId);
          for (const [id, flow] of flows)
            if (flow.connection.id === connectionId && !flow.settled) yield* cancel(id);
          if (flows.size >= 8)
            return yield* fail(
              "limit-exceeded",
              "Too many sign-ins are active. Cancel one or wait for it to expire.",
            );
          const ref: { flow?: Flow } = {};
          const server = yield* Effect.callback<NodeHttp.Server, DriveError>((resume) => {
            const server = NodeHttp.createServer((request, response) => {
              const flow = ref.flow;
              const raw = request.url ?? "/";
              const url =
                flow && URL.canParse(raw, flow.redirectUri)
                  ? match(flow, new URL(raw, flow.redirectUri).href)
                  : undefined;
              if (request.method !== "GET" || !flow || !url || flow.settled) {
                response.writeHead(404).end();
                return;
              }
              flow.settled = true;
              flow.response = response;
              Deferred.doneUnsafe(flow.returned, Effect.succeed(url));
            });
            server.once("error", () =>
              resume(
                Effect.fail(fail("unavailable", "The loopback sign-in callback could not start.")),
              ),
            );
            server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)));
          });
          const flowId = NodeCrypto.randomBytes(16).toString("base64url");
          const flow: Flow = {
            connection,
            state: NodeCrypto.randomBytes(32).toString("base64url"),
            verifier: NodeCrypto.randomBytes(64).toString("base64url"),
            redirectUri: `http://127.0.0.1:${(server.address() as { port: number }).port}/callback`,
            settled: false,
            returned: yield* Deferred.make<URL, DriveError>(),
            result: yield* Deferred.make<DriveConnection, DriveError>(),
          };
          ref.flow = flow;
          flows.set(flowId, flow);
          const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
          url.search = new URLSearchParams({
            client_id: connection.clientId,
            response_type: "code",
            redirect_uri: flow.redirectUri,
            scope: scopeName,
            state: flow.state,
            code_challenge_method: "S256",
            code_challenge: NodeCrypto.createHash("sha256")
              .update(flow.verifier)
              .digest("base64url"),
            access_type: "offline",
            prompt: "consent",
          }).toString();
          yield* Deferred.await(flow.returned).pipe(
            Effect.timeoutOrElse({
              duration: "10 minutes",
              orElse: () => Effect.fail(fail("conflict", "This sign-in expired. Start again.")),
            }),
            Effect.flatMap((url) => exchange(flow, url)),
            Effect.exit,
            Effect.flatMap((exit) =>
              Effect.sync(() =>
                flow.response
                  ?.writeHead(exit._tag === "Success" ? 200 : 400, { "content-type": "text/plain" })
                  .end(
                    exit._tag === "Success"
                      ? "Connected. You can close this tab."
                      : "Sign-in did not finish. Return to Pulse Code.",
                  ),
              ).pipe(Effect.andThen(Deferred.done(flow.result, exit))),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                flows.delete(flowId);
                server.closeAllConnections();
                server.close();
              }),
            ),
            Effect.forkIn(lifetime),
          );
          return { flowId, authorizeUrl: url.href };
        }),
      ),
    complete: (flowId: string, raw: string) =>
      Effect.gen(function* () {
        const flow = flows.get(flowId);
        if (!flow)
          return yield* fail("not-found", "This sign-in is no longer active. Start again.");
        const url = match(flow, raw.trim());
        if (!url)
          return yield* fail("invalid-input", "This return URL does not belong to this sign-in.");
        if (flow.settled) return yield* fail("conflict", "This sign-in already finished.");
        flow.settled = true;
        yield* Deferred.succeed(flow.returned, url);
        return yield* Deferred.await(flow.result);
      }),
    accessToken: (connectionId: string) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const connection = yield* store.get(connectionId);
          if (!connection.connected)
            return yield* fail("auth-required", "Reconnect this Drive connection in Settings.");
          const credential = yield* store.readCredential(connectionId);
          if (Option.isNone(credential))
            return yield* fail("auth-required", "Reconnect this Drive connection in Settings.");
          const now = yield* Clock.currentTimeMillis;
          if (credential.value.accessToken && (credential.value.expiresAt ?? 0) - now > 300000)
            return { token: credential.value.accessToken, generation: connection.generation };
          const tokens = yield* tokenRequest(connection, {
            grant_type: "refresh_token",
            refresh_token: credential.value.refreshToken,
          });
          yield* save(connection, tokens, credential.value.refreshToken);
          return { token: tokens.access_token, generation: connection.generation };
        }),
      ),
  };
});
export class DriveOAuth extends Context.Service<DriveOAuth, Effect.Success<typeof make>>()(
  "t3/drive/DriveOAuth",
) {}
export const layer = Layer.effect(DriveOAuth, make);
