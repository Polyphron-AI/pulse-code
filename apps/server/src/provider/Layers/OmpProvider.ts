import type { ModelCapabilities, OmpSettings, ServerProviderModel } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { buildOmpProcessEnvironment } from "../acp/OmpAcpSupport.ts";
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
const OMP_MODEL_CATALOG_TIMEOUT_MS = 4_000;
const OMP_PROBE_FORCE_KILL_AFTER = "1 second";

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());
const OmpCatalogModel = Schema.Struct({
  selector: NonEmptyString,
  name: NonEmptyString,
  reasoning: Schema.Boolean,
  thinking: Schema.NullOr(Schema.Array(NonEmptyString)),
});
const OmpModelCatalog = Schema.Struct({
  models: Schema.Array(OmpCatalogModel),
});
const decodeOmpModelCatalog = Schema.decodeUnknownEffect(Schema.fromJsonString(OmpModelCatalog));

type OmpCatalogModel = typeof OmpCatalogModel.Type;

export interface OmpProviderProcessContext {
  readonly cwd: string;
  readonly agentDir: string;
  readonly environment: NodeJS.ProcessEnv;
}

function buildOmpModelCapabilities(model: OmpCatalogModel): ModelCapabilities {
  if (!model.reasoning) {
    return EMPTY_CAPABILITIES;
  }

  const options = [
    { value: "off", label: "Off" },
    { value: "auto", label: "Auto" },
  ];
  const seen = new Set(options.map((option) => option.value));
  for (const effort of model.thinking ?? []) {
    if (seen.has(effort)) {
      continue;
    }
    seen.add(effort);
    options.push({ value: effort, label: effort });
  }

  return createModelCapabilities({
    optionDescriptors: [
      buildSelectOptionDescriptor({
        id: "reasoning",
        label: "Thinking",
        options,
      }),
    ],
  });
}

function buildOmpModelsFromCatalog(
  catalog: typeof OmpModelCatalog.Type,
): ReadonlyArray<ServerProviderModel> {
  return catalog.models.map((model) => ({
    slug: model.selector,
    name: model.name,
    isCustom: false,
    capabilities: buildOmpModelCapabilities(model),
  }));
}

export const parseOmpModelsJson = Effect.fn("parseOmpModelsJson")(function* (output: string) {
  const catalog = yield* decodeOmpModelCatalog(output);
  return buildOmpModelsFromCatalog(catalog);
});

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

const runOmpCommand = (
  ompSettings: OmpSettings,
  context: OmpProviderProcessContext,
  args: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const command = ompSettings.binaryPath || "omp";
    const environment = buildOmpProcessEnvironment(context.environment, context.agentDir);
    const spawnCommand = yield* resolveSpawnCommand(command, args, {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        cwd: context.cwd,
        env: environment,
        forceKillAfter: OMP_PROBE_FORCE_KILL_AFTER,
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

  const versionResult = yield* runOmpCommand(ompSettings, context, ["--version"]).pipe(
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

  const catalogResult = yield* runOmpCommand(ompSettings, context, ["models", "--json"]).pipe(
    Effect.timeoutOption(OMP_MODEL_CATALOG_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(catalogResult)) {
    yield* Effect.logWarning("Oh My Pi CLI model catalog command failed", {
      errorTag: catalogResult.failure._tag,
    });
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: "Failed to execute `omp models --json`.",
    });
  }

  if (Option.isNone(catalogResult.success)) {
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: `Oh My Pi model catalog timed out after ${OMP_MODEL_CATALOG_TIMEOUT_MS}ms.`,
    });
  }

  const catalogOutput = catalogResult.success.value;
  if (catalogOutput.code !== 0) {
    yield* Effect.logWarning("Oh My Pi CLI model catalog exited with a non-zero status", {
      exitCode: catalogOutput.code,
      stdoutLength: catalogOutput.stdout.length,
      stderrLength: catalogOutput.stderr.length,
    });
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: "Oh My Pi CLI model catalog command failed.",
    });
  }

  const parsedModels = yield* parseOmpModelsJson(catalogOutput.stdout).pipe(Effect.result);
  if (Result.isFailure(parsedModels)) {
    yield* Effect.logWarning("Oh My Pi CLI returned malformed model catalog JSON", {
      errorTag: parsedModels.failure._tag,
      stdoutLength: catalogOutput.stdout.length,
    });
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: "Oh My Pi CLI returned malformed model catalog JSON.",
    });
  }

  const models = parsedModels.success;
  if (models.length === 0) {
    return buildFailedOmpProviderSnapshot({
      checkedAt,
      ompSettings,
      installed: true,
      version,
      message: "Oh My Pi CLI model catalog returned no models.",
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
