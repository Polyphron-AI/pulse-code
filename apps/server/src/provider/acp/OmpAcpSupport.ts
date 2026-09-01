import {
  type ModelSelection,
  type OmpSettings,
  type ProviderInstanceId,
  type RuntimeMode,
} from "@t3tools/contracts";
import { getProviderOptionStringSelectionValue } from "@t3tools/shared/model";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import type * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

export type OmpApprovalMode = "always-ask" | "write" | "yolo";

// Pulse has no provider-neutral auto reviewer, so `auto` must continue asking.
export const OMP_APPROVAL_MODE_BY_RUNTIME_MODE = {
  "approval-required": "always-ask",
  "auto-accept-edits": "write",
  auto: "always-ask",
  "full-access": "yolo",
} as const satisfies Readonly<Record<RuntimeMode, OmpApprovalMode>>;

export const OMP_ACP_CLIENT_CAPABILITIES = {
  elicitation: { form: {} },
} satisfies NonNullable<EffectAcpSchema.InitializeRequest["clientCapabilities"]>;

export const OMP_TEXT_GENERATION_ACP_CLIENT_CAPABILITIES = {
  fs: {
    readTextFile: false,
    writeTextFile: false,
  },
  terminal: false,
} satisfies NonNullable<EffectAcpSchema.InitializeRequest["clientCapabilities"]>;

export const OMP_TEXT_GENERATION_ACP_ARGS = [
  "acp",
  "--approval-mode",
  "always-ask",
  "--no-tools",
  "--no-extensions",
  "--no-skills",
  "--no-rules",
  "--no-lsp",
  "--no-title",
  "--no-session",
] as const;

const OMP_AUTH_METHOD_ID = "agent";
const OMP_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
const OMP_SESSION_DIR_ENV = "PI_CODING_AGENT_SESSION_DIR";
const OMP_PROFILE_ENV_KEYS = new Set(["OMP_PROFILE", "PI_PROFILE", "PI_CODING_AGENT_PROFILE"]);
const PULSE_INTERNAL_ENV_PREFIXES = ["PULSE_CODE_", "T3CODE_"] as const;
const PULSE_INTERNAL_ENV_KEYS = new Set([
  "PULSE_INTERNAL_AUTH_TOKEN",
  "T3_MCP_BEARER_TOKEN",
  "T3_SERVICE_LAUNCHER_CONTEXT",
  "T3_SSH_AUTH_SECRET",
]);
const OMP_TEXT_GENERATION_REDIRECT_ENV_KEYS = new Set([
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_WORK_TREE",
  "OMP_AGENT_DIR",
  "OMP_AUTH_BROKER_ACCOUNT_POOL_FILE",
  "OMP_AUTH_BROKER_SNAPSHOT_CACHE",
  "OMP_AUTH_BROKER_TOKEN",
  "OMP_AUTH_BROKER_URL",
  "OMP_AUTORESEARCH_DB_DIR",
  "OMP_COMMIT_CACHE_DB",
  "OMP_GITHUB_CACHE_DB",
  "OMP_LAUNCH_CWD",
  "OMP_WORKTREE_DIR",
  "PI_CONFIG_DIR",
  "PI_CONFIG_FILES",
]);

type OmpAcpRuntimeSettings = Pick<OmpSettings, "binaryPath">;

export interface OmpTextGenerationRunPaths {
  readonly runRoot: string;
  readonly cwd: string;
  readonly agentDir: string;
  readonly sessionDir: string;
  readonly homeDir: string;
  readonly configDir: string;
  readonly dataDir: string;
  readonly cacheDir: string;
  readonly stateDir: string;
  readonly appDataDir: string;
  readonly localAppDataDir: string;
  readonly tempDir: string;
}

export type OmpAcpSpawnPurpose =
  | {
      readonly type: "interactive";
      readonly runtimeMode: RuntimeMode;
      readonly cwd: string;
      readonly agentDir: string;
    }
  | {
      readonly type: "text-generation";
      readonly paths: OmpTextGenerationRunPaths;
    };

export interface OmpAcpSpawnOptions {
  readonly ompSettings: OmpAcpRuntimeSettings | null | undefined;
  readonly environment: NodeJS.ProcessEnv;
  readonly purpose: OmpAcpSpawnPurpose;
}

export interface OmpAcpRuntimeOptionsInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly ompSettings: OmpAcpRuntimeSettings | null | undefined;
  readonly runtimeMode: RuntimeMode;
  readonly agentDir: string;
  readonly environment: NodeJS.ProcessEnv;
}

export interface OmpAcpRuntimeInput extends OmpAcpRuntimeOptionsInput {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
}

