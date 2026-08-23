import { type HermesSettings, type ModelSelection, ProviderDriverKind } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { getModelSelectionBooleanOptionValue, normalizeModelSlug } from "@t3tools/shared/model";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

/**
 * Pulse Code owns MCP wiring for the session, so Hermes must not also load
 * the user's globally configured MCP servers from ~/.hermes/config.yaml.
 */
const HERMES_SKIP_CONFIGURED_MCP_ENV = "HERMES_ACP_SKIP_CONFIGURED_MCP";
const HERMES_DRIVER_KIND = ProviderDriverKind.make("hermes");

/**
 * Placeholder slug meaning "whatever model Hermes is configured with".
 * Hermes reports real model ids over ACP as `provider:model`; this slug is
 * never sent to Hermes — selecting it skips `session/set_model` entirely.
 */
export const HERMES_DEFAULT_MODEL_SLUG = "hermes-default";

type HermesAcpRuntimeHermesSettings = Pick<HermesSettings, "binaryPath">;

interface HermesAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly hermesSettings: HermesAcpRuntimeHermesSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildHermesAcpSpawnInput(
  hermesSettings: HermesAcpRuntimeHermesSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  return {
    command: hermesSettings?.binaryPath || "hermes",
    args: ["acp"],
    cwd,
    env: {
      ...environment,
      [HERMES_SKIP_CONFIGURED_MCP_ENV]: "1",
    },
  };
}

/**
 * Hermes authenticates via its own on-disk credentials (~/.hermes); over ACP
 * it only advertises a terminal setup method, so no `authenticate` call is
 * made — `authMethodId` is intentionally omitted.
 */
export const makeHermesAcpRuntime = (
  input: HermesAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildHermesAcpSpawnInput(input.hermesSettings, input.cwd, input.environment),
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

export function resolveHermesAcpBaseModelId(model: string | null | undefined): string {
  const trimmed = model?.trim();
  const base = trimmed && trimmed.length > 0 ? trimmed : HERMES_DEFAULT_MODEL_SLUG;
  return normalizeModelSlug(base, HERMES_DRIVER_KIND) ?? HERMES_DEFAULT_MODEL_SLUG;
}

/** Suffix Hermes uses for the fast-inference variant of a model id. */
export const HERMES_FAST_VARIANT_SUFFIX = "-fast";

/** The placeholder slug means "keep Hermes' current model" — never request it. */
export function requestedHermesAcpModelId(model: string | null | undefined): string | undefined {
  const resolved = resolveHermesAcpBaseModelId(model);
  return resolved === HERMES_DEFAULT_MODEL_SLUG ? undefined : resolved;
}

/**
 * Resolve the model id to request from a full model selection. Fast Mode is a
 * standard boolean option on models whose catalog has a `-fast` sibling
 * (discovery collapses the sibling into the toggle), so an enabled toggle maps
 * back to the variant id here.
 */
export function requestedHermesAcpModelIdForSelection(
  modelSelection: ModelSelection | null | undefined,
): string | undefined {
  const requested = requestedHermesAcpModelId(modelSelection?.model);
  const fastMode = getModelSelectionBooleanOptionValue(modelSelection, "fastMode");
  if (!requested || fastMode !== true || requested.endsWith(HERMES_FAST_VARIANT_SUFFIX)) {
    return requested;
  }
  return `${requested}${HERMES_FAST_VARIANT_SUFFIX}`;
}

export function currentHermesModelIdFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): string | undefined {
  return sessionSetupResult.models?.currentModelId?.trim() || undefined;
}

export function applyHermesAcpModelSelection<E>(input: {
  readonly runtime: Pick<AcpSessionRuntime.AcpSessionRuntime["Service"], "setSessionModel">;
  readonly currentModelId: string | undefined;
  readonly requestedModelId: string | undefined;
  readonly mapError: (cause: EffectAcpErrors.AcpError) => E;
}): Effect.Effect<string | undefined, E> {
  const shouldSwitchModel =
    input.requestedModelId !== undefined && input.requestedModelId !== input.currentModelId;
  if (!shouldSwitchModel) {
    return Effect.succeed(input.currentModelId);
  }
  return input.runtime
    .setSessionModel(input.requestedModelId)
    .pipe(Effect.mapError(input.mapError), Effect.as(input.requestedModelId));
}
