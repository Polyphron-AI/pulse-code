import { type OmpSettings, type ProviderInstanceId, type RuntimeMode } from "@t3tools/contracts";
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

const OMP_AUTH_METHOD_ID = "agent";
const OMP_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

type OmpAcpRuntimeSettings = Pick<OmpSettings, "binaryPath">;

export interface OmpAcpSpawnOptions {
  readonly ompSettings: OmpAcpRuntimeSettings | null | undefined;
  readonly runtimeMode: RuntimeMode;
  readonly cwd: string;
  readonly agentDir: string;
  readonly environment: NodeJS.ProcessEnv;
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

/** Resolve the credential and session store for one OMP provider instance. */
export function resolveOmpAgentDir(
  path: Pick<Path.Path, "join">,
  stateDir: string,
  instanceId: ProviderInstanceId,
): string {
  return path.join(stateDir, "providers", "omp", instanceId);
}

export function buildOmpProcessEnvironment(
  environment: NodeJS.ProcessEnv,
  agentDir: string,
): NodeJS.ProcessEnv {
  return {
    ...environment,
    [OMP_AGENT_DIR_ENV]: agentDir,
  };
}

export function buildOmpAcpSpawnInput(input: OmpAcpSpawnOptions): AcpSessionRuntime.AcpSpawnInput {
  return {
    command: input.ompSettings?.binaryPath || "omp",
    args: ["acp", "--approval-mode", OMP_APPROVAL_MODE_BY_RUNTIME_MODE[input.runtimeMode]],
    cwd: input.cwd,
    env: buildOmpProcessEnvironment(input.environment, input.agentDir),
  };
}

export function buildOmpAcpRuntimeOptions(
  input: OmpAcpRuntimeOptionsInput,
): AcpSessionRuntime.AcpSessionRuntimeOptions {
  const { agentDir, environment, ompSettings, runtimeMode, ...runtimeOptions } = input;
  return {
    ...runtimeOptions,
    spawn: buildOmpAcpSpawnInput({
      ompSettings,
      runtimeMode,
      cwd: input.cwd,
      agentDir,
      environment,
    }),
    authMethodId: OMP_AUTH_METHOD_ID,
    clientCapabilities: OMP_ACP_CLIENT_CAPABILITIES,
  };
}

export const makeOmpAcpRuntime = (
  input: OmpAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const { childProcessSpawner, ...runtimeOptionsInput } = input;
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer(buildOmpAcpRuntimeOptions(runtimeOptionsInput)).pipe(
        Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner)),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });
