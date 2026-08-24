/**
 * ScheduleAuthProbe - Pre-flight provider auth check for scheduled chats.
 *
 * The ScheduleReactor consults this before firing a scheduled occurrence so a
 * schedule that would immediately die on expired credentials fails fast with
 * reason "auth" instead of burning a turn. The live implementation currently
 * answers "unknown" (fire anyway); real provider probes can replace it later
 * without touching the reactor.
 *
 * @module ScheduleAuthProbe
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ModelSelection, ProjectId, ScheduleId } from "@t3tools/contracts";

/**
 * Result of a pre-flight auth probe. "unknown" means the probe could not
 * determine auth state and the occurrence should fire anyway.
 */
export type ScheduleAuthProbeResult =
  | { readonly _tag: "ok" }
  | { readonly _tag: "unknown" }
  | { readonly _tag: "failed"; readonly message?: string };

export interface ScheduleAuthProbeInput {
  readonly scheduleId: ScheduleId;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection | null;
}

/**
 * ScheduleAuthProbeShape - Service API for scheduled-chat auth probing.
 */
export interface ScheduleAuthProbeShape {
  readonly probe: (input: ScheduleAuthProbeInput) => Effect.Effect<ScheduleAuthProbeResult>;
}

/**
 * ScheduleAuthProbe - Service tag for the scheduled-chat auth probe.
 */
export class ScheduleAuthProbe extends Context.Service<ScheduleAuthProbe, ScheduleAuthProbeShape>()(
  "t3/orchestration/Services/ScheduleAuthProbe",
) {}
