import { AuthSessionId, EnvironmentId, IntegrationProviderId } from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { describe, expect } from "vite-plus/test";

import {
  makeOAuthAttemptStore,
  OAuthAttemptRejected,
  type OAuthAttemptBinding,
} from "./OAuthAttemptStore.ts";

const binding = (): OAuthAttemptBinding => ({
  providerId: IntegrationProviderId.make("pulse"),
  environmentId: EnvironmentId.make("environment-1"),
  initiatingSessionId: AuthSessionId.make("session-1"),
  redirectUri: "http://127.0.0.1:43123/oauth/callback",
});

const harness = () => {
  let nowEpochMs = Date.parse("2026-08-21T08:00:00.000Z");
  let randomCall = 0;
  const service = makeOAuthAttemptStore({
    nowEpochMs: Effect.sync(() => nowEpochMs),
    randomBytes: (bytes) =>
      Effect.sync(() => Uint8Array.from({ length: bytes }, () => ++randomCall % 256)),
    sha256: (bytes) => Effect.succeed(Uint8Array.from(bytes).reverse()),
  });
  return {
    service,
    advance: (milliseconds: number) => {
      nowEpochMs += milliseconds;
    },
  };
};

describe("OAuthAttemptStore", () => {
  it.effect("creates 128-bit state and S256 PKCE material without embedding binding data", () =>
    Effect.gen(function* () {
      const test = harness();
      const store = yield* test.service;

      const attempt = yield* store.initiate(binding());

      expect(attempt.state).toHaveLength(22);
      expect(attempt.codeChallengeMethod).toBe("S256");
      expect(attempt.codeChallenge).not.toContain("environment-1");
      expect(attempt.state).not.toContain("session-1");
      expect(attempt.expiresAtEpochMs).toBe(Date.parse("2026-08-21T08:10:00.000Z"));
    }),
  );

  it.effect("consumes a valid attempt exactly once", () =>
    Effect.gen(function* () {
      const test = harness();
      const store = yield* test.service;
      const attempt = yield* store.initiate(binding());

      const consumed = yield* store.consume({ ...binding(), state: attempt.state });
      const replay = yield* store.consume({ ...binding(), state: attempt.state }).pipe(Effect.flip);

      expect(consumed.codeVerifier).not.toBe("");
      expect(replay).toBeInstanceOf(OAuthAttemptRejected);
    }),
  );

  it.effect("rejects each binding mismatch with the same bounded failure", () =>
    Effect.gen(function* () {
      const variants: ReadonlyArray<Partial<OAuthAttemptBinding>> = [
        { providerId: IntegrationProviderId.make("github") },
        { environmentId: EnvironmentId.make("environment-2") },
        { initiatingSessionId: AuthSessionId.make("session-2") },
        { redirectUri: "http://127.0.0.1:43124/oauth/callback" },
      ];

      for (const variant of variants) {
        const test = harness();
        const store = yield* test.service;
        const attempt = yield* store.initiate(binding());
        const error = yield* store
          .consume({ ...binding(), ...variant, state: attempt.state })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(OAuthAttemptRejected);
        // @effect-diagnostics-next-line preferSchemaOverJson:off - This regression checks the public serialized error shape itself.
        expect(JSON.stringify(error)).not.toContain(attempt.state);
      }
    }),
  );

  it.effect("expires an attempt and returns the same failure as an unknown state", () =>
    Effect.gen(function* () {
      const test = harness();
      const store = yield* test.service;
      const attempt = yield* store.initiate(binding());
      test.advance(10 * 60 * 1_000 + 1);

      const expired = yield* store
        .consume({ ...binding(), state: attempt.state })
        .pipe(Effect.flip);
      const missing = yield* store
        .consume({ ...binding(), state: "unknown-state" })
        .pipe(Effect.flip);

      expect(expired.message).toBe(missing.message);
      // @effect-diagnostics-next-line preferSchemaOverJson:off - This regression checks the public serialized error shape itself.
      expect(JSON.stringify(expired)).not.toContain(attempt.state);
    }),
  );

  it.effect("cannot replay state after a caller begins and fails token exchange", () =>
    Effect.gen(function* () {
      const test = harness();
      const store = yield* test.service;
      const attempt = yield* store.initiate(binding());

      yield* store.consume({ ...binding(), state: attempt.state });
      const simulatedExchangeFailure = Effect.fail("provider exchange failed");
      yield* simulatedExchangeFailure.pipe(Effect.flip);
      const replay = yield* store.consume({ ...binding(), state: attempt.state }).pipe(Effect.flip);

      expect(replay).toBeInstanceOf(OAuthAttemptRejected);
      // @effect-diagnostics-next-line preferSchemaOverJson:off - This regression checks the public serialized error shape itself.
      expect(JSON.stringify(replay)).not.toContain("provider exchange failed");
    }),
  );
});
