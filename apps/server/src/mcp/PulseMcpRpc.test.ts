import * as NodeServices from "@effect/platform-node/NodeServices";
// @effect-diagnostics preferSchemaOverJson:off -- These assertions inspect redacted RPC values.

import { ProjectId, ProviderInstanceId, PulseMcpWardenError, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as PulseMcpConfig from "./PulseMcpConfigService.ts";
import { pulseMcpHandlers } from "./PulseMcpRpc.ts";
import { PulseWardenError, type PulseWardenClientShape } from "./PulseWardenClient.ts";

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
      const projectId = ProjectId.make("project-1");
      expect(yield* rpc.getProjectDefault({ projectId, providerInstanceId })).toEqual({});
      expect(
        yield* rpc.setProjectDefault({ projectId, providerInstanceId, connectionIds: [] }),
      ).toEqual({ connectionIds: [] });
      expect(yield* rpc.getProjectDefault({ projectId, providerInstanceId })).toEqual({
        connectionIds: [],
      });
      expect(yield* rpc.resetProjectDefault({ projectId, providerInstanceId })).toEqual({});
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

const REF = "urn:pulse:acme:credential:gh-token";

const fakeWarden = (input: {
  readonly capabilities?: unknown;
  readonly credentials?: unknown;
  readonly grants?: unknown;
  readonly fail?: PulseWardenError;
}): PulseWardenClientShape => ({
  callTool: (name) => {
    if (input.fail) return Effect.fail(input.fail);
    if (name === "warden_capabilities") return Effect.succeed(input.capabilities ?? {});
    if (name === "warden_credentials_list") return Effect.succeed(input.credentials ?? []);
    if (name === "warden_grants_list") return Effect.succeed(input.grants ?? []);
    return Effect.die(`unexpected ${name}`);
  },
  release: () => Effect.die("unreachable"),
});

describe("Pulse MCP Warden RPC", () => {
  it.effect("exposes warden values publicly and settings without the PAT", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const rpc = pulseMcpHandlers(service);
      yield* rpc.upsert({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test",
          headers: { Authorization: { type: "warden", credentialRef: REF } },
        },
      });
      const listed = yield* rpc.list();
      expect(
        listed[0]?.config.transport === "http" && listed[0].config.headers.Authorization,
      ).toEqual({
        type: "warden",
        credentialRef: REF,
      });
      const settings = yield* rpc.wardenSet({
        origin: "https://go.example.test",
        pat: "pat-secret",
      });
      expect(settings).toEqual({ origin: "https://go.example.test", patConfigured: true });
      expect(JSON.stringify(yield* rpc.wardenGet())).not.toContain("pat-secret");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "tests the connection, records the principal, and lists credentials with grant state",
    () =>
      Effect.gen(function* () {
        const service = yield* PulseMcpConfig.PulseMcpConfigService;
        const rpc = pulseMcpHandlers(service, undefined, undefined, {
          wardenClient: () =>
            fakeWarden({
              capabilities: { principal: { id: "u1", name: "Ops bot" } },
              credentials: {
                credentials: [
                  {
                    credentialRef: REF,
                    resourceRef: "urn:pulse:acme:resource:gh",
                    queryRefs: [],
                    available: true,
                  },
                  {
                    credentialRef: "urn:pulse:acme:credential:other",
                    resourceRef: "urn:pulse:acme:resource:o",
                    queryRefs: [],
                    available: false,
                  },
                ],
              },
              grants: {
                grants: [
                  { id: "g1", scope: REF, status: "active", expiresAt: "2030-01-01T00:00:00Z" },
                  { id: "g2", scope: "urn:pulse:acme:credential:other", status: "pending" },
                ],
              },
            }),
        });
        yield* rpc.wardenSet({ origin: "https://go.example.test", pat: "pat" });
        expect(yield* rpc.wardenTest()).toEqual({ principal: { id: "u1", name: "Ops bot" } });
        expect((yield* rpc.wardenGet()).principal).toEqual({ id: "u1", name: "Ops bot" });
        expect(yield* rpc.wardenListCredentials()).toEqual([
          {
            credentialRef: REF,
            resourceRef: "urn:pulse:acme:resource:gh",
            available: true,
            grant: { status: "active", expiresAt: "2030-01-01T00:00:00Z" },
          },
          {
            credentialRef: "urn:pulse:acme:credential:other",
            resourceRef: "urn:pulse:acme:resource:o",
            available: false,
            grant: { status: "pending" },
          },
        ]);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("returns typed warden errors for missing configuration and rejected tokens", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const unconfigured = pulseMcpHandlers(service, undefined, undefined, {
        wardenClient: () => fakeWarden({}),
      });
      const missing = yield* Effect.exit(unconfigured.wardenTest());
      expect(Exit.isFailure(missing)).toBe(true);
      const error = Exit.isFailure(missing) ? missing.cause.reasons[0] : undefined;
      expect(
        error?._tag === "Fail" && Schema.is(PulseMcpWardenError)(error.error) && error.error.kind,
      ).toBe("not-configured");
      yield* unconfigured.wardenSet({ origin: "https://go.example.test", pat: "pat-secret" });
      const rejected = pulseMcpHandlers(service, undefined, undefined, {
        wardenClient: () =>
          fakeWarden({
            fail: new PulseWardenError("unauthorized", "Pulse Go rejected the token.", 401),
          }),
      });
      const exit = yield* Effect.exit(rejected.wardenListCredentials());
      const failure = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
      expect(
        failure?._tag === "Fail" &&
          Schema.is(PulseMcpWardenError)(failure.error) &&
          failure.error.kind,
      ).toBe("unauthorized");
      expect(JSON.stringify(exit)).not.toContain("pat-secret");
    }).pipe(Effect.provide(testLayer)),
  );
});
