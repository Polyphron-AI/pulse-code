import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { TgEnvelope, TgMessage, TgUpdate, TgUser, TgWebhookInfo } from "./TelegramApiTypes.ts";

export class TelegramApiError extends Schema.TaggedError<TelegramApiError>()("TelegramApiError", {
  kind: Schema.Literals([
    "unauthorized",
    "forbidden",
    "conflict",
    "rate-limited",
    "bad-request",
    "not-found",
    "server",
    "network",
    "timeout",
    "decode",
    // A defect inside the outbox, reported to callers as a typed failure.
    "internal",
  ]),
  // Telegram's description or a fixed string; never a URL, because the URL holds the token.
  description: Schema.String,
  retryAfterSeconds: Schema.NullOr(Schema.Number),
}) {}
export type TelegramApiErrorKind = TelegramApiError["kind"];

export type BotToken = Redacted.Redacted<string>;

export interface TelegramBotApiShape {
  readonly getMe: (token: BotToken) => Effect.Effect<TgUser, TelegramApiError>;
  readonly getWebhookInfo: (
    token: BotToken,
  ) => Effect.Effect<{ readonly url: string }, TelegramApiError>;
  readonly getUpdates: (
    token: BotToken,
    input: {
      offset: number | null;
      timeoutSeconds: number;
      limit: number;
      allowedUpdates: ReadonlyArray<string>;
    },
  ) => Effect.Effect<ReadonlyArray<TgUpdate>, TelegramApiError>;
  readonly sendMessage: (
    token: BotToken,
    input: {
      chatId: number;
      text: string;
    },
  ) => Effect.Effect<TgMessage, TelegramApiError>;
}

export class TelegramBotApi extends Context.Service<TelegramBotApi, TelegramBotApiShape>()(
  "t3/telegram/TelegramBotApi",
) {}

const DECODE_DESCRIPTION = "Unexpected response from Telegram";

const apiError = (
  kind: TelegramApiErrorKind,
  description: string,
  retryAfterSeconds: number | null = null,
) => new TelegramApiError({ kind, description, retryAfterSeconds });

// Only the reason tag is used. The HttpClientError message embeds the request URL, which holds the token.
const fromHttpError = (error: HttpClientError.HttpClientError): TelegramApiError => {
  switch (error.reason._tag) {
    case "DecodeError":
    case "EmptyBodyError":
      return apiError("decode", DECODE_DESCRIPTION);
    default:
      return apiError("network", "Could not reach Telegram");
  }
};

const kindForCode = (code: number): TelegramApiErrorKind => {
  switch (code) {
    case 400:
      return "bad-request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    case 429:
      return "rate-limited";
    default:
      return code >= 500 ? "server" : "bad-request";
  }
};

const decodeEnvelope = Schema.decodeUnknownEffect(TgEnvelope);

const decodeUpdate = Schema.decodeUnknownOption(TgUpdate);
const decodeUpdateId = Schema.decodeUnknownOption(
  Schema.Struct({ update_id: TgUpdate.fields.update_id }),
);

/**
 * Decodes each update on its own, so one unexpected payload cannot stall the poller. An
 * update that fails becomes a bare `{ update_id }`, which the router ignores and the
 * offset still moves past.
 */
const decodeUpdates = (items: ReadonlyArray<unknown>) =>
  Effect.gen(function* () {
    const updates: Array<TgUpdate> = [];
    for (const item of items) {
      const update = decodeUpdate(item);
      if (Option.isSome(update)) {
        updates.push(update.value);
        continue;
      }
      const id = decodeUpdateId(item);
      yield* Effect.logWarning("Skipping a Telegram update that did not decode", {
        updateId: Option.isSome(id) ? id.value.update_id : null,
      });
      if (Option.isSome(id)) updates.push({ update_id: id.value.update_id });
    }
    return updates;
  });

export const make = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;

  const call = <S extends Schema.Top>(
    token: BotToken,
    method: string,
    body: object,
    schema: S,
  ): Effect.Effect<S["Type"], TelegramApiError, S["DecodingServices"]> =>
    Effect.gen(function* () {
      const request = HttpClientRequest.post(
        `https://api.telegram.org/bot${Redacted.value(token)}/${method}`,
      ).pipe(HttpClientRequest.bodyJsonUnsafe(body));
      const response = yield* client.execute(request).pipe(Effect.mapError(fromHttpError));
      // A gateway in front of Telegram can answer 5xx with an HTML page; that is a
      // server error to back off from, not a decode error.
      const json = yield* response.json.pipe(
        Effect.mapError((error) =>
          response.status >= 500
            ? apiError("server", `Telegram error ${response.status}`)
            : fromHttpError(error),
        ),
      );
      const envelope = yield* decodeEnvelope(json).pipe(
        Effect.mapError(() => apiError("decode", DECODE_DESCRIPTION)),
      );
      if (!envelope.ok) {
        const code = envelope.error_code ?? response.status;
        return yield* apiError(
          kindForCode(code),
          `Telegram rejected this request (${code}).`,
          envelope.parameters?.retry_after ?? null,
        );
      }
      return yield* Schema.decodeUnknownEffect(schema)(envelope.result).pipe(
        Effect.mapError(() => apiError("decode", DECODE_DESCRIPTION)),
      );
    }).pipe(
      Effect.timeoutOrElse({
        duration: method === "getUpdates" ? "35 seconds" : "15 seconds",
        orElse: () => Effect.fail(apiError("timeout", "Telegram did not answer in time")),
      }),
      Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
    );

  return TelegramBotApi.of({
    getMe: (token) => call(token, "getMe", {}, TgUser),
    getWebhookInfo: (token) => call(token, "getWebhookInfo", {}, TgWebhookInfo),
    getUpdates: (token, input) =>
      call(
        token,
        "getUpdates",
        {
          ...(input.offset === null ? {} : { offset: input.offset }),
          timeout: input.timeoutSeconds,
          limit: input.limit,
          allowed_updates: input.allowedUpdates,
        },
        Schema.Array(Schema.Unknown),
      ).pipe(Effect.flatMap(decodeUpdates)),
    sendMessage: (token, input) =>
      call(
        token,
        "sendMessage",
        {
          chat_id: input.chatId,
          text: input.text,
          link_preview_options: { is_disabled: true },
        },
        TgMessage,
      ),
  });
});

export const layer: Layer.Layer<TelegramBotApi, never, HttpClient.HttpClient> = Layer.effect(
  TelegramBotApi,
  make,
);

export const layerFetch: Layer.Layer<TelegramBotApi> = layer.pipe(
  Layer.provide(FetchHttpClient.layer),
);
