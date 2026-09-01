import type { ModelCapabilities, OmpSettings, ServerProviderModel } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { causeErrorTag } from "@t3tools/shared/observability";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import { buildOmpProcessEnvironment, makeOmpAcpRuntime } from "../acp/OmpAcpSupport.ts";
import {
  buildSelectOptionDescriptor,
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  spawnAndCollect,
  type ProviderProbeResult,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const OMP_PRESENTATION = {
  displayName: "Oh My Pi",
  badgeLabel: "Early Access",
  showInteractionModeToggle: true,
} as const;

const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const OMP_ACP_MODEL_DISCOVERY_TIMEOUT_MS = 15_000;

export interface OmpProviderProcessContext {
  readonly cwd: string;
  readonly agentDir: string;
  readonly environment: NodeJS.ProcessEnv;
}

interface OmpSessionSelectOption {
  readonly value: string;
  readonly name: string;
  readonly description?: string;
}

function flattenOmpSelectOptions(
  configOption: EffectAcpSchema.SessionConfigOption | undefined,
): ReadonlyArray<OmpSessionSelectOption> {
  if (!configOption || configOption.type !== "select") {
    return [];
  }
  return configOption.options.flatMap((entry) => {
    const options = "value" in entry ? [entry] : entry.options;
    return options.flatMap((option) => {
      if (option.value.trim().length === 0) {
        return [];
      }
      const name = option.name.trim() || option.value;
      const description = option.description?.trim();
      return [
        {
          value: option.value,
          name,
          ...(description ? { description } : {}),
        } satisfies OmpSessionSelectOption,
      ];
    });
  });
}

export function buildOmpCapabilitiesFromConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
): ModelCapabilities {
  const thinkingOption = configOptions?.find(
    (option) =>
      option.type === "select" && option.id === "thinking" && option.category === "thought_level",
  );
  const choices = flattenOmpSelectOptions(thinkingOption);
  if (!thinkingOption || choices.length === 0) {
    return EMPTY_CAPABILITIES;
  }

  return createModelCapabilities({
    optionDescriptors: [
      buildSelectOptionDescriptor({
        id: "reasoning",
        label: thinkingOption.name.trim() || "Thinking",
        options: choices.map((choice) => ({
          value: choice.value,
          label: choice.name,
          ...(choice.description ? { description: choice.description } : {}),
          ...(thinkingOption.currentValue === choice.value ? { isDefault: true } : {}),
        })),
      }),
    ],
  });
}

export function buildOmpModelsFromConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
): ReadonlyArray<ServerProviderModel> {
  const modelOption = configOptions?.find(
    (option) => option.type === "select" && option.id === "model" && option.category === "model",
  );
  const capabilities = buildOmpCapabilitiesFromConfigOptions(configOptions);
  const currentModelId = modelOption?.type === "select" ? modelOption.currentValue : undefined;
  const seen = new Set<string>();
  return flattenOmpSelectOptions(modelOption).flatMap((model) => {
    if (seen.has(model.value)) {
      return [];
    }
    seen.add(model.value);
    return [
      {
        slug: model.value,
        name: model.name,
        isCustom: false,
        // OMP's thinking options describe only the active model. The runtime probe fills the rest.
        capabilities: model.value === currentModelId ? capabilities : EMPTY_CAPABILITIES,
      } satisfies ServerProviderModel,
    ];
  });
}

interface OmpModelDiscoveryRuntime {
  readonly getConfigOptions: Effect.Effect<
    ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
    EffectAcpErrors.AcpError
  >;
  readonly setModel: (model: string) => Effect.Effect<void, EffectAcpErrors.AcpError>;
}

export function discoverOmpModelsFromRuntime(
  runtime: OmpModelDiscoveryRuntime,
): Effect.Effect<ReadonlyArray<ServerProviderModel>, EffectAcpErrors.AcpError> {
  return Effect.gen(function* () {
    const initialConfigOptions = yield* runtime.getConfigOptions;
    const initialModels = buildOmpModelsFromConfigOptions(initialConfigOptions);
    const modelOption = initialConfigOptions.find(
      (option) => option.type === "select" && option.id === "model" && option.category === "model",
    );
    const originalModelId = modelOption?.type === "select" ? modelOption.currentValue : undefined;

    const discover = Effect.gen(function* () {
      const discovered: Array<ServerProviderModel> = [];
      for (const model of initialModels) {
        const configOptions =
          model.slug === originalModelId
            ? initialConfigOptions
            : yield* runtime.setModel(model.slug).pipe(Effect.andThen(runtime.getConfigOptions));
        discovered.push({
          ...model,
          capabilities: buildOmpCapabilitiesFromConfigOptions(configOptions),
        });
      }
      return discovered;
    });

    return yield* originalModelId
      ? discover.pipe(Effect.ensuring(runtime.setModel(originalModelId).pipe(Effect.ignore)))
      : discover;
  });
}

