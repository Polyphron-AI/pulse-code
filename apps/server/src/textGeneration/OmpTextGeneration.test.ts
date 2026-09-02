// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId } from "@t3tools/contracts";
import { HostProcessExecutablePath, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import { OMP_TEXT_GENERATION_ACP_ARGS } from "../provider/acp/OmpAcpSupport.ts";
import { makeOmpTextGeneration } from "./OmpTextGeneration.ts";

interface MockFixture {
  readonly directory: string;
  readonly wrapperPath: string;
  readonly textGenerationDir: string;
  readonly argsLogPath: string;
  readonly environmentLogPath: string;
  readonly requestLogPath: string;
  readonly responseLogPath: string;
  readonly exitLogPath: string;
}

const MockInvocationSchema = Schema.Struct({
  args: Schema.Array(Schema.String),
  pid: Schema.Number,
});
const MockEnvironmentSchema = Schema.Struct({
  cwd: Schema.String,
  OMP_PROFILE: Schema.String,
  PI_PROFILE: Schema.String,
  PI_CODING_AGENT_PROFILE: Schema.String,
  PI_CODING_AGENT_DIR: Schema.String,
  PI_CODING_AGENT_SESSION_DIR: Schema.String,
  HOME: Schema.String,
  USERPROFILE: Schema.String,
  XDG_CONFIG_HOME: Schema.String,
  XDG_DATA_HOME: Schema.String,
  XDG_CACHE_HOME: Schema.String,
  XDG_STATE_HOME: Schema.String,
  APPDATA: Schema.String,
  LOCALAPPDATA: Schema.String,
  TEMP: Schema.String,
  TMP: Schema.String,
  TMPDIR: Schema.String,
  PWD: Schema.String,
  OLDPWD: Schema.String,
  INIT_CWD: Schema.String,
  OPENAI_API_KEY_PRESENT: Schema.Boolean,
  OPENAI_API_KEY_MATCHES_EXPECTED: Schema.Boolean,
  OPENAI_API_KEY_NAMES: Schema.Array(Schema.String),
  HTTPS_PROXY: Schema.optional(Schema.String),
  NODE_EXTRA_CA_CERTS: Schema.optional(Schema.String),
  PATH_PRESENT: Schema.Boolean,
  PATH_MATCHES_EXPECTED: Schema.Boolean,
  PATH_KEY_NAMES: Schema.Array(Schema.String),
  PULSE_CODE_INTERNAL_AUTH_TOKEN_PRESENT: Schema.Boolean,
  T3_MCP_BEARER_TOKEN_PRESENT: Schema.Boolean,
  CLAUDE_CONFIG_DIR_PRESENT: Schema.Boolean,
  GIT_WORK_TREE_PRESENT: Schema.Boolean,
  OMP_LAUNCH_CWD_PRESENT: Schema.Boolean,
  OMP_WORKTREE_DIR_PRESENT: Schema.Boolean,
  OMP_AUTH_BROKER_URL_PRESENT: Schema.Boolean,
  OMP_AUTH_BROKER_TOKEN_PRESENT: Schema.Boolean,
  OMP_AUTH_BROKER_ACCOUNT_POOL_FILE_PRESENT: Schema.Boolean,
  OMP_AUTH_BROKER_SNAPSHOT_CACHE_PRESENT: Schema.Boolean,
  PI_CONFIG_FILES_PRESENT: Schema.Boolean,
  PI_CONFIG_DIR_PRESENT: Schema.Boolean,
  sessionMarkerPath: Schema.String,
  SESSION_MARKER_WRITTEN: Schema.Boolean,
});
const LoggedRequestSchema = Schema.Struct({
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Unknown),
});
const ConfigRequestParamsSchema = Schema.Struct({
  configId: Schema.String,
  value: Schema.Union([Schema.String, Schema.Boolean]),
});
const InitializeParamsSchema = Schema.Struct({
  clientCapabilities: Schema.Unknown,
});
const NewSessionParamsSchema = Schema.Struct({
  mcpServers: Schema.Array(Schema.Unknown),
});
const ClientResponseSchema = Schema.Struct({
  method: Schema.String,
  response: Schema.Unknown,
});