export interface OmpAcpPurposeRuntimeOptionsInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "cwd" | "spawn"
> {
  readonly ompSettings: OmpAcpRuntimeSettings | null | undefined;
  readonly environment: NodeJS.ProcessEnv;
  readonly purpose: OmpAcpSpawnPurpose;
}

export interface OmpAcpPurposeRuntimeInput extends OmpAcpPurposeRuntimeOptionsInput {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
}

/** Resolve the credential and session store for one OMP provider instance. */
export function resolveOmpAgentDir(
  path: Pick<Path.Path, "join">,
  stateDir: string,
  instanceId: ProviderInstanceId,
): string {
  return path.join(stateDir, "providers", "omp", instanceId);
}

/** Keep disposable text generation state outside the interactive OMP agent directory. */
export function resolveOmpTextGenerationDir(
  path: Pick<Path.Path, "join">,
  stateDir: string,
  instanceId: ProviderInstanceId,
): string {
  return path.join(stateDir, "providers", "omp-text-generation", instanceId);
}

export function resolveOmpTextGenerationRunPaths(
  path: Pick<Path.Path, "join">,
  runRoot: string,
): OmpTextGenerationRunPaths {
  return {
    runRoot,
    cwd: path.join(runRoot, "workspace"),
    agentDir: path.join(runRoot, "agent"),
    sessionDir: path.join(runRoot, "sessions"),
    homeDir: path.join(runRoot, "home"),
    configDir: path.join(runRoot, "config"),
    dataDir: path.join(runRoot, "data"),
    cacheDir: path.join(runRoot, "cache"),
    stateDir: path.join(runRoot, "state"),
    appDataDir: path.join(runRoot, "app-data"),
    localAppDataDir: path.join(runRoot, "local-app-data"),
    tempDir: path.join(runRoot, "tmp"),
  };
}

function environmentKeyIsPulseInternal(normalizedKey: string): boolean {
  return (
    PULSE_INTERNAL_ENV_KEYS.has(normalizedKey) ||
    PULSE_INTERNAL_ENV_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix))
  );
}

export function buildOmpProcessEnvironment(
  environment: NodeJS.ProcessEnv,
  agentDir: string,
): NodeJS.ProcessEnv {
  const isolatedEnvironment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(environment)) {
    const normalizedKey = key.toUpperCase();
    if (OMP_PROFILE_ENV_KEYS.has(normalizedKey) || normalizedKey === OMP_AGENT_DIR_ENV) {
      continue;
    }
    isolatedEnvironment[key] = value;
  }
  isolatedEnvironment.OMP_PROFILE = "";
  isolatedEnvironment.PI_PROFILE = "";
  isolatedEnvironment.PI_CODING_AGENT_PROFILE = "";
  isolatedEnvironment[OMP_AGENT_DIR_ENV] = agentDir;
  return isolatedEnvironment;
}

export function buildOmpTextGenerationProcessEnvironment(
  environment: NodeJS.ProcessEnv,
  paths: OmpTextGenerationRunPaths,
): NodeJS.ProcessEnv {
  const overriddenKeys = new Set([
    ...OMP_PROFILE_ENV_KEYS,
    OMP_AGENT_DIR_ENV,
    OMP_SESSION_DIR_ENV,
    "HOME",
    "USERPROFILE",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_STATE_HOME",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "TMPDIR",
    "PWD",
    "OLDPWD",
    "INIT_CWD",
  ]);
  const isolatedEnvironment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(environment)) {
    const normalizedKey = key.toUpperCase();
    if (
      overriddenKeys.has(normalizedKey) ||
      OMP_TEXT_GENERATION_REDIRECT_ENV_KEYS.has(normalizedKey) ||
      environmentKeyIsPulseInternal(normalizedKey)
    ) {
      continue;
    }
    isolatedEnvironment[key] = value;
  }
  return {
    ...isolatedEnvironment,
    OMP_PROFILE: "",
    PI_PROFILE: "",
    PI_CODING_AGENT_PROFILE: "",
    [OMP_AGENT_DIR_ENV]: paths.agentDir,
    [OMP_SESSION_DIR_ENV]: paths.sessionDir,
    HOME: paths.homeDir,
    USERPROFILE: paths.homeDir,
    XDG_CONFIG_HOME: paths.configDir,
    XDG_DATA_HOME: paths.dataDir,
    XDG_CACHE_HOME: paths.cacheDir,
    XDG_STATE_HOME: paths.stateDir,
    APPDATA: paths.appDataDir,
    LOCALAPPDATA: paths.localAppDataDir,
    TEMP: paths.tempDir,
    TMP: paths.tempDir,
    TMPDIR: paths.tempDir,
    PWD: paths.cwd,
    OLDPWD: paths.cwd,
    INIT_CWD: paths.cwd,
  };
}

