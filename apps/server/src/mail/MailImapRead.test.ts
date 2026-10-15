// @effect-diagnostics preferSchemaOverJson:off -- Tests scan serialized results for sequence numbers.
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import MailComposer from "nodemailer/lib/mail-composer";

import type { StoredMailAccount } from "./MailConfigService.ts";
import type { MailLogin } from "./MailConnection.ts";
import {
  discoverSpecialUse,
  fetchByReference,
  fetchMessage,
  readAttachment,
  scanOrder,
  SCAN_MAX,
  search,
} from "./MailImapRead.ts";
import { saveDraft } from "./MailImapWrite.ts";
import type { MailLookup } from "./MailNetworkPolicy.ts";
import {
  MAIL_TEST_CA,
  MailTestPeers,
  fakeImap,
  imapTag,
  type MailPeerScript,
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

const serve = (
  mailboxes: Array<FakeImapMailbox>,
  capabilities?: string,
  wrap?: (respond: MailPeerScript["respond"]) => MailPeerScript["respond"],
) =>
  Effect.gen(function* () {
    const server = fakeImap(mailboxes, capabilities ? { capabilities } : {});
    const peer = yield* MailTestPeers.imap({
      implicitTls: true,
      ...server,
      respond: wrap ? wrap(server.respond) : server.respond,
    });
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

const withId = (messageId: string, subject: string) =>
  [
    "From: Ana <ana@example.com>",
    "To: me@mail.test",
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    "Date: Thu, 01 Oct 2026 10:00:00 +0000",
    "",
    `Body of ${subject}`,
    "",
  ].join("\r\n");

const folder = (
  name: string,
  uidValidity: number,
  messages: Array<{ readonly uid: number; readonly raw: string }>,
  specialUse?: string,
): FakeImapMailbox => ({
  name,
  uidValidity,
  uidNext: Math.max(0, ...messages.map((message) => message.uid)) + 1,
  messages: messages.map((message) => ({ ...message, flags: new Set<string>() })),
  ...(specialUse ? { specialUse } : {}),
});

const linkedAt = { accountId: "acct_test", mailbox: "INBOX", uidValidity: 7, uid: 3 };

describe("fetchByReference", () => {
  it.effect(
    "finds a Gmail-archived message in All Mail, never the message now at its old UID",
    () =>
      Effect.gen(function* () {
        const { options } = yield* serve([
          folder("INBOX", 7, [{ uid: 3, raw: withId("<other@example.com>", "Someone else") }]),
          folder(
            "[Gmail]/All Mail",
            9,
            [
              { uid: 12, raw: withId("<other@example.com>", "Someone else") },
              { uid: 30, raw: withId("<brief@example.com>", "Q3 brief") },
            ],
            "\\All",
          ),
        ]);
        const found = yield* fetchByReference(
          account,
          login,
          { messageId: "<brief@example.com>", location: linkedAt },
          options,
        );
        expect(found.ref).toEqual({
          accountId: "acct_test",
          mailbox: "[Gmail]/All Mail",
          uidValidity: 9,
          uid: 30,
        });
        expect(found.subject).toBe("Q3 brief");
        expect(found.messageId).toBe("<brief@example.com>");
      }).pipe(Effect.scoped),
  );

  it.effect("reads the stored location when the message has not moved", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([
        folder("INBOX", 7, [{ uid: 3, raw: withId("<brief@example.com>", "Q3 brief") }]),
      ]);
      const found = yield* fetchByReference(
        account,
        login,
        { messageId: "<brief@example.com>", location: linkedAt },
        options,
      );
      expect(found.ref).toEqual(linkedAt);
    }).pipe(Effect.scoped),
  );

  it.effect("fails not-found when the message is gone from every folder", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([
        folder("INBOX", 7, []),
        folder(
          "Archive",
          3,
          [{ uid: 1, raw: withId("<other@example.com>", "Someone else") }],
          "\\Archive",
        ),
      ]);
      const error = yield* fetchByReference(
        account,
        login,
        { messageId: "<brief@example.com>", location: linkedAt },
        options,
      ).pipe(Effect.flip);
      expect(error.kind).toBe("not-found");
      expect(error.message).toBe(
        "This message was not found in any folder. It may have been deleted.",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("says a link without a Message-ID broke when its folder is gone", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([folder("INBOX", 7, [])]);
      const error = yield* fetchByReference(
        account,
        login,
        { location: { ...linkedAt, mailbox: "Projects/Old" } },
        options,
      ).pipe(Effect.flip);
      expect(error.kind).toBe("not-found");
      expect(error.message).toBe(
        "This message moved or was deleted. It was linked without a Message-ID, so it cannot be found again.",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("says a link without a Message-ID broke when its UID is empty", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([folder("INBOX", 7, [])]);
      const error = yield* fetchByReference(account, login, { location: linkedAt }, options).pipe(
        Effect.flip,
      );
      expect(error.kind).toBe("not-found");
      expect(error.message).toContain("linked without a Message-ID");
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a reference with neither a Message-ID nor a location", () =>
    Effect.gen(function* () {
      expect(yield* kindOf(fetchByReference(account, login, {}, { lookup: loopback }))).toBe(
        "invalid-input",
      );
    }).pipe(Effect.scoped),
  );
});

describe("scanOrder", () => {
  it("tries the hint, then All Mail, Archive, Inbox, Sent and Junk, and skips unselectable folders", () => {
    expect(
      scanOrder(
        [
          { path: "Work" },
          { path: "[Gmail]", flags: new Set(["\\Noselect", "\\HasChildren"]) },
          { path: "[Gmail]/Spam", specialUse: "\\Junk" },
          { path: "INBOX" },
          { path: "[Gmail]/Sent Mail", specialUse: "\\Sent" },
          { path: "Projects" },
          { path: "Old", specialUse: "\\Archive" },
          { path: "[Gmail]/All Mail", specialUse: "\\All" },
          { path: "Gone", flags: new Set(["\\NonExistent"]) },
        ],
        "Projects",
      ),
    ).toEqual([
      "Projects",
      "[Gmail]/All Mail",
      "Old",
      "INBOX",
      "[Gmail]/Sent Mail",
      "[Gmail]/Spam",
      "Work",
    ]);
  });

  it("searches at most SCAN_MAX folders", () => {
    const many = Array.from({ length: SCAN_MAX + 10 }, (_, index) => ({ path: `F${index}` }));
    expect(scanOrder(many, undefined)).toHaveLength(SCAN_MAX);
  });
});

describe("search Message-IDs", () => {
  it.effect("carries each message's Message-ID so the list can link it", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([
        folder("INBOX", 7, [{ uid: 1, raw: withId("<brief@example.com>", "Q3 brief") }]),
      ]);
      const page = yield* search(account, login, { mailbox: "INBOX" }, options);
      expect(page.messages[0]?.messageId).toBe("<brief@example.com>");
    }).pipe(Effect.scoped),
  );
});

describe("fetchByReference completeness", () => {
  it.effect.each([
    { newestUnreadable: true, earlierExact: true, kind: "ok" },
    { newestUnreadable: false, earlierExact: false, kind: "not-found" },
    { newestUnreadable: true, earlierExact: false, kind: "unavailable" },
  ])(
    "returns $kind with newestUnreadable=$newestUnreadable and earlierExact=$earlierExact in one folder",
    ({ newestUnreadable, earlierExact, kind }) =>
      Effect.gen(function* () {
        const { peer, options } = yield* serve(
          [
            folder("INBOX", 7, [
              {
                uid: 3,
                raw: withId(
                  earlierExact ? "<brief@example.com>" : "<BRIEF@example.com>",
                  "Earlier",
                ),
              },
              { uid: 30, raw: withId("<BRIEF@example.com>", "Newest") },
            ]),
          ],
          undefined,
          (respond) => (command, io) => {
            const { tag, command: line } = imapTag(command.line);
            if (/^UID SEARCH /i.test(line)) {
              respond(command, {
                ...io,
                send: (text) => io.send(text.replace(/\* SEARCH[^\r]*\r\n/, "* SEARCH 3 30\r\n")),
              });
            } else if (newestUnreadable && /^UID FETCH 30 /i.test(line)) {
              io.send(`${tag} NO message temporarily unreadable\r\n`);
            } else respond(command, io);
          },
        );
        const result = fetchByReference(
          account,
          login,
          { messageId: "<brief@example.com>" },
          options,
        );
        if (kind === "ok") {
          const found = yield* result;
          expect(found.ref).toEqual(linkedAt);
          expect(found.messageId).toBe("<brief@example.com>");
        } else expect(yield* kindOf(result)).toBe(kind);
        expect(
          peer.received.flatMap(({ line }) => / UID FETCH (\d+) /i.exec(line)?.[1] ?? []),
        ).toEqual(["30", "3"]);
        expect(peer.connections()).toBe(1);
      }).pipe(Effect.scoped),
  );

  it.effect.each([
    { counts: [50], exact: false, cached: false, kind: "not-found" },
    { counts: [51], exact: false, cached: false, kind: "unavailable" },
    { counts: [25, 25], exact: false, cached: false, kind: "not-found" },
    { counts: [25, 26], exact: true, cached: false, kind: "unavailable" },
    { counts: [25, 25], exact: true, cached: true, kind: "ok" },
  ])(
    "bounds candidate reads across $counts with exact=$exact, cached=$cached and result=$kind",
    ({ counts, exact, cached, kind }) =>
      Effect.gen(function* () {
        let searches = 0;
        const { peer, options } = yield* serve(
          counts.map((count, index) =>
            folder(
              `F${index}`,
              7,
              Array.from({ length: count }, (_, uidIndex) => ({
                uid: uidIndex + 1,
                raw: withId(
                  exact && index === counts.length - 1 && uidIndex === 0
                    ? "<brief@example.com>"
                    : "<BRIEF@example.com>",
                  "Candidate",
                ),
              })),
            ),
          ),
          undefined,
          (respond) => (command, io) => {
            const { command: line } = imapTag(command.line);
            if (/^UID SEARCH /i.test(line)) {
              const uids = Array.from({ length: counts[searches++]! }, (_, i) => i + 1);
              respond(command, {
                ...io,
                send: (text) =>
                  io.send(text.replace(/\* SEARCH[^\r]*\r\n/, `* SEARCH ${uids.join(" ")}\r\n`)),
              });
            } else respond(command, io);
          },
        );
        const result = fetchByReference(
          account,
          login,
          {
            messageId: "<brief@example.com>",
            ...(cached ? { location: { ...linkedAt, mailbox: "F0", uid: counts[0]! } } : {}),
          },
          options,
        );
        if (kind === "ok") {
          const found = yield* result;
          expect(found.ref).toEqual({ ...linkedAt, mailbox: "F1", uid: 1 });
          expect(found.messageId).toBe("<brief@example.com>");
        } else expect(yield* kindOf(result)).toBe(kind);
        expect(peer.received.filter(({ line }) => / UID FETCH /i.test(line))).toHaveLength(
          50 + Number(cached),
        );
        expect(peer.connections()).toBe(1);
      }).pipe(Effect.scoped),
  );

  it.effect("finds an earlier exact ID after rejecting a newer case-insensitive search hit", () =>
    Effect.gen(function* () {
      const { peer, options } = yield* serve(
        [
          folder("INBOX", 7, [
            { uid: 3, raw: withId("<brief@example.com>", "Q3 brief") },
            { uid: 30, raw: withId("<BRIEF@example.com>", "Different ID") },
          ]),
        ],
        undefined,
        (respond) => (command, io) => {
          const { command: line } = imapTag(command.line);
          if (/^UID SEARCH /i.test(line)) {
            respond(command, {
              ...io,
              send: (text) => io.send(text.replace(/\* SEARCH[^\r]*\r\n/, "* SEARCH 3 30\r\n")),
            });
          } else respond(command, io);
        },
      );
      const found = yield* fetchByReference(
        account,
        login,
        { messageId: "<brief@example.com>" },
        options,
      );
      expect(found.ref).toEqual(linkedAt);
      expect(found.messageId).toBe("<brief@example.com>");
      expect(found.subject).toBe("Q3 brief");
      expect(
        peer.received.flatMap(({ line }) => / UID FETCH (\d+) /i.exec(line)?.[1] ?? []),
      ).toEqual(["30", "3"]);
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect.each([
    { count: 50, kind: "not-found" },
    { count: 51, kind: "unavailable" },
  ])("reports $kind after scanning $count selectable folders", ({ count, kind }) =>
    Effect.gen(function* () {
      const { peer, options } = yield* serve(
        Array.from({ length: count }, (_, index) => folder(`F${index}`, 1, [])),
      );
      expect(
        yield* kindOf(
          fetchByReference(account, login, { messageId: "<brief@example.com>" }, options),
        ),
      ).toBe(kind);
      expect(peer.received.filter(({ line }) => / UID SEARCH /i.test(line))).toHaveLength(50);
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect.each([
    { laterMatch: false, result: "makes the scan unavailable" },
    { laterMatch: true, result: "does not hide a later match" },
  ])("a refused folder search $result", ({ laterMatch }) =>
    Effect.gen(function* () {
      let searches = 0;
      const { peer, options } = yield* serve(
        [
          folder("INBOX", 7, []),
          folder(
            "Work",
            9,
            laterMatch ? [{ uid: 30, raw: withId("<brief@example.com>", "Q3 brief") }] : [],
          ),
        ],
        undefined,
        (respond) => (command, io) => {
          const { tag, command: line } = imapTag(command.line);
          if (/^UID SEARCH /i.test(line) && searches++ === 0) {
            io.send(`${tag} NO search refused\r\n`);
          } else respond(command, io);
        },
      );
      const result = fetchByReference(
        account,
        login,
        { messageId: "<brief@example.com>" },
        options,
      );
      if (laterMatch) expect((yield* result).ref.mailbox).toBe("Work");
      else expect(yield* kindOf(result)).toBe("unavailable");
      expect(searches).toBe(2);
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect.each([
    { laterMatch: false, result: "makes the scan unavailable" },
    { laterMatch: true, result: "does not hide a later match" },
  ])("an unreadable search candidate $result", ({ laterMatch }) =>
    Effect.gen(function* () {
      let reads = 0;
      const { peer, options } = yield* serve(
        [
          folder("INBOX", 7, [{ uid: 3, raw: withId("<brief@example.com>", "Q3 brief") }]),
          folder(
            "Work",
            9,
            laterMatch ? [{ uid: 30, raw: withId("<brief@example.com>", "Q3 brief") }] : [],
          ),
        ],
        undefined,
        (respond) => (command, io) => {
          const { tag, command: line } = imapTag(command.line);
          if (/^UID FETCH /i.test(line) && reads++ === 0) {
            io.send(`${tag} NO message temporarily unreadable\r\n`);
          } else respond(command, io);
        },
      );
      const result = fetchByReference(
        account,
        login,
        { messageId: "<brief@example.com>" },
        options,
      );
      if (laterMatch) expect((yield* result).ref.mailbox).toBe("Work");
      else expect(yield* kindOf(result)).toBe("unavailable");
      expect(reads).toBe(laterMatch ? 2 : 1);
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect("verifies the normalized ID after a header search returns a different message", () =>
    Effect.gen(function* () {
      const { peer, options } = yield* serve(
        [
          folder("INBOX", 7, [{ uid: 3, raw: withId("<other@example.com>", "Someone else") }]),
          folder("Work", 9, [{ uid: 30, raw: withId("<brief@example.com>", "Q3 brief") }]),
        ],
        undefined,
        (respond) => (command, io) => {
          const { command: line } = imapTag(command.line);
          if (/^UID SEARCH /i.test(line)) {
            respond(command, {
              ...io,
              send: (text) => io.send(text.replace("* SEARCH \r\n", "* SEARCH 3\r\n")),
            });
          } else respond(command, io);
        },
      );
      const found = yield* fetchByReference(
        account,
        login,
        { messageId: "<brief@example.com>", location: linkedAt },
        options,
      );
      expect(found.ref.mailbox).toBe("Work");
      expect(found.messageId).toBe("<brief@example.com>");
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect("finds the message after its stored UIDVALIDITY changes", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([
        folder("INBOX", 8, [{ uid: 3, raw: withId("<other@example.com>", "Someone else") }]),
        folder("Work", 9, [{ uid: 30, raw: withId("<brief@example.com>", "Q3 brief") }]),
      ]);
      const found = yield* fetchByReference(
        account,
        login,
        { messageId: "<brief@example.com>", location: linkedAt },
        options,
      );
      expect(found.ref.mailbox).toBe("Work");
    }).pipe(Effect.scoped),
  );

  it.effect("retains the no-Message-ID limitation after UIDVALIDITY changes", () =>
    Effect.gen(function* () {
      const { options } = yield* serve([
        folder("INBOX", 8, [{ uid: 3, raw: withId("<other@example.com>", "Someone else") }]),
      ]);
      const error = yield* fetchByReference(account, login, { location: linkedAt }, options).pipe(
        Effect.flip,
      );
      expect(error.kind).toBe("not-found");
      expect(error.message).toContain("linked without a Message-ID");
    }).pipe(Effect.scoped),
  );

  it.effect("retains connection failures for location-only reads", () =>
    Effect.gen(function* () {
      const { options } = yield* serve(
        [folder("INBOX", 7, [])],
        undefined,
        (respond) => (command, io) => {
          if (/ EXAMINE /i.test(command.line)) io.close();
          else respond(command, io);
        },
      );
      const error = yield* fetchByReference(account, login, { location: linkedAt }, options).pipe(
        Effect.flip,
      );
      expect(error.kind).toBe("unavailable");
      expect(error.message).toBe("Could not reach the mail server.");
    }).pipe(Effect.scoped),
  );
});

describe("shared Message-ID lookup", () => {
  it.effect("preserves the draft outcome when a fallback search is refused", () =>
    Effect.gen(function* () {
      let searches = 0;
      const { peer, options } = yield* serve(
        [folder("Drafts", 7, [], "\\Drafts")],
        undefined,
        (respond) => (command, io) => {
          const { tag, command: line } = imapTag(command.line);
          if (/^UID SEARCH /i.test(line) && searches++ === 0) {
            io.send(`${tag} NO search refused\r\n`);
          } else if (/^APPEND /i.test(line)) {
            respond(command, {
              ...io,
              send: (text) => io.send(text.replace(/\[APPENDUID \d+ \d+\] /, "")),
            });
          } else respond(command, io);
        },
      );
      expect(
        yield* kindOf(
          saveDraft(
            account,
            login,
            {
              mime: new TextEncoder().encode(withId("<brief@example.com>", "Q3 brief")),
              messageId: "<brief@example.com>",
            },
            options,
          ),
        ),
      ).toBe("outcome-unknown");
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );
});
