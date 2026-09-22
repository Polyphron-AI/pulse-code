// @effect-diagnostics preferSchemaOverJson:off -- Fixtures exercise Pulse Go's JSON-RPC wire boundary.
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makePulseWardenClient, wardenArray, type PulseWardenError } from "./PulseWardenClient.ts";

const failureOf = Effect.fn(function* (effect: Effect.Effect<unknown, PulseWardenError>) {
  const result = yield* Effect.result(effect);
  if (result._tag === "Failure") return result.failure;
  return yield* Effect.die("expected Warden refusal");
});

const access = { origin: "https://go.example.test/", pat: "fixture-token" };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("PulseWardenClient", () => {
  it.effect("posts JSON-RPC metadata calls with authorization and decodes structured content", () =>
    Effect.gen(function* () {
      const calls: { url: string; init: RequestInit | undefined }[] = [];
      const client = makePulseWardenClient(access, {
        fetch: async (url, init) => {
          calls.push({ url: String(url), init });
          return jsonResponse({ result: { structuredContent: { principal: { id: "u1" } } } });
        },
      });
      expect(yield* client.callTool("warden_capabilities", {})).toEqual({
        principal: { id: "u1" },
      });
      expect(calls[0]?.url).toBe("https://go.example.test/mcp");
      expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
        "Bearer fixture-token",
      );
      expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "warden_capabilities", arguments: {} },
      });
    }),
  );

  it.effect("decodes text-only metadata responses", () =>
    Effect.gen(function* () {
      const client = makePulseWardenClient(access, {
        fetch: async () =>
          jsonResponse({ result: { content: [{ type: "text", text: '[{"id":"g1"}]' }] } }),
      });
      expect(yield* client.callTool("warden_grants_list", {})).toEqual([{ id: "g1" }]);
    }),
  );

  it.effect("refuses legacy release without contacting even a material-capable server", () =>
    Effect.gen(function* () {
      let calls = 0;
      const client = makePulseWardenClient(access, {
        fetch: async () => {
          calls += 1;
          return jsonResponse({
            credentialRef: "c",
            material: "fixture-material",
            requestDigest: "digest",
          });
        },
      });
      const request = { requestId: "r", grantId: "g", credentialRef: "c", scope: "c" };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const error = yield* client.release(request).pipe(Effect.flip);
        expect(error.kind).toBe("denied");
        expect(error.message).toContain("approved operation");
        expect(error.message).not.toContain("fixture-material");
        expect(error.message).not.toContain(access.pat);
      }
      expect(calls).toBe(0);
    }),
  );

  it.effect("classifies HTTP failures without exposing the access token", () =>
    Effect.gen(function* () {
      for (const [status, kind] of [
        [401, "unauthorized"],
        [403, "denied"],
        [503, "unavailable"],
      ] as const) {
        const client = makePulseWardenClient(access, {
          fetch: async () => jsonResponse({ error: "refused" }, status),
        });
        const error = yield* failureOf(client.callTool("warden_capabilities", {}));
        expect(error.kind).toBe(kind);
        expect(error.message).not.toContain(access.pat);
      }
    }),
  );

  it.effect("classifies malformed and denied tool responses", () =>
    Effect.gen(function* () {
      for (const [body, kind] of [
        ["not json", "protocol"],
        [
          JSON.stringify({
            result: { isError: true, content: [{ type: "text", text: "Denied" }] },
          }),
          "denied",
        ],
      ] as const) {
        const client = makePulseWardenClient(access, { fetch: async () => new Response(body) });
        expect((yield* failureOf(client.callTool("warden_capabilities", {}))).kind).toBe(kind);
      }
    }),
  );

  it.effect("maps network failures to unavailable", () =>
    Effect.gen(function* () {
      const client = makePulseWardenClient(access, {
        fetch: async () => {
          throw new Error("network failed");
        },
      });
      expect((yield* failureOf(client.callTool("warden_capabilities", {}))).kind).toBe(
        "unavailable",
      );
    }),
  );

  it.effect("aborts a stalled transport at the configured deadline", () =>
    Effect.gen(function* () {
      const client = makePulseWardenClient(access, {
        timeoutMs: 10,
        fetch: (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error("missing request deadline"));
              return;
            }
            if (signal.aborted) {
              reject(signal.reason);
              return;
            }
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      });
      expect((yield* failureOf(client.callTool("warden_capabilities", {}))).kind).toBe(
        "unavailable",
      );
    }),
  );

  it("reads a bare array or keyed array", () => {
    expect(wardenArray([1], "grants")).toEqual([1]);
    expect(wardenArray({ grants: [2] }, "grants")).toEqual([2]);
    expect(() => wardenArray({ other: [] }, "grants")).toThrow();
  });
});
