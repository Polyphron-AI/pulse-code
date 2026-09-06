import { describe, expect, it } from "vite-plus/test";
import { mailFolderKind, mailListDate, mailSenderName, parseMailSearch } from "./mailNavigation";

describe("mail navigation", () => {
  it("retains an exact environment, account and draft without accepting arbitrary tab values", () => {
    expect(
      parseMailSearch({ environment: "remote", account: "work", draft: "draft-2", tab: "drafts" }),
    ).toEqual({ environment: "remote", account: "work", draft: "draft-2", tab: "drafts" });
    expect(
      parseMailSearch({ account: [], environment: "x".repeat(513), draft: "", tab: "send" }),
    ).toEqual({ environment: undefined, account: undefined, draft: undefined, tab: undefined });
  });
  it("uses provider folder roles even when Sent has a localized name", () => {
    expect(mailFolderKind("Envoyés", "\\Sent")).toBe("sent");
    expect(mailFolderKind("Projects/Sent invoices", null)).toBe("folder");
    expect(mailFolderKind("INBOX", null)).toBe("inbox");
  });
  it("shows a sender name without manufacturing an identity", () => {
    expect(mailSenderName('"Quintin" <quintin@example.com>')).toBe("Quintin");
    expect(mailSenderName("shared@example.com")).toBe("shared@example.com");
    expect(mailSenderName("")).toBe("Unknown sender");
  });
  it("keeps invalid dates explicit", () => {
    expect(mailListDate(null)).toBe("Unknown date");
    expect(mailListDate("invalid")).toBe("Unknown date");
  });
});
