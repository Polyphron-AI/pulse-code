import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  normalizeLinkUrl,
  normalizeWorkspaceItemRef,
  WorkspaceItemRef,
  workspaceItemKey,
} from "./pulseLinks.ts";
import { MailMessageIdHeader, normalizeMessageId } from "./pulseMail.ts";

const decodeRef = Schema.decodeUnknownSync(WorkspaceItemRef);
const decodeMessageId = Schema.decodeUnknownSync(MailMessageIdHeader);
const location = { accountId: "acct_1", mailbox: "INBOX", uidValidity: 4, uid: 7 };

describe("normalizeMessageId", () => {
  it("wraps a bare id and keeps a wrapped one", () => {
    expect(normalizeMessageId("abc@example.com")).toBe("<abc@example.com>");
    expect(normalizeMessageId("  <abc@example.com>  ")).toBe("<abc@example.com>");
  });
  it("rejects ids that cannot be a stable key", () => {
    expect(normalizeMessageId("")).toBeUndefined();
    expect(normalizeMessageId("<>")).toBeUndefined();
    expect(normalizeMessageId("<a b@example.com>")).toBeUndefined();
    expect(normalizeMessageId("<a<b@example.com>")).toBeUndefined();
    expect(normalizeMessageId(`<${"x".repeat(997)}>`)).toBeUndefined();
  });
  it("only accepts normalised ids on the wire", () => {
    expect(() => decodeMessageId("<abc@example.com>")).not.toThrow();
    expect(() => decodeMessageId("abc@example.com")).toThrow();
  });
});

describe("normalizeLinkUrl", () => {
  it("drops the fragment and utm parameters but keeps the rest", () => {
    expect(normalizeLinkUrl(" https://a.test/p?utm_source=x&id=2&UTM_medium=y#top ")).toBe(
      "https://a.test/p?id=2",
    );
    expect(normalizeLinkUrl("https://a.test/p?utm_source=x")).toBe("https://a.test/p");
  });
  it("rejects anything but http and https", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeLinkUrl("file:///etc/passwd")).toBeUndefined();
    expect(normalizeLinkUrl("not a url")).toBeUndefined();
    expect(normalizeLinkUrl(`https://a.test/${"x".repeat(2050)}`)).toBeUndefined();
  });
});

describe("WorkspaceItemRef", () => {
  it("needs a Message-ID or a location for mail", () => {
    expect(() => decodeRef({ type: "mail", accountId: "acct_1" })).toThrow();
    expect(() => decodeRef({ type: "mail", accountId: "acct_1", location })).not.toThrow();
  });
  it("rejects a location from another account", () => {
    expect(() =>
      decodeRef({ type: "mail", accountId: "acct_2", messageId: "<a@b>", location }),
    ).toThrow();
  });
  it("rejects a non-web url", () => {
    expect(() => decodeRef({ type: "url", url: "javascript:alert(1)" })).toThrow();
  });
});

describe("workspaceItemKey", () => {
  it("keys mail by Message-ID wherever the message sits", () => {
    const inInbox = decodeRef({ type: "mail", accountId: "acct_1", messageId: "<a@b>", location });
    const inAllMail = decodeRef({
      type: "mail",
      accountId: "acct_1",
      messageId: "<a@b>",
      location: { ...location, mailbox: "[Gmail]/All Mail", uidValidity: 9, uid: 30 },
    });
    expect(workspaceItemKey(inInbox)).toBe(workspaceItemKey(inAllMail));
    expect(workspaceItemKey(inInbox)).toBe("mail:acct_1:%3Ca%40b%3E");
  });
  it("keys mail without a Message-ID by its location", () => {
    expect(workspaceItemKey(decodeRef({ type: "mail", accountId: "acct_1", location }))).toBe(
      "mail-location:acct_1:INBOX:4:7",
    );
  });
  it("escapes separators so two different items never share a key", () => {
    const a = decodeRef({ type: "provider-resource", provider: "x", resourceId: "a:b" });
    const b = decodeRef({ type: "provider-resource", provider: "x", resourceId: "a%3Ab" });
    expect(workspaceItemKey(a)).not.toBe(workspaceItemKey(b));
  });
  it("keys a url by its normalised form", () => {
    const ref = normalizeWorkspaceItemRef(decodeRef({ type: "url", url: "https://a.test/p#x" }));
    expect(ref).toEqual({ type: "url", url: "https://a.test/p" });
    expect(workspaceItemKey(ref!)).toBe(
      workspaceItemKey(decodeRef({ type: "url", url: "https://a.test/p?utm_campaign=z" })),
    );
  });
});
