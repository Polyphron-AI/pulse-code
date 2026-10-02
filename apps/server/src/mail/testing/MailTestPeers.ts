import * as NodeNet from "node:net";
import * as NodeTls from "node:tls";

import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

import { MAIL_TEST_CA, MAIL_TEST_LEAF_CERT, MAIL_TEST_LEAF_KEY } from "./fixtures/certs.ts";

export { MAIL_TEST_CA };

const identity = { cert: MAIL_TEST_LEAF_CERT, key: MAIL_TEST_LEAF_KEY };
const secureContext = NodeTls.createSecureContext(identity);

export interface MailPeerCommand {
  /** One client command. IMAP literals are inlined, and SMTP DATA arrives as one command. */
  readonly line: string;
  /** Whether the bytes arrived over TLS. */
  readonly tls: boolean;
}

export interface MailPeerIo {
  readonly send: (text: string) => void;
  /** Upgrades the connection in place, after the caller sent the go-ahead response. */
  readonly startTls: () => void;
  readonly close: () => void;
}

export interface MailPeerScript {
  /** Implicit TLS from the first byte (993/465), or plaintext until `startTls` (143/587). */
  readonly implicitTls: boolean;
  readonly greeting: string;
  readonly respond: (command: MailPeerCommand, io: MailPeerIo) => void;
}

export interface MailPeer {
  readonly port: number;
  /** Every command any client sent, in order. */
  readonly received: ReadonlyArray<MailPeerCommand>;
  readonly connections: () => number;
}

const LITERAL = /\{(\d+)(\+?)\}$/;

const serve = (script: MailPeerScript, protocol: "imap" | "smtp") =>
  Effect.acquireRelease(
    Effect.callback<{
      readonly server: NodeNet.Server;
      readonly sockets: Set<NodeNet.Socket>;
      readonly peer: MailPeer;
    }>((resume) => {
      const received: Array<MailPeerCommand> = [];
      const sockets = new Set<NodeNet.Socket>();
      let connections = 0;

      const onSocket = (raw: NodeNet.Socket) => {
        connections += 1;
        let socket: NodeNet.Socket = raw;
        let tls = script.implicitTls;
        let buffer = "";
        let pending = "";
        let literalBytes = 0;
        let inData = false;
        let lastSent = "";
        raw.on("error", () => undefined);

        const io: MailPeerIo = {
          send: (text) => {
            lastSent = text;
            socket.write(text);
          },
          startTls: () => {
            socket.removeListener("data", onData);
            const upgraded = new NodeTls.TLSSocket(socket, { isServer: true, secureContext });
            upgraded.on("error", () => undefined);
            upgraded.on("data", onData);
            socket = upgraded;
            tls = true;
          },
          close: () => socket.end(),
        };

        const dispatch = (line: string) => {
          received.push({ line, tls });
          script.respond({ line, tls }, io);
          if (protocol === "smtp" && /^DATA$/i.test(line) && lastSent.startsWith("354")) {
            inData = true;
          }
        };

        function onData(chunk: Buffer) {
          buffer += chunk.toString("latin1");
          for (;;) {
            if (inData) {
              const end = buffer.indexOf("\r\n.\r\n");
              if (end < 0) return;
              const data = buffer.slice(0, end);
              buffer = buffer.slice(end + 5);
              inData = false;
              dispatch(data);
              continue;
            }
            if (literalBytes > 0) {
              if (buffer.length < literalBytes) return;
              pending += buffer.slice(0, literalBytes);
              buffer = buffer.slice(literalBytes);
              literalBytes = 0;
            }
            const newline = buffer.indexOf("\r\n");
            if (newline < 0) return;
            const line = pending + buffer.slice(0, newline);
            buffer = buffer.slice(newline + 2);
            const literal = protocol === "imap" ? LITERAL.exec(line) : null;
            if (literal?.[1]) {
              pending = `${line}\r\n`;
              literalBytes = Number(literal[1]);
              if (literal[2] !== "+") socket.write("+ Ready for literal data\r\n");
              continue;
            }
            pending = "";
            dispatch(line);
          }
        }

        socket.on("data", onData);
        socket.write(script.greeting);
      };

      const server = script.implicitTls
        ? NodeTls.createServer(identity, onSocket)
        : NodeNet.createServer(onSocket);
      // Handshake failures are part of what the tests exercise; they are not peer errors.
      server.on("tlsClientError", () => undefined);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as NodeNet.AddressInfo;
        resume(
          Effect.succeed({
            server,
            sockets,
            peer: { port: address.port, received, connections: () => connections },
          }),
        );
      });
      // Track sockets for teardown, since implicit TLS servers hand out TLS sockets.
      server.on("connection", (socket: NodeNet.Socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      });
    }),
    ({ server, sockets }) =>
      Effect.callback<void>((resume) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resume(Effect.void));
      }),
  ).pipe(Effect.map(({ peer }) => peer));

