import type { AuthSessionId, EnvironmentId, IntegrationProviderId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1_000;
const MAX_PENDING_ATTEMPTS = 100;

export interface OAuthAttemptBinding {
  readonly providerId: IntegrationProviderId;
  readonly environmentId: EnvironmentId;
  readonly initiatingSessionId: AuthSessionId;
  readonly redirectUri: string;
}

export interface OAuthAttemptInitiation extends OAuthAttemptBinding {}

export interface OAuthAttemptChallenge {
  readonly state: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
  readonly expiresAtEpochMs: number;
}

export interface OAuthAttemptConsumption extends OAuthAttemptBinding {
  readonly state: string;
}

export interface ConsumedOAuthAttempt {
  readonly codeVerifier: string;
}

interface PendingOAuthAttempt extends OAuthAttemptBinding {
  readonly codeVerifier: string;
  readonly expiresAtEpochMs: number;
}

export class OAuthAttemptRejected extends Schema.TaggedErrorClass<OAuthAttemptRejected>()(
  "OAuthAttemptRejected",
  {},
) {
  override get message(): string {
    return "OAuth authorization attempt is invalid or expired.";
  }
}

export class OAuthAttemptUnavailable extends Schema.TaggedErrorClass<OAuthAttemptUnavailable>()(
  "OAuthAttemptUnavailable",
  {},
) {
  override get message(): string {
    return "OAuth authorization could not be started.";
  }
}

export interface OAuthAttemptStoreOptions {
  readonly nowEpochMs: Effect.Effect<number>;
  readonly randomBytes: (bytes: number) => Effect.Effect<Uint8Array, OAuthAttemptUnavailable>;
  readonly sha256: (bytes: Uint8Array) => Effect.Effect<Uint8Array, OAuthAttemptUnavailable>;
}

export class OAuthAttemptStore extends Context.Service<
  OAuthAttemptStore,
  {
    readonly initiate: (
      input: OAuthAttemptInitiation,
    ) => Effect.Effect<OAuthAttemptChallenge, OAuthAttemptUnavailable>;
    readonly consume: (
      input: OAuthAttemptConsumption,
    ) => Effect.Effect<ConsumedOAuthAttempt, OAuthAttemptRejected>;
  }
>()("t3/integrations/OAuthAttemptStore") {}

const sameBinding = (attempt: PendingOAuthAttempt, input: OAuthAttemptConsumption): boolean =>
  attempt.providerId === input.providerId &&
  attempt.environmentId === input.environmentId &&
  attempt.initiatingSessionId === input.initiatingSessionId &&
  attempt.redirectUri === input.redirectUri;

export const makeOAuthAttemptStore = Effect.fn("OAuthAttemptStore.make")(function* (
  options: OAuthAttemptStoreOptions,
) {
  const attempts = new Map<string, PendingOAuthAttempt>();
  const mutex = yield* Semaphore.make(1);

  const pruneExpired = (nowEpochMs: number): void => {
    for (const [state, attempt] of attempts) {
      if (attempt.expiresAtEpochMs <= nowEpochMs) attempts.delete(state);
    }
  };

  const initiate: OAuthAttemptStore["Service"]["initiate"] = Effect.fn(
    "OAuthAttemptStore.initiate",
  )(function* (input) {
    const state = Encoding.encodeBase64Url(yield* options.randomBytes(16));
    const codeVerifier = Encoding.encodeBase64Url(yield* options.randomBytes(32));
    const codeChallenge = Encoding.encodeBase64Url(
      yield* options.sha256(new TextEncoder().encode(codeVerifier)),
    );
    const nowEpochMs = yield* options.nowEpochMs;
    const expiresAtEpochMs = nowEpochMs + OAUTH_ATTEMPT_TTL_MS;

    yield* mutex.withPermits(1)(
      Effect.sync(() => {
        pruneExpired(nowEpochMs);
        while (attempts.size >= MAX_PENDING_ATTEMPTS) {
          const oldestState = attempts.keys().next().value;
          if (oldestState === undefined) break;
          attempts.delete(oldestState);
        }
        attempts.set(state, { ...input, codeVerifier, expiresAtEpochMs });
      }),
    );

    return { state, codeChallenge, codeChallengeMethod: "S256" as const, expiresAtEpochMs };
  });

  const consume: OAuthAttemptStore["Service"]["consume"] = Effect.fn("OAuthAttemptStore.consume")(
    function* (input) {
      const nowEpochMs = yield* options.nowEpochMs;
      return yield* mutex.withPermits(1)(
        Effect.suspend(() => {
          const attempt = attempts.get(input.state);
          if (attempt === undefined) return Effect.fail(new OAuthAttemptRejected());
          if (attempt.expiresAtEpochMs <= nowEpochMs) {
            attempts.delete(input.state);
            return Effect.fail(new OAuthAttemptRejected());
          }
          if (!sameBinding(attempt, input)) return Effect.fail(new OAuthAttemptRejected());

          // Delete before returning the verifier. A failed token exchange cannot replay this state.
          attempts.delete(input.state);
          return Effect.succeed({ codeVerifier: attempt.codeVerifier });
        }),
      );
    },
  );

  return OAuthAttemptStore.of({ initiate, consume });
});

export const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  return yield* makeOAuthAttemptStore({
    nowEpochMs: Clock.currentTimeMillis,
    randomBytes: (bytes) =>
      crypto.randomBytes(bytes).pipe(Effect.mapError(() => new OAuthAttemptUnavailable())),
    sha256: (bytes) =>
      crypto.digest("SHA-256", bytes).pipe(Effect.mapError(() => new OAuthAttemptUnavailable())),
  });
});

export const layer = Layer.effect(OAuthAttemptStore, make);
