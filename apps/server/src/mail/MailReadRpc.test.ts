import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import type { MailAccountInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as MailConfig from "./MailConfigService.ts";
import type { MailLookup } from "./MailNetworkPolicy.ts";
import { MailOAuth } from "./MailOAuth.ts";
import { mailRpcHandlers } from "./MailRpc.ts";
import { MailSendService } from "./MailSendService.ts";
import {
  MAIL_TEST_CA,
  MailTestPeers,
  fakeImap,
  type FakeImapMailbox,
  type MailPeerScript,
} from "./testing/MailTestPeers.ts";

const testLayer = () => {
  const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mail-read-test-" });
  return Layer.mergeAll(
    MailConfig.layer.pipe(
      Layer.provide(ServerSecretStore.layer.pipe(Layer.provide(configLayer))),
      Layer.provide(configLayer),
      Layer.provide(Layer.mock(Orchestrator.OrchestratorV2)({})),
    ),
    Layer.mock(MailOAuth)({
      login: () => Effect.succeed({ type: "password", password: "hunter2" }),
    }),
    Layer.mock(MailSendService)({}),
  ).pipe(Layer.provideMerge(NodeServices.layer));
};

const loopback: MailLookup = async () => [{ address: "127.0.0.1", family: 4 }];

const accountInput = {
  nickname: "Work",
  address: "me@mail.test",
  imap: { host: "mail.test", port: 993 },
  smtp: { host: "mail.test", port: 465 },
  auth: { kind: "password" },
  allowPrivateNetwork: true,
  appendToSent: true,
} satisfies MailAccountInput;

const message = (uid: number, subject: string, messageId: string) => ({
  uid,
  flags: new Set<string>(),
  raw: [
    "From: Ana <ana@example.com>",
    "To: me@mail.test",
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    "Date: Thu, 01 Oct 2026 10:00:00 +0000",
    "",
    `Body of ${subject}`,
    "",
  ].join("\r\n"),
});

/** Gmail after the brief was archived: it left INBOX and lives on in All Mail. */
const archived = (): Array<FakeImapMailbox> => [
  {
    name: "INBOX",
    uidValidity: 7,
    uidNext: 3,
    messages: [message(1, "Hello", "<hello@example.com>")],
  },
  {
    name: "[Gmail]/All Mail",
    specialUse: "\\All",
    uidValidity: 9,
    uidNext: 31,
    messages: [
      message(11, "Hello", "<hello@example.com>"),
      message(30, "Q3 brief", "<brief@example.com>"),
    ],
  },
];

/** A stored account whose IMAP server is a fresh fake holding `boxes`, and its handlers. */
const setup = (
  boxes: Array<FakeImapMailbox>,
  wrap?: (respond: MailPeerScript["respond"]) => MailPeerScript["respond"],
) =>
  Effect.gen(function* () {
    const config = yield* MailConfig.MailConfigService;
    const account = yield* config.upsertAccount(accountInput);
    yield* config.setCredential(account.id, { type: "password", password: "hunter2" });
    const server = fakeImap(boxes, { capabilities: "SPECIAL-USE" });
    const peer = yield* MailTestPeers.imap({
      implicitTls: true,
      ...server,
      respond: wrap ? wrap(server.respond) : server.respond,
    });
    const rpc = mailRpcHandlers(config, yield* MailOAuth, yield* MailSendService, {
      lookup: loopback,
      testPeer: { port: peer.port, ca: MAIL_TEST_CA },
    });
    return { config, account, peer, rpc };
  });

const kindOf = <A>(effect: Effect.Effect<A, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

describe("mail read RPCs", () => {
  it.effect("lists folders with their special use", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived());
      const list = yield* rpc.listFolders({ accountId: account.id });
      expect(list.folders).toEqual(
        expect.arrayContaining([
          { name: "INBOX", specialUse: "\\Inbox" },
          { name: "[Gmail]/All Mail", specialUse: "\\All" },
        ]),
      );
      expect(list.truncated).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("lists a folder newest first with each message's Message-ID", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived());
      const page = yield* rpc.listMessages({ accountId: account.id, mailbox: "[Gmail]/All Mail" });
      expect(page.messages.map((item) => item.ref.uid)).toEqual([30, 11]);
      expect(page.messages[0]).toMatchObject({
        subject: "Q3 brief",
        from: '"Ana" <ana@example.com>',
        messageId: "<brief@example.com>",
        seen: false,
      });
      expect(page.nextCursor).toBeUndefined();
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("sends typed search text to the server as a text search", () =>
    Effect.gen(function* () {
      const { account, peer, rpc } = yield* setup(archived());
      yield* rpc.listMessages({ accountId: account.id, mailbox: "INBOX", query: "  brief  " });
      expect(peer.received.some(({ line }) => /UID SEARCH .*TEXT .*brief/i.test(line))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("opens an archived message from its link, never the message at its old UID", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived());
      const content = yield* rpc.readMessage({
        accountId: account.id,
        messageId: "<brief@example.com>",
        location: { accountId: account.id, mailbox: "INBOX", uidValidity: 7, uid: 1 },
      });
      expect(content.ref).toEqual({
        accountId: account.id,
        mailbox: "[Gmail]/All Mail",
        uidValidity: 9,
        uid: 30,
      });
      expect(content.subject).toBe("Q3 brief");
      expect(content.body.text).toContain("Body of Q3 brief");
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("refuses a location from another account", () =>
    Effect.gen(function* () {
      const { account, peer, config } = yield* setup(archived());
      const oauth = yield* MailOAuth;
      const rpc = mailRpcHandlers(
        config,
        { ...oauth, login: () => Effect.die("sign-in must not run") },
        yield* MailSendService,
      );
      const kind = yield* kindOf(
        rpc.readMessage({
          accountId: account.id,
          location: { accountId: "acct_other", mailbox: "INBOX", uidValidity: 7, uid: 1 },
        }),
      );
      expect(kind).toBe("invalid-input");
      expect(peer.received).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("names a missing folder as not found", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived());
      const kind = yield* kindOf(rpc.listMessages({ accountId: account.id, mailbox: "Nope" }));
      expect(kind).toBe("not-found");
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("pages message lists using the returned cursor", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived());
      const first = yield* rpc.listMessages({
        accountId: account.id,
        mailbox: "[Gmail]/All Mail",
        limit: 1,
      });
      expect(first.messages.map((item) => item.ref.uid)).toEqual([30]);
      expect(first.nextCursor).toBe("9.30");
      const second = yield* rpc.listMessages({
        accountId: account.id,
        mailbox: "[Gmail]/All Mail",
        limit: 1,
        cursor: first.nextCursor,
      });
      expect(second.messages.map((item) => item.ref.uid)).toEqual([11]);
      expect(second.nextCursor).toBeUndefined();
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("rejects an empty reference without connecting", () =>
    Effect.gen(function* () {
      const { account, peer, rpc } = yield* setup(archived());
      expect(yield* kindOf(rpc.readMessage({ accountId: account.id }))).toBe("invalid-input");
      expect(peer.received).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("returns not found for an unknown account without connecting", () =>
    Effect.gen(function* () {
      const { peer, rpc } = yield* setup(archived());
      expect(yield* kindOf(rpc.listFolders({ accountId: "acct_unknown" }))).toBe("not-found");
      expect(yield* kindOf(rpc.listMessages({ accountId: "acct_unknown", mailbox: "INBOX" }))).toBe(
        "not-found",
      );
      expect(
        yield* kindOf(
          rpc.readMessage({ accountId: "acct_unknown", messageId: "<brief@example.com>" }),
        ),
      ).toBe("not-found");
      expect(peer.received).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("preserves not found after a complete Message-ID search", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived());
      const result = yield* rpc
        .readMessage({ accountId: account.id, messageId: "<missing@example.com>" })
        .pipe(Effect.result);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          kind: "not-found",
          message: "This message was not found in any folder. It may have been deleted.",
        },
      });
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("explains a lost location-only reference", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived());
      const result = yield* rpc
        .readMessage({
          accountId: account.id,
          location: { accountId: account.id, mailbox: "INBOX", uidValidity: 6, uid: 1 },
        })
        .pipe(Effect.result);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          kind: "not-found",
          message:
            "This message moved or was deleted. It was linked without a Message-ID, so it cannot be found again.",
        },
      });
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("preserves unavailable when a folder refuses a Message-ID search", () =>
    Effect.gen(function* () {
      const { account, rpc } = yield* setup(archived(), (respond) => (command, io) => {
        if (/UID SEARCH/i.test(command.line))
          io.send(`${command.line.split(" ")[0]} NO search refused hunter2\r\n`);
        else respond(command, io);
      });
      const result = yield* rpc
        .readMessage({ accountId: account.id, messageId: "<missing@example.com>" })
        .pipe(Effect.result);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { kind: "unavailable", message: "Some folders could not be searched. Try again." },
      });
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );

  it.effect("redacts unexpected sign-in throws and rejections on every read handler", () =>
    Effect.gen(function* () {
      const { account, config, peer } = yield* setup(archived());
      const oauth = yield* MailOAuth;
      const send = yield* MailSendService;
      for (const failure of [
        Effect.sync(() => {
          throw new Error("password=hunter2 token=private");
        }),
        Effect.promise(() => Promise.reject(new Error("password=hunter2 token=private"))),
      ]) {
        const rpc = mailRpcHandlers(config, { ...oauth, login: () => failure }, send);
        for (const read of [
          rpc.listFolders({ accountId: account.id }).pipe(Effect.result),
          rpc.listMessages({ accountId: account.id, mailbox: "INBOX" }).pipe(Effect.result),
          rpc
            .readMessage({ accountId: account.id, messageId: "<brief@example.com>" })
            .pipe(Effect.result),
        ]) {
          expect(yield* read).toMatchObject({
            _tag: "Failure",
            failure: { kind: "unavailable", message: "The mail operation failed. Try again." },
          });
        }
      }
      expect(peer.received).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
});