/**
 * Scripted mail servers on 127.0.0.1 port 0. All behavior comes from `respond`, so a test owns its
 * server conversation without editing this file. The peer closes when the scope closes.
 */
export const MailTestPeers = {
  imap: (script: MailPeerScript): Effect.Effect<MailPeer, never, Scope.Scope> =>
    serve(script, "imap"),
  smtp: (script: MailPeerScript): Effect.Effect<MailPeer, never, Scope.Scope> =>
    serve(script, "smtp"),
};

/** Splits an IMAP command into its tag and the rest, for responders. */
export const imapTag = (line: string) => {
  const space = line.indexOf(" ");
  return { tag: line.slice(0, space), command: line.slice(space + 1) };
};

export interface FakeImapMessage {
  readonly uid: number;
  flags: Set<string>;
  readonly raw: string;
}

export interface FakeImapMailbox {
  readonly name: string;
  readonly specialUse?: string;
  uidValidity: number;
  uidNext: number;
  messages: Array<FakeImapMessage>;
}

/** Expands an IMAP UID set such as `1,4:6,9:*` against the UIDs present. */
const inUidSet = (set: string, uids: ReadonlyArray<number>) => {
  const max = Math.max(0, ...uids);
  const ranges = set.split(",").map((part) => {
    const [from = "0", to = from] = part.split(":");
    const a = from === "*" ? max : Number(from);
    const b = to === "*" ? max : Number(to);
    return [Math.min(a, b), Math.max(a, b)] as const;
  });
  return (uid: number) => ranges.some(([a, b]) => uid >= a && uid <= b);
};

const APPEND = /^APPEND ("?)(.+?)\1 (?:\(([^)]*)\) )?\{\d+\+?\}\r\n([\s\S]*)$/i;
const STORE = /^([+-]?)(FLAGS|X-GM-LABELS)(?:\.SILENT)? \(([^)]*)\)/i;

/** Gmail labels live beside flags on the fake message; tests read them with `labelsOf`. */
const LABELS = new WeakMap<FakeImapMessage, Set<string>>();
export const labelsOf = (message: FakeImapMessage) => {
  const labels = LABELS.get(message) ?? new Set<string>();
  LABELS.set(message, labels);
  return labels;
};

const SECTION = /BODY(?:\.PEEK)?\[([^\]]*)\](?:<(\d+)\.(\d+)>)?/gi;

const sectionOf = (raw: string, section: string) => {
  if (section === "") return raw;
  const end = raw.indexOf("\r\n\r\n");
  return end < 0 ? raw : raw.slice(0, end + 4);
};

/**
 * A responder for an IMAP server holding `mailboxes` in memory: sign-in, LIST, SELECT/EXAMINE,
 * APPEND, UID SEARCH (every UID, or by Message-ID header), UID FETCH (flags, size, BODY sections),
 * UID STORE (flags and Gmail labels), UID MOVE, and LOGOUT. Tests extend it by
 * handling a command first and falling back to this responder.
 */
