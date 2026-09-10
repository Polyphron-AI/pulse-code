// @effect-diagnostics nodeBuiltinImport:off - This opt-in parity test owns a disposable Go child and synthetic certificates.
import { expect, it } from "@effect/vitest";
import { NodeHttpServer } from "@effect/platform-node";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  WardenUseResult,
  WardenReceiptsResult,
  canonicalWardenReadBinding,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer } from "effect/unstable/ai";
import { HttpRouter } from "effect/unstable/http";
import * as McpHttpServer from "../mcp/McpHttpServer.ts";
import * as McpSessionRegistry from "../mcp/McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "../mcp/PreviewAutomationBroker.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import * as NodeUtil from "node:util";
import * as ServerConfig from "../config.ts";
import { McpInvocationContext, type McpInvocationScope } from "../mcp/McpInvocationContext.ts";
import { registration } from "../mcp/toolkits/infrastructure.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { requestBroker } from "./WardenBroker.ts";

const Fixture = Schema.Struct({
  event: Schema.Literal("ready"),
  endpoint: Schema.String,
  clientCertificateFile: Schema.String,
  clientKeyFile: Schema.String,
  caFile: Schema.String,
  operatorCertificateFile: Schema.String,
  operatorKeyFile: Schema.String,
  environmentId: Schema.String,
  threadId: Schema.String,
  attemptId: Schema.String,
  operatorPrincipalId: Schema.String,
});
const Review = Schema.Struct({
  request: Schema.Unknown,
  authority: Schema.Unknown,
  requestDigest: Schema.String,
});
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const decodeFixture = Schema.decodeUnknownEffect(Fixture);
const decodeUse = Schema.decodeUnknownEffect(WardenUseResult);
const decodeReceipts = Schema.decodeUnknownEffect(WardenReceiptsResult);
const decodeReview = Schema.decodeUnknownEffect(Review);
const goRepo = process.env.WARDEN_GO_REPO;

