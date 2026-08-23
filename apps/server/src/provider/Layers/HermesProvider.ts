import {
  type HermesSettings,
  type ModelCapabilities,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  buildBooleanOptionDescriptor,
  buildSelectOptionDescriptor,
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";
import {
  HERMES_DEFAULT_MODEL_SLUG,
  HERMES_FAST_VARIANT_SUFFIX,
  makeHermesAcpRuntime,
  resolveHermesAcpBaseModelId,
} from "../acp/HermesAcpSupport.ts";

const HERMES_PRESENTATION = {
  displayName: "Hermes",
  badgeLabel: "Early Access",
  showInteractionModeToggle: false,
  requiresNewThreadForModelChange: false,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});
/** For models whose catalog has a `-fast` sibling, collapsed into a toggle. */
const HERMES_FAST_CAPABLE_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [buildBooleanOptionDescriptor({ id: "fastMode", label: "Fast Mode" })],
});

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const HERMES_ACP_MODEL_DISCOVERY_TIMEOUT_MS = 15_000;

/**
 * Hermes has no static catalog — real models arrive dynamically over ACP as
 * `provider:model` ids. The built-in placeholder means "whatever model Hermes
 * is currently configured with" and is never sent to Hermes.
 */
const HERMES_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: HERMES_DEFAULT_MODEL_SLUG,
    name: "Hermes Default",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

export function buildInitialHermesProviderSnapshot(
  hermesSettings: HermesSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = hermesModelsFromSettings(hermesSettings.customModels);

    if (!hermesSettings.enabled) {
      return buildServerProvider({
        presentation: HERMES_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Hermes is disabled in Pulse Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking Hermes Agent CLI availability...",
      },
    });
  });
}

function hermesModelsFromSettings(
  customModels: ReadonlyArray<string> | undefined,
  builtInModels: ReadonlyArray<ServerProviderModel> = HERMES_BUILT_IN_MODELS,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(builtInModels, customModels ?? [], EMPTY_CAPABILITIES);
}

/**
 * Hermes model ids are `route:modelPath` where the route is the credentialed
 * connection (anthropic, openai-codex, copilot, ...). Subscription routes
 * (Claude Code OAuth, Codex OAuth) can only actually serve their own model
 * family, but Hermes lists its whole catalog under the active route — so we
 * keep only the family the connection authorizes. Pay-per-use API routes
 * (openrouter, nous, ...) genuinely serve their full catalog and pass through.
 */
const HERMES_ROUTE_MODEL_FAMILY: Readonly<Record<string, RegExp>> = {
  anthropic: /^~?(anthropic\/)?claude[-/.]/i,
  "claude-code": /^~?(anthropic\/)?claude[-/.]/i,
  "openai-codex": /^(openai\/)?(gpt-|codex|o[134][-.]?(mini|preview)?$)/i,
  openai: /^(openai\/)?(gpt-|codex|o[134][-.]?(mini|preview)?$)/i,
};

/** Batch-only and non-chat modalities cannot back an interactive agent turn. */
const HERMES_INCOMPATIBLE_MODEL_PATTERN =
  /:batch$|(^|[-/.])(image|lyria|guard|moderation|embed(ding)?s?|tts|whisper)([-/.:]|$)/i;

const HERMES_CURRENT_CLAUDE_PATTERN =
  /claude-(fable|opus|sonnet)-5(-fast)?$|claude-[a-z]+-latest$/i;
const HERMES_CURRENT_OPENAI_PATTERN = /gpt-5|codex/i;

function splitHermesModelId(modelId: string): { route: string; modelPath: string } {
  const separator = modelId.indexOf(":");
  if (separator <= 0) {
    return { route: "", modelPath: modelId };
  }
  return { route: modelId.slice(0, separator), modelPath: modelId.slice(separator + 1) };
}

export function isVettedHermesModel(modelId: string): boolean {
  const { route, modelPath } = splitHermesModelId(modelId);
  if (HERMES_INCOMPATIBLE_MODEL_PATTERN.test(modelPath)) {
    return false;
  }
  const family = HERMES_ROUTE_MODEL_FAMILY[route];
  return family === undefined || family.test(modelPath);
}

export function isLegacyHermesModel(modelId: string): boolean {
  const { modelPath } = splitHermesModelId(modelId);
  if (/claude/i.test(modelPath)) {
    return !HERMES_CURRENT_CLAUDE_PATTERN.test(modelPath);
  }
  if (/^(openai\/)?(gpt-|o[134][-.])/i.test(modelPath)) {
    return !HERMES_CURRENT_OPENAI_PATTERN.test(modelPath);
  }
  return false;
}

