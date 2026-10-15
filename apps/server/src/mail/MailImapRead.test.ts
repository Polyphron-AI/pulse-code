// @effect-diagnostics preferSchemaOverJson:off -- Tests scan serialized results for sequence numbers.
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import MailComposer from "nodemailer/lib/mail-composer";

import type { StoredMailAccount } from "./MailConfigService.ts";
import type { MailLogin } from "./MailConnection.ts";
import { discoverSpecialUse, fetchMessage, readAttachment, search } from "./MailImapRead.ts";
import type { MailLookup } from "./MailNetworkPolicy.ts";
import {
  MAIL_TEST_CA,
  MailTestPeers,
  fakeImap,
  type FakeImapMailbox,
} from "./testing/MailTestPeers.ts";

const account: StoredMailAccount = {
  id: "acct_test",
  nickname: "Test",
  address: "me@mail.test",
  username: "me@mail.test",
  imap: { host: "mail.test", port: 993 },
  smtp: { host: "mail.test", port: 465 },
  auth: { kind: "password" },
  allowPrivateNetwork: true,
  appendToSent: true,
  folders: {},
  health: { status: "unknown" },
};
const login: MailLogin = { type: "password", password: "hunter2" };
const loopback: MailLookup = async () => [{ address: "127.0.0.1", family: 4 }];

const compose = (options: ConstructorParameters<typeof MailComposer>[0]) =>
  Effect.promise(() => new MailComposer(options).compile().build()).pipe(
    Effect.map((buffer) => buffer.toString("latin1")),
  );

const simple = (uid: number) =>
  [
    `From: Sender ${uid} <s${uid}@example.com>`,
    "To: me@mail.test",
    `Subject: Message ${uid}`,
    "Date: Thu, 01 Oct 2026 10:00:00 +0000",
    "",
    `Body ${uid}`,
    "",
  ].join("\r\n");

const inbox = (count: number): FakeImapMailbox => ({
  name: "INBOX",
  uidValidity: 7,
  uidNext: count + 1,
  messages: Array.from({ length: count }, (_, index) => ({
    uid: index + 1,
    flags: new Set(index % 2 === 0 ? ["\\Seen"] : []),
    raw: simple(index + 1),
  })),
});

const serve = (mailboxes: Array<FakeImapMailbox>, capabilities?: string) =>
  Effect.gen(function* () {
    const server = fakeImap(mailboxes, capabilities ? { capabilities } : {});
    const peer = yield* MailTestPeers.imap({ implicitTls: true, ...server });
    return { peer, options: { lookup: loopback, testPeer: { port: peer.port, ca: MAIL_TEST_CA } } };
  });

