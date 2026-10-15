import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import type * as Scope from "effect/Scope";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import type { TgUpdate, TgUser } from "../TelegramApiTypes.ts";

export interface FakeBotScript {
  readonly me: TgUser;
  readonly webhookUrl: string;
}

/**
 * A scripted failure for the next call to a method. `status: 0` simulates a
 * network failure. A string `body` is sent raw, so tests can send invalid JSON.
 */
export interface FakeBotFailure {
  readonly status: number;
  readonly body: unknown;
}

export interface FakeBotCall {
  readonly method: string;
  readonly body: unknown;
  readonly url: string;
}

const defaultScript: FakeBotScript = {
  me: { id: 1000, is_bot: true, first_name: "Pulse", username: "pulse_test_bot" },
  webhookUrl: "",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const decodeBody = (body: unknown): unknown => {
  if (
    typeof body === "object" &&
    body !== null &&
    "_tag" in body &&
    body._tag === "Uint8Array" &&
    "body" in body &&
    body.body instanceof Uint8Array
  ) {
    return JSON.parse(new TextDecoder().decode(body.body));
  }
  return null;
};

/**
 * An in-memory Telegram Bot API behind `HttpClient`. `getUpdates` blocks on a
 * queue until `pushUpdates`, so polling tests never wait on a clock.
 */
export const makeFakeBotApi = (
  script?: Partial<FakeBotScript>,
): Effect.Effect<
  {
    readonly layer: Layer.Layer<HttpClient.HttpClient>;
    readonly calls: ReadonlyArray<FakeBotCall>;
    readonly pushUpdates: (updates: ReadonlyArray<TgUpdate>) => Effect.Effect<void>;
    readonly failNext: (method: string, response: FakeBotFailure) => Effect.Effect<void>;
  },
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const resolved = { ...defaultScript, ...script };
    const calls: Array<FakeBotCall> = [];
    const failures = new Map<string, Array<FakeBotFailure>>();
    const updates = yield* Queue.unbounded<ReadonlyArray<TgUpdate>>();
    yield* Effect.addFinalizer(() => Queue.shutdown(updates));
    let nextMessageId = 1;

    const succeed = (result: unknown) => Effect.succeed(jsonResponse(200, { ok: true, result }));

    const answer = (method: string, body: Record<string, unknown>) => {
      switch (method) {
        case "getMe":
          return succeed(resolved.me);
        case "getWebhookInfo":
          return succeed({ url: resolved.webhookUrl, pending_update_count: 0 });
        case "getUpdates":
          // Like Telegram, an idle long poll answers [] once its `timeout` elapses on the clock.
          return Queue.take(updates).pipe(
            Effect.timeoutOption(`${Number(body["timeout"] ?? 0)} seconds`),
            Effect.flatMap((batch) => succeed(Option.getOrElse(batch, () => []))),
            Effect.orDie,
          );
        case "sendMessage":
          // Dated on the Effect clock, so cached outbound rows age like real ones.
          return Clock.currentTimeMillis.pipe(
            Effect.flatMap((now) =>
              succeed({
                message_id: nextMessageId++,
                date: Math.floor(now / 1000),
                chat: { id: body["chat_id"], type: "private" },
                from: resolved.me,
                text: body["text"],
              }),
            ),
          );
        default:
          return succeed(true);
      }
    };

    const client = HttpClient.make((request, url) =>
      Effect.suspend(() => {
        const method = url.pathname.split("/").pop() ?? "";
        const body = decodeBody(request.body);
        calls.push({ method, body, url: url.toString() });
        const failure = failures.get(method)?.shift();
        if (failure !== undefined) {
          if (failure.status === 0) {
            return Effect.fail(
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  request,
                  description: `connect failed for ${url.toString()}`,
                }),
              }),
            );
          }
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, jsonResponse(failure.status, failure.body)),
          );
        }
        const fields = typeof body === "object" && body !== null ? { ...body } : {};
        return answer(method, fields).pipe(
          Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
        );
      }),
    );

    return {
      layer: Layer.succeed(HttpClient.HttpClient, client),
      calls,
      pushUpdates: (batch) => Queue.offer(updates, batch).pipe(Effect.asVoid),
      failNext: (method, response) =>
        Effect.sync(() => {
          const queue = failures.get(method) ?? [];
          queue.push(response);
          failures.set(method, queue);
        }),
    };
  });