export function buildHermesDiscoveredModelsFromSessionModelState(
  modelState: EffectAcpSchema.SessionModelState | null | undefined,
): ReadonlyArray<ServerProviderModel> {
  if (!modelState || modelState.availableModels.length === 0) {
    return [];
  }
  const currentModelId = modelState.currentModelId?.trim();
  const seen = new Set<string>();
  const vetted = modelState.availableModels
    .map((model): ServerProviderModel | undefined => {
      const slug = resolveHermesAcpBaseModelId(model.modelId);
      if (!slug || seen.has(slug)) {
        return undefined;
      }
      // The active model is always usable regardless of vetting — it is what
      // Hermes will run with when the placeholder default is selected.
      if (slug !== currentModelId && !isVettedHermesModel(slug)) {
        return undefined;
      }
      seen.add(slug);
      return {
        slug,
        name: model.name.trim() || slug,
        isCustom: false,
        capabilities: EMPTY_CAPABILITIES,
        ...(isLegacyHermesModel(slug) ? { isLegacy: true } : {}),
      };
    })
    .filter((model): model is ServerProviderModel => model !== undefined);

  // Collapse `-fast` siblings into the standard Fast Mode toggle on the base
  // model — same selection flow as Claude: pick the model first, then flip
  // Fast Mode. The active model is never collapsed away.
  const slugs = new Set(vetted.map((model) => model.slug));
  return vetted
    .filter(
      (model) =>
        model.slug === currentModelId ||
        !(
          model.slug.endsWith(HERMES_FAST_VARIANT_SUFFIX) &&
          slugs.has(model.slug.slice(0, -HERMES_FAST_VARIANT_SUFFIX.length))
        ),
    )
    .map((model) =>
      slugs.has(`${model.slug}${HERMES_FAST_VARIANT_SUFFIX}`)
        ? { ...model, capabilities: HERMES_FAST_CAPABLE_CAPABILITIES }
        : model,
    );
}

