import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import {
  PULSE_DICTATION_GROQ_API_KEY_PATH,
  PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH,
  PULSE_DICTATION_GROQ_API_KEY_SET_PATH,
  PULSE_DICTATION_TRANSCRIPTIONS_PATH,
  PulseDictationApiKeyInput,
} from "../../../../packages/contracts/src/pulseDictation.ts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
  Multipart,
} from "effect/unstable/http";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import {
  failEnvironmentAuthInvalid,
  failEnvironmentInternal,
  failEnvironmentScopeRequired,
} from "../auth/http.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import { isTrustedBrowserOrigin } from "../httpCors.ts";
import {
  createGroqTranscriber,
  GROQ_DICTATION_API_KEY_SECRET,
  GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES,
  GroqTranscriptionError,
  type GroqTranscriptionAudio,
} from "./groqTranscription.ts";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const API_KEY_BODY_MAX_BYTES = 16 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

class DictationCallError extends Data.TaggedError("DictationCallError")<{
  readonly cause: unknown;
}> {}

export interface PulseDictationTranscriberService {
  readonly transcribe: (audio: GroqTranscriptionAudio, signal: AbortSignal) => Promise<string>;
}

export class PulseDictationTranscriber extends Context.Service<
  PulseDictationTranscriber,
  PulseDictationTranscriberService
>()("t3/voice/http/PulseDictationTranscriber") {}

export const pulseDictationTranscriberLayer = Layer.effect(
  PulseDictationTranscriber,
  Effect.gen(function* () {
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    return PulseDictationTranscriber.of(
      createGroqTranscriber({
        fetch: globalThis.fetch,
        getApiKey: () =>
          Effect.runPromise(
            secrets
              .get(GROQ_DICTATION_API_KEY_SECRET)
              .pipe(
                Effect.map(Option.map((bytes) => textDecoder.decode(bytes))),
                Effect.map(Option.getOrNull),
              ),
          ),
      }),
    );
  }),
);

const pulseDictationTranscriberMiddlewareLayer = HttpRouter.middleware<{
  provides: PulseDictationTranscriber;
}>()(
  Effect.map(
    PulseDictationTranscriber,
    (transcriber) => (httpEffect) =>
      Effect.provideService(httpEffect, PulseDictationTranscriber, transcriber),
  ),
).layer;

const authenticateWithScope = (
  scope: typeof AuthOrchestrationReadScope | typeof AuthOrchestrationOperateScope,
  unsafe = false,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* serverAuth.authenticateHttpRequest(request).pipe(
      Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
        failEnvironmentAuthInvalid(
          EnvironmentAuth.serverAuthCredentialReason(error),
          EnvironmentAuth.serverAuthDpopFailureReason(error),
        ),
      ),
      Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
        failEnvironmentInternal("internal_error", error),
      ),
    );
    if (!session.scopes.includes(scope)) {
      return yield* failEnvironmentScopeRequired(scope);
    }
    if (unsafe && session.method === "browser-session-cookie") {
      const origin = request.headers.origin;
      const sameOriginFetch = request.headers["sec-fetch-site"] === "same-origin";
      const requestUrl = HttpServerRequest.toURL(request);
      const config = yield* ServerConfig.ServerConfig;
      const trusted =
        origin === undefined
          ? sameOriginFetch
          : Option.isSome(requestUrl) && isTrustedBrowserOrigin(origin, requestUrl.value, config);
      if (!trusted) {
        return yield* Effect.fail(clientError("A trusted browser origin is required.", 403));
      }
    }
  });

const json = (value: unknown, status = 200) =>
  HttpServerResponse.jsonUnsafe(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const clientError = (message: string, status = 400) => json({ error: message }, status);

const parseSingleAudioFile = Effect.fn("pulseDictation.parseSingleAudioFile")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const contentType = request.headers["content-type"]?.toLowerCase();
  if (!contentType?.startsWith("multipart/form-data;")) {
    return yield* Effect.fail(clientError("Content-Type must be multipart/form-data.", 415));
  }
  const contentLength = request.headers["content-length"];
  if (
    contentLength !== undefined &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES + MULTIPART_OVERHEAD_BYTES)
  ) {
    return yield* Effect.fail(clientError("The upload exceeds the 25 MiB limit.", 413));
  }

  const form = yield* Effect.suspend(() => request.multipart).pipe(
    Effect.provide(
      Multipart.limitsServices({
        maxParts: 2,
        maxFieldSize: 1024,
        maxFileSize: GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES + MULTIPART_OVERHEAD_BYTES,
        maxTotalSize: GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES + MULTIPART_OVERHEAD_BYTES,
      }),
    ),
    Effect.catchTag("MultipartError", (error) =>
      Effect.fail(
        error.reason._tag === "FileTooLarge" || error.reason._tag === "BodyTooLarge"
          ? clientError("The upload exceeds the 25 MiB limit.", 413)
          : clientError("Expected exactly one multipart file field named 'file'."),
      ),
    ),
  );
  const entries = Object.entries(form);
  const files = form.file;
  if (
    entries.length !== 1 ||
    !Array.isArray(files) ||
    files.length !== 1 ||
    !Multipart.isPersistedFile(files[0])
  ) {
    return yield* Effect.fail(
      clientError("Expected exactly one multipart file field named 'file'."),
    );
  }
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs
    .readFile(files[0].path)
    .pipe(Effect.mapError(() => clientError("Could not read the uploaded recording.", 500)));
  if (bytes.byteLength > GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES) {
    return yield* Effect.fail(clientError("The upload exceeds the 25 MiB limit.", 413));
  }
  return { bytes, mimeType: files[0].contentType } satisfies GroqTranscriptionAudio;
});

