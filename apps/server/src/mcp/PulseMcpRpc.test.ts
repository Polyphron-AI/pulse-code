import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as PulseMcpConfig from "./PulseMcpConfigService.ts";
import { pulseMcpHandlers } from "./PulseMcpRpc.ts";

const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mcp-rpc-test-" });
const secretLayer = ServerSecretStore.layer.pipe(Layer.provide(configLayer));
const pulseLayer = PulseMcpConfig.layer.pipe(
  Layer.provide(secretLayer),
  Layer.provide(configLayer),
);
const testLayer = Layer.mergeAll(configLayer, secretLayer, pulseLayer).pipe(
  Layer.provideMerge(NodeServices.layer),
);

describe("Pulse MCP RPC bridge", () => {
  it.effect("redacts secrets and preserves them through explicit edits", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const rpc = pulseMcpHandlers(service);
      yield* rpc.upsert({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test",
          headers: { Authorization: { type: "secret", value: "private-token" } },
        },
      });
      yield* rpc.upsert({
        id: "github",
        name: "Renamed",
        config: {
          transport: "http",
          url: "https://example.test/v2",
          headers: { Authorization: { type: "retain-secret" } },
        },
      });
      const listed = yield* rpc.list();
      expect(listed).toEqual([
        {
          id: "github",
          name: "Renamed",
          config: {
            transport: "http",
            url: "https://example.test/v2",
            headers: { Authorization: { type: "secret", configured: true } },
          },
        },
      ]);
      const authorization =
        listed[0]?.config.transport === "http" ? listed[0].config.headers.Authorization : undefined;
      expect(authorization).toEqual({ type: "secret", configured: true });
      expect(authorization).not.toHaveProperty("value");
      expect(authorization).not.toHaveProperty("secretRef");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("preserves absent versus explicit empty selections", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const rpc = pulseMcpHandlers(service);
      const providerInstanceId = ProviderInstanceId.make("codex_work");
      const threadId = ThreadId.make("thread-1");
      expect(yield* rpc.getProviderDefault({ providerInstanceId })).toEqual({});
      expect(yield* rpc.setProviderDefault({ providerInstanceId, connectionIds: [] })).toEqual({
        connectionIds: [],
      });
      expect(yield* rpc.getProviderDefault({ providerInstanceId })).toEqual({ connectionIds: [] });
      yield* rpc.setThreadOverride({ threadId, connectionIds: [] });
      expect(yield* rpc.getThreadOverride({ threadId })).toEqual({ connectionIds: [] });
      expect(yield* rpc.resetThreadOverride({ threadId })).toEqual({});
      expect(yield* rpc.getThreadOverride({ threadId })).toEqual({});
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("returns a stable redacted error", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const error = yield* pulseMcpHandlers(service)
        .upsert({
          id: "bad",
          name: "Bad",
          config: { transport: "http", url: "file:///private/path" },
        })
        .pipe(Effect.flip);
      expect(error._tag).toBe("PulseMcpError");
      expect(error.message).not.toContain("file:///private/path");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("returns only safe provider-native MCP inventory metadata", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const rpc = pulseMcpHandlers(service, {
        readNativeMcpInventory: () =>
          Effect.succeed([
            { name: "github", status: "ready" as const },
            { name: "private", status: "auth-required" as const },
          ]),
      } as never);
      expect(
        yield* rpc.nativeInventory({
          threadId: ThreadId.make("thread-native"),
          providerInstanceId: ProviderInstanceId.make("claude"),
        }),
      ).toEqual({
        status: "available",
        servers: [
          { name: "github", status: "ready" },
          { name: "private", status: "auth-required" },
        ],
      });
    }).pipe(Effect.provide(testLayer)),
  );
});
