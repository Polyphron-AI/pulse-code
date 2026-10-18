import {
  CommunicationConnection,
  CommunicationConnectionId,
  CommunicationsError,
  SlackConnectInput,
  SlackDisconnectInput,
} from "@t3tools/contracts";
import {
  Context,
  Crypto,
  Deferred,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
  Semaphore,
  Stream,
} from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import * as Secrets from "../auth/ServerSecretStore.ts";
import * as Store from "./SlackAccountStore.ts";

const ProviderId = Schema.String.check(Schema.isPattern(/^[A-Z][A-Z0-9]{1,79}$/));
const AuthResponse = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    team_id: ProviderId,
    team: CommunicationConnection.fields.label,
    user_id: ProviderId,
    user: CommunicationConnection.fields.identity,
    bot_id: Schema.optionalKey(ProviderId),
  }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.String.check(Schema.isMaxLength(160)) }),
]);
const AuthorizeInput = Schema.Struct({
  connectionId: CommunicationConnectionId,
  workspaceId: ProviderId,
});
const decodeAuth = Schema.decodeEffect(Schema.fromJsonString(AuthResponse));
const fail = (kind: CommunicationsError["kind"], message: string) =>
  new CommunicationsError({ kind, message });
const unavailable = () => fail("unavailable", "Slack could not complete this connection request.");
const credentialStorage = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapError(() => Effect.logWarning("Slack credential storage operation failed.")),
    Effect.mapError(unavailable),
  );
const rateLimited = (retry: string | undefined) =>
  new CommunicationsError({
    kind: "rate-limit",
    message: "Slack asked Pulse to wait before connecting again.",
    retryAfterSeconds: retry && /^\d{1,6}$/.test(retry) ? Math.max(1, Number(retry)) : 60,
  });
const changed = () =>
  fail("not-found", "This Slack connection changed or was disconnected. Reload its connections.");
const credentialWarning = "Slack credential storage needs attention. Reconnect this reader.";
const removalWarning = "Slack is disconnected, but its token could not be removed.";
const secretKey = (id: string) => `slack-token-${id}`;
const decode = <S extends Schema.Top>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(() => fail("invalid-input", "Use valid Slack connection details.")),
  );
const publicConnection = (account: CommunicationConnection): CommunicationConnection => ({
  id: account.id,
  provider: "slack",
  identity: account.identity,
  label: account.label,
  connected: account.connected && account.error === undefined,
  generation: account.generation,
  ...(account.error === undefined ? {} : { error: account.error }),
});

/** Private lease. Readers race cancellation and check the persisted generation before returning. */
interface Authorization {
  readonly token: Redacted.Redacted<string>;
  readonly generation: number;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly isBot: boolean;
  readonly cancelled: Effect.Effect<never, CommunicationsError>;
  readonly check: Effect.Effect<void, CommunicationsError>;
}
export class SlackConnection extends Context.Service<
  SlackConnection,
  {
    readonly connect: (
      input: SlackConnectInput,
    ) => Effect.Effect<CommunicationConnection, CommunicationsError>;
    readonly list: Effect.Effect<ReadonlyArray<CommunicationConnection>, CommunicationsError>;
    readonly disconnect: (input: SlackDisconnectInput) => Effect.Effect<void, CommunicationsError>;
    readonly authorize: (
      input: typeof AuthorizeInput.Type,
    ) => Effect.Effect<Authorization, CommunicationsError>;
  }
>()("t3/communications/SlackConnection") {}

