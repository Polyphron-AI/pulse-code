import {
  PULSE_DICTATION_GROQ_API_KEY_PATH,
  PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH,
  PULSE_DICTATION_GROQ_API_KEY_SET_PATH,
  PULSE_DICTATION_TRANSCRIPTIONS_PATH,
  PulseDictationApiKeyStatus,
  PulseDictationHttpError,
  PulseDictationTranscription,
} from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import type { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import type { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "../state/environmentHttpAuth.ts";

const DEFAULT_DICTATION_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 120_000;
export const PULSE_DICTATION_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export class PulseDictationAudioTooLargeError extends Data.TaggedError(
  "PulseDictationAudioTooLargeError",
)<{
  readonly size: number;
  readonly maxSize: number;
}> {
  override get message(): string {
    return "The recording exceeds the 25 MiB dictation limit.";
  }
}

export class PulseDictationHttpResponseError extends Data.TaggedError(
  "PulseDictationHttpResponseError",
)<{
  readonly status: number;
  readonly serverMessage: string;
}> {
  override get message(): string {
    return this.serverMessage;
  }
}

export class PulseDictationInvalidResponseError extends Data.TaggedError(
  "PulseDictationInvalidResponseError",
)<{
  readonly status: number;
}> {
  override get message(): string {
    return `The dictation endpoint returned an invalid ${this.status} response.`;
  }
}

class PulseDictationSanitizedTransportError extends Data.TaggedError(
  "PulseDictationSanitizedTransportError",
)<{
  readonly message: string;
}> {}

const statusResponse = Schema.Struct({
  status: Schema.Literal(200),
  body: PulseDictationApiKeyStatus,
});
const transcriptionResponse = Schema.Struct({
  status: Schema.Literal(200),
  body: PulseDictationTranscription,
});
const emptyResponse = Schema.Struct({ status: Schema.Literal(204) });

export interface PulseDictationRequestContext {
  readonly prepared: PreparedConnection;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly remoteAuthorization?: Option.Option<RemoteEnvironmentAuthorization["Service"]>;
  readonly timeoutMs?: number;
}

type ResponseInput = {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
};

type DictationResponse<A> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "HttpError"; readonly status: number; readonly serverMessage: string }
  | { readonly _tag: "Invalid"; readonly status: number };

const send = <A, I extends ResponseInput>(input: {
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly headers: { readonly authorization?: string; readonly dpop?: string };
  readonly body?: FormData | { readonly apiKey: string };
  readonly schema: Schema.ConstraintCodec<A, I, never, never>;
  readonly expectedStatus: number;
}): Effect.Effect<
  DictationResponse<A>,
  PulseDictationSanitizedTransportError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    let request =
      input.method === "GET" ? HttpClientRequest.get(input.url) : HttpClientRequest.post(input.url);
    request = request.pipe(HttpClientRequest.setHeaders(input.headers));
    if (input.body instanceof FormData)
      request = request.pipe(HttpClientRequest.bodyFormData(input.body));
    else if (input.body !== undefined)
      request = request.pipe(HttpClientRequest.bodyJsonUnsafe(input.body));
    const response = yield* http.execute(request).pipe(
      Effect.mapError(
        () =>
          new PulseDictationSanitizedTransportError({
            message: "The dictation request could not reach the environment.",
          }),
      ),
    );
    if (response.status !== input.expectedStatus) {
      const serverError = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(PulseDictationHttpError)),
        Effect.option,
      );
      return {
        _tag: "HttpError",
        status: response.status,
        serverMessage: Option.isSome(serverError)
          ? serverError.value.error
          : `The dictation endpoint returned HTTP ${response.status}.`,
      };
    }
    const decoded = yield* HttpClientResponse.schemaJson(input.schema)(response).pipe(
      Effect.option,
    );
    return Option.isSome(decoded)
      ? { _tag: "Success", value: decoded.value }
      : { _tag: "Invalid", status: response.status };
  });

const run = <A, I extends ResponseInput>(
  input: PulseDictationRequestContext,
  config: {
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly timeoutMs: number;
    readonly body?: FormData | { readonly apiKey: string };
    readonly schema: Schema.ConstraintCodec<A, I, never, never>;
    readonly expectedStatus: number;
    readonly retryInvalidDpopCredential?: boolean;
  },
) =>
  Effect.gen(function* () {
    let requestUrl = new URL(config.path, input.prepared.httpBaseUrl).toString();
    const response = yield* executeAuthenticatedEnvironmentHttpRequest({
      ...input,
      method: config.method,
      url: (httpBaseUrl) => {
        requestUrl = new URL(config.path, httpBaseUrl).toString();
        return requestUrl;
      },
      timeoutMs: input.timeoutMs ?? config.timeoutMs,
      ...(config.retryInvalidDpopCredential === undefined
        ? {}
        : { retryInvalidDpopCredential: config.retryInvalidDpopCredential }),
      request: ({ headers }) => send({ ...config, url: requestUrl, headers }),
    });
    if (response._tag === "HttpError") return yield* new PulseDictationHttpResponseError(response);
    if (response._tag === "Invalid") return yield* new PulseDictationInvalidResponseError(response);
    return response.value;
  });

export const getPulseDictationApiKeyStatus = (input: PulseDictationRequestContext) =>
  run(input, {
    method: "GET",
    path: PULSE_DICTATION_GROQ_API_KEY_PATH,
    timeoutMs: DEFAULT_DICTATION_REQUEST_TIMEOUT_MS,
    expectedStatus: 200,
    schema: statusResponse,
  }).pipe(Effect.map((response) => response.body));

export const setPulseDictationApiKey = (
  input: PulseDictationRequestContext & { readonly apiKey: string },
) =>
  run(input, {
    method: "POST",
    path: PULSE_DICTATION_GROQ_API_KEY_SET_PATH,
    timeoutMs: DEFAULT_DICTATION_REQUEST_TIMEOUT_MS,
    expectedStatus: 200,
    body: { apiKey: input.apiKey },
    schema: statusResponse,
  }).pipe(Effect.map((response) => response.body));

export const removePulseDictationApiKey = (input: PulseDictationRequestContext) =>
  run(input, {
    method: "POST",
    path: PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH,
    timeoutMs: DEFAULT_DICTATION_REQUEST_TIMEOUT_MS,
    expectedStatus: 204,
    schema: emptyResponse,
  }).pipe(Effect.asVoid);

export const transcribePulseDictation = (
  input: PulseDictationRequestContext & { readonly audio: Blob; readonly fileName?: string },
) =>
  Effect.gen(function* () {
    if (input.audio.size > PULSE_DICTATION_MAX_AUDIO_BYTES) {
      return yield* new PulseDictationAudioTooLargeError({
        size: input.audio.size,
        maxSize: PULSE_DICTATION_MAX_AUDIO_BYTES,
      });
    }
    const body = new FormData();
    body.append("file", input.audio, input.fileName ?? "recording.webm");
    return yield* run(input, {
      method: "POST",
      path: PULSE_DICTATION_TRANSCRIPTIONS_PATH,
      timeoutMs: DEFAULT_TRANSCRIPTION_TIMEOUT_MS,
      expectedStatus: 200,
      retryInvalidDpopCredential: false,
      body,
      schema: transcriptionResponse,
    }).pipe(Effect.map((response) => response.body));
  });
