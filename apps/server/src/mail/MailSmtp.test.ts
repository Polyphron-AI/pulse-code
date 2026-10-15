import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { StoredMailAccount } from "./MailConfigService.ts";
import type { MailLookup } from "./MailNetworkPolicy.ts";
import { submit } from "./MailSmtp.ts";
import { MAIL_TEST_CA, MailTestPeers, type MailPeerIo } from "./testing/MailTestPeers.ts";

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

const loopback: MailLookup = async () => [{ address: "127.0.0.1", family: 4 }];
const mime = new TextEncoder().encode(
  "From: me@mail.test\r\nTo: you@example.com\r\nSubject: Hi\r\n\r\nHello\r\n",
);

/** An SMTP server whose replies to AUTH and to the message body come from the test. */
const smtpPeer = (replies: {
  readonly auth?: string;
  readonly afterData: (io: MailPeerIo) => void;
}) =>
  MailTestPeers.smtp({
    implicitTls: true,
    greeting: "220 mail.test ESMTP\r\n",
    respond: ({ line }, io) => {
      if (/^EHLO/i.test(line)) io.send("250-mail.test\r\n250 AUTH PLAIN\r\n");
      else if (/^AUTH/i.test(line)) io.send(replies.auth ?? "235 2.7.0 Accepted\r\n");
      else if (/^DATA$/i.test(line)) io.send("354 Go ahead\r\n");
      else if (/^QUIT/i.test(line)) {
        io.send("221 Bye\r\n");
        io.close();
      } else if (/^(MAIL|RCPT)/i.test(line)) io.send("250 OK\r\n");
      else replies.afterData(io);
    },
  });

const send = (port: number) =>
  submit(
    account,
    { type: "password", password: "hunter2" },
    { envelope: { from: "me@mail.test", to: ["you@example.com"] }, mime },
    { lookup: loopback, testPeer: { port, ca: MAIL_TEST_CA } },
  );

const dataCommands = (received: ReadonlyArray<{ readonly line: string }>) =>
  received.filter(({ line }) => /^DATA$/i.test(line)).length;

describe("submit", () => {
  it.effect("reports an accepted message (A16)", () =>
    Effect.gen(function* () {
      const peer = yield* smtpPeer({ afterData: (io) => io.send("250 2.0.0 Queued as ABC\r\n") });
      const result = yield* send(peer.port);
      expect(result).toEqual({ kind: "accepted", response: "250 2.0.0 Queued as ABC" });
      expect(dataCommands(peer.received)).toBe(1);
      expect(peer.received.some(({ line }) => line.includes("Subject: Hi"))).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("reports a rejection after DATA as failed (A18)", () =>
    Effect.gen(function* () {
      const peer = yield* smtpPeer({
        afterData: (io) => io.send("550 5.7.1 Message rejected\r\n"),
      });
      const result = yield* send(peer.port);
      expect(result).toMatchObject({ kind: "failed", code: 550 });
      expect(dataCommands(peer.received)).toBe(1);
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect("reports an authentication failure without sending DATA (A18)", () =>
    Effect.gen(function* () {
      const peer = yield* smtpPeer({
        auth: "535 5.7.8 Authentication credentials invalid\r\n",
        afterData: () => undefined,
      });
      const result = yield* send(peer.port);
      expect(result).toMatchObject({ kind: "failed", code: 535 });
      expect(dataCommands(peer.received)).toBe(0);
      expect(peer.received.filter(({ line }) => /^AUTH/i.test(line))).toHaveLength(1);
    }).pipe(Effect.scoped),
  );

  it.effect("reports outcome unknown when the socket closes after the final dot (A17)", () =>
    Effect.gen(function* () {
      const peer = yield* smtpPeer({ afterData: (io) => io.close() });
      const result = yield* send(peer.port);
      expect(result.kind).toBe("outcome_unknown");
      expect(dataCommands(peer.received)).toBe(1);
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );
});
