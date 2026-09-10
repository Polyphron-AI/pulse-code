// @effect-diagnostics nodeBuiltinImport:off - Test fixtures use native absolute certificate paths.
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type WardenUseState,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";
import * as NodePath from "node:path";
import { McpSchema, McpServer } from "effect/unstable/ai";
import * as ServerConfig from "../config.ts";
import { McpInvocationContext, type McpInvocationScope } from "../mcp/McpInvocationContext.ts";
import { registration } from "../mcp/toolkits/infrastructure.ts";
import { parseCatalog } from "./catalog.ts";
import { Infrastructure, make } from "./Infrastructure.ts";
import { WardenBroker } from "./WardenBroker.ts";
import { ServerSettingsService } from "../serverSettings.ts";

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const invocation: McpInvocationScope = {
  environmentId: EnvironmentId.make("test-environment"),
  threadId: ThreadId.make("allowed-thread"),
  providerSessionId: "test-session",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["warden"]),
  wardenAttempt: {
    id: "33333333-3333-4333-8333-333333333333",
    signal: new AbortController().signal,
  },
  issuedAt: 1,
};
const query = {
  id: "errors",
  label: "Worker errors",
  kind: "loki" as const,
  brokerQueryId: "ttdev-errors-v1",
  credentialRef: "urn:pulse:example:credential:grafana",
};
const target = {
  id: "techtraders-development",
  label: "TechTraders",
  stage: "development" as const,
  service: "worker",
  repository: "techtraders",
  enabled: true,
  allowedThreadIds: ["allowed-thread"],
  environmentId: "test-environment",
  brokerEndpoint: "https://warden.example.test",
  wardenAuthority: "example",
  clientCertificateFile: NodePath.resolve("missing-client.crt"),
  clientKeyFile: NodePath.resolve("missing-client.key"),
  caFile: NodePath.resolve("missing-ca.crt"),
  queries: [query],
};
const fixture = (targets: ReadonlyArray<unknown> = [target]) => json({ version: 3, targets });

it("rejects v1, credentials, expressions, ambiguous IDs and unsafe broker references", () => {
  expect(parseCatalog(fixture())).toHaveLength(1);
  for (const value of [
    json({ version: 1, targets: [] }),
    json({ version: 2, targets: [] }),
    fixture([target, target]),
    fixture([{ ...target, queries: [query, query] }]),
    ...[
      "http://localhost",
      "https://user:pass@example.test",
      "https://example.test/mcp",
      "https://example.test?secret=x",
    ].map((brokerEndpoint) => fixture([{ ...target, brokerEndpoint }])),
    fixture([{ ...target, clientKeyFile: "relative.key" }]),
    fixture([{ ...target, tokenEnv: "TOKEN" }]),
    fixture([{ ...target, mcpEndpoint: "https://grafana.test" }]),
    fixture([{ ...target, queries: [{ ...query, expression: "{job=foo}" }] }]),
    "{",
  ])
    expect(() => parseCatalog(value)).toThrow("Infrastructure configuration is invalid");
});

const calls: Array<unknown> = [];
let requestedState: typeof WardenUseState.Type = "ready";
const useId = "22222222-2222-4222-8222-222222222222";
const requestId = "11111111-1111-4111-8111-111111111111";
const digest = "a".repeat(64);
const useRef = `urn:pulse:example:use:${useId}`;
const snapshot = (id = requestId) => ({
  version: "pulse-warden/read-v1" as const,
  targetId: target.id,
  resourceRef: `urn:pulse:example:resource:${target.id}`,
  useId,
  useRef,
  requestId: id,
  state: requestedState,
  requestDigest: digest,
  expiresAt: 4070908800,
  revoked: false,
});
const broker = Layer.succeed(WardenBroker, {
  receipts: () =>
    Effect.succeed({
      version: "pulse-warden/read-v1" as const,
      useId,
      resourceRef: `urn:pulse:example:resource:${target.id}`,
      receipts: [],
      nextCursor: "",
    }),
  requestUse: (selected, saved, scope, minutes, id) => {
    calls.push({ selected, saved, scope, minutes, requestId: id });
    return Effect.succeed(snapshot(id));
  },
  useAction: (_selected, scope, input, action) => {
    calls.push({ scope, input, action });
    return Effect.succeed({
      ...snapshot(),
      state: "succeeded" as const,
      startTime: "2026-09-09T10:00:00Z",
      endTime: "2026-09-09T10:05:00Z",
      text: "redacted error",
      outputTruncated: false,
    });
  },
});
const settingsLayer = ServerSettingsService.layerTest({ enableAgentWardenAccess: true });
const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-infrastructure-test-" });
const testLayer = Layer.effect(Infrastructure, make).pipe(
  Layer.provide(broker),
  Layer.provideMerge(settingsLayer),
  Layer.provideMerge(configLayer),
  Layer.provideMerge(NodeServices.layer),
);
const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  return {
    fs,
    file: path.join(config.stateDir, "infrastructure.json"),
    service: yield* Infrastructure,
  };
});
const withScope = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(McpInvocationContext, invocation));

