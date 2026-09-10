import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { callGrafana } from "./GrafanaMcp.ts";

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const call = { name: "query_prometheus", arguments: {} };
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } },
};

it.effect("times out a stalled upstream request without polling", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const client = HttpClient.make(() =>
      Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
    );
    const fiber = yield* callGrafana("https://example.test/mcp", "synthetic-token", call).pipe(
      Effect.provideService(HttpClient.HttpClient, client),
      Effect.flip,
      Effect.forkChild,
    );
    yield* Deferred.await(started);
    yield* TestClock.adjust("21 seconds");
    expect(yield* Fiber.join(fiber)).toMatchObject({ code: "upstream" });
  }),
);

for (const [label, response] of [
  [
    "upstream tool errors",
    () =>
      new Response(
        json({
          jsonrpc: "2.0",
          id: 2,
          result: { isError: true, content: [{ type: "text", text: "secret upstream failure" }] },
        }),
      ),
  ],
  [
    "JSON-RPC errors",
    () =>
      new Response(json({ jsonrpc: "2.0", id: 2, error: { message: "secret upstream failure" } })),
  ],
  ["mismatched response IDs", () => new Response(json({ jsonrpc: "2.0", id: 3, result: {} }))],
  ["malformed JSON", () => new Response("not JSON: secret")],
  ["oversized responses", () => new Response("x".repeat(1_048_577))],
  [
    "HTTP redirects",
    () => new Response(null, { status: 302, headers: { location: "https://other.example" } }),
  ],
  ["HTTP authorization failures", () => new Response("secret", { status: 401 })],
] as const) {
  it.effect(`fails safely on ${label} and closes the MCP session`, () => {
    let posts = 0;
    let closed = false;
    const fetch = Object.assign(
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          closed = true;
          return new Response(null, { status: 204 });
        }
        posts++;
        if (posts === 1)
          return new Response(json(initialize), { headers: { "mcp-session-id": "test-session" } });
        if (posts === 2) return new Response(null, { status: 202 });
        return response();
      },
      { preconnect: () => {} },
    );
    return Effect.gen(function* () {
      const error = yield* callGrafana("https://example.test/mcp", "synthetic-token", call).pipe(
        Effect.flip,
      );
      expect(error.code).toBe("upstream");
      expect(error.message).not.toContain("secret");
      expect(closed).toBe(true);
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    );
  });
}

it.effect("accepts stateless JSON responses with structured evidence", () => {
  let posts = 0;
  const fetch = Object.assign(
    async () => {
      posts++;
      if (posts === 1) return new Response(json(initialize));
      if (posts === 2) return new Response(null, { status: 202 });
      return new Response(
        json({ jsonrpc: "2.0", id: 2, result: { content: [], structuredContent: { up: 1 } } }),
      );
    },
    { preconnect: () => {} },
  );
  return Effect.gen(function* () {
    expect(yield* callGrafana("https://example.test/mcp", "synthetic-token", call)).toEqual({
      text: '{"up":1}',
      outputTruncated: false,
    });
    expect(posts).toBe(3);
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
  );
});
