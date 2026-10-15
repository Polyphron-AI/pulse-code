import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { describe, expect } from "vite-plus/test";

import { resolveMailDestination, type MailLookup } from "./MailNetworkPolicy.ts";

const lookupOf =
  (...addresses: ReadonlyArray<string>): MailLookup =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

const kindOf = (effect: Effect.Effect<unknown, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "allowed"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

describe("resolveMailDestination", () => {
  for (const address of [
    "10.0.0.5",
    "127.0.0.1",
    "::1",
    "fe80::1",
    "100.64.0.1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ]) {
    it.effect(`denies ${address} unless the account opts in`, () =>
      Effect.gen(function* () {
        const lookup = lookupOf(address);
        expect(yield* kindOf(resolveMailDestination("mail.test", 993, "imap", false, lookup))).toBe(
          "network-denied",
        );
        expect(yield* kindOf(resolveMailDestination("mail.test", 993, "imap", true, lookup))).toBe(
          "allowed",
        );
      }),
    );
  }

  it.effect("denies IP literal hosts in private ranges", () =>
    Effect.gen(function* () {
      expect(yield* kindOf(resolveMailDestination("[::1]", 993, "imap", false))).toBe(
        "network-denied",
      );
      expect(yield* kindOf(resolveMailDestination("192.168.1.2", 465, "smtp", false))).toBe(
        "network-denied",
      );
    }),
  );

  it.effect("denies ports outside the mail set even with private access", () =>
    Effect.gen(function* () {
      const lookup = lookupOf("93.184.215.14");
      for (const port of [25, 2525]) {
        expect(yield* kindOf(resolveMailDestination("smtp.test", port, "smtp", true, lookup))).toBe(
          "network-denied",
        );
      }
      expect(yield* kindOf(resolveMailDestination("imap.test", 587, "imap", true, lookup))).toBe(
        "network-denied",
      );
    }),
  );

  it.effect("denies a host with one public and one private answer", () =>
    Effect.gen(function* () {
      const lookup = lookupOf("93.184.215.14", "10.1.2.3");
      expect(yield* kindOf(resolveMailDestination("mixed.test", 587, "smtp", false, lookup))).toBe(
        "network-denied",
      );
    }),
  );

  it.effect("returns the checked address with the configured host as servername", () =>
    Effect.gen(function* () {
      const destination = yield* resolveMailDestination(
        "imap.example.com",
        993,
        "imap",
        false,
        lookupOf("93.184.215.14"),
      );
      expect(destination).toEqual({
        address: "93.184.215.14",
        family: 4,
        servername: "imap.example.com",
      });
    }),
  );
});
