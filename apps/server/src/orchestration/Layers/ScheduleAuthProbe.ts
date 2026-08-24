import type { ProviderInstanceId, ServerProviderAuth } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProviderRegistry } from "../../provider/Services/ProviderRegistry.ts";
import { ScheduleAuthProbe, type ScheduleAuthProbeShape } from "../Services/ScheduleAuthProbe.ts";

type ProviderAuthSnapshot = {
  readonly instanceId: ProviderInstanceId;
  readonly auth: ServerProviderAuth;
};

export function scheduleAuthResult(
  instanceId: ProviderInstanceId | null,
  providers: ReadonlyArray<ProviderAuthSnapshot>,
) {
  if (instanceId === null) return { _tag: "unknown" as const };
  const provider = providers.find((entry) => entry.instanceId === instanceId);
  if (provider === undefined || provider.auth.status === "unknown") {
    return { _tag: "unknown" as const };
  }
  if (provider.auth.status === "unauthenticated") {
    return {
      _tag: "failed" as const,
      message: provider.auth.label ?? "Provider credentials are not authenticated.",
    };
  }
  return { _tag: "ok" as const };
}

/** Uses the existing provider health snapshots; unknown probes still fire so
 * providers without an authoritative auth signal fail through the normal turn path. */
export const ScheduleAuthProbeLive = Layer.effect(
  ScheduleAuthProbe,
  Effect.gen(function* () {
    const registry = yield* ProviderRegistry;
    return {
      probe: (input) =>
        registry.getProviders.pipe(
          Effect.map((providers) =>
            scheduleAuthResult(input.modelSelection?.instanceId ?? null, providers),
          ),
        ),
    } satisfies ScheduleAuthProbeShape;
  }),
);
