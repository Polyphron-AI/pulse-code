import { TelegramError, parseTelegramResourceId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Semaphore from "effect/Semaphore";
import * as Schedule from "effect/Schedule";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";
import { TelegramBotApi, type TelegramApiError } from "./TelegramBotApi.ts";
import { TelegramStore, type ConnectionRow } from "./TelegramStore.ts";

const secretKey = (id: string) => `telegram-bot-${id}`;
const unavailable = () =>
  new TelegramError({
    kind: "unavailable",
    message: "Telegram is unavailable. Check this bot in Settings.",
  });
const apiFailure = (error: TelegramApiError) =>
  new TelegramError({
    kind:
      error.kind === "conflict"
        ? "conflict"
        : error.kind === "unauthorized" || error.kind === "forbidden"
          ? "access-denied"
          : "unavailable",
    ...(error.retryAfterSeconds === null
      ? {}
      : { retryAfterSeconds: Math.max(1, Math.min(300, Math.ceil(error.retryAfterSeconds))) }),
    message:
      error.kind === "unauthorized"
        ? "The bot token was rejected. Replace it in Settings."
        : error.kind === "conflict"
          ? "Another poller or webhook is using this bot. Disconnect it there first."
          : "Telegram could not complete this request. Try again.",
  });

export const make = (options: { readonly poll?: boolean } = {}) =>
  Effect.gen(function* () {
    const lifetime = yield* Effect.scope;
    const store = yield* TelegramStore;
    const secrets = yield* ServerSecretStore;
    const api = yield* TelegramBotApi;
    const changes = yield* SubscriptionRef.make(0);
    const announce = SubscriptionRef.update(changes, (value) => value + 1);
    const workers = new Map<string, Fiber.Fiber<void, never>>();
    const control = yield* Semaphore.make(1);
    const tokenFor = (id: string) =>
      secrets.get(secretKey(id)).pipe(
        Effect.mapError(unavailable),
        Effect.flatMap((value) =>
          Option.isSome(value)
            ? Effect.succeed(Redacted.make(new TextDecoder().decode(value.value)))
            : Effect.fail(unavailable()),
        ),
      );

    /** The next request acknowledges only an offset already committed with its complete update batch. */
    const pollOnce = (connection: ConnectionRow, timeoutSeconds = 25) =>
      Effect.gen(function* () {
        const token = yield* tokenFor(connection.id);
        const batch = yield* api
          .getUpdates(token, {
            offset: connection.nextOffset,
            timeoutSeconds,
            limit: 100,
            allowedUpdates: ["message", "edited_message", "my_chat_member"],
          })
          .pipe(Effect.mapError(apiFailure));
        const committed = yield* store.ingest(
          connection.id,
          connection.generation,
          batch,
          yield* Clock.currentTimeMillis,
        );
        if (committed.changed) yield* announce;
        // Pairing notices are control replies, never agent-authored sends or a generic send tool.
        for (const notice of committed.notices)
          yield* api.sendMessage(token, notice).pipe(Effect.catch(() => Effect.void));
      });
    const startWorker = (id: string) =>
      Effect.gen(function* () {
        const previous = workers.get(id);
        if (previous) yield* Fiber.interrupt(previous);
        if (options.poll === false) return;
        const worker = yield* Effect.gen(function* () {
          while (true) {
            const connection = yield* store.get(id);
            if (!connection?.connected) return;
            const result = yield* pollOnce(connection).pipe(Effect.result);
            if (result._tag === "Failure") {
              const stop =
                result.failure.kind === "conflict" || result.failure.kind === "access-denied";
              yield* store
                .health(id, connection.generation, result.failure.message, stop)
                .pipe(Effect.ignore);
              yield* announce;
              if (stop) return;
              yield* Effect.sleep((result.failure.retryAfterSeconds ?? 10) * 1000);
            }
          }
        }).pipe(
          Effect.retry({ schedule: Schedule.spaced("10 seconds") }),
          Effect.orDie,
          Effect.forkIn(lifetime),
        );
        workers.set(id, worker);
      });
    const connect = (input: { token: string }) =>
      Effect.gen(function* () {
        const token = Redacted.make(input.token);
        const bot = yield* api.getMe(token).pipe(Effect.mapError(apiFailure));
        if (!bot.is_bot || !bot.username || !/^[A-Za-z0-9_]+$/.test(bot.username) || bot.id <= 0)
          return yield* new TelegramError({
            kind: "invalid-input",
            message: "Use a Telegram bot token with a bot username.",
          });
        const webhook = yield* api.getWebhookInfo(token).pipe(Effect.mapError(apiFailure));
        if (webhook.url !== "")
          return yield* new TelegramError({
            kind: "conflict",
            message:
              "This bot has a webhook. Remove it in the service using the bot before connecting Pulse Code.",
          });
        const id = `telegram_${bot.id}`;
        const existing = yield* store.list;
        if (!existing.some((connection) => connection.id === id) && existing.length >= 32)
          return yield* new TelegramError({
            kind: "conflict",
            message: "At most 32 bot connections are supported.",
          });
        yield* secrets
          .set(secretKey(id), new TextEncoder().encode(input.token))
          .pipe(Effect.mapError(unavailable));
        yield* store.connect({
          id,
          botId: String(bot.id),
          username: bot.username,
          title: bot.first_name.slice(0, 160),
        });
        yield* startWorker(id);
        yield* announce;
        return (yield* store.list).find((connection) => connection.id === id)!;
      });
    const disconnect = (input: { connectionId: string }) =>
      Effect.gen(function* () {
        yield* store.disconnect(input.connectionId);
        const worker = workers.get(input.connectionId);
        if (worker) yield* Fiber.interrupt(worker);
        workers.delete(input.connectionId);
        yield* secrets.remove(secretKey(input.connectionId)).pipe(Effect.mapError(unavailable));
        yield* announce;
      });
    const removeChat = (input: { connectionId: string; chatId: string }) =>
      store.removeChat(input.connectionId, input.chatId).pipe(Effect.andThen(announce));
    const readResource = (resourceId: string, offset?: number) =>
      Effect.gen(function* () {
        const ref = parseTelegramResourceId(resourceId);
        if (!ref)
          return yield* new TelegramError({
            kind: "invalid-input",
            message: "This Telegram reference is invalid.",
          });
        if (ref.messageId) return yield* store.readMessage({ ...ref, messageId: ref.messageId });
        const page = yield* store.listMessages({
          ...ref,
          ...(offset ? { cursor: String(offset) } : {}),
        });
        return { ...page, ...(page.nextCursor ? { nextOffset: Number(page.nextCursor) } : {}) };
      });
    for (const connection of yield* store.list)
      if (connection.connected) yield* startWorker(connection.id);
    return {
      connect: (input: { token: string }) => control.withPermits(1)(connect(input)),
      disconnect: (input: { connectionId: string }) => control.withPermits(1)(disconnect(input)),
      removeChat,
      readResource,
      pollOnce,
      listConnections: store.list,
      cancelPairing: store.cancelPairing,
      startPairing: (input: { connectionId: string }) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) => store.startPairing(input.connectionId, now)),
        ),
      listChats: (input: { connectionId: string }) => store.listChats(input.connectionId),
      listMessages: store.listMessages,
      readMessage: store.readMessage,
      changes: SubscriptionRef.changes(changes),
    };
  });
export class TelegramService extends Context.Service<
  TelegramService,
  Effect.Success<ReturnType<typeof make>>
>()("t3/telegram/TelegramService") {}
export const layer = (options?: Parameters<typeof make>[0]) =>
  Layer.effect(TelegramService, make(options));
