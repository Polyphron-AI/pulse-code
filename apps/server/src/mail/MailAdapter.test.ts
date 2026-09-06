import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MailAccount, MailDraft } from "@t3tools/contracts";
import { ImapSmtpMailAdapter, mailMessageIdentity } from "./MailAdapter.ts";

const mocks = vi.hoisted(() => ({
  imapOptions: vi.fn(),
  smtpOptions: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  list: vi.fn(),
  search: vi.fn(),
  append: vi.fn(),
  move: vi.fn(),
  fetch: vi.fn(),
  flags: vi.fn(),
  lock: vi.fn(),
  send: vi.fn(),
}));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    mailbox = { uidValidity: 1n, uidNext: 4 };
    constructor(options: unknown) {
      mocks.imapOptions(options);
    }
    on() {}
    connect = mocks.connect;
    close = mocks.close;
    list = mocks.list;
    search = mocks.search;
    append = mocks.append;
    fetchOne = mocks.fetch;
    messageMove = mocks.move;
    messageFlagsAdd = mocks.flags;
    messageFlagsRemove = mocks.flags;
    getMailboxLock = mocks.lock;
  },
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: unknown) => {
      mocks.smtpOptions(options);
      return { sendMail: mocks.send, close: mocks.close, verify: async () => true };
    },
  },
}));

const server = { host: "mail.example.com", port: 993, security: "tls", username: "me" } as const;
const account: MailAccount = {
  id: "a",
  name: "Work",
  email: "me@example.com",
  imap: server,
  smtp: { ...server, port: 587, security: "starttls" },
  connected: true,
};
const credentials = { imapPassword: "imap-secret", smtpPassword: "smtp-secret" };
const ref = { accountId: "a", folder: "INBOX", uidValidity: "1", uid: 3 };
const draft: MailDraft = {
  id: "draft",
  revision: 1,
  updatedAt: "2026-09-06T00:00:00Z",
  content: {
    accountId: "a",
    to: ['"Doe, Jane" <jane@example.com>'],
    cc: [],
    bcc: ["hidden@example.com"],
    subject: "A review",
    text: "Ready for review",
    attachments: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue({ release() {} });
  mocks.list.mockResolvedValue([
    { path: "Sent", specialUse: "\\Sent" },
    { path: "Archive", specialUse: "\\Archive" },
  ]);
  mocks.search.mockResolvedValue([]);
  mocks.append.mockResolvedValue({ uid: 1 });
  mocks.send.mockResolvedValue({
    accepted: ["jane@example.com", "hidden@example.com"],
    rejected: [],
  });
  mocks.fetch.mockResolvedValue({ uid: 3 });
  mocks.move.mockResolvedValue({
    destination: "Archive",
    uidValidity: 2n,
    uidMap: new Map([[3, 8]]),
  });
});

describe("mail transport boundaries", () => {
  it("verifies an IMAP-only account without creating an SMTP transport", async () => {
    await new ImapSmtpMailAdapter().verify({ ...account, smtp: null }, credentials);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.smtpOptions).not.toHaveBeenCalled();
  });
  it("retains completed move mappings when a later folder cannot be opened", async () => {
    mocks.lock
      .mockResolvedValueOnce({ release() {} })
      .mockRejectedValueOnce(new Error("folder removed"));
    const missing = { ...ref, folder: "Missing" };
    const result = await new ImapSmtpMailAdapter().act(account, credentials, {
      refs: [ref, missing],
      action: "archive",
    });
    expect(result.completed).toEqual([ref]);
    expect(result.moved).toHaveLength(1);
    expect(result.failed[0]?.ref).toEqual(missing);
    expect(mocks.move).toHaveBeenCalledTimes(1);
  });
  it("sends one MIME message with private Bcc in the envelope and files that accepted message", async () => {
    await new ImapSmtpMailAdapter().send(account, credentials, draft, "<fixed@example.com>");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const sent = mocks.send.mock.calls[0]![0] as { envelope: { to: string[] }; raw: Buffer };
    expect(sent.envelope.to).toContain("hidden@example.com");
    expect(sent.raw.toString()).not.toMatch(/^Bcc:/im);
    expect(sent.raw.toString()).toContain("Message-ID: <fixed@example.com>");
    expect(mocks.append.mock.calls[0]?.[1]).toEqual(sent.raw);
    expect(mocks.smtpOptions.mock.calls[0]?.[0]).toMatchObject({
      requireTLS: true,
      disableUrlAccess: true,
      disableFileAccess: true,
      logger: false,
    });
  });
  it("reports an accepted send when Sent filing fails without resubmitting", async () => {
    mocks.append.mockRejectedValue(new Error("network lost while filing"));
    const result = await new ImapSmtpMailAdapter().send(
      account,
      credentials,
      draft,
      "<fixed@example.com>",
    );
    expect(result.accepted).toHaveLength(2);
    expect(result.detail).toContain("Do not resend");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not append another copy when the provider already filed the Message-ID", async () => {
    mocks.search.mockResolvedValue([44]);
    await new ImapSmtpMailAdapter().send(account, credentials, draft, "<fixed@example.com>");
    expect(mocks.append).not.toHaveBeenCalled();
  });
  it("returns verified destination identity for move undo and metadata preservation", async () => {
    const result = await new ImapSmtpMailAdapter().act(account, credentials, {
      refs: [ref],
      action: "archive",
    });
    expect(result.moved).toEqual([
      { from: ref, to: { ...ref, folder: "Archive", uidValidity: "2", uid: 8 } },
    ]);
    mocks.move.mockResolvedValue({ destination: "Archive" });
    expect(
      (
        await new ImapSmtpMailAdapter().act(account, credentials, {
          refs: [ref],
          action: "archive",
        })
      ).moved,
    ).toEqual([]);
  });
  it("rejects stale UID validity without moving or flagging another message", async () => {
    const result = await new ImapSmtpMailAdapter().act(account, credentials, {
      refs: [{ ...ref, uidValidity: "old" }],
      action: "trash",
    });
    expect(result.failed).toHaveLength(1);
    expect(mocks.move).not.toHaveBeenCalled();
    expect(mocks.flags).not.toHaveBeenCalled();
  });
  it("does not merge mail solely because another message reuses its headers", () => {
    expect(mailMessageIdentity({ ref })).not.toBe(mailMessageIdentity({ ref: { ...ref, uid: 4 } }));
    expect(mailMessageIdentity({ ref })).not.toBe(
      mailMessageIdentity({ ref: { ...ref, accountId: "other" } }),
    );
  });
});