it.effect("defaults off and reloads thread, environment, disable and revocation policy", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { fs, file, service } = yield* setup;
      expect(yield* service.listTargets).toEqual({ targets: [] });
      yield* fs.writeFileString(file, fixture());
      const result = yield* service.listTargets;
      expect(result.targets).toHaveLength(1);
      for (const secret of ["brokerEndpoint", "clientKeyFile", "caFile", "brokerQueryId"])
        expect(json(result)).not.toContain(secret);
      for (const scope of [
        { ...invocation, threadId: ThreadId.make("other") },
        { ...invocation, environmentId: EnvironmentId.make("other") },
      ]) {
        expect(
          yield* service.listTargets.pipe(Effect.provideService(McpInvocationContext, scope)),
        ).toEqual({ targets: [] });
        expect(
          yield* service
            .query({ targetId: target.id, queryId: query.id, lookbackMinutes: 5 })
            .pipe(Effect.provideService(McpInvocationContext, scope), Effect.flip),
        ).toMatchObject({ code: "unavailable" });
      }
      for (const changed of [
        { ...target, allowedThreadIds: [] },
        { ...target, enabled: false },
      ]) {
        yield* fs.writeFileString(file, fixture([changed]));
        expect(yield* service.listTargets).toEqual({ targets: [] });
        expect(
          yield* service
            .query({ targetId: target.id, queryId: query.id, lookbackMinutes: 5 })
            .pipe(Effect.flip),
        ).toMatchObject({ code: "unavailable" });
      }
      yield* fs.writeFileString(file, "invalid");
      expect(yield* service.listTargets.pipe(Effect.flip)).toMatchObject({ code: "configuration" });
    }),
  ).pipe(withScope, Effect.provide(testLayer)),
);

it.effect(
  "uses trusted invocation and saved broker IDs, rejecting forged input without transport",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        calls.length = 0;
        const { fs, file, service } = yield* setup;
        yield* fs.writeFileString(file, fixture());
        const input = { targetId: target.id, queryId: query.id, lookbackMinutes: 5 };
        const invalidInputs = [
          ...[0, 61, 1.5].map((lookbackMinutes) => ({ ...input, lookbackMinutes })),
          { ...input, threadId: "forged" },
          { ...input, queryId: query.brokerQueryId },
        ];
        for (const invalid of invalidInputs)
          expect(yield* service.query(invalid).pipe(Effect.flip)).toMatchObject({
            code: "unavailable",
          });
        expect(calls).toHaveLength(0);
        const result = yield* service.query(input);
        expect(calls).toHaveLength(2);
        expect(calls[0]).toMatchObject({
          selected: target,
          saved: query,
          scope: invocation,
          minutes: 5,
        });
        expect(calls[1]).toMatchObject({
          scope: invocation,
          input: { targetId: target.id, useRef, expectedRequestDigest: digest },
          action: "execute",
        });
        expect(result).toMatchObject({
          useRef,
          state: "succeeded",
          text: "redacted error",
        });
        expect(json(result)).not.toContain("clientKeyFile");
      }),
    ).pipe(withScope, Effect.provide(testLayer)),
);

it.effect(
  "returns pending for convenience reads and resumes only an explicitly referenced use",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        calls.length = 0;
        requestedState = "pending_approval";
        const { fs, file, service } = yield* setup;
        yield* fs.writeFileString(file, fixture());
        const pending = yield* service.query({
          targetId: target.id,
          queryId: query.id,
          lookbackMinutes: 5,
        });
        expect(pending).toMatchObject({ state: "pending_approval", useRef, requestDigest: digest });
        expect(calls).toHaveLength(1);
        const resumed = yield* service.use(
          { targetId: target.id, useRef, expectedRequestDigest: digest },
          "execute",
        );
        expect(resumed.state).toBe("succeeded");
        expect(calls).toHaveLength(2);
      }),
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          requestedState = "ready";
        }),
      ),
      withScope,
      Effect.provide(testLayer),
    ),
);

it.effect("rechecks the live Warden setting after a credential has been issued", () =>
  Effect.scoped(
    Effect.gen(function* () {
      calls.length = 0;
      const { fs, file, service } = yield* setup;
      const settings = yield* ServerSettingsService;
      yield* fs.writeFileString(file, fixture());
      expect((yield* service.listTargets).targets).toHaveLength(1);
      yield* settings.updateSettings({ enableAgentWardenAccess: false });
      expect(yield* service.listTargets).toEqual({ targets: [] });
      expect(
        yield* service
          .use({ targetId: target.id, useRef, expectedRequestDigest: digest }, "execute")
          .pipe(Effect.flip),
      ).toMatchObject({ code: "unavailable" });
      expect(calls).toHaveLength(0);
    }),
  ).pipe(withScope, Effect.provide(testLayer)),
);

it.effect(
  "MCP registration exposes summaries and fails closed with missing certificate files",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfig.ServerConfig;
        yield* fs.writeFileString(path.join(config.stateDir, "infrastructure.json"), fixture());
        const server = yield* McpServer.McpServer;
        const result = yield* server.callTool({
          name: "infrastructure_list_targets",
          arguments: {},
        });
        expect(result.isError).toBe(false);
        expect(result.structuredContent).toMatchObject({ targets: [{ id: target.id }] });
        const missing = yield* server.callTool({
          name: "infrastructure_query",
          arguments: { targetId: target.id, queryId: query.id, lookbackMinutes: 5 },
        });
        expect(missing.isError).toBe(true);
        expect(json(missing)).not.toContain(target.clientKeyFile);
      }),
    ).pipe(
      withScope,
      Effect.provideService(McpSchema.McpServerClient, {
        clientId: 1,
        protocolVersion: "2025-06-18",
        initializePayload: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
        getClient: Effect.die("unused"),
      }),
      Effect.provide(
        registration.pipe(
          Layer.provideMerge(McpServer.McpServer.layer),
          Layer.provideMerge(configLayer),
          Layer.provideMerge(settingsLayer),
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
    ),
);