const decodeMockInvocation = Schema.decodeUnknownSync(Schema.fromJsonString(MockInvocationSchema));
const decodeMockEnvironment = Schema.decodeUnknownSync(
  Schema.fromJsonString(MockEnvironmentSchema),
);
const decodeLoggedRequest = Schema.decodeUnknownSync(Schema.fromJsonString(LoggedRequestSchema));
const decodeConfigRequestParams = Schema.decodeUnknownSync(ConfigRequestParamsSchema);
const decodeInitializeParams = Schema.decodeUnknownSync(InitializeParamsSchema);
const decodeNewSessionParams = Schema.decodeUnknownSync(NewSessionParamsSchema);
const decodeClientResponse = Schema.decodeUnknownSync(Schema.fromJsonString(ClientResponseSchema));
const encodeUnknownJson = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

function shellQuote(value: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

const makeMockFixture = Effect.fn("OmpTextGenerationTest.makeMockFixture")(function* () {
  const platform = yield* HostProcessPlatform;
  const executablePath = yield* HostProcessExecutablePath;
  return yield* Effect.sync(() => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-omp-text-"));
    const mockAgentPath = NodeURL.fileURLToPath(
      new URL("../../scripts/acp-mock-agent.ts", import.meta.url),
    );
    const wrapperPath = NodePath.join(
      directory,
      platform === "win32" ? "omp-text-mock.cmd" : "omp-text-mock.sh",
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
      textGenerationDir: NodePath.join(directory, "text-generation"),
      argsLogPath: NodePath.join(directory, "args.ndjson"),
      environmentLogPath: NodePath.join(directory, "environment.ndjson"),
      requestLogPath: NodePath.join(directory, "requests.ndjson"),
      responseLogPath: NodePath.join(directory, "responses.ndjson"),
      exitLogPath: NodePath.join(directory, "exit.log"),
    } satisfies MockFixture;
  });
});

function withFixture<A, E, R>(use: (fixture: MockFixture) => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(makeMockFixture(), use, (fixture) =>
    Effect.sync(() => NodeFS.rmSync(fixture.directory, { recursive: true, force: true })),
  );
}

function withProcessEnvironment<A, E, R>(
  patch: Readonly<Record<string, string>>,
  use: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = new Map<string, string | undefined>();
      for (const [key, value] of Object.entries(patch)) {
        previous.set(key, process.env[key]);
        process.env[key] = value;
      }
      return previous;
    }),
    () => use,
    (previous) =>
      Effect.sync(() => {
        for (const [key, value] of previous) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }),
  );
}

function testEnvironment(
  fixture: MockFixture,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    ...(process.env.ComSpec ? { ComSpec: process.env.ComSpec } : {}),
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    T3_ACP_OMP_MODE: "1",
    T3_OMP_CLI_ARGS_LOG_PATH: fixture.argsLogPath,
    T3_OMP_ENV_LOG_PATH: fixture.environmentLogPath,
    T3_ACP_REQUEST_LOG_PATH: fixture.requestLogPath,
    T3_ACP_CLIENT_RESPONSE_LOG_PATH: fixture.responseLogPath,
    T3_ACP_EXIT_LOG_PATH: fixture.exitLogPath,
    ...overrides,
  };
}

const makeTextGeneration = Effect.fn("OmpTextGenerationTest.makeTextGeneration")(function* (
  fixture: MockFixture,
  overrides: NodeJS.ProcessEnv = {},
) {
  return yield* makeOmpTextGeneration({
    ompSettings: { binaryPath: fixture.wrapperPath },
    textGenerationDir: fixture.textGenerationDir,
    environment: testEnvironment(fixture, overrides),
  });
});

function readLines<A>(path: string, decode: (line: string) => A): ReadonlyArray<A> {
  const content = NodeFS.readFileSync(path, "utf8").trim();
  return content ? content.split("\n").map(decode) : [];
}

function requestMethodWasLogged(path: string, method: string): boolean {
  if (!NodeFS.existsSync(path)) {
    return false;
  }
  try {
    return readLines(path, decodeLoggedRequest).some((request) => request.method === method);
  } catch {
    return false;
  }
}

