import * as NodeDnsPromises from "node:dns/promises";
import * as NodeNet from "node:net";

import { MailError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

export interface MailDestination {
  /** The checked address. Connect to this, never re-resolve the host. */
  readonly address: string;
  readonly family: 4 | 6;
  /** The configured host, used for TLS SNI and certificate checks. */
  readonly servername: string;
}

export type MailLookup = (
  host: string,
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

const ALLOWED_PORTS = { imap: [993, 143], smtp: [465, 587] } as const;

const blocked = new NodeNet.BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv4");
}
for (const [prefix, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv6");
}

/** Maps `::ffff:a.b.c.d` and `::ffff:XXXX:XXXX` to IPv4 so mapped addresses get the IPv4 rules. */
const unmapIpv4 = (address: string): string | undefined => {
  const match = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/i.exec(address);
  if (!match?.[1]) return undefined;
  const rest = match[1];
  if (NodeNet.isIPv4(rest)) return rest;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
  if (!hex?.[1] || !hex[2]) return undefined;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
};

export const isPrivateMailAddress = (address: string): boolean => {
  if (NodeNet.isIPv4(address)) return blocked.check(address, "ipv4");
  if (!NodeNet.isIPv6(address)) return true;
  const mapped = unmapIpv4(address);
  if (mapped) return blocked.check(mapped, "ipv4");
  return blocked.check(address, "ipv6");
};

const defaultLookup: MailLookup = (host) =>
  NodeDnsPromises.lookup(host, { all: true, verbatim: true });

const denied = (message: string) => new MailError({ kind: "network-denied", message });

/**
 * Resolves a mail host once and checks every answer. A host with any private answer is denied
 * unless the account opted in, so a mixed public/private record cannot slip through.
 */
export const resolveMailDestination = (
  host: string,
  port: number,
  protocol: "imap" | "smtp",
  allowPrivateNetwork: boolean,
  lookup: MailLookup = defaultLookup,
): Effect.Effect<MailDestination, MailError> =>
  Effect.gen(function* () {
    if (!(ALLOWED_PORTS[protocol] as ReadonlyArray<number>).includes(port)) {
      return yield* denied(
        `${protocol.toUpperCase()} port ${port} is not allowed. Use ${ALLOWED_PORTS[protocol].join(" or ")}.`,
      );
    }
    const literal = host.replace(/^\[(.*)\]$/, "$1");
    const answers = NodeNet.isIP(literal)
      ? [{ address: literal, family: NodeNet.isIPv4(literal) ? 4 : 6 }]
      : yield* Effect.tryPromise({
          try: () => lookup(host),
          catch: () =>
            new MailError({ kind: "unavailable", message: `Could not resolve mail host ${host}.` }),
        });
    const first = answers[0];
    if (!first) {
      return yield* new MailError({
        kind: "unavailable",
        message: `Mail host ${host} has no addresses.`,
      });
    }
    if (!allowPrivateNetwork && answers.some((answer) => isPrivateMailAddress(answer.address))) {
      return yield* denied(
        `Mail host ${host} resolves to a private or local address. Enable private network access for this account to allow it.`,
      );
    }
    return {
      address: first.address,
      family: first.family === 6 ? 6 : 4,
      servername: literal,
    } satisfies MailDestination;
  });
