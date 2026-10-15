import * as NodeCrypto from "node:crypto";
import {
  TelegramError,
  type TelegramConnection,
  type TelegramChat,
  type TelegramMessage,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { sliceUtf8 } from "../mail/MailImapRead.ts";
import type { TgMessage, TgUpdate } from "./TelegramApiTypes.ts";

export interface ConnectionRow {
  id: string;
  botId: string;
  username: string;
  title: string;
  connected: number;
  nextOffset: number;
  generation: number;
  error: string | null;
}
interface ChatRow {
  connectionId: string;
  chatId: string;
  title: string;
  chatType: string;
  pairedUserLabel: string;
  active: number;
  preview?: string | null;
}
interface MessageRow {
  connectionId: string;
  chatId: string;
  messageId: number;
  sender: string;
  text: string;
  sentAt: number;
  edited: number;
}
const unavailable = () =>
  new TelegramError({
    kind: "unavailable",
    message: "Telegram data could not be saved or read. Retry when server storage is available.",
  });
const missing = () =>
  new TelegramError({
    kind: "not-found",
    message: "This Telegram chat is unavailable. Reconnect its bot and pair the chat in Settings.",
  });
const hashCode = (code: string) =>
  NodeCrypto.createHash("sha256")
    .update(code.trim().toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0"))
    .digest("hex");
const label = (user: TgMessage["from"]) =>
  user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ").slice(0, 160)
    : "Unknown sender";
const title = (message: TgMessage) =>
  (message.chat.title ??
    [message.chat.first_name, message.chat.last_name].filter(Boolean).join(" ")) ||
  message.chat.username ||
  "Telegram chat";
const content = (message: TgMessage) =>
  (
    message.text ??
    message.caption ??
    (message.photo
      ? "[Photo]"
      : message.document
        ? "[Document]"
        : message.voice
          ? "[Voice message]"
          : message.video
            ? "[Video]"
            : message.audio
              ? "[Audio]"
              : message.sticker
                ? "[Sticker]"
                : "[Unsupported message]")
  ).slice(0, 16_000);
const publicConnection = (row: ConnectionRow): TelegramConnection => ({
  id: row.id,
  username: row.username,
  title: row.title,
  connected: row.connected === 1,
  ...(row.error ? { error: row.error } : {}),
});
const publicMessage = (row: MessageRow): TelegramMessage => ({
  ...row,
  messageId: String(row.messageId),
  edited: row.edited === 1,
  truncated: false,
});
const isTelegramError = Schema.is(TelegramError);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const safe = <A, E>(effect: Effect.Effect<A, E>) =>
    effect.pipe(Effect.mapError((error) => (isTelegramError(error) ? error : unavailable())));
  const columns = sql`id, bot_id AS "botId", username, title, connected, next_offset AS "nextOffset", generation, error`;
  const get = (id: string) =>
    safe(
      sql<ConnectionRow>`SELECT ${columns} FROM telegram_connections WHERE id = ${id}`.pipe(
        Effect.map((rows) => rows[0]),
      ),
    );
  const requireChat = (connectionId: string, chatId: string) =>
    safe(
      Effect.gen(function* () {
        const rows =
          yield* sql`SELECT 1 FROM telegram_chats p JOIN telegram_connections c ON c.id = p.connection_id WHERE p.connection_id = ${connectionId} AND p.chat_id = ${chatId} AND p.active = 1 AND c.connected = 1`;
        if (rows.length === 0) return yield* missing();
      }),
    );
  return {
    get,
    list: safe(
      sql<ConnectionRow>`SELECT ${columns} FROM telegram_connections ORDER BY title LIMIT 32`.pipe(
        Effect.map((rows) => rows.map(publicConnection)),
      ),
    ),
    connect: (input: { id: string; botId: string; username: string; title: string }) =>
      safe(
        sql`INSERT INTO telegram_connections (id, bot_id, username, title, connected) VALUES (${input.id}, ${input.botId}, ${input.username}, ${input.title}, 1) ON CONFLICT(id) DO UPDATE SET username = excluded.username, title = excluded.title, connected = 1, error = NULL, generation = generation + 1`.pipe(
          Effect.asVoid,
        ),
      ),
    disconnect: (id: string) =>
      safe(
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`UPDATE telegram_connections SET connected = 0, generation = generation + 1, error = NULL WHERE id = ${id}`;
            yield* sql`DELETE FROM telegram_pairing_codes WHERE connection_id = ${id}`;
          }),
        ),
      ),
    health: (id: string, generation: number, error: string | null, stop = false) =>
      safe(
        sql`UPDATE telegram_connections SET error = ${error}, connected = CASE WHEN ${stop ? 1 : 0} = 1 THEN 0 ELSE connected END WHERE id = ${id} AND generation = ${generation}`.pipe(
          Effect.asVoid,
        ),
      ),
    startPairing: (connectionId: string, now: number) =>
      safe(
        sql.withTransaction(
          Effect.gen(function* () {
            const connection = yield* get(connectionId);
            if (!connection?.connected) return yield* missing();
            yield* sql`DELETE FROM telegram_pairing_codes WHERE expires_at <= ${now}`;
            const codes =
              yield* sql`SELECT 1 FROM telegram_pairing_codes WHERE connection_id = ${connectionId}`;
            if (codes.length >= 3)
              return yield* new TelegramError({
                kind: "conflict",
                message: "Three pairing codes are already active. Use one or wait ten minutes.",
              });
            const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
            const code = Array.from(NodeCrypto.randomBytes(10), (byte) => alphabet[byte & 31]).join(
              "",
            );
            const expiresAt = now + 600_000;
            yield* sql`INSERT INTO telegram_pairing_codes (connection_id, code_hash, expires_at) VALUES (${connectionId}, ${hashCode(code)}, ${expiresAt})`;
            return {
              code,
              expiresAt,
              privateLink: `https://t.me/${connection.username}?start=pair_${code}`,
              groupLink: `https://t.me/${connection.username}?startgroup=pair_${code}`,
            };
          }),
        ),
      ),
    cancelPairing: (input: { connectionId: string; code: string }) =>
      safe(
        sql`DELETE FROM telegram_pairing_codes WHERE connection_id = ${input.connectionId} AND code_hash = ${hashCode(input.code)}`.pipe(
          Effect.asVoid,
        ),
      ),
    removeChat: (connectionId: string, chatId: string) =>
      safe(
        sql`UPDATE telegram_chats SET active = 0 WHERE connection_id = ${connectionId} AND chat_id = ${chatId}`.pipe(
          Effect.asVoid,
        ),
      ),
    /** Every cache write, pairing redemption and offset advance commits as one batch. No agent commands run here. */
    ingest: (
      connectionId: string,
      generation: number,
      updates: ReadonlyArray<TgUpdate>,
      now: number,
    ) =>
      safe(
        sql.withTransaction(
          Effect.gen(function* () {
            const connection = yield* get(connectionId);
            const notices: Array<{ chatId: number; text: string }> = [];
            if (!connection?.connected || connection.generation !== generation)
              return { changed: false, notices };
            let offset = connection.nextOffset;
            for (const update of [...updates]
              .sort((a, b) => a.update_id - b.update_id)
              .slice(0, 100)) {
              if (update.update_id < offset) continue;
              const membership = update.my_chat_member;
              if (
                membership &&
                String(membership.new_chat_member.user.id) === connection.botId &&
                ["left", "kicked"].includes(membership.new_chat_member.status)
              ) {
                yield* sql`UPDATE telegram_chats SET active = 0 WHERE connection_id = ${connectionId} AND chat_id = ${String(membership.chat.id)}`;
              }
              const message = update.message ?? update.edited_message;
              if (message && ["private", "group", "supergroup"].includes(message.chat.type)) {
                const chatId = String(message.chat.id);
                const pair = /^\/start(?:@[A-Za-z0-9_]+)?\s+pair_([A-Za-z0-9]+)\s*$/.exec(
                  message.text ?? "",
                );
                if (pair && message.from && !message.from.is_bot) {
                  const codes =
                    yield* sql`DELETE FROM telegram_pairing_codes WHERE connection_id = ${connectionId} AND code_hash = ${hashCode(pair[1]!)} AND expires_at > ${now} RETURNING code_hash`;
                  if (codes.length > 0) {
                    yield* sql`INSERT INTO telegram_chats (connection_id, chat_id, chat_type, title, paired_user_id, paired_user_label, active, created_at) VALUES (${connectionId}, ${chatId}, ${message.chat.type}, ${title(message)}, ${String(message.from.id)}, ${label(message.from)}, 1, ${now}) ON CONFLICT(connection_id, chat_id) DO UPDATE SET chat_type = excluded.chat_type, title = excluded.title, paired_user_id = excluded.paired_user_id, paired_user_label = excluded.paired_user_label, active = 1`;
                    notices.push({
                      chatId: message.chat.id,
                      text: "This chat is paired with Pulse Code. Received messages can be read and linked there. Telegram messages do not run agent commands.",
                    });
                    yield* sql`UPDATE telegram_connections SET pairing_failures = 0, pairing_window = ${now} WHERE id = ${connectionId}`;
                  } else {
                    yield* sql`UPDATE telegram_connections SET pairing_failures = CASE WHEN pairing_window < ${now - 600_000} THEN 1 ELSE pairing_failures + 1 END, pairing_window = CASE WHEN pairing_window < ${now - 600_000} THEN ${now} ELSE pairing_window END WHERE id = ${connectionId}`;
                    yield* sql`DELETE FROM telegram_pairing_codes WHERE connection_id = ${connectionId} AND EXISTS (SELECT 1 FROM telegram_connections WHERE id = ${connectionId} AND pairing_failures >= 10)`;
                  }
                } else {
                  const peers = yield* sql<{
                    pairedUserId: string;
                  }>`SELECT paired_user_id AS "pairedUserId" FROM telegram_chats WHERE connection_id = ${connectionId} AND chat_id = ${chatId} AND active = 1`;
                  const peer = peers[0];
                  if (
                    peer &&
                    /^\/unpair(?:@[A-Za-z0-9_]+)?\s*$/.test(message.text ?? "") &&
                    String(message.from?.id) === peer.pairedUserId
                  ) {
                    yield* sql`UPDATE telegram_chats SET active = 0 WHERE connection_id = ${connectionId} AND chat_id = ${chatId}`;
                  } else if (peer) {
                    yield* sql`UPDATE telegram_chats SET title = ${title(message)} WHERE connection_id = ${connectionId} AND chat_id = ${chatId}`;
                    yield* sql`INSERT INTO telegram_messages (connection_id, chat_id, message_id, sender_label, text, sent_at, edited) VALUES (${connectionId}, ${chatId}, ${message.message_id}, ${label(message.from)}, ${content(message)}, ${message.date * 1000}, ${update.edited_message ? 1 : 0}) ON CONFLICT(connection_id, chat_id, message_id) DO UPDATE SET text = excluded.text, sender_label = excluded.sender_label, edited = excluded.edited`;
                  }
                }
              }
              offset = update.update_id + 1;
            }
            yield* sql`UPDATE telegram_connections SET next_offset = ${offset}, error = NULL WHERE id = ${connectionId} AND generation = ${generation}`;
            return {
              changed: offset !== connection.nextOffset || connection.error !== null,
              notices,
            };
          }),
        ),
      ),
    listChats: (connectionId: string) =>
      safe(
        Effect.gen(function* () {
          const rows =
            yield* sql<ChatRow>`SELECT p.connection_id AS "connectionId", p.chat_id AS "chatId", p.title, p.chat_type AS "chatType", p.paired_user_label AS "pairedUserLabel", p.active, (SELECT substr(m.text, 1, 160) FROM telegram_messages m WHERE m.connection_id = p.connection_id AND m.chat_id = p.chat_id ORDER BY m.message_id DESC LIMIT 1) AS preview FROM telegram_chats p WHERE p.connection_id = ${connectionId} ORDER BY p.created_at DESC LIMIT 101`;
          return {
            chats: rows.slice(0, 100).map((row): TelegramChat => ({
              connectionId: row.connectionId,
              chatId: row.chatId,
              title: row.title,
              chatType: row.chatType,
              pairedUserLabel: row.pairedUserLabel,
              active: row.active === 1,
              ...(row.preview == null ? {} : { preview: row.preview }),
            })),
            truncated: rows.length > 100,
          };
        }),
      ),
    listMessages: (input: {
      connectionId: string;
      chatId: string;
      cursor?: string | undefined;
      limit?: number | undefined;
    }) =>
      safe(
        Effect.gen(function* () {
          yield* requireChat(input.connectionId, input.chatId);
          const limit = input.limit ?? 20;
          if (!Number.isInteger(limit) || limit < 1 || limit > 50)
            return yield* new TelegramError({
              kind: "invalid-input",
              message: "Choose 1 to 50 messages.",
            });
          const before = input.cursor ? Number(input.cursor) : Number.MAX_SAFE_INTEGER;
          const rows =
            yield* sql<MessageRow>`SELECT connection_id AS "connectionId", chat_id AS "chatId", message_id AS "messageId", sender_label AS sender, text, sent_at AS "sentAt", edited FROM telegram_messages WHERE connection_id = ${input.connectionId} AND chat_id = ${input.chatId} AND message_id < ${before} ORDER BY message_id DESC LIMIT ${limit + 1}`;
          const messages: Array<TelegramMessage> = [];
          let remaining = 24_000;
          for (const row of rows.slice(0, limit)) {
            const message = publicMessage(row);
            let size = Buffer.byteLength(encodeJson(message)) + 1;
            if (messages.length > 0 && size > remaining) break;
            while (size > remaining) {
              Object.assign(message, {
                text: sliceUtf8(message.text, 0, Math.floor(Buffer.byteLength(message.text) / 2))
                  .text,
                truncated: true,
              });
              size = Buffer.byteLength(encodeJson(message)) + 1;
            }
            messages.push(message);
            remaining -= size;
          }
          return {
            messages,
            ...(rows.length > messages.length && messages.length > 0
              ? { nextCursor: messages.at(-1)!.messageId }
              : {}),
          };
        }),
      ),
    readMessage: (input: { connectionId: string; chatId: string; messageId: string }) =>
      safe(
        Effect.gen(function* () {
          yield* requireChat(input.connectionId, input.chatId);
          const rows =
            yield* sql<MessageRow>`SELECT connection_id AS "connectionId", chat_id AS "chatId", message_id AS "messageId", sender_label AS sender, text, sent_at AS "sentAt", edited FROM telegram_messages WHERE connection_id = ${input.connectionId} AND chat_id = ${input.chatId} AND message_id = ${Number(input.messageId)}`;
          if (!rows[0])
            return yield* new TelegramError({
              kind: "not-found",
              message: "This message was not received by this bot or is unavailable.",
            });
          const row = publicMessage(rows[0]);
          const body = sliceUtf8(row.text, 0, 24_000);
          return { ...row, text: body.text, truncated: body.truncated };
        }),
      ),
  };
});

export class TelegramStore extends Context.Service<TelegramStore, Effect.Success<typeof make>>()(
  "t3/telegram/TelegramStore",
) {}
export const layer = Layer.effect(TelegramStore, make);