function waitForRequestMethod(path: string, method: string): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    let completed = false;
    const watcher = NodeFS.watch(NodePath.dirname(path), () => {
      if (!completed && requestMethodWasLogged(path, method)) {
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
    if (requestMethodWasLogged(path, method)) {
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

function threadTitleInput(message: string) {
  return {
    cwd: "C:\\repository-that-must-not-be-used",
    message,
    modelSelection: createModelSelection(ProviderInstanceId.make("omp_work"), "openai/gpt-5", [
      { id: "reasoning", value: "high" },
    ]),
  };
}

describe("OmpTextGeneration", () => {
  it.effect("does not re-inherit ambient auth or config state in the real ACP child", () =>
    withFixture((fixture) =>
      withProcessEnvironment(
        {
          PULSE_CODE_INTERNAL_AUTH_TOKEN: "ambient-pulse-secret",
          OMP_AUTH_BROKER_TOKEN: "ambient-broker-secret",
          PI_CONFIG_FILES: NodePath.join(fixture.directory, "ambient-omp-overlay.yml"),
        },
        Effect.gen(function* () {
          const selectedPath = process.env.PATH ?? "";
          const selectedProviderKey = "selected-provider-key";
          const selectedProxy = "https://proxy.example.test";
          const selectedCaPath = NodePath.join(fixture.directory, "selected-ca.pem");
          const textGeneration = yield* makeTextGeneration(fixture, {
            OPENAI_API_KEY: selectedProviderKey,
            HTTPS_PROXY: selectedProxy,
            NODE_EXTRA_CA_CERTS: selectedCaPath,
            T3_OMP_EXPECTED_OPENAI_API_KEY: selectedProviderKey,
            T3_OMP_EXPECTED_PATH: selectedPath,
            T3_ACP_PROMPT_RESPONSE_TEXT: encodeUnknownJson({
              title: "Keep ambient state out",
            }),
          });

          expect(
            yield* textGeneration.generateThreadTitle(
              threadTitleInput("Do not inherit live Pulse or OMP auth state"),
            ),
          ).toEqual({ title: "Keep ambient state out" });

          const [environment] = readLines(fixture.environmentLogPath, decodeMockEnvironment);
          expect(environment?.PULSE_CODE_INTERNAL_AUTH_TOKEN_PRESENT).toBe(false);
          expect(environment?.OMP_AUTH_BROKER_TOKEN_PRESENT).toBe(false);
          expect(environment?.PI_CONFIG_FILES_PRESENT).toBe(false);
          expect(environment?.OPENAI_API_KEY_MATCHES_EXPECTED).toBe(true);
          expect(environment?.OPENAI_API_KEY_NAMES).toEqual(["OPENAI_API_KEY"]);
          expect(environment?.HTTPS_PROXY).toBe(selectedProxy);
          expect(environment?.NODE_EXTRA_CA_CERTS).toBe(selectedCaPath);
          expect(environment?.PATH_MATCHES_EXPECTED).toBe(true);
          expect(environment?.PATH_KEY_NAMES).toEqual(["PATH"]);
        }),
      ),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("uses the hardened isolated process and exact ACP configuration order", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const textGeneration = yield* makeTextGeneration(fixture, {
          OPENAI_API_KEY: "selected-provider-key",
          HTTPS_PROXY: "https://proxy.example.test",
          NODE_EXTRA_CA_CERTS: NodePath.join(fixture.directory, "selected-ca.pem"),
          PULSE_CODE_INTERNAL_AUTH_TOKEN: "pulse-secret",
          T3_MCP_BEARER_TOKEN: "mcp-secret",
          OMP_PROFILE: "ambient-omp",
          pi_profile: "ambient-pi",
          Pi_Coding_Agent_Profile: "ambient-agent-profile",
          pi_coding_agent_dir: NodePath.join(fixture.directory, "ambient-agent"),
          PI_CODING_AGENT_SESSION_DIR: NodePath.join(fixture.directory, "ambient-sessions"),
          HOME: NodePath.join(fixture.directory, "ambient-home"),
          userprofile: NodePath.join(fixture.directory, "ambient-user-profile"),
          xdg_config_home: NodePath.join(fixture.directory, "ambient-config"),
          appdata: NodePath.join(fixture.directory, "ambient-app-data"),
          temp: NodePath.join(fixture.directory, "ambient-temp"),
          pwd: NodePath.join(fixture.directory, "ambient-repository"),
          oldpwd: NodePath.join(fixture.directory, "previous-repository"),
          init_cwd: NodePath.join(fixture.directory, "npm-repository"),
          claude_config_dir: NodePath.join(fixture.directory, "shared-claude"),
          GIT_WORK_TREE: NodePath.join(fixture.directory, "ambient-repository"),
          omp_launch_cwd: NodePath.join(fixture.directory, "ambient-repository"),
          OMP_WORKTREE_DIR: NodePath.join(fixture.directory, "shared-omp-worktrees"),
          oMp_AuTh_BrOkEr_Url: "https://broker.example.test",
          OmP_aUtH_bRoKeR_tOkEn: "do-not-forward",
          oMp_AuTh_BrOkEr_AcCoUnT_pOoL_fIlE: NodePath.join(fixture.directory, "account-pool.json"),
          OmP_aUtH_bRoKeR_sNaPsHoT_cAcHe: NodePath.join(fixture.directory, "broker-snapshot.enc"),
          Pi_CoNfIg_FiLeS: NodePath.join(fixture.directory, "omp-overlay.yml"),
          pI_cOnFiG_dIr: "../../shared-omp-config",
          T3_ACP_OMP_INITIAL_MODE: "plan",
          T3_OMP_WRITE_SESSION_MARKER: "1",
          T3_ACP_PROMPT_RESPONSE_TEXT: encodeUnknownJson({
            subject: "Add isolated OMP generation",
            body: "Keep repository state outside the ACP child.",
          }),
        });

        const generated = yield* textGeneration.generateCommitMessage({
          cwd: "C:\\repository-that-must-not-be-used",
          branch: "feat/omp-text",
          stagedSummary: "M apps/server/src/textGeneration/OmpTextGeneration.ts",
          stagedPatch: "diff --git a/OmpTextGeneration.ts b/OmpTextGeneration.ts",
          modelSelection: threadTitleInput("unused").modelSelection,
        });

        expect(generated).toEqual({
          subject: "Add isolated OMP generation",
          body: "Keep repository state outside the ACP child.",
        });

        const invocations = readLines(fixture.argsLogPath, decodeMockInvocation);
        expect(invocations).toHaveLength(1);
        expect(invocations[0]!.args).toEqual(OMP_TEXT_GENERATION_ACP_ARGS);
        expect(processIsAlive(invocations[0]!.pid)).toBe(false);

        const environments = readLines(fixture.environmentLogPath, decodeMockEnvironment);
        expect(environments).toHaveLength(1);
        const environment = environments[0]!;
        const runRoot = NodePath.dirname(environment.cwd);
        expect(environment.cwd).toBe(NodePath.join(runRoot, "workspace"));
        expect(environment.PI_CODING_AGENT_DIR).toBe(NodePath.join(runRoot, "agent"));
        expect(environment.PI_CODING_AGENT_SESSION_DIR).toBe(NodePath.join(runRoot, "sessions"));
        expect(environment.HOME).toBe(NodePath.join(runRoot, "home"));
        expect(environment.USERPROFILE).toBe(NodePath.join(runRoot, "home"));
        expect(environment.XDG_CONFIG_HOME).toBe(NodePath.join(runRoot, "config"));
        expect(environment.XDG_DATA_HOME).toBe(NodePath.join(runRoot, "data"));
        expect(environment.XDG_CACHE_HOME).toBe(NodePath.join(runRoot, "cache"));
        expect(environment.XDG_STATE_HOME).toBe(NodePath.join(runRoot, "state"));
        expect(environment.APPDATA).toBe(NodePath.join(runRoot, "app-data"));
        expect(environment.LOCALAPPDATA).toBe(NodePath.join(runRoot, "local-app-data"));
        expect(environment.TEMP).toBe(NodePath.join(runRoot, "tmp"));
        expect(environment.TMP).toBe(NodePath.join(runRoot, "tmp"));
        expect(environment.TMPDIR).toBe(NodePath.join(runRoot, "tmp"));
        expect(environment.PWD).toBe(NodePath.join(runRoot, "workspace"));
        expect(environment.OLDPWD).toBe(NodePath.join(runRoot, "workspace"));
        expect(environment.INIT_CWD).toBe(NodePath.join(runRoot, "workspace"));
        expect(environment.OMP_PROFILE).toBe("");
        expect(environment.PI_PROFILE).toBe("");
        expect(environment.PI_CODING_AGENT_PROFILE).toBe("");
        expect(environment.OPENAI_API_KEY_PRESENT).toBe(true);
        expect(environment.HTTPS_PROXY).toBe("https://proxy.example.test");
        expect(environment.NODE_EXTRA_CA_CERTS).toBe(
          NodePath.join(fixture.directory, "selected-ca.pem"),
        );
        expect(environment.PATH_PRESENT).toBe(true);
        expect(environment.PULSE_CODE_INTERNAL_AUTH_TOKEN_PRESENT).toBe(false);
        expect(environment.T3_MCP_BEARER_TOKEN_PRESENT).toBe(false);
        expect(environment.CLAUDE_CONFIG_DIR_PRESENT).toBe(false);
        expect(environment.GIT_WORK_TREE_PRESENT).toBe(false);
        expect(environment.OMP_LAUNCH_CWD_PRESENT).toBe(false);
        expect(environment.OMP_WORKTREE_DIR_PRESENT).toBe(false);
        expect(environment.OMP_AUTH_BROKER_URL_PRESENT).toBe(false);
        expect(environment.OMP_AUTH_BROKER_TOKEN_PRESENT).toBe(false);
        expect(environment.OMP_AUTH_BROKER_ACCOUNT_POOL_FILE_PRESENT).toBe(false);
        expect(environment.OMP_AUTH_BROKER_SNAPSHOT_CACHE_PRESENT).toBe(false);
        expect(environment.PI_CONFIG_FILES_PRESENT).toBe(false);
        expect(environment.PI_CONFIG_DIR_PRESENT).toBe(false);
        expect(NodePath.normalize(environment.sessionMarkerPath)).toBe(
          NodePath.join(runRoot, "sessions", "mock-session-marker"),
        );
        expect(environment.SESSION_MARKER_WRITTEN).toBe(true);
        expect(runRoot.startsWith(fixture.textGenerationDir)).toBe(true);
        expect(runRoot).not.toContain("repository-that-must-not-be-used");
        expect(NodeFS.existsSync(runRoot)).toBe(false);

        const requests = readLines(fixture.requestLogPath, decodeLoggedRequest);
        const initialize = requests.find((request) => request.method === "initialize");
        expect(decodeInitializeParams(initialize?.params).clientCapabilities).toEqual({
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        });
        const newSession = requests.find((request) => request.method === "session/new");
        expect(decodeNewSessionParams(newSession?.params).mcpServers).toEqual([]);

        const configured = requests
          .map((request, index) => ({ index, request }))
          .filter(({ request }) => request.method === "session/set_config_option")
          .map(({ index, request }) => ({ index, ...decodeConfigRequestParams(request.params) }));
        expect(configured).toEqual([
          { index: expect.any(Number), configId: "mode", value: "default" },
          { index: expect.any(Number), configId: "model", value: "openai/gpt-5" },
          { index: expect.any(Number), configId: "thinking", value: "high" },
        ]);
        const promptIndex = requests.findIndex((request) => request.method === "session/prompt");
        expect(configured.every(({ index }) => index < promptIndex)).toBe(true);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("allocates unique scoped roots for concurrent calls", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const textGeneration = yield* makeTextGeneration(fixture, {
          OPENAI_API_KEY: "selected-provider-key",
          T3_ACP_PROMPT_RESPONSE_TEXT: encodeUnknownJson({ title: "Isolated concurrent run" }),
        });
        const results = yield* Effect.all(
          [
            textGeneration.generateThreadTitle(threadTitleInput("first")),
            textGeneration.generateThreadTitle(threadTitleInput("second")),
          ],
          { concurrency: "unbounded" },
        );
        expect(results).toEqual([
          { title: "Isolated concurrent run" },
          { title: "Isolated concurrent run" },
        ]);

        const environments = readLines(fixture.environmentLogPath, decodeMockEnvironment);
        const runRoots = environments.map((environment) => NodePath.dirname(environment.cwd));
        expect(new Set(runRoots).size).toBe(2);
        expect(runRoots.every((runRoot) => runRoot.startsWith(fixture.textGenerationDir))).toBe(
          true,
        );
        expect(runRoots.every((runRoot) => !NodeFS.existsSync(runRoot))).toBe(true);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("cancels permission, standard elicitation, and legacy elicitation requests", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const scenarios = [
          { name: "permission", environment: { T3_ACP_EMIT_TOOL_CALLS: "1" } },
          { name: "standard", environment: { T3_ACP_OMP_ELICITATION: "plan" } },
          { name: "legacy", environment: { T3_ACP_OMP_ELICITATION: "legacy-plan" } },
        ] as const;

        for (const scenario of scenarios) {
          const textGeneration = yield* makeTextGeneration(fixture, scenario.environment);
          const error = yield* Effect.flip(
            textGeneration.generateThreadTitle(threadTitleInput(scenario.name)),
          );
          expect(error._tag).toBe("TextGenerationError");
          expect(error.detail).toMatch(/cancelled/i);
        }

        const responses = readLines(fixture.responseLogPath, decodeClientResponse);
        expect(responses).toEqual([
          {
            method: "session/request_permission",
            response: { outcome: { outcome: "cancelled" } },
          },
          {
            method: "session/elicitation",
            response: { action: { action: "cancel" } },
          },
          {
            method: "elicitation/create",
            response: { action: "cancel" },
          },
        ]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns typed errors for invalid, empty, and unavailable custom-model output", () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const invalid = yield* makeTextGeneration(fixture, {
          T3_ACP_PROMPT_RESPONSE_TEXT: "not json",
        });
        const invalidError = yield* Effect.flip(
          invalid.generateThreadTitle(threadTitleInput("invalid")),
        );
        expect(invalidError._tag).toBe("TextGenerationError");
        expect(invalidError.detail).toMatch(/invalid structured output/i);

        const empty = yield* makeTextGeneration(fixture, {
          T3_ACP_PROMPT_RESPONSE_TEXT: "   ",
        });
        const emptyError = yield* Effect.flip(empty.generateThreadTitle(threadTitleInput("empty")));
        expect(emptyError._tag).toBe("TextGenerationError");
        expect(emptyError.detail).toMatch(/empty output/i);

        const requestCountBeforeUnavailableModel = readLines(
          fixture.requestLogPath,
          decodeLoggedRequest,
        ).length;
        const unavailableModel = yield* makeTextGeneration(fixture, {
          T3_ACP_FAIL_SET_CONFIG_OPTION: "1",
          T3_ACP_PROMPT_RESPONSE_TEXT: encodeUnknownJson({ title: "must not fall back" }),
        });
        const modelError = yield* Effect.flip(
          unavailableModel.generateThreadTitle({
            ...threadTitleInput("custom model"),
            modelSelection: createModelSelection(
              ProviderInstanceId.make("omp_work"),
              "custom/private-model",
            ),
          }),
        );
        expect(modelError._tag).toBe("TextGenerationError");
        expect(modelError.detail).toMatch(/exact OMP ACP model/i);

        const customModelRequests = readLines(fixture.requestLogPath, decodeLoggedRequest).slice(
          requestCountBeforeUnavailableModel,
        );
        expect(
          customModelRequests.some((request) => request.method === "session/set_config_option"),
        ).toBe(false);
        expect(customModelRequests.some((request) => request.method === "session/prompt")).toBe(
          false,
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "times out a hung prompt and closes the ACP process",
    () =>
      withFixture((fixture) =>
        Effect.gen(function* () {
          const textGeneration = yield* makeTextGeneration(fixture, {
            T3_ACP_HANG_PROMPT_FOREVER: "1",
          });
          const generation = yield* textGeneration
            .generateThreadTitle(threadTitleInput("hang forever"))
            .pipe(Effect.forkChild);

          yield* waitForRequestMethod(fixture.requestLogPath, "session/prompt").pipe(
            TestClock.withLive,
          );
          yield* TestClock.adjust("181 seconds");
          const error = yield* Effect.flip(Fiber.join(generation));
          expect(error._tag).toBe("TextGenerationError");
          expect(error.detail).toMatch(/timed out/i);

          const invocations = readLines(fixture.argsLogPath, decodeMockInvocation);
          expect(invocations).toHaveLength(1);
          expect(processIsAlive(invocations[0]!.pid)).toBe(false);
          const runRoot = NodePath.dirname(
            readLines(fixture.environmentLogPath, decodeMockEnvironment)[0]!.cwd,
          );
          expect(NodeFS.existsSync(runRoot)).toBe(false);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    5_000,
  );
});
