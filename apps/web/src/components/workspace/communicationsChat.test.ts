import { describe, expect, it } from "vite-plus/test";
import type { ChatMessage } from "@t3tools/contracts";
import {
  chatReferenceKey,
  conversationInitials,
  conversationGroups,
  conversationSubtitle,
  legacySlackNotice,
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

it("derives initials from name parts", () => {
  expect(conversationInitials("Maya Chen")).toBe("MC");
  expect(conversationInitials("  Leo   Martins ")).toBe("LM");
  expect(conversationInitials("Nina")).toBe("N");
  expect(conversationInitials("👩🏽‍💻 Chen")).toBe("👩🏽‍💻C");
  expect(conversationInitials("e\u0301 Martin")).toBe("E\u0301M");
  expect(conversationInitials("🇿🇦")).toBe("🇿🇦");
});
it("requires confirmed project provenance and preserves one endpoint across groups", () => {
  const endpoint = {
    ref: { type: "url" as const, url: "https://example.invalid/" },
    title: "SynKEK",
  };
  const rows = [
    { key: "same", title: "SynKEK", endpoint, kind: "channel" as const },
    { key: "dm", title: "Maya Chen", endpoint, kind: "dm" as const },
  ];
  expect(conversationGroups(rows, [], "discord").map((group) => group.label)).toEqual(["General"]);
  const groups = conversationGroups(
    rows,
    [
      { key: "p1", label: "One", conversationKeys: ["same"] },
      { key: "p2", label: "Two", conversationKeys: ["same"] },
    ],
    "slack",
  );
  expect(groups.map((group) => group.label)).toEqual(["One", "Two", "Direct messages"]);
  expect(groups[0]!.rows[0]!.endpoint).toBe(groups[1]!.rows[0]!.endpoint);
});
it("shows only complete fresh source membership including zero", () => {
  const fresh = { complete: true, value: 0, observedAt: "2026-10-13T08:30:00Z" };
  expect(conversationSubtitle("Slack", "Project", fresh, "2026-10-13T08:30:01Z")).toBe(
    "Project · Slack · 0 members",
  );
  expect(
    conversationSubtitle("Slack", undefined, { ...fresh, complete: false }, "2026-10-13T08:30:01Z"),
  ).toBe("Slack");
  expect(conversationSubtitle("Slack", undefined, fresh, "2026-10-14T08:30:00Z")).toBe("Slack");
  expect(conversationSubtitle("Slack", undefined, fresh, "2026-10-13T08:30:01Z", false)).toBe(
    "Slack",
  );
});
it("retains the spec-pinned legacy Slack warning before loaded-message availability", () => {
  expect(legacySlackNotice("slack", { messageId: "1" })).toBe(
    "This legacy Slack message has no known reply root. Exact reply reading is unsupported until you reopen the source.",
  );
  expect(legacySlackNotice("discord", { messageId: "1" })).toBeUndefined();
});

it.each([
  ["2026-10-13T08:30:00Z", "2026-10-13T08:35:00Z", 8, true, true, "Slack · 8 members"],
  ["2026-10-13T08:30:00Z", "2026-10-13T08:35:00.001Z", 8, true, true, "Slack"],
  ["2026-10-13T08:30:01Z", "2026-10-13T08:30:00Z", 8, true, true, "Slack"],
  ["2026-10-13T08:30:00Z", "2026-10-13T08:30:01Z", -1, true, true, "Slack"],
  ["2026-10-13T08:30:00Z", "2026-10-13T08:30:01Z", 1.5, true, true, "Slack"],
  ["bad", "2026-10-13T08:30:01Z", 8, true, true, "Slack"],
  ["2026-10-13T08:30:00Z", "bad", 8, true, true, "Slack"],
  ["2026-10-13T08:30:00Z", "2026-10-13T08:30:01Z", 8, true, false, "Slack"],
  ["2026-10-13T08:30:00Z", "2026-10-13T08:30:01Z", 8, false, true, "Slack"],
])(
  "bounds membership freshness at observed=%s now=%s value=%s complete=%s available=%s",
  (observedAt, now, value, complete, available, expected) => {
    expect(
      conversationSubtitle("Slack", undefined, { observedAt, value, complete }, now, available),
    ).toBe(expected);
  },
);

it("replaces equal-stamp edits without colliding across conversations or accounts", () => {
  const first = message("1760343120.000001", "2026-10-13T07:12:00Z", "old");
  const other = { ...first, conversationId: "second", text: "other" };
  const account = { ...first, accountId: "second", text: "account" };
  expect(
    mergeChatMessages([first, other, account], [{ ...first, text: "edited" }]).map(
      (row) => row.text,
    ),
  ).toEqual(["edited", "other", "account"]);
});
it.each([
  ["1760343120.000010", "1760343120.000002"],
  ["90071992547409930", "9007199254740992"],
])("orders equal-date native IDs %s and %s without number precision loss", (later, earlier) => {
  expect(
    mergeChatMessages(
      [message(later, "2026-10-13", "later")],
      [message(earlier, "2026-10-13", "earlier")],
    ).map((row) => row.text),
  ).toEqual(["earlier", "later"]);
});