export const fakeImap = (
  mailboxes: Array<FakeImapMailbox>,
  options: { readonly capabilities?: string } = {},
) => {
  const capabilities = `IMAP4rev1 AUTH=PLAIN SASL-IR ${options.capabilities ?? ""}`.trim();
  let selected: FakeImapMailbox | undefined;
  const respond = ({ line }: MailPeerCommand, io: MailPeerIo) => {
    const { tag, command } = imapTag(line);
    const [verb = "", ...rest] = command.split(" ");
    const upper = verb.toUpperCase();
    const args = rest.join(" ");
    const sub = rest[0]?.toUpperCase();
    if (upper === "CAPABILITY") io.send(`* CAPABILITY ${capabilities}\r\n${tag} OK done\r\n`);
    else if (upper === "AUTHENTICATE" || upper === "LOGIN") io.send(`${tag} OK signed in\r\n`);
    else if ((upper === "LIST" || upper === "LSUB") && args.endsWith('""')) {
      // An empty pattern asks for the hierarchy delimiter only.
      io.send(`* ${upper} (\\Noselect) "/" ""\r\n${tag} OK done\r\n`);
    } else if (upper === "LIST" || upper === "LSUB") {
      const lines = mailboxes.map(
        (mailbox) =>
          `* ${upper} (\\HasNoChildren${mailbox.specialUse ? ` ${mailbox.specialUse}` : ""}) "/" "${mailbox.name}"\r\n`,
      );
      io.send(`${lines.join("")}${tag} OK done\r\n`);
    } else if (upper === "SELECT" || upper === "EXAMINE") {
      const name = args.replace(/^"|"$/g, "");
      selected = mailboxes.find((mailbox) => mailbox.name === name);
      if (!selected) {
        io.send(`${tag} NO [NONEXISTENT] no such mailbox\r\n`);
        return;
      }
      io.send(
        `* FLAGS (\\Seen \\Flagged \\Answered \\Draft \\Deleted)\r\n` +
          `* OK [PERMANENTFLAGS (\\Seen \\Flagged \\Answered \\Draft \\*)] ok\r\n` +
          `* ${selected.messages.length} EXISTS\r\n` +
          `* OK [UIDVALIDITY ${selected.uidValidity}] ok\r\n` +
          `* OK [UIDNEXT ${selected.uidNext}] ok\r\n` +
          `${tag} OK [${upper === "EXAMINE" ? "READ-ONLY" : "READ-WRITE"}] done\r\n`,
      );
    } else if (upper === "APPEND") {
      const append = APPEND.exec(command);
      const target = mailboxes.find((mailbox) => mailbox.name === append?.[2]);
      if (!append || !target) {
        io.send(`${tag} NO [TRYCREATE] no such mailbox\r\n`);
        return;
      }
      const uid = target.uidNext++;
      const flags = (append[3] ?? "").split(" ").filter(Boolean);
      target.messages.push({ uid, flags: new Set(flags), raw: append[4] ?? "" });
      io.send(`${tag} OK [APPENDUID ${target.uidValidity} ${uid}] appended\r\n`);
    } else if (upper === "UID" && sub === "SEARCH") {
      const header = /HEADER MESSAGE-ID "?([^"]+)"?/i.exec(args)?.[1];
      const uids = (selected?.messages ?? [])
        .filter((message) => header === undefined || message.raw.includes(header))
        .map((message) => message.uid);
      io.send(`* SEARCH ${uids.join(" ")}\r\n${tag} OK done\r\n`);
    } else if (upper === "UID" && sub === "STORE" && selected) {
      const store = STORE.exec(rest.slice(2).join(" "));
      const matches = inUidSet(
        rest[1] ?? "",
        selected.messages.map((message) => message.uid),
      );
      const names = (store?.[3] ?? "").split(" ").filter(Boolean);
      const out = selected.messages.flatMap((message, index) => {
        if (!store || !matches(message.uid)) return [];
        const target =
          store[2]?.toUpperCase() === "X-GM-LABELS" ? labelsOf(message) : message.flags;
        for (const name of names) {
          if (store[1] === "-") target.delete(name);
          else target.add(name);
        }
        return [
          `* ${index + 1} FETCH (UID ${message.uid} FLAGS (${[...message.flags].join(" ")}))\r\n`,
        ];
      });
      io.send(`${out.join("")}${tag} OK done\r\n`);
    } else if (upper === "UID" && sub === "MOVE" && selected) {
      const name = rest.slice(2).join(" ").replace(/^"|"$/g, "");
      const target = mailboxes.find((mailbox) => mailbox.name === name);
      if (!target) {
        io.send(`${tag} NO [TRYCREATE] no such mailbox\r\n`);
        return;
      }
      const matches = inUidSet(
        rest[1] ?? "",
        selected.messages.map((message) => message.uid),
      );
      const moving = selected.messages.filter((message) => matches(message.uid));
      selected.messages = selected.messages.filter((message) => !matches(message.uid));
      const newUids = moving.map((message) => {
        const uid = target.uidNext++;
        target.messages.push({ ...message, uid });
        return uid;
      });
      io.send(
        `* OK [COPYUID ${target.uidValidity} ${moving.map((message) => message.uid).join(",")} ${newUids.join(",")}] moved\r\n${tag} OK done\r\n`,
      );
    } else if (upper === "UID" && sub === "FETCH" && selected) {
      const set = rest[1] ?? "";
      const items = rest.slice(2).join(" ");
      const matches = inUidSet(
        set,
        selected.messages.map((message) => message.uid),
      );
      const out = selected.messages.flatMap((message, index) => {
        if (!matches(message.uid)) return [];
        const parts = [`UID ${message.uid}`];
        if (/\bFLAGS\b/i.test(items)) parts.push(`FLAGS (${[...message.flags].join(" ")})`);
        if (/RFC822\.SIZE/i.test(items)) parts.push(`RFC822.SIZE ${message.raw.length}`);
        for (const match of items.matchAll(SECTION)) {
          const [, section = "", start, length] = match;
          let content = sectionOf(message.raw, section);
          if (start !== undefined)
            content = content.slice(Number(start), Number(start) + Number(length));
          parts.push(
            `BODY[${section}]${start === undefined ? "" : `<${start}>`} {${Buffer.byteLength(content)}}\r\n${content}`,
          );
        }
        return [`* ${index + 1} FETCH (${parts.join(" ")})\r\n`];
      });
      io.send(`${out.join("")}${tag} OK done\r\n`);
    } else if (upper === "LOGOUT") {
      io.send(`* BYE bye\r\n${tag} OK done\r\n`);
      io.close();
    } else io.send(`${tag} OK done\r\n`);
  };
  return { respond, greeting: `* OK [CAPABILITY ${capabilities}] ready\r\n` };
};
