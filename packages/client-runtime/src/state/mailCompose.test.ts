import { describe, expect, it } from "vite-plus/test";
import type { MailAccount, MailMessageDetail } from "@t3tools/contracts";
import { buildMailReply, parseMailRecipients } from "./mailCompose.ts";

const server = { host: "mail.example.com", port: 993, security: "tls", username: "me" } as const;
const account: MailAccount = {
  id: "a",
  name: "Work",
  email: "me@example.com",
  imap: server,
  smtp: server,
  connected: true,
};
const detail: MailMessageDetail = {
  message: {
    id: "m",
    ref: { accountId: "a", folder: "INBOX", uidValidity: "1", uid: 1 },
    messageId: "<m@example.com>",
    subject: "Question",
    from: "Sender <sender@example.com>",
    to: ["Me <ME@example.com>", "Colleague <colleague@example.com>"],
    cc: ["sender@example.com", "colleague@example.com", "other@example.com"],
    date: null,
    flags: [],
    size: 1,
    metadata: { revision: 0, tags: [], links: [], suppressedLinks: [] },
  },
  text: "Please review.\nThanks",
  html: null,
  replyTo: ["help@example.com"],
  attachments: [],
};

describe("mail composition", () => {
  it("keeps a quoted display-name comma and removes duplicate recipients", () => {
    expect(
      parseMailRecipients('"Doe, Jane" <jane@example.com>; JANE@example.com, other@example.com'),
    ).toEqual(['"Doe, Jane" <jane@example.com>', "other@example.com"]);
  });
  it("rejects unfinished or header-injected addresses instead of dropping recipients", () => {
    expect(() => parseMailRecipients('"Jane <jane@example.com>')).toThrow();
    expect(() => parseMailRecipients("Jane <jane@example.com>\rBcc: bad@example.com")).toThrow();
  });
  it("honors Reply-To, excludes self, and deduplicates reply-all To and Cc", () => {
    const reply = buildMailReply(detail, account, "replyAll");
    expect(reply.to).toEqual(["help@example.com", "Colleague <colleague@example.com>"]);
    expect(reply.cc).toEqual(["sender@example.com", "other@example.com"]);
    expect(reply.bcc).toEqual([]);
    expect(reply.inReplyTo).toBe("<m@example.com>");
  });
  it("replies to the original recipients when opening one's own sent message", () => {
    const sent = {
      ...detail,
      replyTo: [],
      message: { ...detail.message, from: account.email, to: ["client@example.com"] },
    };
    expect(buildMailReply(sent, account, "reply").to).toEqual(["client@example.com"]);
  });
  it("forwards without recipients or falsely claiming attachments have been loaded", () => {
    const forward = buildMailReply(detail, account, "forward");
    expect(forward.to).toEqual([]);
    expect(forward.attachments).toEqual([]);
    expect(forward.inReplyTo).toBeUndefined();
    expect(forward.subject).toBe("Fwd: Question");
  });
});
