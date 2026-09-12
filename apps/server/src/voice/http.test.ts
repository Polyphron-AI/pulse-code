import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import {
  PULSE_DICTATION_GROQ_API_KEY_PATH,
  PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH,
  PULSE_DICTATION_GROQ_API_KEY_SET_PATH,
  PULSE_DICTATION_TRANSCRIPTIONS_PATH,
} from "../../../../packages/contracts/src/pulseDictation.ts";
import { NodeHttpServer } from "@effect/platform-node";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import {
  PulseDictationTranscriber,
  makePulseDictationRouteLayer,
  type PulseDictationTranscriberService,
} from "./http.ts";

const session = (scopes: ReadonlyArray<string>) =>
  ({
    sessionId: "test-session",
    subject: "test-user",
    method: "bearer-access-token",
    scopes,
  }) as EnvironmentAuth.AuthenticatedSession;

const authLayer = (scopes: ReadonlyArray<string> | null) =>
  Layer.succeed(EnvironmentAuth.EnvironmentAuth, {
    authenticateHttpRequest: () =>
      scopes === null
        ? Effect.fail(new EnvironmentAuth.ServerAuthMissingCredentialError())
        : Effect.succeed(session(scopes)),
  } as unknown as EnvironmentAuth.EnvironmentAuth["Service"]);

const makeSecretStore = () => {
  const values = new Map<string, Uint8Array>();
  return ServerSecretStore.ServerSecretStore.of({
    get: (name) => {
      const value = values.get(name);
      return Effect.succeed(value === undefined ? Option.none() : Option.some(value));
    },
    set: (name, value) => Effect.sync(() => void values.set(name, Uint8Array.from(value))),
    create: (name, value) => Effect.sync(() => void values.set(name, Uint8Array.from(value))),
    getOrCreateRandom: () => Effect.succeed(new Uint8Array()),
    remove: (name) => Effect.sync(() => void values.delete(name)),
  });
};

const withRoutes = <A, E, R>(
  scopes: ReadonlyArray<string> | null,
  transcriber: PulseDictationTranscriberService,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* makePulseDictationRouteLayer(
        Layer.succeed(PulseDictationTranscriber, transcriber),
      ).pipe(
        HttpRouter.serve,
        Layer.provide(authLayer(scopes)),
        Layer.provide(configLayer),
        Layer.provide(Layer.succeed(ServerSecretStore.ServerSecretStore, makeSecretStore())),
        Layer.build,
      );
      return yield* effect;
    }),
  ).pipe(Effect.provide(NodeHttpServer.layerTest));

const audioBody = (entries: ReadonlyArray<readonly [string, Blob, string]>) => {
  const form = new FormData();
  for (const [key, blob, name] of entries) form.append(key, blob, name);
  return HttpBody.formData(form);
};

const transcriber = (text = "hello") => ({ transcribe: vi.fn(async () => text) });
const configLayer = Layer.succeed(ServerConfig.ServerConfig, {
  devUrl: undefined,
  devAllowedOrigins: [],
} as unknown as ServerConfig.ServerConfig["Service"]);

const realAuthLayer = EnvironmentAuth.layer.pipe(
  Layer.provideMerge(SessionStore.layer),
  Layer.provide(SqlitePersistenceMemory),
  Layer.provide(ServerSecretStore.layer),
  Layer.provide(ServerEnvironment.identityLayer),
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "pulse-dictation-auth-test-" })),
);

const requestMetadata = {
  deviceType: "desktop" as const,
  os: "test",
  browser: "test",
  ipAddress: "127.0.0.1",
};

