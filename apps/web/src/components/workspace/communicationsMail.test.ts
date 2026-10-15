import { describe, expect, it } from "vite-plus/test";
import type { OfficeMessage } from "@t3tools/contracts";
import { mailConversations, mailMessageKey } from "./communicationsMail";

function message(overrides: Partial<OfficeMessage>): OfficeMessage {
  return {
    id: "42:7",
    accountId: "account-1",
    subject: "Status",
    from: "person@example.com",
    to: "owner@example.com",
    date: "2026-10-11T10:00:00Z",
    preview: "Update",
    unread: false,
    ...overrides,
  };
}

describe("real mail identity", () => {
  it("uses native conversation ids and retains loaded unread state", () => {
    const older = message({ id: "older", conversationId: "thread", unread: true });
    const newer = message({ id: "newer", conversationId: "thread", date: "2026-10-11T11:00:00Z" });
    expect(mailConversations([older, newer])).toEqual([{ message: newer, unread: true }]);
  });
  it("does not merge matching subjects or ids across accounts", () => {
    const rows = [message({}), message({ id: "42:8" }), message({ accountId: "account-2" })];
    expect(mailConversations(rows)).toHaveLength(3);
    expect(mailConversations(rows.map((row) => ({ ...row, conversationId: "same" })))).toHaveLength(
      2,
    );
  });
  it("round trips colon-containing IMAP ids without bookmark collisions", () => {
    const row = message({ accountId: "imap:account" });
    expect(JSON.parse(mailMessageKey(row))).toEqual(["imap:account", "42:7"]);
    expect(mailMessageKey(row)).not.toBe(
      mailMessageKey(message({ accountId: "imap", id: "account:42:7" })),
    );
  });
});