export function buildOmpProviderSnapshot(input: {
  readonly checkedAt: string;
  readonly ompSettings: OmpSettings;
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly probe: ProviderProbeResult;
}): ServerProviderDraft {
  return buildServerProvider({
    presentation: OMP_PRESENTATION,
    enabled: input.ompSettings.enabled,
    checkedAt: input.checkedAt,
    models: input.models,
    probe: input.probe,
  });
}

export function buildFailedOmpProviderSnapshot(input: {
  readonly checkedAt: string;
  readonly ompSettings: OmpSettings;
  readonly installed: boolean;
  readonly version: string | null;
  readonly message: string;
}): ServerProviderDraft {
  return buildOmpProviderSnapshot({
    checkedAt: input.checkedAt,
    ompSettings: input.ompSettings,
    models: [],
    probe: {
      installed: input.installed,
      version: input.version,
      status: "error",
      auth: { status: "unknown" },
      message: input.message,
    },
  });
}

export function buildInitialOmpProviderSnapshot(
  ompSettings: OmpSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    if (!ompSettings.enabled) {
      return buildOmpProviderSnapshot({
        checkedAt,
        ompSettings,
        models: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Oh My Pi is disabled in Pulse Code settings.",
        },
      });
    }

    return buildOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      models: [],
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking Oh My Pi CLI availability...",
      },
    });
  });
}

export const discoverOmpModelsViaAcp = (
  ompSettings: OmpSettings,
  context: OmpProviderProcessContext,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const acp = yield* makeOmpAcpRuntime({
      ompSettings,
      runtimeMode: "approval-required",
      childProcessSpawner,
      cwd: context.cwd,
      agentDir: context.agentDir,
      environment: context.environment,
      clientInfo: { name: "pulse-code-provider-probe", version: "0.0.0" },
    });
    yield* acp.start();
    return yield* discoverOmpModelsFromRuntime(acp);
  }).pipe(Effect.scoped);

const runOmpVersionCommand = (ompSettings: OmpSettings, context: OmpProviderProcessContext) =>
  Effect.gen(function* () {
    const command = ompSettings.binaryPath || "omp";
    const environment = buildOmpProcessEnvironment(context.environment, context.agentDir);
    const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        cwd: context.cwd,
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

export const checkOmpProviderStatus = Effect.fn("checkOmpProviderStatus")(function* (
  ompSettings: OmpSettings,
  context: OmpProviderProcessContext,
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  if (!ompSettings.enabled) {
    return buildOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      models: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Oh My Pi is disabled in Pulse Code settings.",
      },
    });
  }

  const versionResult = yield* runOmpVersionCommand(ompSettings, context).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("Oh My Pi CLI health check failed", {
      errorTag: error._tag,
    });
    const missing = isCommandMissingCause(error);
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: !missing,
      version: null,
      message: missing
        ? `Oh My Pi CLI command \`${ompSettings.binaryPath || "omp"}\` is not installed or not on PATH.`
        : "Failed to execute the Oh My Pi CLI health check.",
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version: null,
      message: "Oh My Pi CLI timed out while running `omp --version`.",
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    yield* Effect.logWarning("Oh My Pi CLI version probe exited with a non-zero status", {
      exitCode: versionOutput.code,
      stdoutLength: versionOutput.stdout.length,
      stderrLength: versionOutput.stderr.length,
    });
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: "Oh My Pi CLI is installed but failed to run.",
    });
  }

  const discoveryExit = yield* discoverOmpModelsViaAcp(ompSettings, context).pipe(
    Effect.timeoutOption(OMP_ACP_MODEL_DISCOVERY_TIMEOUT_MS),
    Effect.exit,
  );
  if (Exit.isFailure(discoveryExit)) {
    yield* Effect.logWarning("Oh My Pi ACP model discovery failed", {
      errorTag: causeErrorTag(discoveryExit.cause),
    });
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: "Oh My Pi CLI is installed but ACP startup failed. Check server logs for details.",
    });
  }

  if (Option.isNone(discoveryExit.value)) {
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: `Oh My Pi ACP model discovery timed out after ${OMP_ACP_MODEL_DISCOVERY_TIMEOUT_MS}ms.`,
    });
  }

  const models = discoveryExit.value.value;
  if (models.length === 0) {
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: "Oh My Pi ACP model discovery returned no models.",
    });
  }

  return buildOmpProviderSnapshot({
    checkedAt,
    ompSettings,
    models,
    probe: {
      installed: true,
      version,
      status: "ready",
      auth: { status: "unknown" },
    },
  });
});