export function buildOmpAcpSpawnInput(input: OmpAcpSpawnOptions): AcpSessionRuntime.AcpSpawnInput {
  if (input.purpose.type === "text-generation") {
    return {
      command: input.ompSettings?.binaryPath || "omp",
      args: OMP_TEXT_GENERATION_ACP_ARGS,
      cwd: input.purpose.paths.cwd,
      env: buildOmpTextGenerationProcessEnvironment(input.environment, input.purpose.paths),
      forceKillAfter: "2 seconds",
    };
  }
  return {
    command: input.ompSettings?.binaryPath || "omp",
    args: ["acp", "--approval-mode", OMP_APPROVAL_MODE_BY_RUNTIME_MODE[input.purpose.runtimeMode]],
    cwd: input.purpose.cwd,
    env: buildOmpProcessEnvironment(input.environment, input.purpose.agentDir),
    forceKillAfter: "2 seconds",
  };
}

export function buildOmpAcpPurposeRuntimeOptions(
  input: OmpAcpPurposeRuntimeOptionsInput,
): AcpSessionRuntime.AcpSessionRuntimeOptions {
  const { environment, ompSettings, purpose, ...runtimeOptions } = input;
  const textGeneration = purpose.type === "text-generation";
  return {
    ...runtimeOptions,
    cwd: textGeneration ? purpose.paths.cwd : purpose.cwd,
    spawn: buildOmpAcpSpawnInput({
      ompSettings,
      environment,
      purpose,
    }),
    authMethodId: OMP_AUTH_METHOD_ID,
    clientCapabilities: textGeneration
      ? OMP_TEXT_GENERATION_ACP_CLIENT_CAPABILITIES
      : OMP_ACP_CLIENT_CAPABILITIES,
    ...(textGeneration ? { mcpServers: [] } : {}),
  };
}

export function buildOmpAcpRuntimeOptions(
  input: OmpAcpRuntimeOptionsInput,
): AcpSessionRuntime.AcpSessionRuntimeOptions {
  const { agentDir, cwd, environment, ompSettings, runtimeMode, ...runtimeOptions } = input;
  return buildOmpAcpPurposeRuntimeOptions({
    ...runtimeOptions,
    ompSettings,
    environment,
    purpose: {
      type: "interactive",
      runtimeMode,
      cwd,
      agentDir,
    },
  });
}

const makeOmpAcpRuntimeFromOptions = (
  options: AcpSessionRuntime.AcpSessionRuntimeOptions,
  childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer(options).pipe(
        Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner)),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

export const makeOmpAcpRuntimeForPurpose = (
  input: OmpAcpPurposeRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> => {
  const { childProcessSpawner, ...runtimeOptionsInput } = input;
  return makeOmpAcpRuntimeFromOptions(
    buildOmpAcpPurposeRuntimeOptions(runtimeOptionsInput),
    childProcessSpawner,
  );
};

export const makeOmpAcpRuntime = (
  input: OmpAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> => {
  const { childProcessSpawner, ...runtimeOptionsInput } = input;
  return makeOmpAcpRuntimeFromOptions(
    buildOmpAcpRuntimeOptions(runtimeOptionsInput),
    childProcessSpawner,
  );
};

export function applyOmpAcpTextGenerationModelSelection<E>(input: {
  readonly runtime: Pick<
    AcpSessionRuntime.AcpSessionRuntime["Service"],
    "setConfigOption" | "setMode" | "setModel"
  >;
  readonly modelSelection: ModelSelection;
  readonly mapError: (input: {
    readonly cause: EffectAcpErrors.AcpError;
    readonly step: "set-mode" | "set-model" | "set-thinking";
  }) => E;
}): Effect.Effect<void, E> {
  return Effect.gen(function* () {
    yield* input.runtime
      .setMode("default")
      .pipe(Effect.mapError((cause) => input.mapError({ cause, step: "set-mode" })));
    yield* input.runtime
      .setModel(input.modelSelection.model)
      .pipe(Effect.mapError((cause) => input.mapError({ cause, step: "set-model" })));
    const thinking = getProviderOptionStringSelectionValue(
      input.modelSelection.options,
      "reasoning",
    );
    if (thinking === undefined) {
      return;
    }
    yield* input.runtime
      .setConfigOption("thinking", thinking)
      .pipe(Effect.mapError((cause) => input.mapError({ cause, step: "set-thinking" })));
  });
}