const kindOf = <A>(effect: Effect.Effect<A, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

describe("search", () => {
  it.effect("pages a 120-message mailbox newest first at 50 per page (A08)", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([inbox(120)]);
      const first = yield* search(account, login, { mailbox: "INBOX", limit: 50 }, options);
      expect(first.messages).toHaveLength(50);
      expect(first.messages[0]).toMatchObject({
        ref: { accountId: "acct_test", mailbox: "INBOX", uidValidity: 7, uid: 120 },
        subject: "Message 120",
        seen: false,
      });
      const second = yield* search(
        account,
        login,
        { mailbox: "INBOX", limit: 50, ...(first.nextCursor ? { cursor: first.nextCursor } : {}) },
        options,
      );
      expect(second.messages.map((message) => message.ref.uid)).toEqual(
        Array.from({ length: 50 }, (_, index) => 70 - index),
      );
      const third = yield* search(
        account,
        login,
        {
          mailbox: "INBOX",
          limit: 50,
          ...(second.nextCursor ? { cursor: second.nextCursor } : {}),
        },
        options,
      );
      expect(third.messages).toHaveLength(20);
      expect(third.nextCursor).toBeUndefined();
      // References carry UIDs only, never sequence numbers.
      expect(JSON.stringify([first, second, third])).not.toMatch(/"seq"/);
      for (const message of [...first.messages, ...second.messages, ...third.messages]) {
        expect(Object.keys(message.ref).sort()).toEqual([
          "accountId",
          "mailbox",
          "uid",
          "uidValidity",
        ]);
      }
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a page above the maximum before connecting", () =>
    Effect.gen(function* () {
      const { peer, options } = yield* serve([inbox(3)]);
      const kind = yield* kindOf(search(account, login, { mailbox: "INBOX", limit: 51 }, options));
      expect(kind).toBe("limit-exceeded");
      expect(peer.connections()).toBe(0);
    }).pipe(Effect.scoped),
  );
});

describe("fetchMessage", () => {
  it.effect("returns stale-reference when UIDVALIDITY changed (A09)", () =>
    Effect.gen(function* () {
      const mailbox = inbox(3);
      const { options } = yield* serve([mailbox]);
      const page = yield* search(account, login, { mailbox: "INBOX", limit: 2 }, options);
      const ref = page.messages[0]!.ref;
      mailbox.uidValidity = 8;
      expect(yield* kindOf(fetchMessage(account, login, ref, {}, options))).toBe("stale-reference");
      const cursor = page.nextCursor ?? "";
      expect(yield* kindOf(search(account, login, { mailbox: "INBOX", cursor }, options))).toBe(
        "stale-reference",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("pages a long body by byte offset and lists attachments without bytes", () =>
    Effect.gen(function* () {
      const longText = "é".repeat(20_000);
      const raw = yield* compose({
        from: "a@example.com",
        to: "me@mail.test",
        subject: "Long",
        text: longText,
        attachments: [
          { filename: "notes.txt", content: "plain notes", contentType: "text/plain" },
          {
            filename: "photo.bin",
            content: Buffer.from([0, 1, 2, 3]),
            contentType: "application/octet-stream",
          },
        ],
      });
      const { options } = yield* serve([
        {
          name: "INBOX",
          uidValidity: 3,
          uidNext: 2,
          messages: [{ uid: 1, flags: new Set(), raw }],
        },
      ]);
      const ref = { accountId: "acct_test", mailbox: "INBOX", uidValidity: 3, uid: 1 };
      const first = yield* fetchMessage(account, login, ref, {}, options);
      expect(first.subject).toBe("Long");
      expect(first.body.truncated).toBe(true);
      expect(Buffer.byteLength(first.body.text)).toBeLessThanOrEqual(32_000);
      const rest = yield* fetchMessage(
        account,
        login,
        ref,
        { offset: first.body.nextOffset ?? 0 },
        options,
      );
      expect(rest.body.truncated).toBe(false);
      expect(first.body.text + rest.body.text).toBe(longText);
      expect(first.attachments).toEqual([
        { partId: "1", name: "notes.txt", contentType: "text/plain", size: 11 },
        { partId: "2", name: "photo.bin", contentType: "application/octet-stream", size: 4 },
      ]);

      const text = yield* readAttachment(account, login, ref, "1", options);
      expect(text).toMatchObject({
        binary: false,
        content: { text: "plain notes", truncated: false },
      });
      const binary = yield* readAttachment(account, login, ref, "2", options);
      expect(binary).toEqual({
        partId: "2",
        name: "photo.bin",
        contentType: "application/octet-stream",
        size: 4,
        binary: true,
      });
      expect(yield* kindOf(readAttachment(account, login, ref, "3", options))).toBe("not-found");
    }).pipe(Effect.scoped),
  );
});

describe("discoverSpecialUse", () => {
  it.effect("finds special-use mailboxes and capabilities, with account overrides winning", () =>
    Effect.gen(function* () {
      const box = (name: string, specialUse?: string): FakeImapMailbox => ({
        name,
        ...(specialUse ? { specialUse } : {}),
        uidValidity: 1,
        uidNext: 1,
        messages: [],
      });
      const { options } = yield* serve(
        [
          box("INBOX"),
          box("Brouillons", "\\Drafts"),
          box("Sent Items", "\\Sent"),
          box("Bin", "\\Trash"),
        ],
        "MOVE CONDSTORE",
      );
      const found = yield* discoverSpecialUse(
        { ...account, folders: { archive: "Old" } },
        login,
        options,
      );
      expect(found).toEqual({
        drafts: "Brouillons",
        sent: "Sent Items",
        trash: "Bin",
        archive: "Old",
        capabilities: { move: true, gmailLabels: false, condstore: true },
      });
    }).pipe(Effect.scoped),
  );
});
