import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as PulseMcpConfig from "./PulseMcpConfigService.ts";

const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mcp-config-test-" });
const secretLayer = ServerSecretStore.layer.pipe(Layer.provide(configLayer));
const pulseLayer = PulseMcpConfig.layer.pipe(
  Layer.provide(secretLayer),
  Layer.provide(configLayer),
);
const testLayer = Layer.mergeAll(configLayer, secretLayer, pulseLayer).pipe(
  Layer.provideMerge(NodeServices.layer),
);

const readiness = {
  supportsProvider: (provider: string) => provider === "codex" || provider === "claudeAgent",
  checkConnection: async () => ({ status: "unknown" as const }),
};

const addFixtures = Effect.fn(function* () {
  const service = yield* PulseMcpConfig.PulseMcpConfigService;
  yield* service.upsertConnection({
    id: "github",
    name: "GitHub",
    config: {
      transport: "http",
      url: "https://mcp.example.test/github",
      headers: {
        Authorization: { type: "secret", value: "Bearer private-token" },
        "X-Pulse": { type: "literal", value: "enabled" },
      },
    },
  });
  yield* service.upsertConnection({
    id: "local_docs",
    name: "Local docs",
    config: {
      transport: "stdio",
      command: "docs-mcp",
      args: ["--stdio"],
      env: { DOCS_TOKEN: { type: "secret", value: "private-docs-token" } },
    },
  });
  return service;
});

describe("PulseMcpConfigService", () => {
  it.effect(
    "keeps secrets out of durable configuration and materializes them only for a turn",
    () =>
      Effect.gen(function* () {
        const service = yield* addFixtures();
        const config = yield* ServerConfig.ServerConfig;
        const fs = yield* FileSystem.FileSystem;

        const persisted = yield* fs.readFileString(`${config.stateDir}/pulse-mcp.json`);
        expect(persisted).not.toContain("private-token");
        expect(persisted).not.toContain("private-docs-token");
        expect(persisted).toContain("pulse-mcp-connection-github");

        yield* service.setProviderDefault(ProviderInstanceId.make("codex_work"), ["github"]);
        const prepared = yield* service.prepareTurn(
          {
            turnId: "turn-1",
            provider: "codex",
            providerInstanceId: ProviderInstanceId.make("codex_work"),
            threadId: ThreadId.make("thread-1"),
          },
          readiness,
        );
        expect(prepared.connections[0]?.config).toEqual({
          transport: "http",
          url: "https://mcp.example.test/github",
          headers: { Authorization: "Bearer private-token", "X-Pulse": "enabled" },
        });
        expect(prepared.preflight.snapshot.selectionSource).toBe("default");
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("distinguishes an explicit empty override from reset to defaults", () =>
    Effect.gen(function* () {
      const service = yield* addFixtures();
      const instanceId = ProviderInstanceId.make("claude_work");
      const threadId = ThreadId.make("thread-empty");
      yield* service.setProviderDefault(instanceId, ["github"]);
      yield* service.setThreadOverride(threadId, []);

      const overridden = yield* service.prepareTurn(
        { turnId: "turn-2", provider: "claudeAgent", providerInstanceId: instanceId, threadId },
        readiness,
      );
      expect(overridden.preflight.snapshot).toMatchObject({
        selectedConnectionIds: [],
        selectionSource: "thread",
      });

      yield* service.resetThreadOverride(threadId);
      const reset = yield* service.prepareTurn(
        { turnId: "turn-3", provider: "claudeAgent", providerInstanceId: instanceId, threadId },
        readiness,
      );
      expect(reset.preflight.snapshot).toMatchObject({
        selectedConnectionIds: ["github"],
        selectionSource: "default",
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("freezes different selections for concurrent threads", () =>
    Effect.gen(function* () {
      const service = yield* addFixtures();
      const instanceId = ProviderInstanceId.make("codex_parallel");
      const firstThread = ThreadId.make("thread-a");
      const secondThread = ThreadId.make("thread-b");
      yield* Effect.all(
        [
          service.setThreadOverride(firstThread, ["github"]),
          service.setThreadOverride(secondThread, ["local_docs"]),
        ],
        { concurrency: "unbounded" },
      );

      const [first, second] = yield* Effect.all(
        [
          service.prepareTurn(
            {
              turnId: "turn-a",
              provider: "codex",
              providerInstanceId: instanceId,
              threadId: firstThread,
            },
            readiness,
          ),
          service.prepareTurn(
            {
              turnId: "turn-b",
              provider: "codex",
              providerInstanceId: instanceId,
              threadId: secondThread,
            },
            readiness,
          ),
        ],
        { concurrency: "unbounded" },
      );

      expect(first.preflight.snapshot.selectedConnectionIds).toEqual(["github"]);
      expect(second.preflight.snapshot.selectedConnectionIds).toEqual(["local_docs"]);
      expect(Object.isFrozen(first.preflight.snapshot.selectedConnectionIds)).toBe(true);
      expect(Object.isFrozen(first.connections)).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("does not read or rewrite the shared settings document", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const sentinel = '{"futureClientField":{"keep":true}}\n';
      yield* fs.writeFileString(config.settingsPath, sentinel);
      yield* addFixtures();
      expect(yield* fs.readFileString(config.settingsPath)).toBe(sentinel);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects duplicate persisted IDs through one canonical keyed entry", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      yield* service.upsertConnection({
        id: "same_id",
        name: "First",
        config: { transport: "http", url: "https://first.example.test" },
      });
      yield* service.upsertConnection({
        id: "same_id",
        name: "Replacement",
        config: { transport: "http", url: "https://second.example.test" },
      });
      const connections = yield* service.listConnections;
      expect(connections).toHaveLength(1);
      expect(connections[0]?.name).toBe("Replacement");
    }).pipe(Effect.provide(testLayer)),
  );
});
