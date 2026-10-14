import { describe, expect, it } from "vite-plus/test";
import type { ChatMessage } from "@t3tools/contracts";
import {
  chatReferenceKey,
  chatTextParts,
  createRequestQueue,
  mergeChatMessages,
  sendAttempt,
} from "./communicationsChat";

const message = (id: string, date: string, text: string): ChatMessage => ({
  id,
  date,
  text,
  accountId: "account",
  conversationId: "room",
  author: "Alex",
});
describe("communications chat state", () => {
  it("routes web links while preserving surrounding message text and punctuation", () => {
    const input =
      "Review https://github.com/team/repo/pull/42, then <https://docs.google.com/document/d/123|brief>.";
    const parts = chatTextParts(input);
    expect(parts.map((part) => part.text).join("")).toBe(input);
    expect(parts.flatMap((part) => (part.href ? [part.href] : []))).toEqual([
      "https://github.com/team/repo/pull/42",
      "https://docs.google.com/document/d/123",
    ]);
  });
  it("leaves executable, local and malformed links as plain text", () => {
    const input = "javascript:alert(1) file:///private data:text/html,x https:// https://%";
    expect(chatTextParts(input)).toEqual([{ text: input }]);
  });
  it("keeps provider and colon-bearing IDs distinct in local saved references", () => {
    const base = { provider: "slack", accountId: "a:b", conversationId: "c", messageId: "d" };
    expect(chatReferenceKey(base)).not.toBe(
      chatReferenceKey({ ...base, accountId: "a", conversationId: "b:c" }),
    );
    expect(chatReferenceKey(base)).not.toBe(chatReferenceKey({ ...base, provider: "discord" }));
  });
  it("deduplicates history pages, replaces changed messages, and orders oldest first", () => {
    expect(
      mergeChatMessages(
        [message("2", "2026-01-02", "old")],
        [message("1", "2026-01-01", "first"), message("2", "2026-01-02", "edited")],
      ).map((row) => row.text),
    ).toEqual(["first", "edited"]);
  });
  it("retains a send nonce on retry and changes it only when text changes", () => {
    const initial = sendAttempt("hello", undefined, () => "first");
    expect(sendAttempt("hello", initial, () => "second")).toBe(initial);
    expect(sendAttempt("edited", initial, () => "second")).toEqual({
      text: "edited",
      nonce: "second",
      destination: "",
    });
  });
  it("uses a new nonce when unchanged text changes reply destination", () => {
    const first = sendAttempt("same text", undefined, () => "first", "room/root-1");
    expect(sendAttempt("same text", first, () => "second", "room/root-2")).toEqual({
      text: "same text",
      nonce: "second",
      destination: "room/root-2",
    });
  });
  it("queues concurrent reads and still runs the next request after a failure", async () => {
    const received: string[] = [];
    const run = createRequestQueue(async (request: string) => {
      received.push(request);
      if (request === "bad") throw new Error("failed");
      return request;
    });
    const result = await Promise.allSettled([run("first"), run("bad"), run("last")]);
    expect(received).toEqual(["first", "bad", "last"]);
    expect(result.map((item) => item.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});
