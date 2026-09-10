import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-1");
const makeFakeHttpServer = (hostname: string, port = 43123) =>
  HttpServer.HttpServer.of({
    address: { _tag: "TcpAddress", hostname, port },
    serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
  });
const fakeHttpServer = makeFakeHttpServer("127.0.0.1");
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});

const makeRegistry = (now: () => number, httpServer = fakeHttpServer) =>
  McpSessionRegistry.__testing
    .make({
      now,
      livenessWindowMs: 100,
    })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, httpServer),
      Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
      Effect.provide(NodeServices.layer),
    );

it.effect("stores only a token hash, resolves the bearer token, and revokes by thread", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-1");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    expect(issued.config.endpoint).toBe("http://127.0.0.1:43123/mcp");
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(token.length).toBeGreaterThan(20);

    const resolved = yield* registry.resolve(token);
    expect(resolved?.threadId).toBe(threadId);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token)).toBeUndefined();

    timestamp += 2_000;
  }),
);

it.effect("builds MCP endpoints from the bound server host", () =>
  Effect.gen(function* () {
    const cases = [
      ["100.64.0.40", "http://100.64.0.40:43123/mcp"],
      ["0.0.0.0", "http://127.0.0.1:43123/mcp"],
      ["localhost", "http://localhost:43123/mcp"],
      ["127.0.0.1", "http://127.0.0.1:43123/mcp"],
    ] as const;

    for (const [hostname, expectedEndpoint] of cases) {
      const registry = yield* makeRegistry(() => 1_000, makeFakeHttpServer(hostname));
      const issued = yield* registry.issue({
        threadId: ThreadId.make(`thread-${hostname}`),
        providerInstanceId: ProviderInstanceId.make("codex"),
      });
      expect(issued.config.endpoint).toBe(expectedEndpoint);
    }
  }),
);

it.effect("expires credentials once their session stops showing signs of life", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-2"),
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);

it.effect("keeps a credential alive across turns that never touch an MCP tool", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-3");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");

    // Well past the liveness window in total, but each turn reports in before
    // it lapses — this is the long-session case that used to lose the toolkit.
    for (let turn = 0; turn < 10; turn += 1) {
      timestamp += 99;
      yield* registry.touch(threadId);
    }

    expect((yield* registry.resolve(token))?.threadId).toBe(threadId);
  }),
);

it.effect("does not keep credentials of other threads alive", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-4"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");

    timestamp += 99;
    yield* registry.touch(ThreadId.make("thread-unrelated"));
    timestamp += 2;

    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);

it.effect(
  "binds Warden to trusted attempts independently of preview and aborts stale snapshots",
  () =>
    Effect.gen(function* () {
      const registry = yield* makeRegistry(() => 1_000);
      const threadId = ThreadId.make("warden-thread");
      const instanceId = ProviderInstanceId.make("codex");
      const issued = yield* registry.issue({
        threadId,
        providerInstanceId: instanceId,
        capabilities: new Set(["warden"]),
      });
      const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
      expect((yield* registry.resolve(token))?.capabilities).toEqual(new Set(["warden"]));
      expect((yield* registry.resolve(token))?.wardenAttempt).toBeUndefined();
      expect(
        yield* registry.beginAttempt(threadId, ProviderInstanceId.make("other")),
      ).toBeUndefined();
      const first = yield* registry.beginAttempt(threadId, instanceId);
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      const snapshot = yield* registry.resolve(token);
      expect(snapshot?.wardenAttempt?.id).toBe(first);
      expect(snapshot?.wardenAttempt?.signal.aborted).toBe(false);
      yield* registry.bindAttempt(threadId, first!, "turn-1");
      const second = yield* registry.beginAttempt(threadId, instanceId);
      expect(second).not.toBe(first);
      expect(snapshot?.wardenAttempt?.signal.aborted).toBe(true);
      yield* registry.bindAttempt(threadId, second!, "turn-2");
      yield* registry.endAttempt(threadId, first!);
      yield* registry.bindAttempt(threadId, first!, "turn-stale");
      yield* registry.endTurn(threadId, instanceId, "turn-1");
      expect((yield* registry.resolve(token))?.wardenAttempt?.id).toBe(second);
      yield* registry.endTurn(threadId, ProviderInstanceId.make("other"), "turn-2");
      expect((yield* registry.resolve(token))?.wardenAttempt?.id).toBe(second);
      const current = yield* registry.resolve(token);
      yield* registry.endTurn(threadId, instanceId, "turn-2");
      expect(current?.wardenAttempt?.signal.aborted).toBe(true);
      expect((yield* registry.resolve(token))?.wardenAttempt).toBeUndefined();
      // A late sendTurn return cannot resurrect a terminal attempt.
      yield* registry.bindAttempt(threadId, second!, "turn-2");
      expect((yield* registry.resolve(token))?.wardenAttempt).toBeUndefined();
    }),
);

it.effect("does not issue Warden attempts to preview-only credentials", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("preview-thread");
    const providerInstanceId = ProviderInstanceId.make("claude");
    yield* registry.issue({ threadId, providerInstanceId });
    expect(yield* registry.beginAttempt(threadId, providerInstanceId)).toBeUndefined();
  }),
);

it.effect("aborts Warden snapshots on revoke and credential expiry", () =>
  Effect.gen(function* () {
    let now = 1_000;
    const registry = yield* makeRegistry(() => now);
    const threadId = ThreadId.make("warden-expiry");
    const providerInstanceId = ProviderInstanceId.make("codex");
    for (const revoke of ["thread", "session", "all", "expiry"] as const) {
      const issued = yield* registry.issue({
        threadId,
        providerInstanceId,
        capabilities: new Set(["warden"]),
      });
      const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
      yield* registry.beginAttempt(threadId, providerInstanceId);
      const snapshot = yield* registry.resolve(token);
      if (revoke === "thread") yield* registry.revokeThread(threadId);
      if (revoke === "session")
        yield* registry.revokeProviderSession(issued.config.providerSessionId);
      if (revoke === "all") yield* registry.revokeAll;
      if (revoke === "expiry") now += 101;
      expect(yield* registry.resolve(token)).toBeUndefined();
      expect(snapshot?.wardenAttempt?.signal.aborted).toBe(true);
    }
  }),
);

it.effect("shares one trusted attempt across separate MCP and Warden-only CLI credentials", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1000);
    const threadId = ThreadId.make("shared-thread");
    const providerInstanceId = ProviderInstanceId.make("codex");
    const mcp = yield* registry.issue({
      threadId,
      providerInstanceId,
      capabilities: new Set(["preview", "warden"]),
    });
    const cli = yield* registry.issue({
      threadId,
      providerInstanceId,
      capabilities: new Set(["warden"]),
    });
    expect(mcp.config.authorizationHeader).not.toBe(cli.config.authorizationHeader);
    const token = (value: typeof mcp) => value.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const id = yield* registry.beginAttempt(threadId, providerInstanceId);
    const a = yield* registry.resolve(token(mcp));
    const b = yield* registry.resolve(token(cli));
    expect(a?.wardenAttempt?.id).toBe(id);
    expect(b?.wardenAttempt?.id).toBe(id);
    expect(b?.capabilities).toEqual(new Set(["warden"]));
    yield* registry.endAttempt(threadId, id!);
    expect(a?.wardenAttempt?.signal.aborted).toBe(true);
    expect(b?.wardenAttempt?.signal.aborted).toBe(true);
    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token(mcp))).toBeUndefined();
    expect(yield* registry.resolve(token(cli))).toBeUndefined();
  }),
);
