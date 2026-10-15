import { describe, expect, it } from "vite-plus/test";

import {
  canonicalMailRef,
  mailFolderLabel,
  mailItemRef,
  mailItemTitle,
  mailLinkMayBreak,
  mailMessagesInput,
  mailReadInput,
} from "./mailItemRef";

const location = { accountId: "acct_1", mailbox: "INBOX", uidValidity: 4, uid: 7 };
const shuffled = { uid: 7, mailbox: "INBOX", uidValidity: 4, accountId: "acct_1" };

describe("canonicalMailRef", () => {
  it("serializes the same message the same way whatever order it arrived in", () => {
    const a = canonicalMailRef({ accountId: "acct_1", messageId: "<a@b>", location });
    const b = canonicalMailRef({ location: shuffled, messageId: "<a@b>", accountId: "acct_1" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("omits what it was not given", () => {
    expect(canonicalMailRef({ accountId: "acct_1", messageId: "<a@b>" })).toEqual({
      type: "mail",
      accountId: "acct_1",
      messageId: "<a@b>",
    });
    expect(Object.keys(canonicalMailRef({ accountId: "acct_1", location }))).toEqual([
      "type",
      "accountId",
      "location",
    ]);
  });
});

describe("mailItemRef", () => {
  it("links by Message-ID and keeps the location as a hint", () => {
    const item = mailItemRef({ ref: location, messageId: "<a@b>" });
    expect(item).toEqual({ type: "mail", accountId: "acct_1", messageId: "<a@b>", location });
    expect(mailLinkMayBreak(item)).toBe(false);
  });

  it("marks a message with no Message-ID as one whose link may break", () => {
    const item = mailItemRef({ ref: location });
    expect(item).toEqual({ type: "mail", accountId: "acct_1", location });
    expect(mailLinkMayBreak(item)).toBe(true);
  });
});

describe("labels", () => {
  it("never shows an empty title", () => {
    expect(mailItemTitle("  Q3 brief ")).toBe("Q3 brief");
    expect(mailItemTitle("   ")).toBe("Message with no subject");
    expect(mailItemTitle(undefined)).toBe("Message with no subject");
  });

  it("names the inbox in plain words", () => {
    expect(mailFolderLabel("INBOX")).toBe("Inbox");
    expect(mailFolderLabel("inbox")).toBe("Inbox");
    expect(mailFolderLabel("[Gmail]/All Mail")).toBe("[Gmail]/All Mail");
  });
});

describe("query inputs", () => {
  it("builds read input in a fixed order", () => {
    const item = canonicalMailRef({ location: shuffled, messageId: "<a@b>", accountId: "acct_1" });
    expect(JSON.stringify(mailReadInput(item, 65_536))).toBe(
      JSON.stringify({ accountId: "acct_1", messageId: "<a@b>", location, offset: 65_536 }),
    );
    expect(mailReadInput(item)).not.toHaveProperty("offset");
  });

  it("drops a blank search and keeps a fixed order", () => {
    expect(mailMessagesInput({ accountId: "acct_1", mailbox: "INBOX", query: "   " })).toEqual({
      accountId: "acct_1",
      mailbox: "INBOX",
    });
    expect(
      JSON.stringify(
        mailMessagesInput({
          cursor: "c1",
          query: " brief ",
          mailbox: "INBOX",
          accountId: "acct_1",
        }),
      ),
    ).toBe(JSON.stringify({ accountId: "acct_1", mailbox: "INBOX", query: "brief", cursor: "c1" }));
  });
});
