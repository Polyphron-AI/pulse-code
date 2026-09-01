// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceEnvironment,
  ProviderInstanceId,
  type ProviderInstanceConfigMap,
  type ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import { HostProcessExecutablePath, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { createModelSelection } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { OMP_TEXT_GENERATION_ACP_ARGS } from "../acp/OmpAcpSupport.ts";
import { BUILT_IN_DRIVERS } from "../builtInDrivers.ts";
import { deriveProviderInstanceConfigMap } from "../Layers/ProviderInstanceRegistryHydration.ts";
import { makeProviderInstanceRegistry } from "../Layers/ProviderInstanceRegistryLive.ts";
import { NoOpProviderEventLoggers, ProviderEventLoggers } from "../Layers/ProviderEventLoggers.ts";
import { ProviderVersionCache } from "../providerMaintenance.ts";
import { OmpDriver } from "./OmpDriver.ts";

interface MockFixture {
  readonly directory: string;
  readonly wrapperPath: string;
  readonly projectA: string;
  readonly projectB: string;
}

interface MockInvocation {
  readonly args: ReadonlyArray<string>;
  readonly pid: number;
}

interface MockEnvironment {
  readonly cwd: string;
  readonly PI_CODING_AGENT_DIR?: string;
  readonly PI_CODING_AGENT_SESSION_DIR?: string;
  readonly OPENAI_API_KEY_PRESENT: boolean;
  readonly ORDINARY_VALUE?: string;
}

const TEST_EPOCH = DateTime.makeUnsafe("1970-01-01T00:00:00.000Z");
const OMP_KIND = ProviderDriverKind.make("omp");
const decodeEnvironment = Schema.decodeSync(ProviderInstanceEnvironment);
const encodeUnknownJson = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

function shellQuote(value: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

const makeFixture = Effect.acquireRelease(
  Effect.gen(function* () {
    const platform = yield* HostProcessPlatform;
    const executablePath = yield* HostProcessExecutablePath;
    return yield* Effect.sync(() => {
      const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-omp-driver-"));
      const wrapperPath = NodePath.join(directory, platform === "win32" ? "omp.cmd" : "omp.sh");
      const mockAgentPath = NodeURL.fileURLToPath(
        new URL("../../../scripts/acp-mock-agent.ts", import.meta.url),
      );
      const command = `${shellQuote(executablePath, platform)} ${shellQuote(mockAgentPath, platform)}`;
      NodeFS.writeFileSync(
        wrapperPath,
        platform === "win32"
          ? `@echo off\r\n${command} %*\r\nexit /b %ERRORLEVEL%\r\n`
          : `#!/bin/sh\nexec ${command} "$@"\n`,
        "utf8",
      );
      if (platform !== "win32") NodeFS.chmodSync(wrapperPath, 0o755);
      const projectA = NodePath.join(directory, "project-a");
      const projectB = NodePath.join(directory, "project-b");
      NodeFS.mkdirSync(projectA);
      NodeFS.mkdirSync(projectB);
      return { directory, wrapperPath, projectA, projectB } satisfies MockFixture;
    });
  }),
  (fixture) =>
    Effect.sync(() => NodeFS.rmSync(fixture.directory, { recursive: true, force: true })),
);

function readJsonLines<A>(path: string): ReadonlyArray<A> {
  if (!NodeFS.existsSync(path)) return [];
  const content = NodeFS.readFileSync(path, "utf8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as A) : [];
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function providerEnvironment(values: Readonly<Record<string, string>>) {
  return decodeEnvironment(
    Object.entries(values).map(([name, value]) => ({
      name,
      value,
      sensitive: name.includes("KEY") || name.includes("TOKEN"),
    })),
  );
}

function instanceEnvironment(
  fixture: MockFixture,
  label: "a" | "b",
  overrides: Readonly<Record<string, string>> = {},
) {
  return providerEnvironment({
    T3_ACP_OMP_MODE: "1",
    T3_OMP_CLI_ARGS_LOG_PATH: NodePath.join(fixture.directory, `${label}-args.ndjson`),
    T3_OMP_ENV_LOG_PATH: NodePath.join(fixture.directory, `${label}-env.ndjson`),
    T3_OMP_MODELS_JSON: encodeUnknownJson({
      models: [
        {
          selector: "openai/gpt-5",
          name: "GPT-5",
          reasoning: true,
          thinking: ["low", "high"],
        },
      ],
    }),
    T3_ACP_PROMPT_RESPONSE_TEXT: encodeUnknownJson({ title: `Title ${label.toUpperCase()}` }),
    T3_OMP_ORDINARY_VALUE: `selected-${label}`,
    OPENAI_API_KEY: `provider-key-${label}`,
    ...overrides,
  });
}

function waitForSnapshot(
  getSnapshot: Effect.Effect<ServerProvider>,
  predicate: (snapshot: ServerProvider) => boolean,
  remaining = 300,
): Effect.Effect<ServerProvider> {
  return Effect.gen(function* () {
    const snapshot = yield* getSnapshot;
    if (predicate(snapshot)) return snapshot;
    if (remaining <= 0) {
      return yield* Effect.die(new Error(`Timed out waiting for OMP snapshot: ${snapshot.status}`));
    }
    yield* Effect.sleep("10 millis").pipe(TestClock.withLive);
    return yield* waitForSnapshot(getSnapshot, predicate, remaining - 1);
  });
}

const BackgroundPolicyAlwaysRunLayer = Layer.mock(BackgroundPolicy.BackgroundPolicy)({
  reportClientActivity: () => Effect.void,
  removeRpcClient: () => Effect.void,
  reportHostPowerState: () => Effect.void,
  snapshot: Effect.succeed({
    hostPower: {
      source: "unknown",
      idle: "unknown",
      idleSeconds: null,
      locked: "unknown",
      suspended: false,
      onBattery: "unknown",
      lowPowerMode: "unknown",
      thermalState: "unknown",
      stale: true,
      updatedAt: TEST_EPOCH,
    },
    leases: [],
    activeForegroundLeaseCount: 0,
    activeScopeKeys: [],
    shouldRunOpportunisticWork: true,
    updatedAt: TEST_EPOCH,
  }),
  streamChanges: Stream.empty,
  hasDemand: () => Effect.succeed(true),
  shouldRunScopeWork: () => Effect.succeed(true),
  shouldRunOpportunisticWork: Effect.succeed(true),
});

const TestHttpClientLive = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ version: "1.2.4" }))),
  ),
);

const testLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-omp-driver-test-",
}).pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(BackgroundPolicyAlwaysRunLayer),
  Layer.provideMerge(ServerSettingsService.layerTest({ enableProviderUpdateChecks: false })),
  Layer.provideMerge(TestHttpClientLive),
  Layer.provideMerge(Layer.succeed(ProviderEventLoggers, NoOpProviderEventLoggers)),
);

describe("OmpDriver registration", () => {
  it("is a multi-instance first-party driver and hydrates the legacy OMP slot", () => {
    expect(OmpDriver.driverKind).toBe(OMP_KIND);
    expect(OmpDriver.metadata).toEqual({
      displayName: "Oh My Pi",
      supportsMultipleInstances: true,
    });
    expect(OmpDriver.defaultConfig()).toEqual({ enabled: true, binaryPath: "omp" });
    expect(BUILT_IN_DRIVERS).toContain(OmpDriver);
    const defaultId = ProviderInstanceId.make("omp");
    expect(deriveProviderInstanceConfigMap(DEFAULT_SERVER_SETTINGS)[defaultId]?.driver).toBe(
      OMP_KIND,
    );
  });
});

it.layer(testLayer)("OmpDriver", (it) => {
  it.effect("captures independent identity, closures, maintenance, and registry entries", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const customId = ProviderInstanceId.make("omp_custom");
        const defaultId = ProviderInstanceId.make("omp_default");
        const customBinary = "C:\\tools\\omp-custom.exe";
        const custom = yield* OmpDriver.create({
          instanceId: customId,
          displayName: "OMP custom",
          accentColor: "#123456",
          environment: providerEnvironment({ OPENAI_API_KEY: "driver-secret" }),
          enabled: false,
          config: { enabled: false, binaryPath: customBinary },
        });
        const standard = yield* OmpDriver.create({
          instanceId: defaultId,
          displayName: undefined,
          accentColor: undefined,
          environment: [],
          enabled: false,
          config: OmpDriver.defaultConfig(),
        });

        expect(custom.adapter).not.toBe(standard.adapter);
        expect(custom.textGeneration).not.toBe(standard.textGeneration);
        expect(custom.snapshot).not.toBe(standard.snapshot);
        expect(custom.continuationIdentity).toEqual({
          driverKind: OMP_KIND,
          continuationKey: "omp:instance:omp_custom",
        });
        expect(custom.snapshot.maintenanceCapabilities).toEqual({
          provider: OMP_KIND,
          packageName: "@oh-my-pi/pi-coding-agent",
          update: {
            command: `${customBinary} update`,
            executable: customBinary,
            args: ["update"],
            lockKey: "omp",
          },
        });
        expect(standard.snapshot.maintenanceCapabilities.update?.executable).toBe("omp");
        const customSnapshot = yield* custom.snapshot.getSnapshot;
        expect(customSnapshot).toMatchObject({
          instanceId: customId,
          driver: OMP_KIND,
          displayName: "OMP custom",
          accentColor: "#123456",
          continuation: { groupKey: "omp:instance:omp_custom" },
          enabled: false,
        });
        expect(encodeUnknownJson(customSnapshot)).not.toContain("driver-secret");

        const registryId = ProviderInstanceId.make("omp_registry");
        const configMap: ProviderInstanceConfigMap = {
          [registryId]: {
            driver: OMP_KIND,
            enabled: false,
            config: OmpDriver.defaultConfig(),
          },
        };
        const { registry } = yield* makeProviderInstanceRegistry({
          drivers: [OmpDriver],
          configMap,
        });
        expect(yield* registry.listUnavailable).toEqual([]);
        expect((yield* registry.getInstance(registryId))?.driverKind).toBe(OMP_KIND);
      }),
    ),
  );

  it.effect(
    "keeps two instances' interactive state, environment, and text generation isolated",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* makeFixture;
          const serverConfig = yield* ServerConfig;
          const idA = ProviderInstanceId.make("omp_a");
          const idB = ProviderInstanceId.make("omp_b");
          const previousAmbient = process.env.T3_OMP_ORDINARY_VALUE;
          process.env.T3_OMP_ORDINARY_VALUE = "ambient-before-create";
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              if (previousAmbient === undefined) delete process.env.T3_OMP_ORDINARY_VALUE;
              else process.env.T3_OMP_ORDINARY_VALUE = previousAmbient;
            }),
          );

          const [instanceA, instanceB] = yield* Effect.all(
            [
              OmpDriver.create({
                instanceId: idA,
                displayName: "OMP A",
                accentColor: undefined,
                environment: instanceEnvironment(fixture, "a"),
                enabled: true,
                config: { enabled: true, binaryPath: fixture.wrapperPath },
              }),
              OmpDriver.create({
                instanceId: idB,
                displayName: "OMP B",
                accentColor: undefined,
                environment: instanceEnvironment(fixture, "b"),
                enabled: true,
                config: { enabled: true, binaryPath: fixture.wrapperPath },
              }),
            ],
            { concurrency: "unbounded" },
          );
          process.env.T3_OMP_ORDINARY_VALUE = "ambient-after-create";

          yield* Effect.all([instanceA.snapshot.refresh, instanceB.snapshot.refresh], {
            concurrency: "unbounded",
          });
          const [snapshotA, snapshotB] = yield* Effect.all([
            waitForSnapshot(
              instanceA.snapshot.getSnapshot,
              (snapshot) => snapshot.status === "ready" && snapshot.versionAdvisory !== undefined,
            ),
            waitForSnapshot(
              instanceB.snapshot.getSnapshot,
              (snapshot) => snapshot.status === "ready" && snapshot.versionAdvisory !== undefined,
            ),
          ]);
          expect(snapshotA).toMatchObject({
            instanceId: idA,
            driver: OMP_KIND,
            version: "1.2.3",
            versionAdvisory: {
              currentVersion: "1.2.3",
              latestVersion: null,
              updateCommand: `${fixture.wrapperPath} update`,
            },
          });
          expect(snapshotB.instanceId).toBe(idB);

          const threadA = ThreadId.make("omp-driver-a");
          const threadB = ThreadId.make("omp-driver-b");
          yield* Effect.all(
            [
              instanceA.adapter.startSession({
                threadId: threadA,
                provider: OMP_KIND,
                cwd: fixture.projectA,
                runtimeMode: "approval-required",
              }),
              instanceB.adapter.startSession({
                threadId: threadB,
                provider: OMP_KIND,
                cwd: fixture.projectB,
                runtimeMode: "approval-required",
              }),
            ],
            { concurrency: "unbounded" },
          );
          yield* Effect.all(
            [instanceA.adapter.stopSession(threadA), instanceB.adapter.stopSession(threadB)],
            { concurrency: "unbounded" },
          );

          const [titleA, titleB] = yield* Effect.all(
            [
              instanceA.textGeneration.generateThreadTitle({
                cwd: fixture.projectA,
                message: "Name A",
                modelSelection: createModelSelection(idA, "openai/gpt-5", [
                  { id: "reasoning", value: "high" },
                ]),
              }),
              instanceB.textGeneration.generateThreadTitle({
                cwd: fixture.projectB,
                message: "Name B",
                modelSelection: createModelSelection(idB, "openai/gpt-5", [
                  { id: "reasoning", value: "low" },
                ]),
              }),
            ],
            { concurrency: "unbounded" },
          );
          expect(titleA).toEqual({ title: "Title A" });
          expect(titleB).toEqual({ title: "Title B" });

          for (const [label, id, project] of [
            ["a", idA, fixture.projectA],
            ["b", idB, fixture.projectB],
          ] as const) {
            const argsPath = NodePath.join(fixture.directory, `${label}-args.ndjson`);
            const envPath = NodePath.join(fixture.directory, `${label}-env.ndjson`);
            const invocations = readJsonLines<MockInvocation>(argsPath);
            expect(invocations.some((entry) => entry.args.join(" ") === "--version")).toBe(true);
            expect(invocations.some((entry) => entry.args.join(" ") === "models --json")).toBe(
              true,
            );
            expect(
              invocations.some(
                (entry) => entry.args.join(" ") === "acp --approval-mode always-ask",
              ),
            ).toBe(true);
            expect(
              invocations.some(
                (entry) => entry.args.join("\0") === OMP_TEXT_GENERATION_ACP_ARGS.join("\0"),
              ),
            ).toBe(true);
            expect(invocations.every((entry) => !processIsAlive(entry.pid))).toBe(true);

            const environments = readJsonLines<MockEnvironment>(envPath);
            const interactiveDir = NodePath.join(serverConfig.stateDir, "providers", "omp", id);
            const interactive = environments.find((entry) => entry.cwd === project);
            expect(interactive?.PI_CODING_AGENT_DIR).toBe(interactiveDir);
            const text = environments.find(
              (entry) => entry.PI_CODING_AGENT_SESSION_DIR !== undefined,
            );
            const textBase = NodePath.join(
              serverConfig.stateDir,
              "providers",
              "omp-text-generation",
              id,
            );
            expect(text?.cwd.startsWith(textBase)).toBe(true);
            expect(text?.PI_CODING_AGENT_DIR?.startsWith(textBase)).toBe(true);
            expect(text && NodeFS.existsSync(NodePath.dirname(text.cwd))).toBe(false);
            expect(
              environments.every((entry) => entry.ORDINARY_VALUE === `selected-${label}`),
            ).toBe(true);
            expect(environments.every((entry) => entry.OPENAI_API_KEY_PRESENT)).toBe(true);
          }
        }),
      ),
  );

  it.effect("honors update-check settings and never exposes failed-probe secrets", () => {
    const messages: Array<unknown> = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      messages.push(message);
    });
    return Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const calls = yield* Ref.make(0);
        const secret = "omp-driver-probe-secret";
        const client = HttpClient.make((request) =>
          Ref.update(calls, (count) => count + 1).pipe(
            Effect.as(HttpClientResponse.fromWeb(request, Response.json({ version: "1.2.4" }))),
          ),
        );
        const settings = yield* ServerSettingsService;
        const instance = yield* OmpDriver.create({
          instanceId: ProviderInstanceId.make("omp_advisory"),
          displayName: undefined,
          accentColor: undefined,
          environment: instanceEnvironment(fixture, "a", {
            T3_OMP_MODELS_EXIT_CODE: "7",
            T3_OMP_MODELS_STDERR: secret,
            OPENAI_API_KEY: secret,
          }),
          enabled: true,
          config: { enabled: true, binaryPath: fixture.wrapperPath },
        }).pipe(Effect.provideService(HttpClient.HttpClient, client));

        yield* instance.snapshot.refresh;
        const failed = yield* waitForSnapshot(
          instance.snapshot.getSnapshot,
          (snapshot) => snapshot.status === "error" && snapshot.versionAdvisory !== undefined,
        );
        expect(failed.versionAdvisory).toMatchObject({
          currentVersion: "1.2.3",
          latestVersion: null,
          status: "unknown",
        });
        expect(yield* Ref.get(calls)).toBe(0);
        expect(encodeUnknownJson(failed)).not.toContain(secret);
        expect(encodeUnknownJson(messages)).not.toContain(secret);
        expect(
          NodeFS.readFileSync(NodePath.join(fixture.directory, "a-args.ndjson"), "utf8"),
        ).not.toContain(secret);
        expect(
          NodeFS.readFileSync(NodePath.join(fixture.directory, "a-env.ndjson"), "utf8"),
        ).not.toContain(secret);

        yield* settings.updateSettings({ enableProviderUpdateChecks: true });
        yield* instance.snapshot.refresh.pipe(
          Effect.provideService(ProviderVersionCache, new Map()),
        );
        const advised = yield* waitForSnapshot(
          instance.snapshot.getSnapshot,
          (snapshot) => snapshot.versionAdvisory?.latestVersion === "1.2.4",
        );
        expect(advised.versionAdvisory).toMatchObject({
          currentVersion: "1.2.3",
          latestVersion: "1.2.4",
          status: "behind_latest",
          updateCommand: `${fixture.wrapperPath} update`,
        });
        expect(yield* Ref.get(calls)).toBeGreaterThan(0);
        expect(encodeUnknownJson(advised)).not.toContain(secret);
      }).pipe(Effect.provide(Logger.layer([logger], { mergeWithExisting: false }))),
    );
  });
});
