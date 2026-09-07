import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";
import * as ServerConfig from "../config.ts";
import { McpInvocationContext, type McpInvocationScope } from "../mcp/McpInvocationContext.ts";
import { registration } from "../mcp/toolkits/infrastructure.ts";
import { makeQueryCall, parseCatalog } from "./catalog.ts";
import { Infrastructure, layer } from "./Infrastructure.ts";

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const decodeMethod = Schema.decodeUnknownSync(Schema.Struct({ method: Schema.String }));
const token = "synthetic-mcp-token";
const invocation: McpInvocationScope = {
  environmentId: EnvironmentId.make("test-environment"),
  threadId: ThreadId.make("allowed-thread"),
  providerSessionId: "test-session",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(),
  issuedAt: 1,
};
const query = {
  id: "errors",
  label: "Worker errors",
  kind: "loki" as const,
  datasourceUid: "logs",
  expression: '{service_name="worker",deployment_environment_name="production"} |= "error"',
};
const target = {
  id: "techtraders-production",
  label: "TechTraders",
  stage: "production",
  service: "worker",
  repository: "techtraders",
  enabled: true,
  allowedThreadIds: ["allowed-thread"],
  mcpEndpoint: "https://grafana-mcp.example.test/mcp",
  tokenEnv: "TEST_INFRA_TOKEN",
  queries: [query],
};
const fixture = (targets: ReadonlyArray<unknown> = [target]) => json({ version: 1, targets });

it("rejects ambiguous, unsafe and unknown catalog fields", () => {
  for (const value of [
    fixture([target, target]),
    fixture([{ ...target, queries: [query, query] }]),
    fixture([{ ...target, mcpEndpoint: "http://remote.example/mcp" }]),
    fixture([{ ...target, mcpEndpoint: "https://user:password@example.test/mcp" }]),
    fixture([{ ...target, queries: [{ ...query, kind: "shell" }] }]),
    fixture([{ ...target, arbitraryTool: "deploy" }]),
    "{",
  ]) {
    expect(() => parseCatalog(value)).toThrow("Infrastructure configuration is invalid");
  }
});

it("maps saved queries to fixed read-only tools with limits", () => {
  expect(makeQueryCall(query, "start", "end", 60)).toMatchObject({
    name: "query_loki_logs",
    arguments: {
      limit: 100,
      stepSeconds: 30,
      startRfc3339: "start",
      endRfc3339: "end",
      logql: query.expression,
    },
  });
  expect(makeQueryCall({ ...query, kind: "prometheus" }, "start", "end", 1)).toMatchObject({
    name: "query_prometheus",
    arguments: { stepSeconds: 15, queryType: "range", expr: query.expression },
  });
});

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
const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-infrastructure-test-" });
const testLayer = layer.pipe(
  Layer.provideMerge(configLayer),
  Layer.provideMerge(NodeServices.layer),
);
const withScope = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(McpInvocationContext, invocation));

it.effect("defaults off, filters threads, and reloads revocation and invalid configuration", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { fs, file, service } = yield* setup;
      expect(yield* service.listTargets).toEqual({ targets: [] });
      yield* fs.writeFileString(file, fixture());
      const result = yield* service.listTargets;
      expect(result.targets).toHaveLength(1);
      expect(json(result)).not.toContain("mcpEndpoint");
      expect(json(result)).not.toContain("tokenEnv");
      expect(json(result)).not.toContain("expression");
      expect(
        yield* service.listTargets.pipe(
          Effect.provideService(McpInvocationContext, {
            ...invocation,
            threadId: ThreadId.make("other-thread"),
          }),
        ),
      ).toEqual({ targets: [] });
      yield* fs.writeFileString(file, fixture([{ ...target, allowedThreadIds: [] }]));
      expect(
        yield* service
          .query({ targetId: target.id, queryId: query.id, lookbackMinutes: 5 })
          .pipe(Effect.flip),
      ).toMatchObject({ code: "unavailable" });
      yield* fs.writeFileString(file, fixture([{ ...target, enabled: false }]));
      expect(yield* service.listTargets).toEqual({ targets: [] });
      expect(
        yield* service
          .query({ targetId: target.id, queryId: query.id, lookbackMinutes: 5 })
          .pipe(Effect.flip),
      ).toMatchObject({ code: "unavailable" });
      yield* fs.writeFileString(file, "invalid");
      expect(yield* service.listTargets.pipe(Effect.flip)).toMatchObject({ code: "configuration" });
    }),
  ).pipe(withScope, Effect.provide(testLayer)),
);

