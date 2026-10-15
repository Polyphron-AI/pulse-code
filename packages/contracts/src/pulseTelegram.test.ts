import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  parseTelegramResourceId,
  telegramResourceId,
  TelegramChatId,
  TelegramMessageId,
  PulseTelegramRpcs,
} from "./pulseTelegram.ts";

const isChatId = Schema.is(TelegramChatId);
const isMessageId = Schema.is(TelegramMessageId);

describe("Telegram source identity", () => {
  it("keeps connection, chat and individual message identity distinct", () => {
    const source = { connectionId: "telegram_1000", chatId: "-42", messageId: "2" };
    expect(parseTelegramResourceId(telegramResourceId(source))).toEqual(source);
    expect(parseTelegramResourceId("telegram_2000/-42/2")).not.toEqual(source);
    expect(parseTelegramResourceId("telegram_1000/-42")).toEqual({
      connectionId: "telegram_1000",
      chatId: "-42",
    });
  });
  it("rejects malformed and numerically unsafe identities", () => {
    for (const value of [
      "2",
      "telegram_0/-42/2",
      "telegram_1000/0/2",
      "telegram_1000/-42/0",
      "telegram_1000/-42/2/3",
      "telegram_1000/-42/9999999999999999",
      "telegram_9999999999999999/-42/2",
    ])
      expect(parseTelegramResourceId(value)).toBeUndefined();
    expect(isChatId("-9999999999999999")).toBe(false);
    expect(isMessageId("9999999999999999")).toBe(false);
  });
  it("adds only a separate read and connection-management RPC family", () => {
    expect(PulseTelegramRpcs).toHaveLength(10);
    expect(PulseTelegramRpcs.map((rpc) => rpc._tag).some((tag) => /send|command/.test(tag))).toBe(
      false,
    );
  });
});
