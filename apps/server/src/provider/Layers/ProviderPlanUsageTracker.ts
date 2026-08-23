/**
 * ProviderPlanUsageTrackerLive — folds `account.rate-limits.updated` runtime
 * events into `ServerProvider.planUsage` via the provider registry.
 *
 * Adapters emit the provider's raw rate-limit notification; this tracker
 * normalizes it (`planUsage.ts`), merges it with the instance's last-known
 * snapshot, and hands the result to `ProviderRegistry.setProviderPlanUsage`,
 * which republishes the decorated provider list to every client.
 *
 * @module ProviderPlanUsageTrackerLive
 */
import { defaultInstanceIdForDriver } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { forkParked } from "../../serverActivation.ts";
import { ProviderRegistry } from "../Services/ProviderRegistry.ts";
import { ProviderService } from "../Services/ProviderService.ts";
import { mergePlanUsage, planUsageDeltaFromRuntimeEvent } from "../planUsage.ts";

export const ProviderPlanUsageTrackerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const providerService = yield* ProviderService;
    const providerRegistry = yield* ProviderRegistry;

    yield* forkParked(
      Stream.runForEach(providerService.streamEvents, (event) =>
        Effect.gen(function* () {
          const delta = planUsageDeltaFromRuntimeEvent(event);
          if (delta === undefined) {
            return;
          }
          const instanceId = event.providerInstanceId ?? defaultInstanceIdForDriver(event.provider);
          // The registry's snapshot is the merge base (not a tracker-local
          // map) so cache-hydrated windows from before a restart survive a
          // sparse update that only names one window.
          const providers = yield* providerRegistry.getProviders;
          const previous = providers.find(
            (provider) => provider.instanceId === instanceId,
          )?.planUsage;
          yield* providerRegistry.setProviderPlanUsage({
            instanceId,
            planUsage: mergePlanUsage(previous, delta, event.createdAt),
          });
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider plan usage tracker failed to apply update", {
              eventId: event.eventId,
              cause: Cause.pretty(cause),
            }),
          ),
        ),
      ),
    );
  }),
);
