import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as BotApi from "./TelegramBotApi.ts";
import { makeFakeBotApi } from "./testing/fakeBotApi.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

describe("Telegram API boundary", () => {
  it.effect.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [409, "conflict"],
    [429, "rate-limited"],
    [500, "server"],
    [0, "network"],
  ] as const)("returns a sanitized failure for status %s (%s)", ([status, kind]) =>
    Effect.gen(function* () {
      const token = "1000:synthetic_secret_not_for_logs";
      const fake = yield* makeFakeBotApi();
      const api = yield* BotApi.make.pipe(Effect.provide(fake.layer));
      yield* fake.failNext("getMe", {
        status,
        body: {
          ok: false,
          error_code: status,
          description: token,
          parameters: { retry_after: 15 },
        },
      });
      const error = yield* api.getMe(Redacted.make(token)).pipe(Effect.flip);
      expect(error.kind).toBe(kind);
      expect(encodeJson(error)).not.toContain(token);
      if (status === 429) expect(error.retryAfterSeconds).toBe(15);
    }).pipe(Effect.scoped),
  );
  it.effect(
    "advances unknown safe updates without admitting malformed message or unsafe update IDs",
    () =>
      Effect.gen(function* () {
        const fake = yield* makeFakeBotApi();
        const api = yield* BotApi.make.pipe(Effect.provide(fake.layer));
        yield* fake.failNext("getUpdates", {
          status: 200,
          body: {
            ok: true,
            result: [
              { update_id: 1, message: { unexpected: true } },
              { update_id: 2, future_kind: {} },
              { update_id: 1.5 },
              { update_id: Number.MAX_SAFE_INTEGER + 1 },
            ],
          },
        });
        expect(
          yield* api.getUpdates(Redacted.make("fixture"), {
            offset: 0,
            timeoutSeconds: 25,
            limit: 100,
            allowedUpdates: ["message"],
          }),
        ).toEqual([{ update_id: 1 }, { update_id: 2 }]);
      }).pipe(Effect.scoped),
  );
});
