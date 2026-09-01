// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { HostProcessExecutablePath, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { checkOmpProviderStatus, OMP_MODEL_CATALOG_TIMEOUT_MS } from "../Layers/OmpProvider.ts";
import { makeOmpAcpRuntime } from "./OmpAcpSupport.ts";

interface MockInvocation {
  readonly args: ReadonlyArray<string>;
  readonly pid: number;
}

interface MockFixture {
  readonly directory: string;
  readonly wrapperPath: string;
  readonly argsLogPath: string;
  readonly environmentLogPath: string;
  readonly requestLogPath: string;
}

const MockInvocationSchema = Schema.Struct({
  args: Schema.Array(Schema.String),
  pid: Schema.Number,
});
const MockEnvironmentSchema = Schema.Struct({
  OMP_PROFILE: Schema.String,
  PI_PROFILE: Schema.String,
  PI_CODING_AGENT_DIR: Schema.String,
  OPENAI_API_KEY_PRESENT: Schema.Boolean,
  ORDINARY_VALUE: Schema.String,
});
const LoggedRequestSchema = Schema.Struct({
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Unknown),
});
const decodeMockInvocation = Schema.decodeUnknownSync(Schema.fromJsonString(MockInvocationSchema));
const decodeMockEnvironment = Schema.decodeUnknownSync(
  Schema.fromJsonString(MockEnvironmentSchema),
);
const decodeLoggedRequest = Schema.decodeUnknownSync(Schema.fromJsonString(LoggedRequestSchema));
const encodeUnknownJson = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

function shellQuote(value: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const makeMockFixture = Effect.fn("makeMockFixture")(function* () {
  const platform = yield* HostProcessPlatform;
  const executablePath = yield* HostProcessExecutablePath;
  return yield* Effect.sync(() => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-omp-boundary-"));
    const mockAgentPath = NodeURL.fileURLToPath(
      new URL("../../../scripts/acp-mock-agent.ts", import.meta.url),
    );
    const wrapperPath = NodePath.join(
      directory,
      platform === "win32" ? "omp-mock.cmd" : "omp-mock.sh",
    );
    const command = `${shellQuote(executablePath, platform)} ${shellQuote(mockAgentPath, platform)}`;
    const script =
      platform === "win32"
        ? `@echo off\r\n${command} %*\r\nexit /b %ERRORLEVEL%\r\n`
        : `#!/bin/sh\nexec ${command} "$@"\n`;
    NodeFS.writeFileSync(wrapperPath, script, "utf8");
    if (platform !== "win32") {
      NodeFS.chmodSync(wrapperPath, 0o755);
    }
    return {
      directory,
      wrapperPath,
      argsLogPath: NodePath.join(directory, "args.ndjson"),
      environmentLogPath: NodePath.join(directory, "environment.ndjson"),
      requestLogPath: NodePath.join(directory, "requests.ndjson"),
    } satisfies MockFixture;
  });
});

function readInvocations(path: string): ReadonlyArray<MockInvocation> {
  return NodeFS.readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => decodeMockInvocation(line));
}

function invocationWasLogged(path: string, expectedArgs: ReadonlyArray<string>): boolean {
  if (!NodeFS.existsSync(path)) {
    return false;
  }
  try {
    return readInvocations(path).some(
      (invocation) =>
        invocation.args.length === expectedArgs.length &&
        invocation.args.every((arg, index) => arg === expectedArgs[index]),
    );
  } catch {
    return false;
  }
}