describe("pulse dictation HTTP routes", () => {
  it.effect("enforces trusted origins for real cookie auth and permits bearer auth", () => {
    const fake = transcriber();
    return Effect.scoped(
      Effect.gen(function* () {
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        const sessions = yield* SessionStore.SessionStore;
        const pairing = yield* serverAuth.issuePairingCredential();
        const browser = yield* serverAuth.createBrowserSession(pairing.credential, requestMetadata);
        const bearer = yield* serverAuth.issueSession();
        const trustedOrigin = "https://trusted-client.example";
        const routeConfig = Layer.succeed(ServerConfig.ServerConfig, {
          devUrl: new URL(trustedOrigin),
          devAllowedOrigins: [],
        } as unknown as ServerConfig.ServerConfig["Service"]);

        yield* makePulseDictationRouteLayer(Layer.succeed(PulseDictationTranscriber, fake)).pipe(
          HttpRouter.serve,
          Layer.provide(Layer.succeed(EnvironmentAuth.EnvironmentAuth, serverAuth)),
          Layer.provide(routeConfig),
          Layer.provide(Layer.succeed(ServerSecretStore.ServerSecretStore, makeSecretStore())),
          Layer.build,
        );
        const client = yield* HttpClient.HttpClient;
        const cookie = `${sessions.cookieName}=${browser.sessionToken}`;
        const body = () =>
          audioBody([["file", new Blob(["audio"], { type: "audio/webm" }), "clip.webm"]]);

        const foreign = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          headers: { cookie, origin: "https://attacker.example" },
          body: body(),
        });
        expect(foreign.status).toBe(403);
        const foreignSet = yield* client.post(PULSE_DICTATION_GROQ_API_KEY_SET_PATH, {
          headers: { cookie, origin: "https://attacker.example" },
          body: HttpBody.jsonUnsafe({ apiKey: "must-not-be-stored" }),
        });
        expect(foreignSet.status).toBe(403);
        const foreignRemove = yield* client.post(PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH, {
          headers: { cookie, origin: "https://attacker.example" },
        });
        expect(foreignRemove.status).toBe(403);
        const conflictingOrigin = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          headers: {
            cookie,
            origin: "https://attacker.example",
            "sec-fetch-site": "same-origin",
          },
          body: body(),
        });
        expect(conflictingOrigin.status).toBe(403);
        const missingOrigin = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          headers: { cookie },
          body: body(),
        });
        expect(missingOrigin.status).toBe(403);
        const trusted = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          headers: { cookie, origin: trustedOrigin },
          body: body(),
        });
        expect(trusted.status).toBe(200);
        const sameOrigin = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          headers: { cookie, "sec-fetch-site": "same-origin" },
          body: body(),
        });
        expect(sameOrigin.status).toBe(200);
        const bearerResponse = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          headers: {
            authorization: `Bearer ${bearer.token}`,
            origin: "https://attacker.example",
          },
          body: body(),
        });
        expect(bearerResponse.status).toBe(200);
        expect(fake.transcribe).toHaveBeenCalledTimes(3);
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(realAuthLayer, NodeHttpServer.layerTest).pipe(
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
    );
  });

  it.effect("authenticates and requires operate scope before parsing or transcribing", () => {
    const fake = transcriber();
    return withRoutes(
      null,
      fake,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const unauthorized = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          body: HttpBody.text("not multipart"),
        });
        expect(unauthorized.status).toBe(401);
        expect(fake.transcribe).not.toHaveBeenCalled();
      }),
    ).pipe(
      Effect.andThen(
        withRoutes(
          [AuthOrchestrationReadScope],
          fake,
          Effect.gen(function* () {
            const client = yield* HttpClient.HttpClient;
            const forbidden = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
              body: HttpBody.text("not multipart"),
            });
            expect(forbidden.status).toBe(403);
            expect(fake.transcribe).not.toHaveBeenCalled();
          }),
        ),
      ),
    );
  });

  it.effect("accepts exactly one file and returns transcription text", () => {
    const fake = transcriber(" dictated text ");
    return withRoutes(
      [AuthOrchestrationOperateScope],
      fake,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const response = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
          body: audioBody([["file", new Blob(["audio"], { type: "audio/webm" }), "clip.webm"]]),
        });
        expect(response.status).toBe(200);
        expect(yield* response.json).toEqual({ text: " dictated text " });
        expect(fake.transcribe).toHaveBeenCalledOnce();
      }),
    );
  });

  it.effect(
    "rejects wrong fields, multiple files, unsupported content types, and oversized bodies",
    () => {
      const fake = transcriber();
      return withRoutes(
        [AuthOrchestrationOperateScope],
        fake,
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const wrong = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
            body: audioBody([["audio", new Blob(["x"], { type: "audio/webm" }), "x.webm"]]),
          });
          expect(wrong.status).toBe(400);
          const multiple = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
            body: audioBody([
              ["file", new Blob(["x"], { type: "audio/webm" }), "one.webm"],
              ["file", new Blob(["y"], { type: "audio/webm" }), "two.webm"],
            ]),
          });
          expect(multiple.status).toBe(400);
          const contentType = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
            body: HttpBody.text("audio"),
          });
          expect(contentType.status).toBe(415);
          const oversized = yield* client.post(PULSE_DICTATION_TRANSCRIPTIONS_PATH, {
            body: audioBody([
              [
                "file",
                new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: "audio/webm" }),
                "large.webm",
              ],
            ]),
          });
          expect(oversized.status).toBe(413);
          expect(fake.transcribe).not.toHaveBeenCalled();
        }),
      );
    },
  );

  it.effect("stores, reports, and removes the API key without returning it", () =>
    withRoutes(
      [AuthOrchestrationReadScope, AuthOrchestrationOperateScope],
      transcriber(),
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const initial = yield* client.get(PULSE_DICTATION_GROQ_API_KEY_PATH);
        expect(initial.status).toBe(200);
        expect(yield* initial.json).toEqual({ configured: false });
        const set = yield* client.post(PULSE_DICTATION_GROQ_API_KEY_SET_PATH, {
          body: HttpBody.jsonUnsafe({ apiKey: "private-key" }),
        });
        expect(yield* set.json).toEqual({ configured: true });
        const status = yield* client.get(PULSE_DICTATION_GROQ_API_KEY_PATH);
        const statusBody = yield* status.json;
        expect(statusBody).toEqual({ configured: true });
        expect(statusBody).not.toHaveProperty("apiKey");
        const removed = yield* client.post(PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH);
        expect(removed.status).toBe(204);
      }),
    ),
  );
});
