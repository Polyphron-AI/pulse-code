import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import {
  ChatConversation,
  ChatMessage,
  chatResourceId,
  parseChatResourceId,
} from "./communications.ts";
import { workspaceItemKey } from "./pulseLinks.ts";

const isConversation = Schema.is(ChatConversation);
const isMessage = Schema.is(ChatMessage);

const input = {
  version: 1 as const,
  transport: "server" as const,
  connectionId: "slack_a",
  workspaceId: "T1",
  conversationId: "C1",
  messageId: "1760343120.000001",
  replyRootId: "1760343120.000001",
};

describe("chat resource identity", () => {
  it("keeps connection, workspace, channel and timestamp bytes distinct", () => {
    const id = chatResourceId(input);
    expect(parseChatResourceId(id)).toEqual(input);
    const key = (value: string, provider: "slack" | "discord" = "slack") =>
      workspaceItemKey({ type: "provider-resource", provider, resourceId: value });
    for (const other of [
      { ...input, connectionId: "slack_b" },
      { ...input, workspaceId: "T2" },
      { ...input, conversationId: "C2" },
      { ...input, transport: "desktop" as const },
      { ...input, messageId: "1760343120.000002" },
      { ...input, replyRootId: "1760343120.000002" },
    ])
      expect(key(chatResourceId(other))).not.toBe(key(id));
    expect(key(id, "discord")).not.toBe(key(id));
    expect(parseChatResourceId("v2/invalid")).toBeUndefined();
    expect(parseChatResourceId("v1/%GG")).toBeUndefined();
  });

  it("round trips delimiter-bearing and Unicode IDs without collisions", () => {
    const a = { ...input, connectionId: 'a/b:%|"雪', workspaceId: "c/d" };
    const b = { ...input, connectionId: "a", workspaceId: 'b:%|"雪/c/d' };
    expect(parseChatResourceId(chatResourceId(a))).toEqual(a);
    expect(parseChatResourceId(chatResourceId(b))).toEqual(b);
    expect(chatResourceId(a)).not.toBe(chatResourceId(b));
  });

  it("caps the encoded reference at exactly 512 characters", () => {
    const exact = {
      ...input,
      connectionId: "c".repeat(80),
      workspaceId: "w".repeat(80),
      conversationId: "d".repeat(80),
      messageId: "m".repeat(65),
      replyRootId: "r",
    };
    expect(chatResourceId(exact)).toHaveLength(512);
    expect(parseChatResourceId(chatResourceId(exact))).toEqual(exact);
    expect(() => chatResourceId({ ...exact, messageId: "m".repeat(66) })).toThrow("too long");
    const tooLong = `v1/${encodeURIComponent(JSON.stringify({ ...exact, messageId: "m".repeat(66) }))}`;
    expect(tooLong).toHaveLength(513);
    expect(parseChatResourceId(tooLong)).toBeUndefined();
  });

  it("rejects aliases of canonical resource IDs", () => {
    const canonical = chatResourceId(input);
    const { version, ...rest } = input;
    for (const alias of [
      `v1/${encodeURIComponent(JSON.stringify({ ...rest, version }))}`,
      `v1/${encodeURIComponent(JSON.stringify({ ...input, extra: true }))}`,
      `v1/${encodeURIComponent(JSON.stringify(input, null, 2))}`,
      `v1/${encodeURIComponent(" " + JSON.stringify(input))}`,
      canonical.replaceAll("%7B", "%7b"),
      canonical.replace("slack_a", "%73lack_a"),
    ]) {
      expect(alias).not.toBe(canonical);
      expect(parseChatResourceId(alias)).toBeUndefined();
    }
    for (const messageId of ["1760343120.00001", "1760343120.000010"]) {
      expect(parseChatResourceId(chatResourceId({ ...input, messageId }))?.messageId).toBe(
        messageId,
      );
    }
  });

  it.each([
    { ...input, version: 2 },
    { ...input, transport: "web" },
    { ...input, connectionId: "" },
    { ...input, workspaceId: "w".repeat(81) },
    { ...input, conversationId: 12 },
    { ...input, messageId: 1760343120.000001 },
    { ...input, replyRootId: null },
    {},
    [],
    null,
  ])("rejects malformed resource fields: %j", (value) => {
    expect(parseChatResourceId(`v1/${encodeURIComponent(JSON.stringify(value))}`)).toBeUndefined();
    expect(() => chatResourceId(value as typeof input)).toThrow();
  });

  it("keeps old IPC payloads valid and validates optional source metadata", () => {
    const conversation = {
      id: "C1",
      accountId: "a",
      title: "general",
      kind: "channel",
      workspace: "Display name",
      canSend: false,
    };
    const message = {
      id: "m",
      accountId: "a",
      conversationId: "C1",
      author: "A",
      date: "2026-10-13T09:12:00Z",
      text: "Hello",
    };
    expect(isConversation(conversation)).toBe(true);
    expect(isConversation({ ...conversation, workspaceId: "T1" })).toBe(true);
    expect(isMessage(message)).toBe(true);
    for (const replyCount of [0, 2]) expect(isMessage({ ...message, replyCount })).toBe(true);
    for (const replyCount of [-1, 1.5, "2", null])
      expect(isMessage({ ...message, replyCount })).toBe(false);
  });
});