const transcriptionRoute = HttpRouter.add(
  "POST",
  PULSE_DICTATION_TRANSCRIPTIONS_PATH,
  Effect.gen(function* () {
    yield* authenticateWithScope(AuthOrchestrationOperateScope, true);
    const audio = yield* parseSingleAudioFile();
    const transcriber = yield* PulseDictationTranscriber;
    const text = yield* Effect.tryPromise({
      try: (signal) => transcriber.transcribe(audio, signal),
      catch: (cause) => new DictationCallError({ cause }),
    }).pipe(
      Effect.catchTag("DictationCallError", (error) =>
        Effect.succeed(
          error.cause instanceof GroqTranscriptionError
            ? clientError(error.cause.message, 502)
            : clientError("Dictation transcription failed.", 502),
        ),
      ),
    );
    return typeof text === "string" ? json({ text }) : text;
  }).pipe(
    Effect.catchIf(HttpServerResponse.isHttpServerResponse, Effect.succeed),
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
  ),
);

const apiKeyStatusRoute = HttpRouter.add(
  "GET",
  PULSE_DICTATION_GROQ_API_KEY_PATH,
  Effect.gen(function* () {
    yield* authenticateWithScope(AuthOrchestrationReadScope);
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    const stored = yield* secrets.get(GROQ_DICTATION_API_KEY_SECRET);
    const configured = Option.isSome(stored) && textDecoder.decode(stored.value).trim().length > 0;
    return json({ configured });
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
    Effect.catchIf(ServerSecretStore.isSecretStoreError, () =>
      Effect.succeed(clientError("Could not read the Groq API key status.", 500)),
    ),
  ),
);

const setApiKeyRoute = HttpRouter.add(
  "POST",
  PULSE_DICTATION_GROQ_API_KEY_SET_PATH,
  Effect.gen(function* () {
    yield* authenticateWithScope(AuthOrchestrationOperateScope, true);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const input = yield* request.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(PulseDictationApiKeyInput)),
      Effect.provideService(HttpServerRequest.MaxBodySize, FileSystem.Size(API_KEY_BODY_MAX_BYTES)),
      Effect.mapError(() => clientError("Expected JSON with a non-empty apiKey.")),
    );
    const apiKey = input.apiKey.trim();
    if (!apiKey) return clientError("Expected JSON with a non-empty apiKey.");
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    yield* secrets.set(GROQ_DICTATION_API_KEY_SECRET, textEncoder.encode(apiKey));
    return json({ configured: true });
  }).pipe(
    Effect.catchIf(HttpServerResponse.isHttpServerResponse, Effect.succeed),
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
    Effect.catchIf(ServerSecretStore.isSecretStoreError, () =>
      Effect.succeed(clientError("Could not store the Groq API key.", 500)),
    ),
  ),
);

const removeApiKeyRoute = HttpRouter.add(
  "POST",
  PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH,
  Effect.gen(function* () {
    yield* authenticateWithScope(AuthOrchestrationOperateScope, true);
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    yield* secrets.remove(GROQ_DICTATION_API_KEY_SECRET);
    return HttpServerResponse.empty({ status: 204, headers: { "Cache-Control": "no-store" } });
  }).pipe(
    Effect.catchIf(HttpServerResponse.isHttpServerResponse, Effect.succeed),
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
    Effect.catchIf(ServerSecretStore.isSecretStoreError, () =>
      Effect.succeed(clientError("Could not remove the Groq API key.", 500)),
    ),
  ),
);

export const makePulseDictationRouteLayer = <E, R>(
  transcriberLayer: Layer.Layer<PulseDictationTranscriber, E, R>,
) =>
  Layer.mergeAll(
    transcriptionRoute.pipe(
      Layer.provide(pulseDictationTranscriberMiddlewareLayer.pipe(Layer.provide(transcriberLayer))),
    ),
    apiKeyStatusRoute,
    setApiKeyRoute,
    removeApiKeyRoute,
  );

export const pulseDictationRouteLayer = makePulseDictationRouteLayer(
  pulseDictationTranscriberLayer,
);