const discoverHermesModelsViaAcp = (
  hermesSettings: HermesSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const acp = yield* makeHermesAcpRuntime({
      hermesSettings,
      environment,
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* acp.start();
    return buildHermesDiscoveredModelsFromSessionModelState(started.sessionSetupResult.models);
  }).pipe(Effect.scoped);

const runHermesCliCommand = (
  hermesSettings: HermesSettings,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const command = hermesSettings.binaryPath || "hermes";
    const spawnCommand = yield* resolveSpawnCommand(command, [...args], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

const runHermesVersionCommand = (
  hermesSettings: HermesSettings,
  environment: NodeJS.ProcessEnv = process.env,
) => runHermesCliCommand(hermesSettings, ["--version"], environment);

const HERMES_COMPRESSION_THRESHOLD_KEY = "compression.threshold";

/** Accepts "50", "50%", or a "0.5" fraction; returns a whole percent 1-100. */
export function parseHermesContextCompressionPercent(
  value: string | null | undefined,
): number | undefined {
  const trimmed = value?.trim().replace(/%$/, "");
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  const percent = Math.round(parsed <= 1 ? parsed * 100 : parsed);
  return percent >= 1 && percent <= 100 ? percent : undefined;
}

/**
 * Hermes' context setting is its global compression threshold (how full the
 * context gets before Hermes compacts it). When the user set a threshold in
 * Pulse Code settings, push it to the Hermes CLI config; either way return the
 * effective percent so threads can display it.
 */
const syncHermesContextCompression = (
  hermesSettings: HermesSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const requested = parseHermesContextCompressionPercent(
      hermesSettings.contextCompressionThreshold,
    );
    const currentOutput = yield* runHermesCliCommand(
      hermesSettings,
      ["config", "get", HERMES_COMPRESSION_THRESHOLD_KEY],
      environment,
    );
    const current =
      currentOutput.code === 0
        ? parseHermesContextCompressionPercent(currentOutput.stdout)
        : undefined;
    if (requested === undefined || requested === current) {
      return requested ?? current;
    }
    const setOutput = yield* runHermesCliCommand(
      hermesSettings,
      ["config", "set", HERMES_COMPRESSION_THRESHOLD_KEY, String(requested / 100)],
      environment,
    );
    if (setOutput.code !== 0) {
      yield* Effect.logWarning("Failed to apply Hermes context compression threshold.", {
        exitCode: setOutput.code,
      });
      return current;
    }
    return requested;
  }).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(undefined),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
    Effect.orElseSucceed(() => undefined),
  );

/**
 * Read-only Context row for the thread traits menu: Hermes' compression
 * threshold is a provider-global setting, so it renders greyed out per-thread
 * and is changed in Settings → Providers → Hermes.
 */
export function buildHermesContextOptionDescriptor(percent: number) {
  return buildSelectOptionDescriptor({
    id: "contextCompression",
    label: "Context",
    readOnly: true,
    options: [
      {
        value: String(percent),
        label: `Compress at ${percent}%`,
        description: "Hermes-wide setting. Change it in Settings under the Hermes provider.",
        isDefault: true,
      },
    ],
  });
}

export function withHermesContextOption(
  models: ReadonlyArray<ServerProviderModel>,
  percent: number | undefined,
): ReadonlyArray<ServerProviderModel> {
  if (percent === undefined) {
    return models;
  }
  const descriptor = buildHermesContextOptionDescriptor(percent);
  return models.map((model) => ({
    ...model,
    capabilities: createModelCapabilities({
      optionDescriptors: [...(model.capabilities?.optionDescriptors ?? []), descriptor],
    }),
  }));
}

export const checkHermesProviderStatus = Effect.fn("checkHermesProviderStatus")(function* (
  hermesSettings: HermesSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = hermesModelsFromSettings(hermesSettings.customModels);

  if (!hermesSettings.enabled) {
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Hermes is disabled in Pulse Code settings.",
      },
    });
  }

  const versionResult = yield* runHermesVersionCommand(hermesSettings, environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("Hermes CLI health check failed.", {
      errorTag: error._tag,
    });
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: hermesSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "Hermes Agent CLI (`hermes`) is not installed or not on PATH."
          : "Failed to execute Hermes CLI health check.",
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: hermesSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Hermes CLI is installed but timed out while running `hermes --version`.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    yield* Effect.logWarning("Hermes CLI version probe exited with a non-zero status.", {
      exitCode: versionOutput.code,
      stdoutLength: versionOutput.stdout.length,
      stderrLength: versionOutput.stderr.length,
    });
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: hermesSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Hermes CLI is installed but failed to run.",
      },
    });
  }

  const contextCompressionPercent = yield* syncHermesContextCompression(
    hermesSettings,
    environment,
  );

  const discoveryExit = yield* discoverHermesModelsViaAcp(hermesSettings, environment).pipe(
    Effect.timeoutOption(HERMES_ACP_MODEL_DISCOVERY_TIMEOUT_MS),
    Effect.exit,
  );
  if (Exit.isFailure(discoveryExit)) {
    yield* Effect.logWarning("Hermes ACP model discovery failed", {
      errorTag: causeErrorTag(discoveryExit.cause),
    });
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: hermesSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message:
          "Hermes CLI is installed but ACP startup failed. Run `hermes` once to complete setup, then check server logs.",
      },
    });
  }
  if (Option.isNone(discoveryExit.value)) {
    yield* Effect.logWarning(
      `Hermes ACP model discovery timed out after ${HERMES_ACP_MODEL_DISCOVERY_TIMEOUT_MS}ms.`,
    );
    return buildServerProvider({
      presentation: HERMES_PRESENTATION,
      enabled: hermesSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: `Hermes CLI is installed but ACP startup timed out after ${HERMES_ACP_MODEL_DISCOVERY_TIMEOUT_MS}ms.`,
      },
    });
  }
  const discoveredModels = discoveryExit.value.value;
  const models = withHermesContextOption(
    discoveredModels.length > 0
      ? hermesModelsFromSettings(hermesSettings.customModels, [
          ...HERMES_BUILT_IN_MODELS,
          ...discoveredModels.filter((model) => model.slug !== HERMES_DEFAULT_MODEL_SLUG),
        ])
      : fallbackModels,
    contextCompressionPercent,
  );

  return buildServerProvider({
    presentation: HERMES_PRESENTATION,
    enabled: hermesSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version,
      status: "ready",
      auth: { status: "unknown" },
    },
  });
});

export const enrichHermesSnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  readonly httpClient: HttpClient.HttpClient;
}): Effect.Effect<void> => {
  const { snapshot, publishSnapshot } = input;

  return enrichProviderSnapshotWithVersionAdvisory(snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, input.httpClient),
    Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
    Effect.catchCause((cause) =>
      Effect.logWarning("Hermes version advisory enrichment failed", {
        errorTag: causeErrorTag(cause),
      }),
    ),
    Effect.asVoid,
  );
};
