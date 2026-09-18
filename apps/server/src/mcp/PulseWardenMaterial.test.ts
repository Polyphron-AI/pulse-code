import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { PulseWardenError, type PulseWardenClientShape } from "./PulseWardenClient.ts";
import {
  makeWardenGrantIndex,
  makeWardenMaterialSource,
  wardenFailure,
} from "./PulseWardenMaterial.ts";

const REF_A = "urn:pulse:acme:credential:a";
const REF_B = "urn:pulse:acme:credential:b";

const fakeClient = (input: {
  readonly grants?: unknown;
  readonly release?: (body: { credentialRef: string }) => Effect.Effect<string, PulseWardenError>;
}) => {
  const calls = { grants: 0, releases: [] as string[] };
  const client: PulseWardenClientShape = {
    callTool: (name) => {
      if (name !== "warden_grants_list") return Effect.die(`unexpected tool ${name}`);
      calls.grants += 1;
      return Effect.succeed(input.grants ?? []);
    },
    release: (body) => {
      calls.releases.push(body.credentialRef);
      return (input.release ?? ((call) => Effect.succeed(`material-${call.credentialRef}`)))(
        body,
      ).pipe(
        Effect.map((material) => ({
          credentialRef: body.credentialRef,
          material,
          requestDigest: "sha256:x",
        })),
      );
    },
  };
  return { client, calls };
};

describe("WardenGrantIndex", () => {
  it.effect("matches only active grants with an exact scope and caches for 30 seconds", () =>
    Effect.gen(function* () {
      const { client, calls } = fakeClient({
        grants: {
          grants: [
            { id: "g1", scope: REF_A, status: "active", expiresAt: "2030-01-01T00:00:00Z" },
            { id: "g2", scope: REF_B, status: "pending" },
            { id: "g3", scope: "urn:pulse:acme:project:p", status: "active" },
            { id: "g4", scope: REF_B, status: "expired" },
          ],
        },
      });
      const index = yield* makeWardenGrantIndex(client);
      const active = yield* index.active;
      expect([...active.keys()]).toEqual([REF_A]);
      expect(active.get(REF_A)?.id).toBe("g1");
      yield* index.active;
      expect(calls.grants).toBe(1);
      yield* TestClock.adjust(29_999);
      yield* index.active;
      expect(calls.grants).toBe(1);
      yield* TestClock.adjust(1);
      yield* index.active;
      expect(calls.grants).toBe(2);
    }),
  );
});

describe("WardenMaterialSource", () => {
  it.effect(
    "releases each ref once with the matching grant and memoizes within the turn window",
    () =>
      Effect.gen(function* () {
        const { client, calls } = fakeClient({
          grants: [
            { id: "g1", scope: REF_A, status: "active" },
            { id: "g2", scope: REF_B, status: "active" },
          ],
        });
        const index = yield* makeWardenGrantIndex(client);
        const source = yield* makeWardenMaterialSource(client, index);
        const first = yield* source.resolve([REF_A, REF_B, REF_A]);
        expect(first.get(REF_A)).toEqual({ ok: true, material: `material-${REF_A}` });
        expect(first.get(REF_B)).toEqual({ ok: true, material: `material-${REF_B}` });
        expect([...calls.releases].sort()).toEqual([REF_A, REF_B]);
        yield* source.resolve([REF_A]);
        expect(calls.releases.length).toBe(2);
        yield* TestClock.adjust(60_000);
        yield* source.resolve([REF_A]);
        expect(calls.releases.length).toBe(3);
      }),
  );

  it.effect(
    "reports grant-required for refs without an active grant and keeps others resolving",
    () =>
      Effect.gen(function* () {
        const { client } = fakeClient({ grants: [{ id: "g1", scope: REF_A, status: "active" }] });
        const index = yield* makeWardenGrantIndex(client);
        const source = yield* makeWardenMaterialSource(client, index);
        const resolved = yield* source.resolve([REF_A, REF_B]);
        expect(resolved.get(REF_A)?.ok).toBe(true);
        expect(resolved.get(REF_B)).toEqual({
          ok: false,
          reason: "warden-grant-required",
          message:
            "Pulse Go has no active grant for this credential. Issue and accept a grant-only grant in Pulse Go, then retry.",
        });
      }),
  );

  it.effect("maps a failed grant listing onto every ref", () =>
    Effect.gen(function* () {
      const client: PulseWardenClientShape = {
        callTool: () =>
          Effect.fail(new PulseWardenError("unauthorized", "Pulse Go rejected the token.", 401)),
        release: () => Effect.die("unreachable"),
      };
      const index = yield* makeWardenGrantIndex(client);
      const source = yield* makeWardenMaterialSource(client, index);
      const resolved = yield* source.resolve([REF_A, REF_B]);
      expect(resolved.get(REF_A)).toEqual({
        ok: false,
        reason: "warden-unauthorized",
        message: "Pulse Go rejected the token for this environment. Replace it in Settings.",
      });
      expect(resolved.get(REF_B)?.ok).toBe(false);
    }),
  );

  it.effect("maps a release failure onto only that ref", () =>
    Effect.gen(function* () {
      const { client } = fakeClient({
        grants: [
          { id: "g1", scope: REF_A, status: "active" },
          { id: "g2", scope: REF_B, status: "active" },
        ],
        release: (body) =>
          body.credentialRef === REF_B
            ? Effect.fail(new PulseWardenError("denied", "Project not allowed", 403))
            : Effect.succeed("ok"),
      });
      const index = yield* makeWardenGrantIndex(client);
      const source = yield* makeWardenMaterialSource(client, index);
      const resolved = yield* source.resolve([REF_A, REF_B]);
      expect(resolved.get(REF_A)).toEqual({ ok: true, material: "ok" });
      expect(resolved.get(REF_B)).toEqual({
        ok: false,
        reason: "warden-unauthorized",
        message: "Pulse Go denied the release: Project not allowed.",
      });
    }),
  );
});

describe("wardenFailure", () => {
  it("maps every client kind to a reason and pause copy", () => {
    expect(wardenFailure(new PulseWardenError("not-configured", "x"))).toEqual({
      reason: "warden-not-configured",
      message: "Configure Pulse Go Warden in Settings > MCP.",
    });
    expect(wardenFailure(new PulseWardenError("unavailable", "x"))).toEqual({
      reason: "warden-unavailable",
      message: "Pulse Go Warden is unreachable. Retry.",
    });
    expect(wardenFailure(new PulseWardenError("protocol", "x"))).toEqual({
      reason: "warden-unavailable",
      message: "Pulse Go Warden returned an unexpected response. Retry.",
    });
  });
});
