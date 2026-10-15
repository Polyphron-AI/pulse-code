import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { NonNegativeInt, PositiveInt } from "./baseSchemas.ts";

export const TelegramConnectionId = Schema.String.check(
  Schema.isPattern(/^telegram_[1-9]\d{0,15}$/),
  Schema.makeFilter((value) => Number.isSafeInteger(Number(value.slice(9)))),
);
export const TelegramChatId = Schema.String.check(
  Schema.isPattern(/^-?[1-9]\d{0,15}$/),
  Schema.makeFilter((value) => Number.isSafeInteger(Number(value))),
);
export const TelegramMessageId = Schema.String.check(
  Schema.isPattern(/^[1-9]\d{0,15}$/),
  Schema.makeFilter((value) => Number.isSafeInteger(Number(value))),
);
export const TelegramConnection = Schema.Struct({
  id: TelegramConnectionId,
  username: Schema.String,
  title: Schema.String,
  connected: Schema.Boolean,
  error: Schema.optionalKey(Schema.String),
});
export type TelegramConnection = typeof TelegramConnection.Type;
export const TelegramChat = Schema.Struct({
  connectionId: TelegramConnectionId,
  chatId: TelegramChatId,
  title: Schema.String,
  chatType: Schema.String,
  pairedUserLabel: Schema.String,
  active: Schema.Boolean,
  preview: Schema.optionalKey(Schema.String),
});
export type TelegramChat = typeof TelegramChat.Type;
export const TelegramMessage = Schema.Struct({
  connectionId: TelegramConnectionId,
  chatId: TelegramChatId,
  messageId: TelegramMessageId,
  sender: Schema.String,
  text: Schema.String,
  sentAt: NonNegativeInt,
  edited: Schema.Boolean,
  truncated: Schema.Boolean,
});
export type TelegramMessage = typeof TelegramMessage.Type;
export const TelegramMessagePage = Schema.Struct({
  messages: Schema.Array(TelegramMessage),
  nextCursor: Schema.optionalKey(TelegramMessageId),
});
export type TelegramMessagePage = typeof TelegramMessagePage.Type;
export class TelegramError extends Schema.TaggedError<TelegramError>()("TelegramError", {
  kind: Schema.Literals(["invalid-input", "not-found", "unavailable", "access-denied", "conflict"]),
  message: Schema.String,
  retryAfterSeconds: Schema.optionalKey(NonNegativeInt),
}) {}
const errors = Schema.Union([TelegramError, EnvironmentAuthorizationError]);
const Connection = Schema.Struct({ connectionId: TelegramConnectionId });
const Chat = Schema.Struct({ ...Connection.fields, chatId: TelegramChatId });
export const PULSE_TELEGRAM_METHODS = {
  telegramListConnections: "pulse.telegram.listConnections",
  telegramConnect: "pulse.telegram.connect",
  telegramDisconnect: "pulse.telegram.disconnect",
  telegramStartPairing: "pulse.telegram.startPairing",
  telegramListChats: "pulse.telegram.listChats",
  telegramRemoveChat: "pulse.telegram.removeChat",
  telegramListMessages: "pulse.telegram.listMessages",
  telegramReadMessage: "pulse.telegram.readMessage",
  telegramCancelPairing: "pulse.telegram.cancelPairing",
  telegramSubscribeChanges: "pulse.telegram.subscribeChanges",
} as const;
export const PulseTelegramRpcs = [
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramCancelPairing, {
    payload: Schema.Struct({
      ...Connection.fields,
      code: Schema.String.check(Schema.isMaxLength(32)),
    }),
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramListConnections, {
    payload: Schema.Struct({}),
    success: Schema.Array(TelegramConnection),
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramConnect, {
    payload: Schema.Struct({
      token: Schema.String.check(
        Schema.isMaxLength(256),
        Schema.isPattern(/^\d+:[A-Za-z0-9_-]{20,}$/),
      ),
    }),
    success: TelegramConnection,
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramDisconnect, {
    payload: Connection,
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramStartPairing, {
    payload: Connection,
    success: Schema.Struct({
      code: Schema.String,
      privateLink: Schema.String,
      groupLink: Schema.String,
      expiresAt: NonNegativeInt,
    }),
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramListChats, {
    payload: Connection,
    success: Schema.Struct({ chats: Schema.Array(TelegramChat), truncated: Schema.Boolean }),
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramRemoveChat, {
    payload: Chat,
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramListMessages, {
    payload: Schema.Struct({
      ...Chat.fields,
      cursor: Schema.optionalKey(TelegramMessageId),
      limit: Schema.optionalKey(PositiveInt),
    }),
    success: TelegramMessagePage,
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramReadMessage, {
    payload: Schema.Struct({ ...Chat.fields, messageId: TelegramMessageId }),
    success: TelegramMessage,
    error: errors,
  }),
  Rpc.make(PULSE_TELEGRAM_METHODS.telegramSubscribeChanges, {
    payload: Schema.Struct({}),
    success: NonNegativeInt,
    error: EnvironmentAuthorizationError,
    stream: true,
  }),
] as const;

/** Provider-resource identity is local to a connection and chat, never a Telegram message number alone. */
export const telegramResourceId = (input: {
  connectionId: string;
  chatId: string;
  messageId?: string;
}) => `${input.connectionId}/${input.chatId}${input.messageId ? `/${input.messageId}` : ""}`;
export function parseTelegramResourceId(resourceId: string) {
  const match = /^(telegram_[1-9]\d{0,15})\/(-?[1-9]\d{0,15})(?:\/([1-9]\d{0,15}))?$/.exec(
    resourceId,
  );
  return match &&
    Number.isSafeInteger(Number(match[1]!.slice(9))) &&
    Number.isSafeInteger(Number(match[2])) &&
    (!match[3] || Number.isSafeInteger(Number(match[3])))
    ? { connectionId: match[1]!, chatId: match[2]!, ...(match[3] ? { messageId: match[3] } : {}) }
    : undefined;
}
