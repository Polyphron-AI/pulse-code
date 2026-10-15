import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as ServerConfig from "../config.ts";
import * as Secrets from "../auth/ServerSecretStore.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as TelegramStore from "./TelegramStore.ts";
import * as TelegramService from "./TelegramService.ts";
import * as TelegramBotApi from "./TelegramBotApi.ts";
import { makeFakeBotApi } from "./testing/fakeBotApi.ts";
import type { TgUpdate } from "./TelegramApiTypes.ts";

const token = "1000:synthetic_fixture_token_only";
const id = "telegram_1000";
const testLayer = () =>
  Layer.mergeAll(
    TelegramStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    Secrets.layer.pipe(
      Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "telegram-reader-test-" })),
    ),
  ).pipe(Layer.provideMerge(NodeServices.layer));
const update = (
  updateId: number,
  messageId: number,
  text: string,
  userId = 7,
  chatId = -42,
): TgUpdate => ({
  update_id: updateId,
  message: {
    message_id: messageId,
    date: 1_760_000_000,
    chat: { id: chatId, type: "supergroup", title: "Project group" },
    from: { id: userId, is_bot: false, first_name: `User ${userId}` },
    text,
  },
});
const setup = Effect.gen(function* () {
  const fake = yield* makeFakeBotApi();
  const api = yield* TelegramBotApi.make.pipe(Effect.provide(fake.layer));
  const store = yield* TelegramStore.TelegramStore;
  const service = yield* TelegramService.make({ poll: false }).pipe(
    Effect.provideService(TelegramBotApi.TelegramBotApi, api),
  );
  yield* service.connect({ token });
  const poll = (updates: ReadonlyArray<TgUpdate>) =>
    Effect.gen(function* () {
      yield* fake.pushUpdates(updates);
      yield* service.pollOnce((yield* store.get(id))!);
    });
  return { fake, api, store, service, poll };
});

