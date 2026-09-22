import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import {
  PulseWardenError,
  WARDEN_ISOLATED_EXECUTION_REQUIRED,
  type PulseWardenClientShape,
} from "./PulseWardenClient.ts";
import {
  makeWardenGrantIndex,
  makeWardenMaterialSource,
  wardenFailure,
} from "./PulseWardenMaterial.ts";

const REF_A = "urn:pulse:acme:credential:a";
const REF_B = "urn:pulse:acme:credential:b";

describe("WardenGrantIndex", () => {
  it.effect("retains metadata discovery and refreshes active grants after 30 seconds", () =>
    Effect.gen(function* () {
      let calls = 0;
      const client: PulseWardenClientShape = {
        callTool: () =>
          Effect.sync(() => {
            calls += 1;
            return {
              grants: [
                { id: "g1", scope: REF_A, status: "active" },
                { id: "g2", scope: REF_B, status: "pending" },
                { id: "g3", scope: "urn:pulse:acme:project:p", status: "active" },
                { id: "g4", scope: REF_B, status: "expired" },
              ],
            };
          }),
        release: () => Effect.die("release must never be called"),
      };
      const index = yield* makeWardenGrantIndex(client);
      expect([...(yield* index.active).keys()]).toEqual([REF_A]);
      yield* index.active;
      expect(calls).toBe(1);
      yield* TestClock.adjust(30_000);
      yield* index.active;
      expect(calls).toBe(2);
    }),
  );
});

describe("WardenMaterialSource", () => {
  it.effect("refuses injection on first use and retries without fetching or caching secrets", () =>
    Effect.gen(function* () {
      const client: PulseWardenClientShape = {
        callTool: () => Effect.die("grant discovery must not authorize injection"),
        release: () => Effect.die("raw release must never be called"),
      };
      const index = yield* makeWardenGrantIndex(client);
      const source = yield* makeWardenMaterialSource(client, index);
      const expected = {
        ok: false,
        reason: "warden-unavailable",
        message: WARDEN_ISOLATED_EXECUTION_REQUIRED,
      };
      const first = yield* source.resolve([REF_A, REF_B, REF_A]);
      expect(first.size).toBe(2);
      expect(first.get(REF_A)).toEqual(expected);
      expect(first.get(REF_B)).toEqual(expected);
      yield* TestClock.adjust(60_000);
      expect((yield* source.resolve([REF_A])).get(REF_A)).toEqual(expected);
      expect((yield* source.resolve([])).size).toBe(0);
    }),
  );
});

describe("wardenFailure", () => {
  it("maps client failures to existing pause reasons", () => {
    expect(wardenFailure(new PulseWardenError("not-configured", "x")).reason).toBe(
      "warden-not-configured",
    );
    expect(wardenFailure(new PulseWardenError("unauthorized", "x")).reason).toBe(
      "warden-unauthorized",
    );
    expect(wardenFailure(new PulseWardenError("unavailable", "x")).reason).toBe(
      "warden-unavailable",
    );
    expect(wardenFailure(new PulseWardenError("protocol", "x")).reason).toBe("warden-unavailable");
  });
});