it.effect.skipIf(!goRepo)(
  "proves registered Pulse MCP and CLI through the real Go broker and synthetic Grafana",
  () =>
    Effect.gen(function* () {
      const temp = yield* Effect.promise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-warden-parity-")),
      );
      const cliExecutable = NodePath.join(temp, "pulse-cli.exe");
      const executable = NodePath.join(temp, "fixture.exe");
      try {
        yield* Effect.promise(() =>
          NodeUtil.promisify(NodeChildProcess.execFile)(
            process.env.WARDEN_GO_BINARY ?? "go",
            ["build", "-o", executable, "./tests/fixtures/warden"],
            {
              cwd: goRepo,
              windowsHide: true,
              timeout: 120000,
              maxBuffer: 1048576,
            },
          ),
        );
        yield* Effect.promise(() =>
          NodeUtil.promisify(NodeChildProcess.execFile)(
            process.env.WARDEN_GO_BINARY ?? "go",
            ["build", "-o", cliExecutable, "./cmd/cli"],
            { cwd: goRepo, windowsHide: true, timeout: 120000, maxBuffer: 1048576 },
          ),
        );
        const child = NodeChildProcess.spawn(executable, [], {
          cwd: temp,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
          signal: AbortSignal.timeout(120000),
        });
        const exited = new Promise<number | null>((resolve, reject) => {
          child.once("exit", resolve);
          child.once("error", reject);
        });
        let stderr = "";
        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString().slice(0, 4096);
        });
        const lines = NodeReadline.createInterface({ input: child.stdout });
        const iterator = lines[Symbol.asyncIterator]();
        try {
          const ready = yield* Effect.promise(() => iterator.next());
          if (ready.done) throw new Error(`Go fixture exited before readiness: ${stderr}`);
          const fixture = yield* decodeFixture(parseJson(ready.value));
          const operatorTls = {
            cert: yield* Effect.promise(() => NodeFSP.readFile(fixture.operatorCertificateFile)),
            key: yield* Effect.promise(() => NodeFSP.readFile(fixture.operatorKeyFile)),
            ca: yield* Effect.promise(() => NodeFSP.readFile(fixture.caFile)),
          };
          const controller = new AbortController();
          const invocation: McpInvocationScope = {
            environmentId: EnvironmentId.make(fixture.environmentId),
            threadId: ThreadId.make(fixture.threadId),
            providerSessionId: "synthetic-session",
            providerInstanceId: ProviderInstanceId.make("codex"),
            issuedAt: 1,
            capabilities: new Set(["warden"]),
            wardenAttempt: { id: fixture.attemptId, signal: controller.signal },
          };
          const target = {
            id: "dev",
            label: "Synthetic Grafana",
            stage: "development",
            service: "fixture",
            repository: "fixture",
            enabled: true,
            allowedThreadIds: [fixture.threadId],
            environmentId: fixture.environmentId,
            brokerEndpoint: fixture.endpoint,
            wardenAuthority: "example",
            clientCertificateFile: fixture.clientCertificateFile,
            clientKeyFile: fixture.clientKeyFile,
            caFile: fixture.caFile,
            queries: [
              {
                id: "errors",
                label: "Synthetic errors",
                kind: "loki",
                brokerQueryId: "errors",
                credentialRef: "urn:pulse:example:credential:grafana",
              },
            ],
          };
          const configLayer = ServerConfig.layerTest(process.cwd(), {
            prefix: "warden-parity-state-",
          });
          const settingsLayer = ServerSettingsService.layerTest({ enableAgentWardenAccess: true });
          const program = Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const config = yield* ServerConfig.ServerConfig;
            yield* fs.writeFileString(
              NodePath.join(config.stateDir, "infrastructure.json"),
              json({ version: 3, targets: [target] }),
            );
            const server = yield* McpServer.McpServer;
            const call = (name: string, arguments_: Record<string, unknown>) =>
              Effect.gen(function* () {
                const result = yield* server.callTool({ name, arguments: arguments_ });
                expect(result.isError).toBe(false);
                expect(json(result)).not.toContain("SYNTHETIC-WARDEN-PARITY-CANARY");
                expect(json(result)).not.toContain(fixture.clientKeyFile);
                return result.structuredContent;
              });
            const request = {
              targetId: "dev",
              queryId: "errors",
              lookbackMinutes: 5,
              requestId: "11111111-1111-4111-8111-111111111111",
            };
            const pending = yield* call("warden_use_request", request).pipe(
              Effect.flatMap(decodeUse),
            );
            expect(pending.state).toBe("pending_approval");
            const again = yield* call("warden_use_request", request).pipe(
              Effect.flatMap(decodeUse),
            );
            expect(again).toEqual(pending);
            const input = {
              targetId: "dev",
              useRef: pending.useRef,
              expectedRequestDigest: pending.requestDigest,
            };
            const reviewRaw = yield* Effect.promise(() =>
              requestBroker(
                new URL(`/v1/uses/${pending.useId}/review`, fixture.endpoint),
                operatorTls,
                undefined,
                new AbortController().signal,
                "GET",
              ),
            );
            const review = yield* decodeReview(reviewRaw);
            const digest = NodeCrypto.createHash("sha256")
              .update(canonicalWardenReadBinding(review.request, review.authority))
              .digest("hex");
            expect(digest).toBe(pending.requestDigest);
            yield* Effect.promise(() =>
              requestBroker(
                new URL(`/v1/uses/${pending.useId}/approve`, fixture.endpoint),
                operatorTls,
                { expectedRequestDigest: digest },
                new AbortController().signal,
              ),
            );
            const ready = yield* call("warden_use_status", input).pipe(Effect.flatMap(decodeUse));
            expect(ready.state).toBe("ready");
            const output = yield* call("warden_use_execute", input).pipe(Effect.flatMap(decodeUse));
            expect(output.state).toBe("succeeded");
            expect(output.text).toContain("[redacted]");
            expect(output.requestDigest).toBe(digest);
            const replay = yield* call("warden_use_execute", input).pipe(Effect.flatMap(decodeUse));
            expect(replay.resultUnavailable).toBe(true);
            expect(replay.text).toBeUndefined();
            const revoked = yield* call("warden_use_revoke", input).pipe(Effect.flatMap(decodeUse));
            expect(revoked).toMatchObject({
              state: "succeeded",
              revoked: true,
              requestDigest: digest,
            });
            const receipts = yield* call("warden_receipts_list", input).pipe(
              Effect.flatMap(decodeReceipts),
            );
            expect(receipts.receipts.map((receipt) => receipt.action)).toEqual(
              expect.arrayContaining(["request", "approve", "execute", "revoke"]),
            );
            expect(
              receipts.receipts.find((receipt) => receipt.action === "approve")?.principalId,
            ).toBe(fixture.operatorPrincipalId);
            expect(receipts.receipts.every((receipt) => receipt.requestDigest === digest)).toBe(
              true,
            );
            controller.abort();
            const stale = yield* server.callTool({ name: "warden_use_status", arguments: input });
            expect(stale.isError).toBe(true);
          });
          try {
            yield* Effect.scoped(program).pipe(
              Effect.provideService(McpInvocationContext, invocation),
              Effect.provideService(McpSchema.McpServerClient, {
                clientId: 1,
                protocolVersion: "2025-06-18",
                initializePayload: {
                  protocolVersion: "2025-06-18",
                  capabilities: {},
                  clientInfo: { name: "warden-parity", version: "1" },
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
            );

            const cliProgram = Effect.gen(function* () {
              const fs = yield* FileSystem.FileSystem;
              const config = yield* ServerConfig.ServerConfig;
              yield* fs.writeFileString(
                NodePath.join(config.stateDir, "infrastructure.json"),
                json({ version: 3, targets: [target] }),
              );
              yield* HttpRouter.serve(McpHttpServer.layer, {
                disableListenLog: true,
                disableLogger: true,
              }).pipe(Layer.build);
              const registry = yield* McpSessionRegistry.McpSessionRegistry;
              const issued = yield* registry.issue({
                threadId: ThreadId.make(fixture.threadId),
                providerInstanceId: ProviderInstanceId.make("codex"),
                capabilities: new Set(["warden"]),
              });
              const attempt = yield* registry.beginAttempt(
                ThreadId.make(fixture.threadId),
                ProviderInstanceId.make("codex"),
              );
              expect(attempt).toBeDefined();
              const identityFile = NodePath.join(temp, "cli-identity.json");
              yield* fs.writeFileString(
                identityFile,
                json({
                  endpoint: issued.config.endpoint,
                  authorizationHeader: issued.config.authorizationHeader,
                }),
              );
              yield* fs.chmod(identityFile, 0o600);
              const cli = (args: ReadonlyArray<string>) =>
                Effect.promise(
                  () =>
                    new Promise<{ code: number; data: unknown }>((resolve, reject) => {
                      NodeChildProcess.execFile(
                        cliExecutable,
                        ["warden", ...args, "--identity-file", identityFile, "--format", "json"],
                        { cwd: temp, windowsHide: true, timeout: 20000, maxBuffer: 1048576 },
                        (error, stdout, stderr) => {
                          if (error && typeof error.code !== "number") {
                            reject(error);
                            return;
                          }
                          try {
                            expect(stdout).not.toContain("SYNTHETIC-WARDEN-PARITY-CANARY");
                            expect(stdout + stderr).not.toContain(
                              issued.config.authorizationHeader,
                            );
                            resolve({
                              code: typeof error?.code === "number" ? error.code : 0,
                              data: parseJson(stdout),
                            });
                          } catch (cause) {
                            reject(cause);
                          }
                        },
                      );
                    }),
                );
              const requested = yield* cli([
                "use",
                "request",
                "--target",
                "dev",
                "--query",
                "errors",
                "--request-id",
                "22222222-2222-4222-8222-222222222222",
                "--lookback-minutes",
                "5",
              ]);
              expect(requested.code).toBe(3);
              const pending = yield* decodeUse(requested.data);
              expect(pending.state).toBe("pending_approval");
              const pendingExecution = yield* cli([
                "use",
                "execute",
                "--target",
                "dev",
                "--use-ref",
                pending.useRef,
                "--digest",
                pending.requestDigest,
              ]);
              expect(pendingExecution.code).toBe(3);
              expect(pendingExecution.data).toMatchObject({
                state: "pending_approval",
                requestDigest: pending.requestDigest,
              });
              const review = yield* Effect.promise(() =>
                requestBroker(
                  new URL(`/v1/uses/${pending.useId}/review`, fixture.endpoint),
                  operatorTls,
                  undefined,
                  new AbortController().signal,
                  "GET",
                ),
              ).pipe(Effect.flatMap(decodeReview));
              expect(
                NodeCrypto.createHash("sha256")
                  .update(canonicalWardenReadBinding(review.request, review.authority))
                  .digest("hex"),
              ).toBe(pending.requestDigest);
              yield* Effect.promise(() =>
                requestBroker(
                  new URL(`/v1/uses/${pending.useId}/approve`, fixture.endpoint),
                  operatorTls,
                  { expectedRequestDigest: pending.requestDigest },
                  new AbortController().signal,
                ),
              );
              const scopeArgs = [
                "--target",
                "dev",
                "--use-ref",
                pending.useRef,
                "--digest",
                pending.requestDigest,
              ];
              const result = yield* cli(["use", "execute", ...scopeArgs]);
              expect(result.code).toBe(0);
              const output = yield* decodeUse(result.data);
              expect(output.state).toBe("succeeded");
              expect(output.text).toContain("[redacted]");
              const retry = yield* cli(["use", "execute", ...scopeArgs]);
              expect(retry.code).toBe(0);
              expect(retry.data).toMatchObject({ state: "succeeded", resultUnavailable: true });
              const receipts = yield* cli(["receipts", "list", ...scopeArgs]);
              expect(receipts.code).toBe(0);
              const checked = yield* decodeReceipts(receipts.data);
              expect(
                checked.receipts.some(
                  (receipt) =>
                    receipt.action === "approve" &&
                    receipt.principalId === fixture.operatorPrincipalId,
                ),
              ).toBe(true);
              const revoked = yield* cli(["use", "revoke", ...scopeArgs]);
              expect(revoked.data).toMatchObject({ state: "succeeded", revoked: true });
              yield* registry.endAttempt(ThreadId.make(fixture.threadId), attempt!);
              const stale = yield* cli(["use", "status", ...scopeArgs]);
              expect(stale.code).not.toBe(0);
              yield* registry.revokeAll;
            });
            const registryLayer = McpSessionRegistry.layer.pipe(
              Layer.provideMerge(NodeHttpServer.layerTest),
              Layer.provide(
                Layer.succeed(ServerEnvironment.ServerEnvironment, {
                  getEnvironmentId: Effect.succeed(EnvironmentId.make(fixture.environmentId)),
                  getDescriptor: Effect.die("unused"),
                }),
              ),
            );
            yield* Effect.scoped(cliProgram).pipe(
              Effect.provide(
                Layer.mergeAll(PreviewAutomationBroker.layer, configLayer, settingsLayer).pipe(
                  Layer.provideMerge(registryLayer),
                  Layer.provideMerge(NodeServices.layer),
                ),
              ),
            );
          } finally {
            operatorTls.key.fill(0);
          }
          child.stdin.write("stats\n");
          const stats = yield* Effect.promise(() => iterator.next());
          expect(stats.done).toBe(false);
          expect(parseJson(stats.value ?? "{}")).toEqual({ effects: 2 });
        } finally {
          child.stdin.end();
          yield* Effect.promise(() => exited);
          lines.close();
        }
      } finally {
        yield* Effect.promise(() => NodeFSP.rm(temp, { recursive: true, force: true }));
      }
    }),
  150000,
);
