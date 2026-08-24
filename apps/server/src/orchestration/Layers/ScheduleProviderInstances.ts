/**
 * Live ScheduleProviderInstances: enumerates configured provider instance ids
 * from the existing ProviderRegistry snapshots (one snapshot per configured
 * instance), consumed through its exported service interface only.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProviderRegistry } from "../../provider/Services/ProviderRegistry.ts";
import { ScheduleProviderInstances } from "../Services/ScheduleProviderInstances.ts";

export const ScheduleProviderInstancesLive = Layer.effect(
  ScheduleProviderInstances,
  Effect.gen(function* () {
    const registry = yield* ProviderRegistry;
    return {
      configuredInstanceIds: registry.getProviders.pipe(
        Effect.map((providers) => providers.map((provider) => provider.instanceId)),
      ),
    };
  }),
);
