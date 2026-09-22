// @effect-diagnostics nodeBuiltinImport:off -- The HTTP fixture owns a local Node server.

import * as NodeHttp from "node:http";
import type * as NodeNet from "node:net";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { makePulseWardenClient, PulseWardenError, wardenArray } from "./PulseWardenClient.ts";

interface Seen {
  readonly path: string;
  readonly authorization: string | undefined;
  readonly body: unknown;
}

const withServer = async (
  handler: (request: Seen, response: NodeHttp.ServerResponse) => void,
  run: (origin: string, seen: Seen[]) => Promise<void>,
) => {
  const seen: Seen[] = [];
  const server = NodeHttp.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      const record: Seen = {
        path: request.url ?? "",
        authorization: request.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      };
      seen.push(record);
      handler(record, response);
    });
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as NodeNet.AddressInfo).port));
  });
  try {
    await run(`http://127.0.0.1:${port}`, seen);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const json = (response: NodeHttp.ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const failureOf = async <A>(effect: Effect.Effect<A, PulseWardenError>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const reason = exit.cause.reasons.find((entry) => entry._tag === "Fail");
  const error = reason?._tag === "Fail" ? reason.error : undefined;
  if (!(error instanceof PulseWardenError)) throw new Error("expected PulseWardenError");
  return error;
};

describe("PulseWardenClient", () => {
  it("posts a JSON-RPC tools/call with the bearer token and returns structured content", () =>
    withServer(
      (_, response) =>
        json(response, 200, {
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text: '{"principal":{"id":"u1","name":"Ops"}}' }],
            structuredContent: { principal: { id: "u1", name: "Ops" } },
          },
        }),
      async (origin, seen) => {
        const client = makePulseWardenClient({ origin, pat: "pat-secret" });
        const result = await Effect.runPromise(client.callTool("warden_capabilities", {}));
        expect(result).toEqual({ principal: { id: "u1", name: "Ops" } });
        expect(seen[0]?.path).toBe("/mcp");
        expect(seen[0]?.authorization).toBe("Bearer pat-secret");
        expect(seen[0]?.body).toMatchObject({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "warden_capabilities", arguments: {} },
        });
      },
    ));

  it("falls back to parsing text content when structuredContent is absent", () =>
    withServer(
      (_, response) =>
        json(response, 200, {
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: '[{"id":"g1"}]' }] },
        }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        expect(await Effect.runPromise(client.callTool("warden_grants_list", {}))).toEqual([
          { id: "g1" },
        ]);
      },
    ));

  it("maps HTTP 401 to unauthorized without echoing the token", () =>
    withServer(
      (_, response) => json(response, 401, { error: "unauthorized" }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat-secret" });
        const error = await failureOf(client.callTool("warden_capabilities", {}));
        expect(error.kind).toBe("unauthorized");
        expect(error.message).not.toContain("pat-secret");
      },
    ));

  it("maps 503 warden_unavailable and network failures to unavailable", async () => {
    await withServer(
      (_, response) => json(response, 503, { error: "warden_unavailable" }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        expect((await failureOf(client.callTool("warden_capabilities", {}))).kind).toBe(
          "unavailable",
        );
      },
    );
    const closed = makePulseWardenClient({ origin: "http://127.0.0.1:1", pat: "pat" });
    expect((await failureOf(closed.callTool("warden_capabilities", {}))).kind).toBe("unavailable");
  });

  it("maps other 4xx to denied with the server message and malformed JSON to protocol", async () => {
    await withServer(
      (_, response) =>
        json(response, 403, { error: "invalid_project_id", message: "Project not allowed" }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        const error = await failureOf(
          client.release({ requestId: "r", grantId: "g", credentialRef: "c", scope: "c" }),
        );
        expect(error.kind).toBe("denied");
        expect(error.message).toBe("Project not allowed");
      },
    );
    await withServer(
      (_, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("not json");
      },
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        expect((await failureOf(client.callTool("warden_capabilities", {}))).kind).toBe("protocol");
      },
    );
  });

  it("posts a release and returns the material", () =>
    withServer(
      (request, response) =>
        request.path === "/api/warden/release"
          ? json(response, 200, {
              credentialRef: "urn:pulse:acme:credential:gh",
              material: "ghp_material",
              requestDigest: "sha256:abc",
            })
          : json(response, 404, {}),
      async (origin, seen) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        const released = await Effect.runPromise(
          client.release({
            requestId: "req-1",
            grantId: "grant-1",
            credentialRef: "urn:pulse:acme:credential:gh",
            scope: "urn:pulse:acme:credential:gh",
          }),
        );
        expect(released.material).toBe("ghp_material");
        expect(seen[0]?.body).toEqual({
          requestId: "req-1",
          grantId: "grant-1",
          credentialRef: "urn:pulse:acme:credential:gh",
          scope: "urn:pulse:acme:credential:gh",
        });
      },
    ));

  it("times out slow calls as unavailable", () =>
    withServer(
      () => {
        // Never responds, so the client timeout is what ends the call.
      },
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" }, { timeoutMs: 50 });
        expect((await failureOf(client.callTool("warden_capabilities", {}))).kind).toBe(
          "unavailable",
        );
      },
    ));

  it("reads a bare array or a keyed array", () => {
    expect(wardenArray([1], "grants")).toEqual([1]);
    expect(wardenArray({ grants: [2] }, "grants")).toEqual([2]);
    expect(() => wardenArray({ other: [] }, "grants")).toThrow();
  });
});
