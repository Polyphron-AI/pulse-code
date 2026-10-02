import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { MailAccount, MailAccountInput, MailMessageRef } from "./pulseMail.ts";

const account = {
  id: "acct_1",
  nickname: "Work",
  address: "me@example.com",
  username: "me@example.com",
  imap: { host: "imap.example.com", port: 993 },
  smtp: { host: "smtp.example.com", port: 587 },
  auth: { kind: "password" },
  allowPrivateNetwork: false,
  appendToSent: true,
  folders: {},
  credentialConfigured: true,
  health: { status: "ok" },
};

describe("Pulse mail contracts", () => {
  it("drops secret fields from public accounts", () => {
    const decoded = Schema.decodeUnknownSync(MailAccount)({
      ...account,
      password: "hunter2",
      auth: {
        kind: "oauth-google",
        clientId: "cid",
        clientSecretConfigured: true,
        clientSecret: "s",
      },
    });
    const encoded = JSON.stringify(Schema.encodeSync(MailAccount)(decoded));
    expect(encoded).not.toContain("hunter2");
    expect(encoded).not.toContain('"s"');
    expect(encoded).toContain('"clientSecretConfigured":true');
  });

  it("rejects mail ports outside the allowed set", () => {
    const input = {
      nickname: "Work",
      address: "me@example.com",
      imap: { host: "imap.example.com", port: 993 },
      smtp: { host: "smtp.example.com", port: 587 },
      auth: { kind: "password" },
    };
    expect(() => Schema.decodeUnknownSync(MailAccountInput)(input)).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(MailAccountInput)({ ...input, smtp: { host: "x", port: 25 } }),
    ).toThrow();
  });

  it("requires UIDVALIDITY and UID in message references", () => {
    expect(() =>
      Schema.decodeUnknownSync(MailMessageRef)({ accountId: "acct_1", mailbox: "INBOX", uid: 3 }),
    ).toThrow();
  });
});