describe("Telegram bot reader", () => {
  it.effect.each([401, 409])(
    "stops polling with a visible connection error for Telegram status %s",
    (status) =>
      Effect.gen(function* () {
        const fake = yield* makeFakeBotApi();
        const api = yield* TelegramBotApi.make.pipe(Effect.provide(fake.layer));
        const service = yield* TelegramService.make().pipe(
          Effect.provideService(TelegramBotApi.TelegramBotApi, api),
        );
        yield* fake.failNext("getUpdates", { status, body: { ok: false, error_code: status } });
        yield* service.connect({ token }).pipe(Effect.scoped);
        yield* service.changes.pipe(
          Stream.filter((revision) => revision >= 2),
          Stream.runHead,
        );
        expect((yield* service.listConnections)[0]).toMatchObject({
          connected: false,
          error: expect.any(String),
        });
        yield* TestClock.adjust("1 minute");
        expect(fake.calls.filter((call) => call.method === "getUpdates")).toHaveLength(1);
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect(
    "marks a chat unavailable when its bot is removed without deleting received content",
    () =>
      Effect.gen(function* () {
        const { service, poll } = yield* setup;
        const code = yield* service.startPairing({ connectionId: id });
        yield* poll([
          update(1, 1, `/start pair_${code.code}`),
          update(2, 2, "Retained received text"),
        ]);
        yield* poll([
          {
            update_id: 3,
            my_chat_member: {
              chat: { id: -42, type: "supergroup" },
              from: { id: 7, is_bot: false, first_name: "Member" },
              date: 3,
              new_chat_member: {
                status: "left",
                user: { id: 1000, is_bot: true, first_name: "Pulse" },
              },
            },
          },
        ]);
        expect(
          (yield* service
            .readMessage({ connectionId: id, chatId: "-42", messageId: "2" })
            .pipe(Effect.flip)).kind,
        ).toBe("not-found");
        const sql = yield* SqlClient.SqlClient;
        expect(
          (yield* sql<{ text: string }>`SELECT text FROM telegram_messages WHERE message_id = 2`)[0]
            ?.text,
        ).toBe("Retained received text");
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect(
    "honors Retry-After and recovers polling without acknowledging uncommitted updates",
    () =>
      Effect.gen(function* () {
        const fake = yield* makeFakeBotApi();
        const api = yield* TelegramBotApi.make.pipe(Effect.provide(fake.layer));
        const service = yield* TelegramService.make().pipe(
          Effect.provideService(TelegramBotApi.TelegramBotApi, api),
        );
        yield* fake.failNext("getUpdates", {
          status: 429,
          body: { ok: false, error_code: 429, parameters: { retry_after: 15 } },
        });
        yield* service.connect({ token }).pipe(Effect.scoped);
        yield* service.changes.pipe(
          Stream.filter((revision) => revision >= 2),
          Stream.runHead,
        );
        expect((yield* service.listConnections)[0]?.error).toBeDefined();
        const code = yield* service.startPairing({ connectionId: id });
        yield* fake.pushUpdates([
          update(1, 1, `/start pair_${code.code}`),
          update(2, 2, "Recovered"),
        ]);
        yield* TestClock.adjust("14 seconds");
        expect(fake.calls.filter((call) => call.method === "getUpdates")).toHaveLength(1);
        yield* TestClock.adjust("1 second");
        yield* service.changes.pipe(
          Stream.filter((revision) => revision >= 3),
          Stream.runHead,
        );
        expect((yield* service.listConnections)[0]?.error).toBeUndefined();
        expect(
          (yield* service.readMessage({ connectionId: id, chatId: "-42", messageId: "2" })).text,
        ).toBe("Recovered");
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect("keeps a newly connected bot polling after the connect request scope closes", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeBotApi();
      const api = yield* TelegramBotApi.make.pipe(Effect.provide(fake.layer));
      const service = yield* TelegramService.make().pipe(
        Effect.provideService(TelegramBotApi.TelegramBotApi, api),
      );
      yield* service.connect({ token }).pipe(Effect.scoped);
      const pairing = yield* service.startPairing({ connectionId: id });
      yield* fake.pushUpdates([
        update(1, 1, `/start pair_${pairing.code}`),
        update(2, 2, "After request ended"),
      ]);
      yield* service.changes.pipe(
        Stream.filter((revision) => revision >= 2),
        Stream.runHead,
      );
      expect(
        (yield* service.readMessage({ connectionId: id, chatId: "-42", messageId: "2" })).text,
      ).toBe("After request ended");
      yield* service.disconnect({ connectionId: id });
    }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );
  it.effect(
    "pages retained received history without pruning and updates edited message identity",
    () =>
      Effect.gen(function* () {
        const { service, poll } = yield* setup;
        const pairing = yield* service.startPairing({ connectionId: id });
        yield* poll([update(1, 1, `/start pair_${pairing.code}`)]);
        for (let first = 2; first <= 202; first += 100) {
          yield* poll(
            Array.from({ length: Math.min(100, 203 - first) }, (_, index) =>
              update(first + index, first + index, `Received ${first + index}`),
            ),
          );
        }
        const edited = update(203, 2, "Edited old message").message!;
        yield* poll([{ update_id: 203, edited_message: edited }]);
        expect(
          yield* service.readMessage({ connectionId: id, chatId: "-42", messageId: "2" }),
        ).toMatchObject({ text: "Edited old message", edited: true, messageId: "2" });
        const seen: string[] = [];
        let cursor: string | undefined;
        do {
          const page = yield* service.listMessages({
            connectionId: id,
            chatId: "-42",
            cursor,
            limit: 50,
          });
          expect(page.messages.length).toBeLessThanOrEqual(50);
          seen.push(...page.messages.map((message) => message.messageId));
          cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toHaveLength(201);
        expect(new Set(seen).size).toBe(201);
        expect(
          (yield* service
            .listMessages({ connectionId: id, chatId: "-42", limit: 51 })
            .pipe(Effect.flip)).kind,
        ).toBe("invalid-input");
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect(
    "cancels and expires pairing codes, caps attempts, and does not allow another member to unpair",
    () =>
      Effect.gen(function* () {
        const { service, store, poll } = yield* setup;
        const canceled = yield* service.startPairing({ connectionId: id });
        yield* service.cancelPairing({ connectionId: id, code: canceled.code });
        yield* poll([update(1, 1, `/start pair_${canceled.code}`)]);
        expect((yield* service.listChats({ connectionId: id })).chats).toHaveLength(0);
        const expired = yield* store.startPairing(id, 0);
        yield* store.ingest(
          id,
          (yield* store.get(id))!.generation,
          [update(2, 2, `/start pair_${expired.code}`)],
          600_001,
        );
        expect((yield* service.listChats({ connectionId: id })).chats).toHaveLength(0);
        const valid = yield* service.startPairing({ connectionId: id });
        yield* poll([update(3, 3, `/start pair_${valid.code}`)]);
        yield* poll([update(4, 4, "/unpair", 99)]);
        expect((yield* service.listChats({ connectionId: id })).chats[0]?.active).toBe(true);
        yield* poll([update(5, 5, "/unpair", 7)]);
        expect((yield* service.listChats({ connectionId: id })).chats[0]?.active).toBe(false);
        const denied = yield* service.startPairing({ connectionId: id });
        yield* poll(
          Array.from({ length: 10 }, (_, index) =>
            update(6 + index, 6 + index, "/start pair_WRONG"),
          ),
        );
        yield* poll([update(16, 16, `/start pair_${denied.code}`)]);
        expect((yield* service.listChats({ connectionId: id })).chats[0]?.active).toBe(false);
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect(
    "bounds serialized pages including escaped UTF-8 content and exposes a next cursor",
    () =>
      Effect.gen(function* () {
        const { service, poll } = yield* setup;
        const pairing = yield* service.startPairing({ connectionId: id });
        yield* poll([
          update(1, 1, `/start pair_${pairing.code}`),
          ...Array.from({ length: 10 }, (_, index) =>
            update(index + 2, index + 2, "🙂\n\\".repeat(3000)),
          ),
        ]);
        const page = yield* service.listMessages({ connectionId: id, chatId: "-42", limit: 50 });
        expect(page.nextCursor).toBeDefined();
        expect(page.messages).toHaveLength(1);
        expect(page.messages[0]?.truncated).toBe(true);
        expect(page.messages[0]?.text).not.toContain("�");
        expect(yield* service.readResource(`${id}/-42`)).toHaveProperty("nextOffset");
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect(
    "pairs approved chats, stores passive members as inert data, and never exposes a bot send command",
    () =>
      Effect.gen(function* () {
        const { service, store, poll, fake } = yield* setup;
        yield* poll([update(1, 1, "unapproved content")]);
        expect((yield* service.listChats({ connectionId: id })).chats).toEqual([]);
        const pairing = yield* service.startPairing({ connectionId: id });
        yield* poll([
          update(2, 2, `/start pair_${pairing.code}`),
          update(3, 3, "paired member text"),
          update(4, 4, "/new run a destructive command", 99),
        ]);
        expect((yield* service.listChats({ connectionId: id })).chats[0]?.active).toBe(true);
        const messages = yield* service.listMessages({ connectionId: id, chatId: "-42" });
        expect(messages.messages.map((message) => message.messageId)).toEqual(["4", "3"]);
        expect(messages.messages[0]?.text).toBe("/new run a destructive command");
        expect(fake.calls.filter((call) => call.method === "sendMessage")).toHaveLength(1);
        expect((yield* store.get(id))?.nextOffset).toBe(5);
        expect(Object.keys(service)).not.toContain("sendMessage");
        const secret = yield* Secrets.ServerSecretStore;
        expect(Option.isSome(yield* secret.get(`telegram-bot-${id}`))).toBe(true);
        expect(yield* service.listConnections).toEqual([
          { id, username: "pulse_test_bot", title: "Pulse", connected: true },
        ]);
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect(
    "rolls pairing, content and offset back together on persistence failure then recovers once",
    () =>
      Effect.gen(function* () {
        const { service, store, poll, fake } = yield* setup;
        const sql = yield* SqlClient.SqlClient;
        const pairing = yield* service.startPairing({ connectionId: id });
        const batch = [update(1, 1, `/start pair_${pairing.code}`), update(2, 2, "Durable body")];
        yield* sql`CREATE TRIGGER telegram_fixture_failure BEFORE INSERT ON telegram_messages BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`;
        expect((yield* poll(batch).pipe(Effect.flip)).kind).toBe("unavailable");
        expect((yield* store.get(id))?.nextOffset).toBe(0);
        expect((yield* service.listChats({ connectionId: id })).chats).toEqual([]);
        yield* sql`DROP TRIGGER telegram_fixture_failure`;
        yield* poll(batch);
        yield* poll(batch);
        expect(
          (yield* service.listMessages({ connectionId: id, chatId: "-42" })).messages,
        ).toHaveLength(1);
        expect((yield* store.get(id))?.nextOffset).toBe(3);
        expect(fake.calls.filter((call) => call.method === "sendMessage")).toHaveLength(1);
        const restarted = yield* TelegramService.make({ poll: false }).pipe(
          Effect.provideService(
            TelegramBotApi.TelegramBotApi,
            yield* TelegramBotApi.make.pipe(Effect.provide(fake.layer)),
          ),
        );
        expect(
          (yield* restarted.readMessage({ connectionId: id, chatId: "-42", messageId: "2" })).text,
        ).toBe("Durable body");
        const polls = fake.calls.filter((call) => call.method === "getUpdates");
        expect(polls.map((call) => (call.body as { offset: number }).offset)).toEqual([0, 0, 3]);
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect("preserves cached content while removal or disconnect makes reads unavailable", () =>
    Effect.gen(function* () {
      const { service, store, poll } = yield* setup;
      const pairing = yield* service.startPairing({ connectionId: id });
      yield* poll([
        update(1, 1, `/start pair_${pairing.code}`),
        update(2, 2, "Keep this linked text"),
      ]);
      yield* poll([update(3, 3, "/unpair", 99)]);
      expect(
        (yield* service.readMessage({ connectionId: id, chatId: "-42", messageId: "2" })).text,
      ).toBe("Keep this linked text");
      yield* service.removeChat({ connectionId: id, chatId: "-42" });
      expect(
        (yield* service
          .readMessage({ connectionId: id, chatId: "-42", messageId: "2" })
          .pipe(Effect.flip)).kind,
      ).toBe("not-found");
      const code = yield* service.startPairing({ connectionId: id });
      yield* poll([update(4, 4, `/start pair_${code.code}`)]);
      expect(
        (yield* service.readMessage({ connectionId: id, chatId: "-42", messageId: "2" })).text,
      ).toBe("Keep this linked text");
      yield* service.disconnect({ connectionId: id });
      expect(
        (yield* service
          .readMessage({ connectionId: id, chatId: "-42", messageId: "2" })
          .pipe(Effect.flip)).kind,
      ).toBe("not-found");
      yield* store.ingest(id, 1, [update(5, 5, "stale poll")], 0);
      yield* service.connect({ token });
      expect(
        (yield* service.listMessages({ connectionId: id, chatId: "-42" })).messages.some(
          (message) => message.messageId === "5",
        ),
      ).toBe(false);
      expect(
        (yield* service.readMessage({ connectionId: id, chatId: "-42", messageId: "2" })).text,
      ).toBe("Keep this linked text");
    }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect("keeps connections and chats isolated even with identical message numbers", () =>
    Effect.gen(function* () {
      const { service, poll } = yield* setup;
      const pairing = yield* service.startPairing({ connectionId: id });
      yield* poll([update(1, 1, `/start pair_${pairing.code}`), update(2, 2, "First connection")]);
      expect((yield* service.readResource("telegram_2000/-42/2").pipe(Effect.flip)).kind).toBe(
        "not-found",
      );
      expect((yield* service.readResource(`${id}/-99/2`).pipe(Effect.flip)).kind).toBe("not-found");
      expect(yield* service.readResource(`${id}/-42/2`)).toMatchObject({
        text: "First connection",
      });
    }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );
});