export const make = Effect.gen(function* () {
  const store = yield* Store.SlackAccountStore;
  const secrets = yield* Secrets.ServerSecretStore;
  const http = yield* HttpClient.HttpClient;
  const crypto = yield* Crypto.Crypto;
  const lock = yield* Semaphore.make(1);
  const leases = new Map<string, { generation: number; cancel: Deferred.Deferred<void> }>();
  const disconnectedAt = new Map<string, number>();
  // This process-local guard denies leases when durable repair fails; it cannot survive a restart.
  const failedCredentials = new Map<string, string>();
  let revision = 0;
  const invalidate = Effect.fnUntraced(function* (id: string) {
    const lease = leases.get(id);
    leases.delete(id);
    if (lease) yield* Deferred.succeed(lease.cancel, undefined);
  });
  const mutate = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(lock.withPermits(1), Effect.uninterruptible);
  const authenticate = Effect.fnUntraced(
    function* (token: Redacted.Redacted<string>) {
      const response = yield* http
        .execute(
          HttpClientRequest.get("https://slack.com/api/auth.test").pipe(
            HttpClientRequest.bearerToken(token),
          ),
        )
        .pipe(Effect.mapError(unavailable));
      const retry = response.headers["retry-after"];
      if (response.status === 429) return yield* rateLimited(retry);
      if (response.status === 401 || response.status === 403)
        return yield* fail("access-denied", "Slack rejected this credential or its permissions.");
      if (response.status !== 200) return yield* unavailable();
      const bytes = yield* response.stream.pipe(
        Stream.runFoldEffect(
          () => new Uint8Array(0),
          (body, chunk) => {
            if (body.length + chunk.length > 32_000)
              return Effect.fail(
                fail("unavailable", "Slack returned an oversized connection response."),
              );
            const next = new Uint8Array(body.length + chunk.length);
            next.set(body);
            next.set(chunk, body.length);
            return Effect.succeed(next);
          },
        ),
        Effect.mapError(() =>
          fail("unavailable", "Slack returned an unreadable connection response."),
        ),
      );
      const result = yield* decodeAuth(new TextDecoder().decode(bytes)).pipe(
        Effect.mapError(() =>
          fail("unavailable", "Slack returned an invalid connection response."),
        ),
      );
      if (!result.ok && result.error === "ratelimited") return yield* rateLimited(retry);
      if (!result.ok)
        return yield* fail(
          [
            "invalid_auth",
            "not_authed",
            "token_revoked",
            "token_expired",
            "account_inactive",
            "missing_scope",
            "no_permission",
            "access_denied",
          ].includes(result.error)
            ? "access-denied"
            : "unavailable",
          "Slack could not authorize this reader. Check the credential and its read permissions.",
        );
      const scopeHeader = response.headers["x-oauth-scopes"];
      if (scopeHeader === undefined || scopeHeader.length > 4096)
        return yield* fail(
          "access-denied",
          "Slack did not report usable conversation read permissions.",
        );
      const scopes = scopeHeader
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean);
      if (
        !["channels", "groups", "im", "mpim"].some(
          (type) => scopes.includes(`${type}:read`) && scopes.includes(`${type}:history`),
        )
      )
        return yield* fail(
          "access-denied",
          "Slack needs matching conversation read and history permissions.",
        );
      if (
        [result.team, result.user, result.team_id, result.user_id, ...scopes].some((value) =>
          value.includes(Redacted.value(token)),
        )
      )
        return yield* fail("unavailable", "Slack returned invalid connection metadata.");
      return { ...result, scopes };
    },
    Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    Effect.timeoutOrElse({ duration: "15 seconds", orElse: () => Effect.fail(unavailable()) }),
  );
  const connect = Effect.fn("SlackConnection.connect")(function* (input: SlackConnectInput) {
    const decoded = yield* decode(SlackConnectInput, input);
    const token = Redacted.make(decoded.token);
    const startedAt = revision;
    const identity = yield* authenticate(token);
    return yield* Effect.gen(function* () {
      const previous = yield* store.find(identity.team_id, identity.user_id);
      if (previous && (disconnectedAt.get(previous.id) ?? 0) > startedAt) return yield* changed();
      const id =
        previous?.id ?? `slack_${yield* crypto.randomUUIDv4.pipe(Effect.mapError(unavailable))}`;
      const key = secretKey(id);
      const oldToken = yield* secrets.get(key).pipe(credentialStorage);
      const restore = Option.match(oldToken, {
        onNone: () => secrets.remove(key),
        onSome: (bytes) => secrets.set(key, bytes),
      }).pipe(credentialStorage);
      const account = {
        id,
        provider: "slack" as const,
        workspaceId: identity.team_id,
        subjectId: identity.user_id,
        identity: identity.user,
        label: identity.team,
        connected: true,
        generation: (previous?.generation ?? 0) + 1,
        scopes: identity.scopes,
        isBot: identity.bot_id !== undefined,
      };
      yield* Effect.gen(function* () {
        yield* secrets
          .set(key, new TextEncoder().encode(Redacted.value(token)))
          .pipe(credentialStorage);
        yield* store.save(account);
      }).pipe(
        Effect.catch((error) =>
          restore.pipe(
            Effect.catch(() =>
              Effect.gen(function* () {
                failedCredentials.set(id, credentialWarning);
                disconnectedAt.set(id, ++revision);
                yield* invalidate(id);
                const removed = yield* secrets
                  .remove(key)
                  .pipe(
                    credentialStorage,
                    Effect.match({ onSuccess: () => true, onFailure: () => false }),
                  );
                const message = removed ? credentialWarning : removalWarning;
                failedCredentials.set(id, message);
                if (previous) {
                  yield* store.disconnect(id).pipe(Effect.ignore);
                  yield* store.setError(id, message).pipe(Effect.ignore);
                } else if (!removed) {
                  yield* store
                    .save({ ...account, connected: false, error: message })
                    .pipe(Effect.ignore);
                } else {
                  failedCredentials.delete(id);
                }
                return yield* fail("unavailable", message);
              }),
            ),
            Effect.andThen(Effect.fail(error)),
          ),
        ),
      );
      yield* invalidate(id);
      failedCredentials.delete(id);
      return publicConnection(account);
    }).pipe(mutate);
  });
  const disconnect = Effect.fn("SlackConnection.disconnect")(function* (
    input: SlackDisconnectInput,
  ) {
    const { connectionId } = yield* decode(SlackDisconnectInput, input);
    return yield* Effect.gen(function* () {
      if (!(yield* store.get(connectionId))) return yield* changed();
      yield* store.disconnect(connectionId);
      disconnectedAt.set(connectionId, ++revision);
      yield* invalidate(connectionId);
      yield* secrets.remove(secretKey(connectionId)).pipe(
        credentialStorage,
        Effect.catch(() =>
          Effect.gen(function* () {
            const message = removalWarning;
            yield* store.setError(connectionId, message);
            return yield* fail("unavailable", message);
          }),
        ),
      );
      failedCredentials.delete(connectionId);
    }).pipe(mutate);
  });
  const authorize = Effect.fn("SlackConnection.authorize")(function* (
    input: typeof AuthorizeInput.Type,
  ) {
    const { connectionId, workspaceId } = yield* decode(AuthorizeInput, input);
    return yield* Effect.gen(function* () {
      if (failedCredentials.has(connectionId)) return yield* changed();
      const account = yield* store.get(connectionId);
      if (!account?.connected || account.error !== undefined || account.workspaceId !== workspaceId)
        return yield* changed();
      const secret = yield* secrets.get(secretKey(connectionId)).pipe(credentialStorage);
      if (Option.isNone(secret))
        return yield* fail("unavailable", "Reconnect Slack to restore its reader credential.");
      const token = yield* decode(SlackConnectInput, {
        token: new TextDecoder().decode(secret.value),
      });
      let lease = leases.get(connectionId);
      if (!lease || lease.generation !== account.generation) {
        yield* invalidate(connectionId);
        lease = { generation: account.generation, cancel: yield* Deferred.make<void>() };
        leases.set(connectionId, lease);
      }
      return {
        token: Redacted.make(token.token),
        generation: account.generation,
        workspaceId,
        subjectId: account.subjectId,
        scopes: account.scopes,
        isBot: account.isBot,
        cancelled: Deferred.await(lease.cancel).pipe(Effect.andThen(Effect.fail(changed()))),
        check: store
          .get(connectionId)
          .pipe(
            Effect.flatMap((current) =>
              !failedCredentials.has(connectionId) &&
              current?.connected &&
              current.error === undefined &&
              current.generation === account.generation
                ? Effect.void
                : Effect.fail(changed()),
            ),
          ),
      };
    }).pipe(lock.withPermits(1));
  });
  return SlackConnection.of({
    connect,
    list: store.list.pipe(
      Effect.map((accounts) =>
        accounts.map((account) => {
          const error = failedCredentials.get(account.id);
          return publicConnection(
            error === undefined ? account : { ...account, connected: false, error },
          );
        }),
      ),
    ),
    disconnect,
    authorize,
  });
});

export const layer = Layer.effect(SlackConnection, make);
