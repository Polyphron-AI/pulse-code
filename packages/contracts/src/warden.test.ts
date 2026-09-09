import fixtureValues from "../../../prd/warden/fixtures/read-v1.json" with { type: "json" };
import { describe, expect, it } from "vite-plus/test";
import { canonicalWardenReadBinding, decodeWardenReadRequest } from "./warden.ts";

const fixtures = fixtureValues as {
  valid: Array<{
    name: string;
    request: Record<string, unknown>;
    authority: Record<string, unknown>;
    canonical: string;
    sha256: string;
  }>;
  invalid: Array<{ name: string; request: unknown }>;
};
const example = fixtures.valid[1]!;
const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

describe("Warden saved-query read contract", () => {
  it.each(fixtures.valid)(
    "matches independent canonical bytes and digest: $name",
    async ({ request, authority, canonical, sha256 }) => {
      expect(decodeWardenReadRequest(request)).toEqual(request);
      const actual = canonicalWardenReadBinding(request, authority);
      expect(actual).toBe(canonical);
      expect(await digest(actual)).toBe(sha256);
    },
  );
  it.each(fixtures.invalid)("rejects request without echoing data: $name", ({ request }) => {
    expect(() => decodeWardenReadRequest(request)).toThrow(/^Invalid Warden read request$/);
  });
  it("ignores object insertion order when binding", () => {
    const reversed = Object.fromEntries(Object.entries(example.request).toReversed());
    expect(canonicalWardenReadBinding(reversed, example.authority)).toBe(example.canonical);
  });
  it("binds every authority field", async () => {
    for (const [key, value] of Object.entries(example.authority)) {
      const replacement =
        typeof value === "number"
          ? value + 1
          : key.endsWith("Id")
            ? "55555555-5555-4555-8555-555555555555"
            : value + "2";
      const actual = canonicalWardenReadBinding(example.request, {
        ...example.authority,
        [key]: replacement,
      });
      expect(await digest(actual), key).not.toBe(example.sha256);
    }
  });
  it("binds all caller-controlled fields", async () => {
    for (const key of ["requestId", "credentialRef", "resource", "taskRef", "attemptRef"]) {
      const replacement =
        key === "requestId"
          ? "55555555-5555-4555-8555-555555555555"
          : String(example.request[key]) + "2";
      expect(
        await digest(
          canonicalWardenReadBinding({ ...example.request, [key]: replacement }, example.authority),
        ),
        key,
      ).not.toBe(example.sha256);
    }
    const payload = example.request.payload as Record<string, unknown>;
    for (const replacement of [
      { ...payload, lookbackSeconds: 360 },
      { ...payload, queryRef: String(payload.queryRef) + "2" },
    ]) {
      expect(
        await digest(
          canonicalWardenReadBinding(
            { ...example.request, payload: replacement },
            example.authority,
          ),
        ),
      ).not.toBe(example.sha256);
    }
  });
  it("rejects missing, unknown, or malformed authority without echoing it", () => {
    for (const key of Object.keys(example.authority)) {
      const authority = { ...example.authority };
      delete authority[key];
      expect(() => canonicalWardenReadBinding(example.request, authority), key).toThrow(
        /^Invalid Warden read authority$/,
      );
    }
    for (const authority of [
      null,
      { ...example.authority, token: "CANARY-NOT-A-SECRET" },
      { ...example.authority, expiresAt: 0 },
      { ...example.authority, expiresAt: 253402300800 },
      { ...example.authority, expiresAt: 1.5 },
      { ...example.authority, runtime: "codex\n" },
      { ...example.authority, environmentRef: "urn:pulse:example:thread:wrong" },
    ]) {
      expect(() => canonicalWardenReadBinding(example.request, authority)).toThrow(
        /^Invalid Warden read authority$/,
      );
    }
  });
});