function waitForInvocation(
  fixture: MockFixture,
  expectedArgs: ReadonlyArray<string>,
): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    let completed = false;
    const watcher = NodeFS.watch(fixture.directory, () => {
      if (!completed && invocationWasLogged(fixture.argsLogPath, expectedArgs)) {
        completed = true;
        watcher.close();
        resume(Effect.void);
      }
    });
    watcher.once("error", (error) => {
      if (!completed) {
        completed = true;
        watcher.close();
        resume(Effect.die(error));
      }
    });
    if (invocationWasLogged(fixture.argsLogPath, expectedArgs)) {
      completed = true;
      watcher.close();
      resume(Effect.void);
    }
    return Effect.sync(() => watcher.close());
  });
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function withFixture<A, E, R>(
  use: (fixture: MockFixture) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const fixture = yield* makeMockFixture();
    return yield* use(fixture).pipe(
      Effect.ensuring(
        Effect.sync(() => NodeFS.rmSync(fixture.directory, { recursive: true, force: true })),
      ),
    );
  });
}

describe("OMP process boundary", () => {
  it("allows both built-in and extension model discovery within the production timeout", () => {
    expect(OMP_MODEL_CATALOG_TIMEOUT_MS).toBe(35_000);
  });

  it.effect("uses the documented ACP args, initialize capabilities, and agent auth", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const secret = "omp-boundary-secret-value";
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const started = yield* Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* makeOmpAcpRuntime({
              ompSettings: { binaryPath: fixture.wrapperPath },
              runtimeMode: "approval-required",
              childProcessSpawner: spawner,
              cwd: fixture.directory,
              agentDir: NodePath.join(fixture.directory, "agent"),
              environment: {
                OPENAI_API_KEY: secret,
                OMP_PROFILE: "ambient-omp-profile",
                pi_profile: "ambient-pi-profile",
                pi_coding_agent_dir: "ambient-agent-dir",
                T3_ACP_REQUEST_LOG_PATH: fixture.requestLogPath,
                T3_OMP_CLI_ARGS_LOG_PATH: fixture.argsLogPath,
                T3_OMP_ENV_LOG_PATH: fixture.environmentLogPath,
                T3_OMP_ORDINARY_VALUE: "preserved",
              },
              clientInfo: { name: "pulse-code-test", version: "0.0.0" },
            });
            return yield* runtime.start();
          }),
        );

        expect(started.sessionId).toBe("mock-session-1");
        const [invocation] = readInvocations(fixture.argsLogPath);
        expect(invocation?.args).toEqual(["acp", "--approval-mode", "always-ask"]);
        expect(invocation && processIsAlive(invocation.pid)).toBe(false);
        expect(
          decodeMockEnvironment(NodeFS.readFileSync(fixture.environmentLogPath, "utf8")),
        ).toEqual({
          OMP_PROFILE: "",
          PI_PROFILE: "",
          PI_CODING_AGENT_DIR: NodePath.join(fixture.directory, "agent"),
          OPENAI_API_KEY_PRESENT: true,
          ORDINARY_VALUE: "preserved",
        });

        const requestLog = NodeFS.readFileSync(fixture.requestLogPath, "utf8");
        const requests = requestLog
          .trim()
          .split("\n")
          .map((line) => decodeLoggedRequest(line));
        expect(requests.find((request) => request.method === "initialize")?.params).toEqual({
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
            elicitation: { form: {} },
          },
          clientInfo: { name: "pulse-code-test", version: "0.0.0" },
        });
        expect(requests.find((request) => request.method === "authenticate")?.params).toEqual({
          methodId: "agent",
        });
        expect(requestLog).not.toContain(secret);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect("cleans up an OMP child when ACP startup fails without exposing credentials", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const secret = "omp-startup-secret-value";
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const error = yield* Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* makeOmpAcpRuntime({
              ompSettings: { binaryPath: fixture.wrapperPath },
              runtimeMode: "auto",
              childProcessSpawner: spawner,
              cwd: fixture.directory,
              agentDir: NodePath.join(fixture.directory, "agent"),
              environment: {
                ANTHROPIC_API_KEY: secret,
                T3_ACP_FAIL_INITIALIZE: "1",
                T3_ACP_REQUEST_LOG_PATH: fixture.requestLogPath,
                T3_OMP_CLI_ARGS_LOG_PATH: fixture.argsLogPath,
              },
              clientInfo: { name: "pulse-code-test", version: "0.0.0" },
            });
            return yield* runtime.start().pipe(Effect.flip);
          }),
        );

        const [invocation] = readInvocations(fixture.argsLogPath);
        expect(invocation?.args).toEqual(["acp", "--approval-mode", "always-ask"]);
        expect(invocation && processIsAlive(invocation.pid)).toBe(false);
        expect(String(error)).not.toContain(secret);
        expect(NodeFS.readFileSync(fixture.requestLogPath, "utf8")).not.toContain(secret);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect(
    "bounds scope cleanup when the OMP child ignores graceful termination",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const startedAt = yield* Clock.currentTimeMillis;
          const pid = yield* Effect.scoped(
            Effect.gen(function* () {
              const runtime = yield* makeOmpAcpRuntime({
                ompSettings: { binaryPath: fixture.wrapperPath },
                runtimeMode: "approval-required",
                childProcessSpawner: spawner,
                cwd: fixture.directory,
                agentDir: NodePath.join(fixture.directory, "agent"),
                environment: {
                  T3_ACP_IGNORE_TERMINATION: "1",
                  T3_OMP_CLI_ARGS_LOG_PATH: fixture.argsLogPath,
                },
                clientInfo: { name: "pulse-code-test", version: "0.0.0" },
              });
              yield* runtime.start();
              return readInvocations(fixture.argsLogPath)[0]!.pid;
            }),
          );
          const elapsedMillis = (yield* Clock.currentTimeMillis) - startedAt;

          expect(processIsAlive(pid)).toBe(false);
          expect(elapsedMillis).toBeLessThan(5_000);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    10_000,
  );

  it.effect("reports an OMP spawn failure without exposing credentials", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const secret = "omp-spawn-secret-value";
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const error = yield* Effect.scoped(
          makeOmpAcpRuntime({
            ompSettings: { binaryPath: NodePath.join(fixture.directory, "missing-omp") },
            runtimeMode: "approval-required",
            childProcessSpawner: spawner,
            cwd: fixture.directory,
            agentDir: NodePath.join(fixture.directory, "agent"),
            environment: { OPENAI_API_KEY: secret },
            clientInfo: { name: "pulse-code-test", version: "0.0.0" },
          }).pipe(Effect.flip),
        );

        expect(error._tag).toBe("AcpSpawnError");
        expect(String(error)).not.toContain(secret);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect(
    "uses only `models --json` for catalog discovery and terminates a timed-out child",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const secret = "omp-catalog-secret-value";
          const statusFiber = yield* checkOmpProviderStatus(
            { enabled: true, binaryPath: fixture.wrapperPath },
            {
              cwd: fixture.directory,
              agentDir: NodePath.join(fixture.directory, "agent"),
              environment: {
                OPENROUTER_API_KEY: secret,
                T3_OMP_CLI_ARGS_LOG_PATH: fixture.argsLogPath,
                T3_OMP_MODELS_HANG: "1",
              },
            },
          ).pipe(Effect.forkChild);

          yield* waitForInvocation(fixture, ["models", "--json"]).pipe(TestClock.withLive);
          yield* TestClock.adjust("35 seconds");
          yield* TestClock.adjust("1 second");
          const snapshot = yield* Fiber.join(statusFiber);

          expect(snapshot).toMatchObject({
            installed: true,
            status: "error",
            version: "1.2.3",
            models: [],
          });
          expect(snapshot.message).toContain("timed out");
          expect(encodeUnknownJson(snapshot)).not.toContain(secret);
          expect(snapshot.message).toContain("35000ms");

          const invocations = readInvocations(fixture.argsLogPath);
          expect(invocations.map((invocation) => invocation.args)).toEqual([
            ["--version"],
            ["models", "--json"],
          ]);
          expect(invocations.some((invocation) => invocation.args[0] === "acp")).toBe(false);
          expect(processIsAlive(invocations[1]!.pid)).toBe(false);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    5_000,
  );

  it.effect(
    "accepts a valid catalog that arrives after the former four-second timeout",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const startedAt = yield* Clock.currentTimeMillis;
          const snapshot = yield* checkOmpProviderStatus(
            { enabled: true, binaryPath: fixture.wrapperPath },
            {
              cwd: fixture.directory,
              agentDir: NodePath.join(fixture.directory, "agent"),
              environment: {
                T3_OMP_MODELS_DELAY_MS: "4200",
                T3_OMP_MODELS_JSON: encodeUnknownJson({
                  models: [
                    {
                      selector: "provider/delayed-model",
                      name: "Delayed Model",
                      reasoning: false,
                      thinking: null,
                    },
                  ],
                }),
              },
            },
          );
          const elapsedMillis = (yield* Clock.currentTimeMillis) - startedAt;

          expect(snapshot).toMatchObject({
            installed: true,
            status: "ready",
            version: "1.2.3",
            models: [{ slug: "provider/delayed-model", name: "Delayed Model" }],
          });
          expect(elapsedMillis).toBeGreaterThanOrEqual(4_000);
          expect(elapsedMillis).toBeLessThan(9_000);
        }).pipe(TestClock.withLive, Effect.provide(NodeServices.layer)),
      ),
    10_000,
  );

  it.effect("keeps command stderr and credentials out of failed snapshots", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const secret = "omp-status-secret-value";
        const snapshot = yield* checkOmpProviderStatus(
          { enabled: true, binaryPath: fixture.wrapperPath },
          {
            cwd: fixture.directory,
            agentDir: NodePath.join(fixture.directory, "agent"),
            environment: {
              OPENAI_API_KEY: secret,
              T3_OMP_CLI_ARGS_LOG_PATH: fixture.argsLogPath,
              T3_OMP_MODELS_EXIT_CODE: "7",
              T3_OMP_MODELS_STDERR: secret,
            },
          },
        );

        expect(snapshot).toMatchObject({ status: "error", models: [] });
        expect(snapshot.message).toContain("catalog command failed");
        expect(encodeUnknownJson(snapshot)).not.toContain(secret);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect("returns accurate ready, malformed, and empty catalog snapshots", () =>
    Effect.gen(function* () {
      const ready = yield* withFixture((fixture) =>
        checkOmpProviderStatus(
          { enabled: true, binaryPath: fixture.wrapperPath },
          {
            cwd: fixture.directory,
            agentDir: NodePath.join(fixture.directory, "agent"),
            environment: {
              T3_OMP_MODELS_JSON: encodeUnknownJson({
                models: [
                  {
                    selector: "provider/model:exact",
                    name: "Exact Model",
                    reasoning: true,
                    thinking: ["low", "high"],
                  },
                ],
              }),
            },
          },
        ),
      );
      expect(ready).toMatchObject({
        installed: true,
        status: "ready",
        version: "1.2.3",
        models: [{ slug: "provider/model:exact", name: "Exact Model" }],
      });

      const malformed = yield* withFixture((fixture) =>
        checkOmpProviderStatus(
          { enabled: true, binaryPath: fixture.wrapperPath },
          {
            cwd: fixture.directory,
            agentDir: NodePath.join(fixture.directory, "agent"),
            environment: { T3_OMP_MODELS_JSON: '{"models":' },
          },
        ),
      );
      expect(malformed).toMatchObject({
        installed: true,
        status: "error",
        version: "1.2.3",
        models: [],
      });
      expect(malformed.message).toContain("malformed");

      const empty = yield* withFixture((fixture) =>
        checkOmpProviderStatus(
          { enabled: true, binaryPath: fixture.wrapperPath },
          {
            cwd: fixture.directory,
            agentDir: NodePath.join(fixture.directory, "agent"),
            environment: { T3_OMP_MODELS_JSON: '{"models":[]}' },
          },
        ),
      );
      expect(empty).toMatchObject({
        installed: true,
        status: "error",
        version: "1.2.3",
        models: [],
      });
      expect(empty.message).toContain("returned no models");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
