/**
 * ScheduleWorkingTreeProbe - Working-tree dirtiness probe for scheduled chats.
 *
 * The ScheduleReactor consults this before firing an occurrence whose
 * effective skip-if-dirty flag is on: a dirty tree turns the fire into a
 * visible "dirty" failure instead of an unattended run trampling half-done
 * work. The live implementation delegates to the existing GitVcsDriver git
 * plumbing; tests stub it directly.
 *
 * @module ScheduleWorkingTreeProbe
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

/**
 * ScheduleWorkingTreeProbeShape - Service API for the dirty-tree probe.
 * `isDirty` never fails: probe trouble degrades to "not dirty" so a broken
 * git binary cannot silently stall every schedule.
 */
export interface ScheduleWorkingTreeProbeShape {
  readonly isDirty: (workspaceRoot: string) => Effect.Effect<boolean>;
}

/**
 * ScheduleWorkingTreeProbe - Service tag for the scheduled-chat dirty probe.
 */
export class ScheduleWorkingTreeProbe extends Context.Service<
  ScheduleWorkingTreeProbe,
  ScheduleWorkingTreeProbeShape
>()("t3/orchestration/Services/ScheduleWorkingTreeProbe") {}
