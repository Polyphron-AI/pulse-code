import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import type { RpcSession } from "../rpc/session.ts";

import { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import {
  PrimaryConnectionTarget,
  AVAILABLE_CONNECTION_STATE,
  RelayConnectionTarget,
  type PreparedConnection,
} from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { remoteHttpClientLayer } from "../rpc/http.ts";
import {
  getPulseDictationApiKeyStatus,
  pulseDictationRequestContext,
  PULSE_DICTATION_MAX_AUDIO_BYTES,
  removePulseDictationApiKey,
  setPulseDictationApiKey,
  transcribePulseDictation,
} from "./pulseDictation.ts";

const environmentId = EnvironmentId.make("dictation-environment");
const primaryTarget = new PrimaryConnectionTarget({
  environmentId,
  label: "Primary",
  httpBaseUrl: "https://primary.example.test/base",
  wsBaseUrl: "wss://primary.example.test",
});
const primary: PreparedConnection = {
  environmentId,
  label: "Primary",
  httpBaseUrl: primaryTarget.httpBaseUrl,
  socketUrl: primaryTarget.wsBaseUrl,
  httpAuthorization: null,
  target: primaryTarget,
};

const context = (prepared = primary) => ({
  prepared,
  signer: Option.none<ManagedRelayDpopSigner["Service"]>(),
});

describe("Pulse dictation HTTP transport", () => {
  it.effect(
    "resolves the current connection on every execution and rejects disconnected state",
    () =>
      Effect.gen(function* () {
        const prepared = yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(
          Option.some(primary),
        );
        const supervisor = EnvironmentSupervisor.of({
          target: primaryTarget,
          prepared,
          state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
          session: yield* SubscriptionRef.make(Option.none<RpcSession>()),
          connect: Effect.void,
          disconnect: Effect.void,
          retryNow: Effect.void,
        });
        const read = pulseDictationRequestContext.pipe(
          Effect.provideService(EnvironmentSupervisor, supervisor),
        );
        expect((yield* read).prepared.httpBaseUrl).toBe(primary.httpBaseUrl);
        const moved = { ...primary, httpBaseUrl: "https://moved.example.test" };
        yield* SubscriptionRef.set(prepared, Option.some(moved));
        expect((yield* read).prepared.httpBaseUrl).toBe(moved.httpBaseUrl);
        yield* SubscriptionRef.set(prepared, Option.none());
        expect((yield* Effect.flip(read)).message).toBe("The environment is not connected.");
      }),
  );
  it.effect("uses cookie-authenticated environment routing for key management", () =>
    Effect.gen(function* () {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const fetchFn: typeof fetch = async (request, init) => {
        calls.push({ url: String(request), init: init ?? {} });
        if (calls.length === 1) return Response.json({ configured: false });
        if (calls.length === 2) return Response.json({ configured: true });
        return new Response(null, { status: 204 });
      };

      expect(
        yield* getPulseDictationApiKeyStatus(context()).pipe(
          Effect.provide(remoteHttpClientLayer(fetchFn)),
        ),
      ).toEqual({ configured: false });
      expect(
        yield* setPulseDictationApiKey({ ...context(), apiKey: "secret-key" }).pipe(
          Effect.provide(remoteHttpClientLayer(fetchFn)),
        ),
      ).toEqual({ configured: true });
      yield* removePulseDictationApiKey(context()).pipe(
        Effect.provide(remoteHttpClientLayer(fetchFn)),
      );

      expect(calls.map(({ url }) => new URL(url).pathname)).toEqual([
        "/api/pulse/dictation/groq-api-key",
        "/api/pulse/dictation/groq-api-key/set",
        "/api/pulse/dictation/groq-api-key/remove",
      ]);
      expect(calls.map(({ init }) => init.credentials)).toEqual(["include", "include", "include"]);
      expect(new TextDecoder().decode(calls[1]!.init.body as Uint8Array)).toBe(
        '{"apiKey":"secret-key"}',
      );
    }),
  );

  it.effect("uploads one multipart audio file with bearer authorization", () =>
    Effect.gen(function* () {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const fetchFn: typeof fetch = async (request, init) => {
        calls.push({ url: String(request), init: init ?? {} });
        return Response.json({ text: "dictated text" });
      };
      const prepared: PreparedConnection = {
        ...primary,
        httpAuthorization: { _tag: "Bearer", token: "environment-token" },
      };
      const result = yield* transcribePulseDictation({
        ...context(prepared),
        audio: new Blob(["audio-bytes"], { type: "audio/webm" }),
        fileName: "clip.webm",
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      expect(result).toEqual({ text: "dictated text" });
      expect(calls).toHaveLength(1);
      expect(new URL(calls[0]!.url).pathname).toBe("/api/pulse/dictation/transcriptions");
      expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(
        "Bearer environment-token",
      );
      const body = calls[0]!.init.body as FormData;
      expect([...body.keys()]).toEqual(["file"]);
      const file = body.get("file") as File;
      expect(file.name).toBe("clip.webm");
      expect(file.type).toBe("audio/webm");
    }),
  );

  it.effect("binds relay transcription to the captured environment and does not retry", () =>
    Effect.gen(function* () {
      const relayTarget = new RelayConnectionTarget({ environmentId, label: "Relay" });
      const prepared: PreparedConnection = {
        ...primary,
        target: relayTarget,
        httpAuthorization: { _tag: "Dpop", accessToken: "old-token", expiresAtEpochMs: 0 },
      };
      let authorizations = 0;
      const remoteAuthorization = RemoteEnvironmentAuthorization.of({
        authorizeBearer: () => Effect.die("unexpected"),
        authorizeDpop: () => Effect.die("unexpected"),
        authorizeDpopHttp: ({ expectedEnvironmentId }) =>
          Effect.sync(() => {
            authorizations += 1;
            expect(expectedEnvironmentId).toBe(environmentId);
            return {
              environmentId,
              label: "Relay",
              httpBaseUrl: "https://relay.example.test",
              httpAuthorization: {
                _tag: "Dpop" as const,
                accessToken: "current-token",
                expiresAtEpochMs: 9_999_999_999_999,
              },
            };
          }),
      });
      const signer = ManagedRelayDpopSigner.of({
        thumbprint: Effect.succeed("thumbprint"),
        createProof: ({ url, accessToken }) =>
          Effect.succeed(`proof:${new URL(url).host}:${accessToken}`),
      });
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const fetchFn: typeof fetch = async (request, init) => {
        calls.push({ url: String(request), init: init ?? {} });
        return Response.json(
          { _tag: "EnvironmentAuthInvalidError", reason: "invalid_credential" },
          { status: 401 },
        );
      };

      const error = yield* transcribePulseDictation({
        prepared,
        signer: Option.some(signer),
        remoteAuthorization: Option.some(remoteAuthorization),
        audio: new Blob(["audio"]),
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)), Effect.flip);

      expect(error).toMatchObject({
        _tag: "PulseDictationHttpResponseError",
        status: 401,
      });
      expect(authorizations).toBe(1);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("https://relay.example.test/api/pulse/dictation/transcriptions");
      expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("DPoP current-token");
      expect(new Headers(calls[0]!.init.headers).get("dpop")).toBe(
        "proof:relay.example.test:current-token",
      );
    }),
  );

  it.effect(
    "keeps concurrent reusable status requests bound to their own relay authorization",
    () =>
      Effect.gen(function* () {
        const relayTarget = new RelayConnectionTarget({ environmentId, label: "Relay" });
        const prepared: PreparedConnection = {
          ...primary,
          target: relayTarget,
          httpAuthorization: { _tag: "Dpop", accessToken: "expired", expiresAtEpochMs: 0 },
        };
        let authorizationIndex = 0;
        const remoteAuthorization = RemoteEnvironmentAuthorization.of({
          authorizeBearer: () => Effect.die("unexpected"),
          authorizeDpop: () => Effect.die("unexpected"),
          authorizeDpopHttp: () =>
            Effect.sync(() => {
              const index = ++authorizationIndex;
              return {
                environmentId,
                label: `Relay ${index}`,
                httpBaseUrl: `https://relay-${index}.example.test`,
                httpAuthorization: {
                  _tag: "Dpop" as const,
                  accessToken: `token-${index}`,
                  expiresAtEpochMs: 9_999_999_999_999,
                },
              };
            }),
        });
        const proofsStarted = Promise.withResolvers<void>();
        let proofCount = 0;
        const signer = ManagedRelayDpopSigner.of({
          thumbprint: Effect.succeed("thumbprint"),
          createProof: ({ url, accessToken }) =>
            Effect.promise(async () => {
              proofCount += 1;
              if (proofCount === 2) proofsStarted.resolve();
              await proofsStarted.promise;
              return `proof:${url}:${accessToken}`;
            }),
        });
        const calls: Array<{ url: string; authorization: string | null; proof: string | null }> =
          [];
        const fetchFn: typeof fetch = async (request, init) => {
          const headers = new Headers(init?.headers);
          calls.push({
            url: String(request),
            authorization: headers.get("authorization"),
            proof: headers.get("dpop"),
          });
          return Response.json({ configured: false });
        };
        const request = getPulseDictationApiKeyStatus({
          prepared,
          signer: Option.some(signer),
          remoteAuthorization: Option.some(remoteAuthorization),
        }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

        yield* Effect.all([request, request], { concurrency: "unbounded" });

        expect(calls).toHaveLength(2);
        for (const call of calls) {
          const index = new URL(call.url).hostname === "relay-1.example.test" ? 1 : 2;
          expect(call.url).toBe(
            `https://relay-${index}.example.test/api/pulse/dictation/groq-api-key`,
          );
          expect(call.authorization).toBe(`DPoP token-${index}`);
          expect(call.proof).toBe(`proof:${call.url}:token-${index}`);
        }
      }),
  );

  it("aborts the in-flight fetch and rejects invalid successful responses", async () => {
    let fetchAborted = false;
    const started = Promise.withResolvers<void>();
    const fetchFn: typeof fetch = (_request, init) =>
      new Promise<Response>((_resolve, reject) => {
        started.resolve();
        init?.signal?.addEventListener("abort", () => {
          fetchAborted = true;
          reject(init.signal?.reason);
        });
      });
    const controller = new AbortController();
    const pending = Effect.runPromise(
      transcribePulseDictation({ ...context(), audio: new Blob(["audio"]) }).pipe(
        Effect.provide(remoteHttpClientLayer(fetchFn)),
      ),
      { signal: controller.signal },
    );
    await started.promise;
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(fetchAborted).toBe(true);

    const invalid = await Effect.runPromise(
      getPulseDictationApiKeyStatus(context()).pipe(
        Effect.provide(remoteHttpClientLayer(async () => Response.json({ configured: "yes" }))),
        Effect.flip,
      ),
    );
    expect(invalid._tag).toBe("PulseDictationInvalidResponseError");
  });

  it.effect.each([400, 401, 413, 500])("retains sanitized HTTP %s errors", (status) =>
    Effect.gen(function* () {
      const error = yield* setPulseDictationApiKey({
        ...context(),
        apiKey: "never-retain-me",
      }).pipe(
        Effect.provide(
          remoteHttpClientLayer(async () => Response.json({ error: `safe-${status}` }, { status })),
        ),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: "PulseDictationHttpResponseError",
        status,
        serverMessage: `safe-${status}`,
      });
      expect(error).not.toHaveProperty("cause");
    }),
  );

  it.effect("rejects oversized audio before credentials or bytes leave the client", () =>
    Effect.gen(function* () {
      let fetched = false;
      const error = yield* transcribePulseDictation({
        ...context(),
        audio: new Blob([new Uint8Array(PULSE_DICTATION_MAX_AUDIO_BYTES + 1)]),
      }).pipe(
        Effect.provide(
          remoteHttpClientLayer(async () => {
            fetched = true;
            return Response.json({ text: "unexpected" });
          }),
        ),
        Effect.flip,
      );

      expect(error._tag).toBe("PulseDictationAudioTooLargeError");
      expect(fetched).toBe(false);
    }),
  );
});
