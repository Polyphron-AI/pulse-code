import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { StoredMailAccount } from "./MailConfigService.ts";
import type { MailLogin } from "./MailConnection.ts";
import { appendSent, archive, move, saveDraft, setFlags, setLabels } from "./MailImapWrite.ts";
import type { MailLookup } from "./MailNetworkPolicy.ts";
import {
  MAIL_TEST_CA,
  MailTestPeers,
  fakeImap,
  labelsOf,
  type FakeImapMailbox,
  type MailPeer,
  type MailPeerScript,
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

const raw = (messageId: string) =>
  [`Message-ID: ${messageId}`, "From: me@mail.test", "Subject: Draft", "", "Hello", ""].join(
    "\r\n",
  );

const box = (name: string, specialUse?: string, uids: Array<number> = []): FakeImapMailbox => ({
  name,
  ...(specialUse ? { specialUse } : {}),
  uidValidity: 5,
  uidNext: Math.max(0, ...uids) + 1,
  messages: uids.map((uid) => ({ uid, flags: new Set<string>(), raw: raw(`<m${uid}@mail.test>`) })),
});

const standard = () => [
  box("INBOX", undefined, [1, 2]),
  box("Drafts", "\\Drafts"),
  box("Sent", "\\Sent"),
  box("Archive", "\\Archive"),
  box("Bin", "\\Trash"),
];

// Every peer started here, so the final test can check that none was ever asked to delete.
const peers: Array<MailPeer> = [];

const serve = (
  mailboxes: Array<FakeImapMailbox>,
  capabilities = "MOVE UIDPLUS",
  wrap?: (respond: MailPeerScript["respond"]) => MailPeerScript["respond"],
) =>
  Effect.gen(function* () {
    const server = fakeImap(mailboxes, { capabilities });
    const respond = wrap ? wrap(server.respond) : server.respond;
    const peer = yield* MailTestPeers.imap({
      implicitTls: true,
      greeting: server.greeting,
      respond,
    });
    peers.push(peer);
    return { peer, options: { lookup: loopback, testPeer: { port: peer.port, ca: MAIL_TEST_CA } } };
  });

const kindOf = <A>(effect: Effect.Effect<A, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

const writes = (peer: MailPeer) =>
  peer.received.filter((command) => /\b(APPEND|STORE|MOVE|COPY)\b/i.test(command.line));

const inbox = (uid: number) => ({ accountId: "acct_test", mailbox: "INBOX", uidValidity: 5, uid });
const mime = (messageId: string) => new TextEncoder().encode(raw(messageId));

describe("saveDraft", () => {
  it.effect("appends to Drafts with \\Draft \\Seen and no SMTP traffic (A06)", () =>
    Effect.gen(function* () {
      const mailboxes = standard();
      const { options } = yield* serve(mailboxes);
      const smtp = yield* MailTestPeers.smtp({
        implicitTls: true,
        greeting: "220 ready\r\n",
        respond: () => undefined,
      });
      const first = yield* saveDraft(
        account,
        login,
        { mime: mime("<d1@pulse>"), messageId: "<d1@pulse>" },
        options,
      );
      expect(first).toEqual({
        ref: { accountId: "acct_test", mailbox: "Drafts", uidValidity: 5, uid: 1 },
      });
      const second = yield* saveDraft(
        account,
        login,
        { mime: mime("<d2@pulse>"), messageId: "<d2@pulse>", replacesRef: first.ref },
        options,
      );
      expect(second).toMatchObject({ ref: { uid: 2 }, previousDraftLeft: true });
      const drafts = mailboxes[1]!.messages;
      expect(drafts.map((message) => message.uid)).toEqual([1, 2]);
      expect([...drafts[0]!.flags].sort()).toEqual(["\\Draft", "\\Seen"]);
      expect(smtp.connections()).toBe(0);
    }).pipe(Effect.scoped),
  );

  it.effect("finds the draft by Message-ID when the connection drops after APPEND", () =>
    Effect.gen(function* () {
      const mailboxes = standard();
      let dropped = false;
      const { options } = yield* serve(mailboxes, "MOVE UIDPLUS", (respond) => (command, io) => {
        if (!dropped && / APPEND /i.test(command.line)) {
          dropped = true;
          respond(command, { ...io, send: () => undefined });
          io.close();
          return;
        }
        respond(command, io);
      });
      const saved = yield* saveDraft(
        account,
        login,
        { mime: mime("<lost@pulse>"), messageId: "<lost@pulse>" },
        options,
      );
      expect(saved.ref).toEqual({
        accountId: "acct_test",
        mailbox: "Drafts",
        uidValidity: 5,
        uid: 1,
      });
      expect(mailboxes[1]!.messages).toHaveLength(1);
    }).pipe(Effect.scoped),
  );

  it.effect("reports outcome-unknown when the dropped draft is not in Drafts", () =>
    Effect.gen(function* () {
      const { options } = yield* serve(standard(), "MOVE UIDPLUS", (respond) => (command, io) => {
        if (/ APPEND /i.test(command.line)) io.close();
        else respond(command, io);
      });
      expect(
        yield* kindOf(
          saveDraft(account, login, { mime: mime("<x@pulse>"), messageId: "<x@pulse>" }, options),
        ),
      ).toBe("outcome-unknown");
    }).pipe(Effect.scoped),
  );

  it.effect("names the Drafts setting when the account has no Drafts mailbox", () =>
    Effect.gen(function* () {
      const { peer, options } = yield* serve([box("INBOX")]);
      const error = yield* saveDraft(
        account,
        login,
        { mime: mime("<y@pulse>"), messageId: "<y@pulse>" },
        options,
      ).pipe(Effect.flip);
      expect(error.kind).toBe("unsupported");
      expect(error.message).toContain("Settings > Email > Folders > Drafts");
      expect(writes(peer)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe("organization", () => {
  it.effect("sets and clears flags and keywords (A10)", () =>
    Effect.gen(function* () {
      const mailboxes = standard();
      const { options } = yield* serve(mailboxes);
      const message = mailboxes[0]!.messages[0]!;
      yield* setFlags(
        account,
        login,
        inbox(1),
        { seen: true, flagged: true, keywords: { add: ["$Pulse"] } },
        options,
      );
      expect([...message.flags].sort()).toEqual(["$Pulse", "\\Flagged", "\\Seen"]);
      yield* setFlags(
        account,
        login,
        inbox(1),
        { seen: false, keywords: { remove: ["$Pulse"] } },
        options,
      );
      expect([...message.flags]).toEqual(["\\Flagged"]);
      expect(mailboxes[0]!.messages[1]!.flags.size).toBe(0);
    }).pipe(Effect.scoped),
  );

  it.effect("moves and archives with MOVE, and refuses without it (A10)", () =>
    Effect.gen(function* () {
      const mailboxes = standard();
      const { options } = yield* serve(mailboxes);
      const moved = yield* move(account, login, inbox(1), "Sent", options);
      expect(moved).toEqual({
        mailbox: "Sent",
        ref: { accountId: "acct_test", mailbox: "Sent", uidValidity: 5, uid: 1 },
      });
      const archived = yield* archive(account, login, inbox(2), options);
      expect(archived.mailbox).toBe("Archive");
      expect(mailboxes[0]!.messages).toEqual([]);

      const plain = yield* serve(standard(), "UIDPLUS");
      expect(yield* kindOf(move(account, login, inbox(1), "Archive", plain.options))).toBe(
        "unsupported",
      );
      expect(writes(plain.peer)).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect("applies Gmail labels when the server has X-GM-EXT-1", () =>
    Effect.gen(function* () {
      const mailboxes = standard();
      const { options } = yield* serve(mailboxes, "MOVE UIDPLUS X-GM-EXT-1");
      const result = yield* setLabels(account, login, inbox(1), { add: ["Clients"] }, options);
      expect(result.applied).toBe("labels");
      expect([...labelsOf(mailboxes[0]!.messages[0]!)]).toEqual(["Clients"]);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects \\Deleted, Trash moves, and Trash labels without sending a write (A11)", () =>
    Effect.gen(function* () {
      const { peer, options } = yield* serve(standard(), "MOVE UIDPLUS X-GM-EXT-1");
      expect(
        yield* kindOf(
          setFlags(account, login, inbox(1), { keywords: { add: ["\\Deleted"] } }, options),
        ),
      ).toBe("invalid-input");
      expect(peer.connections()).toBe(0);
      expect(yield* kindOf(move(account, login, inbox(1), "Bin", options))).toBe("access-denied");
      expect(yield* kindOf(move(account, login, inbox(1), "\\Trash", options))).toBe(
        "access-denied",
      );
      expect(yield* kindOf(move(account, login, inbox(1), "[Gmail]/Trash", options))).toBe(
        "access-denied",
      );
      expect(
        yield* kindOf(setLabels(account, login, inbox(1), { add: ["\\Trash"] }, options)),
      ).toBe("access-denied");
      expect(
        yield* kindOf(
          archive({ ...account, folders: { archive: "Bin" } }, login, inbox(1), options),
        ),
      ).toBe("access-denied");
      expect(writes(peer)).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect("appends a sent copy with \\Seen", () =>
    Effect.gen(function* () {
      const mailboxes = standard();
      const { options } = yield* serve(mailboxes);
      expect(yield* appendSent(account, login, mime("<s@pulse>"), options)).toEqual({
        mailbox: "Sent",
      });
      expect([...mailboxes[2]!.messages[0]!.flags]).toEqual(["\\Seen"]);
    }).pipe(Effect.scoped),
  );

  it("never sent EXPUNGE or DELETE to any peer (A11)", () => {
    expect(peers.length).toBeGreaterThan(0);
    const destructive = peers.flatMap((peer) =>
      peer.received.filter((command) => /^\S+ (UID )?(EXPUNGE|DELETE)\b/i.test(command.line)),
    );
    expect(destructive).toEqual([]);
  });
});
