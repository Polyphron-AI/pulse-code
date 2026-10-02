import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as nodemailer from "nodemailer";

import type { StoredMailAccount } from "./MailConfigService.ts";
import { smtpTransportOptions, withImap, type MailLogin } from "./MailConnection.ts";
import type { MailLookup } from "./MailNetworkPolicy.ts";
import {
  MAIL_TEST_CA,
  MailTestPeers,
  imapTag,
  type MailPeerCommand,
  type MailPeerIo,
} from "./testing/MailTestPeers.ts";

const account = (imapPort: 993 | 143, smtpPort: 465 | 587 = 465): StoredMailAccount => ({
  id: "acct_test",
  nickname: "Test",
  address: "me@mail.test",
  username: "me@mail.test",
  imap: { host: "mail.test", port: imapPort },
  smtp: { host: "mail.test", port: smtpPort },
  auth: { kind: "password" },
  allowPrivateNetwork: true,
  appendToSent: true,
  folders: {},
  health: { status: "unknown" },
});

const password: MailLogin = { type: "password", password: "hunter2" };
const loopback: MailLookup = async () => [{ address: "127.0.0.1", family: 4 }];

/** A minimal IMAP server: answers CAPABILITY, auth, STARTTLS, and LOGOUT, and OKs the rest. */
const imapServer =
  (capabilities: string, auth: (command: string) => boolean = () => true) =>
  ({ line }: MailPeerCommand, io: MailPeerIo) => {
    const { tag, command } = imapTag(line);
    const verb = command.split(" ")[0]?.toUpperCase();
    if (verb === "CAPABILITY") io.send(`* CAPABILITY ${capabilities}\r\n${tag} OK done\r\n`);
    else if (verb === "STARTTLS") {
      io.send(`${tag} OK Begin TLS\r\n`);
      io.startTls();
    } else if (verb === "AUTHENTICATE" || verb === "LOGIN") {
      io.send(
        auth(command)
          ? `${tag} OK [CAPABILITY IMAP4rev1] signed in\r\n`
          : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`,
      );
    } else if (verb === "LOGOUT") {
      io.send(`* BYE bye\r\n${tag} OK done\r\n`);
      io.close();
    } else io.send(`${tag} OK done\r\n`);
  };

const isCredentialCommand = ({ line }: MailPeerCommand) =>
  /^\S+ (AUTHENTICATE|LOGIN)\b/i.test(line) || /^AUTH\b/i.test(line);

const kindOf = <A>(effect: Effect.Effect<A, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

describe("withImap", () => {
  it.effect("signs in over implicit TLS and logs out", () =>
    Effect.gen(function* () {
      const peer = yield* MailTestPeers.imap({
        implicitTls: true,
        greeting: "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR] ready\r\n",
        respond: imapServer("IMAP4rev1 AUTH=PLAIN SASL-IR"),
      });
      const result = yield* withImap(
        account(993),
        password,
        (client) => Effect.succeed(client.authenticated),
        { lookup: loopback, testPeer: { port: peer.port, ca: MAIL_TEST_CA } },
      );
      expect(result).toBeTruthy();
      expect(peer.received.every((command) => command.tls)).toBe(true);
      expect(peer.received.some((command) => /LOGOUT/.test(command.line))).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects an untrusted certificate before any credential is sent", () =>
    Effect.gen(function* () {
      const peer = yield* MailTestPeers.imap({
        implicitTls: true,
        greeting: "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR] ready\r\n",
        respond: imapServer("IMAP4rev1 AUTH=PLAIN SASL-IR"),
      });
      const kind = yield* kindOf(
        withImap(account(993), password, () => Effect.void, {
          lookup: loopback,
          testPeer: { port: peer.port },
        }),
      );
      expect(kind).toBe("unavailable");
      expect(peer.received).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect("refuses port 143 without STARTTLS before LOGIN", () =>
    Effect.gen(function* () {
      const peer = yield* MailTestPeers.imap({
        implicitTls: false,
        greeting: "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] ready\r\n",
        respond: imapServer("IMAP4rev1 AUTH=PLAIN"),
      });
      const kind = yield* kindOf(
        withImap(account(143), password, () => Effect.void, {
          lookup: loopback,
          testPeer: { port: peer.port, ca: MAIL_TEST_CA },
        }),
      );
      expect(kind).toBe("unavailable");
      expect(peer.received.filter(isCredentialCommand)).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect("upgrades port 143 with STARTTLS before signing in", () =>
    Effect.gen(function* () {
      const peer = yield* MailTestPeers.imap({
        implicitTls: false,
        greeting: "* OK [CAPABILITY IMAP4rev1 STARTTLS AUTH=PLAIN SASL-IR] ready\r\n",
        respond: imapServer("IMAP4rev1 STARTTLS AUTH=PLAIN SASL-IR"),
      });
      yield* withImap(account(143), password, () => Effect.void, {
        lookup: loopback,
        testPeer: { port: peer.port, ca: MAIL_TEST_CA },
      });
      const credentials = peer.received.filter(isCredentialCommand);
      expect(credentials).toHaveLength(1);
      expect(credentials.every((command) => command.tls)).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("does not retry a failed XOAUTH2 sign-in with a password method", () =>
    Effect.gen(function* () {
      const peer = yield* MailTestPeers.imap({
        implicitTls: true,
        greeting: "* OK [CAPABILITY IMAP4rev1 AUTH=XOAUTH2 AUTH=PLAIN SASL-IR] ready\r\n",
        respond: imapServer("IMAP4rev1 AUTH=XOAUTH2 AUTH=PLAIN SASL-IR", () => false),
      });
      const kind = yield* kindOf(
        withImap(account(993), { type: "oauth", accessToken: "expired" }, () => Effect.void, {
          lookup: loopback,
          testPeer: { port: peer.port, ca: MAIL_TEST_CA },
        }),
      );
      expect(kind).toBe("auth-failed");
      const credentials = peer.received.filter(isCredentialCommand);
      expect(credentials).toHaveLength(1);
      expect(credentials[0]?.line).toMatch(/AUTHENTICATE XOAUTH2/);
    }).pipe(Effect.scoped),
  );

  it.effect("dials the checked address even when a later lookup would differ (A20)", () =>
    Effect.gen(function* () {
      const peer = yield* MailTestPeers.imap({
        implicitTls: true,
        greeting: "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR] ready\r\n",
        respond: imapServer("IMAP4rev1 AUTH=PLAIN SASL-IR"),
      });
      let lookups = 0;
      const rebinding: MailLookup = async () => {
        lookups += 1;
        return [{ address: lookups === 1 ? "127.0.0.1" : "10.9.9.9", family: 4 }];
      };
      yield* withImap(account(993), password, () => Effect.void, {
        lookup: rebinding,
        testPeer: { port: peer.port, ca: MAIL_TEST_CA },
      });
      expect(lookups).toBe(1);
      expect(peer.connections()).toBe(1);
    }).pipe(Effect.scoped),
  );
});

describe("smtpTransportOptions", () => {
  it.effect("targets the checked address with the host as TLS servername", () =>
    Effect.gen(function* () {
      const options = yield* smtpTransportOptions(account(993, 587), password, {
        lookup: loopback,
      });
      expect(options).toMatchObject({
        host: "127.0.0.1",
        port: 587,
        secure: false,
        requireTLS: true,
        tls: { servername: "mail.test", rejectUnauthorized: true },
      });
    }),
  );

  it.effect("refuses port 587 without STARTTLS before AUTH", () =>
    Effect.gen(function* () {
      const peer = yield* MailTestPeers.smtp({
        implicitTls: false,
        greeting: "220 mail.test ESMTP\r\n",
        respond: ({ line }, io) => {
          if (/^EHLO/i.test(line)) io.send("250-mail.test\r\n250 AUTH PLAIN LOGIN\r\n");
          else if (/^STARTTLS/i.test(line)) io.send("502 5.5.1 Unrecognized command\r\n");
          else if (/^QUIT/i.test(line)) {
            io.send("221 bye\r\n");
            io.close();
          } else io.send("250 ok\r\n");
        },
      });
      const options = yield* smtpTransportOptions(account(993, 587), password, {
        lookup: loopback,
        testPeer: { port: peer.port, ca: MAIL_TEST_CA },
      });
      const verified = yield* Effect.promise(() =>
        nodemailer
          .createTransport(options)
          .verify()
          .then(
            () => "ok",
            () => "refused",
          ),
      );
      expect(verified).toBe("refused");
      expect(peer.received.filter(isCredentialCommand)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