const requests: Array<{ method: string; body: unknown }> = [];
const responseBody = (id: number, result: unknown) => json({ jsonrpc: "2.0", id, result });
const fakeFetch = Object.assign(
  async (_url: string | URL | Request, init?: RequestInit) => {
    const bodyText =
      init?.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : String(init?.body ?? "");
    const body = bodyText ? decodeJson(bodyText) : undefined;
    requests.push({ method: init?.method ?? "GET", body });
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(init?.redirect).toBe("error");
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    const envelope = decodeMethod(body);
    if (envelope.method === "initialize")
      return new Response(
        responseBody(1, { protocolVersion: "2025-06-18", capabilities: { tools: {} } }),
        { headers: { "content-type": "application/json", "mcp-session-id": "synthetic-session" } },
      );
    expect(new Headers(init?.headers).get("mcp-session-id")).toBe("synthetic-session");
    if (envelope.method === "notifications/initialized") return new Response(null, { status: 202 });
    return new Response(
      `event: message\r\ndata: ${responseBody(2, { content: [{ type: "text", text: `worker error ${token} ${"x".repeat(25000)}` }] })}\r\n\r\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  },
  { preconnect: () => {} },
);

it.effect("executes a bounded query with source metadata, redaction and session cleanup", () =>
  Effect.scoped(
    Effect.gen(function* () {
      requests.length = 0;
      const { fs, file, service } = yield* setup;
      yield* fs.writeFileString(file, fixture());
      for (const minutes of [0, 61, 1.5]) {
        expect(
          yield* service
            .query({ targetId: target.id, queryId: query.id, lookbackMinutes: minutes })
            .pipe(Effect.flip),
        ).toMatchObject({ code: "unavailable" });
      }
      expect(requests).toHaveLength(0);
      const result = yield* service.query({
        targetId: target.id,
        queryId: query.id,
        lookbackMinutes: 5,
      });
      expect(result.target.stage).toBe("production");
      expect(Date.parse(result.endTime) - Date.parse(result.startTime)).toBe(300000);
      expect(result.text).toHaveLength(24000);
      expect(result.text).not.toContain(token);
      expect(result.outputTruncated).toBe(true);
      expect(requests[2]?.body).toMatchObject({
        method: "tools/call",
        params: { name: "query_loki_logs", arguments: { logql: query.expression, limit: 100 } },
      });
      expect(requests.at(-1)?.method).toBe("DELETE");
    }),
  ).pipe(
    withScope,
    Effect.provide(testLayer),
    Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ TEST_INFRA_TOKEN: token }),
    ),
  ),
);

it.effect("registers infrastructure tools with MCP and enforces thread access through calls", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      yield* fs.writeFileString(path.join(config.stateDir, "infrastructure.json"), fixture());
      const server = yield* McpServer.McpServer;
      const result = yield* server.callTool({ name: "infrastructure_list_targets", arguments: {} });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({ targets: [{ id: target.id }] });
      const missingCredential = yield* server
        .callTool({
          name: "infrastructure_query",
          arguments: { targetId: target.id, queryId: query.id, lookbackMinutes: 5 },
        })
        .pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})));
      expect(missingCredential.isError).toBe(true);
      const evidence = yield* server
        .callTool({
          name: "infrastructure_query",
          arguments: { targetId: target.id, queryId: query.id, lookbackMinutes: 5 },
        })
        .pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({ TEST_INFRA_TOKEN: token }),
          ),
          Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
        );
      expect(evidence.isError).toBe(false);
      expect(evidence.structuredContent).toMatchObject({
        target: { id: target.id, stage: "production" },
        queryId: query.id,
        outputTruncated: true,
      });
      const denied = yield* server
        .callTool({
          name: "infrastructure_query",
          arguments: { targetId: target.id, queryId: query.id, lookbackMinutes: 5 },
        })
        .pipe(
          Effect.provideService(McpInvocationContext, {
            ...invocation,
            threadId: ThreadId.make("denied"),
          }),
        );
      expect(denied.isError).toBe(true);
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
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  ),
);
