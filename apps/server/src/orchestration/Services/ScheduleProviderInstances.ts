/**
 * ScheduleProviderInstances - Configured provider-instance ids for scheduled
 * chats.
 *
 * The ScheduleReactor checks a schedule's modelSelection against this at fire
 * time so a stale selection (its provider instance was removed) fails loudly
 * with reason "provider" instead of silently falling back to a different —
 * possibly far more expensive — model. The live implementation reads the
 * existing ProviderRegistry snapshots; tests stub the list directly.
 *
 * @module ScheduleProviderInstances
 */
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

/**
 * ScheduleProviderInstancesShape - Service API for enumerating configured
 * provider instance ids.
 */
export interface ScheduleProviderInstancesShape {
  readonly configuredInstanceIds: Effect.Effect<ReadonlyArray<ProviderInstanceId>>;
}

/**
 * ScheduleProviderInstances - Service tag for the configured-instance lookup.
 */
export class ScheduleProviderInstances extends Context.Service<
  ScheduleProviderInstances,
  ScheduleProviderInstancesShape
>()("t3/orchestration/Services/ScheduleProviderInstances") {}
