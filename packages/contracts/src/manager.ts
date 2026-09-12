import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CommandId,
  IsoDateTime,
  ManagerId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./model.ts";
import { RuntimeMode } from "./runtimeMode.ts";
import { ScheduleScope, type ThreadOrigin } from "./schedule.ts";

/**
 * Manager domain contracts. The manager role ships to users as **Argo**: a
 * record with a mission and a persistent thread that, on an interval, reads
 * its mission, looks at its child threads, and spawns or stops them. Every
 * identifier here says manager; only user-visible copy says Argo. See
 * docs/plans/2026-09-11-agent-roles-design.md section 3.
 *
 * Phase A is the record, its commands, and its events. The cycle reactor and
 * the manager tool catalog land later.
 */

/** How many live children one manager may own at once. */
export const ManagerMaxChildren = Schema.Literals([2, 4, 8, 16]);
export type ManagerMaxChildren = typeof ManagerMaxChildren.Type;
export const DEFAULT_MANAGER_MAX_CHILDREN: ManagerMaxChildren = 8;

/** Minutes between cycles. */
export const ManagerIntervalMinutes = Schema.Literals([1, 5, 15, 30, 60, 120, 240]);
export type ManagerIntervalMinutes = typeof ManagerIntervalMinutes.Type;
export const DEFAULT_MANAGER_INTERVAL_MINUTES: ManagerIntervalMinutes = 30;

export const DEFAULT_MANAGER_CHILD_RUNTIME_MODE: RuntimeMode = "auto-accept-edits";

export const OrchestrationManager = Schema.Struct({
  id: ManagerId,
  name: TrimmedNonEmptyString,
  /** Project scope, or environment scope, so one manager can span repositories. */
  scope: ScheduleScope,
  /** The only free-form configuration. Empty means the manager does nothing. */
  mission: Schema.String,
  /** Model new children start with; null means the project's default. */
  childModelSelection: Schema.NullOr(ModelSelection),
  childRuntimeMode: RuntimeMode.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_MANAGER_CHILD_RUNTIME_MODE)),
  ),
  maxChildren: ManagerMaxChildren.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_MANAGER_MAX_CHILDREN)),
  ),
  intervalMinutes: ManagerIntervalMinutes.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_MANAGER_INTERVAL_MINUTES)),
  ),
  /** The manager's own persistent thread; null until it is bound. */
  threadId: Schema.NullOr(ThreadId),
  pausedAt: Schema.NullOr(IsoDateTime),
  lastCycleAt: Schema.NullOr(IsoDateTime),
  /**
   * Set by `manager.cycle-now` when a user asks for a cycle before the
   * interval elapses, and cleared once that cycle is recorded. Optional so
   * snapshots written before this field still decode; absent means null.
   */
  cycleRequestedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type OrchestrationManager = typeof OrchestrationManager.Type;

export const ManagerState = Schema.Literals(["watching", "paused", "no-mission"]);
export type ManagerState = typeof ManagerState.Type;

/**
 * A manager with no mission has nothing to do, whatever its pause flag says,
 * so "no-mission" wins over "paused".
 */
export function managerState(
  manager: Pick<OrchestrationManager, "mission" | "pausedAt">,
): ManagerState {
  if (manager.mission.trim().length === 0) return "no-mission";
  return manager.pausedAt !== null ? "paused" : "watching";
}

const MANAGER_ORIGIN_PREFIX = "manager:";

/** Thread origin marking a manager's own thread and each of its children. */
export function managerThreadOrigin(managerId: ManagerId): ThreadOrigin {
  return `${MANAGER_ORIGIN_PREFIX}${managerId}`;
}

export function isManagerThreadOrigin(origin: ThreadOrigin): boolean {
  return origin.startsWith(MANAGER_ORIGIN_PREFIX) && origin.length > MANAGER_ORIGIN_PREFIX.length;
}

export function managerIdFromThreadOrigin(origin: ThreadOrigin): ManagerId | null {
  return isManagerThreadOrigin(origin)
    ? ManagerId.make(origin.slice(MANAGER_ORIGIN_PREFIX.length))
    : null;
}

// --- Commands ---

export const ManagerCreateCommand = Schema.Struct({
  type: Schema.Literal("manager.create"),
  commandId: CommandId,
  managerId: ManagerId,
  name: TrimmedNonEmptyString,
  scope: ScheduleScope,
  mission: Schema.optional(Schema.String),
  childModelSelection: Schema.optional(ModelSelection),
  childRuntimeMode: Schema.optional(RuntimeMode),
  maxChildren: Schema.optional(ManagerMaxChildren),
  intervalMinutes: Schema.optional(ManagerIntervalMinutes),
  createdAt: IsoDateTime,
});
export type ManagerCreateCommand = typeof ManagerCreateCommand.Type;

export const ManagerUpdateCommand = Schema.Struct({
  type: Schema.Literal("manager.update"),
  commandId: CommandId,
  managerId: ManagerId,
  name: Schema.optional(TrimmedNonEmptyString),
  scope: Schema.optional(ScheduleScope),
  mission: Schema.optional(Schema.String),
  // Absent = leave unchanged; null = clear back to the project's default.
  childModelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  childRuntimeMode: Schema.optional(RuntimeMode),
  maxChildren: Schema.optional(ManagerMaxChildren),
  intervalMinutes: Schema.optional(ManagerIntervalMinutes),
});
export type ManagerUpdateCommand = typeof ManagerUpdateCommand.Type;

export const ManagerPauseCommand = Schema.Struct({
  type: Schema.Literal("manager.pause"),
  commandId: CommandId,
  managerId: ManagerId,
});
export type ManagerPauseCommand = typeof ManagerPauseCommand.Type;

export const ManagerResumeCommand = Schema.Struct({
  type: Schema.Literal("manager.resume"),
  commandId: CommandId,
  managerId: ManagerId,
});
export type ManagerResumeCommand = typeof ManagerResumeCommand.Type;

/** "Cycle now": run this manager's next cycle on the next sweep. */
export const ManagerCycleNowCommand = Schema.Struct({
  type: Schema.Literal("manager.cycle-now"),
  commandId: CommandId,
  managerId: ManagerId,
});
export type ManagerCycleNowCommand = typeof ManagerCycleNowCommand.Type;

export const ManagerDeleteCommand = Schema.Struct({
  type: Schema.Literal("manager.delete"),
  commandId: CommandId,
  managerId: ManagerId,
  /** False archives every live child thread along with the manager. */
  keepChildren: Schema.Boolean,
});
export type ManagerDeleteCommand = typeof ManagerDeleteCommand.Type;

// Binding and cycle recording are server-only: no client may claim a manager
// ran, or point a manager at a thread the server did not create.

export const ManagerThreadBindCommand = Schema.Struct({
  type: Schema.Literal("manager.thread.bind"),
  commandId: CommandId,
  managerId: ManagerId,
  threadId: ThreadId,
});
export type ManagerThreadBindCommand = typeof ManagerThreadBindCommand.Type;

export const ManagerCycleRecordCommand = Schema.Struct({
  type: Schema.Literal("manager.cycle.record"),
  commandId: CommandId,
  managerId: ManagerId,
  occurredAt: IsoDateTime,
});
export type ManagerCycleRecordCommand = typeof ManagerCycleRecordCommand.Type;

// --- Event payloads ---

export const ManagerCreatedPayload = Schema.Struct({
  managerId: ManagerId,
  name: TrimmedNonEmptyString,
  scope: ScheduleScope,
  mission: Schema.String,
  childModelSelection: Schema.NullOr(ModelSelection),
  childRuntimeMode: RuntimeMode,
  maxChildren: ManagerMaxChildren,
  intervalMinutes: ManagerIntervalMinutes,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ManagerCreatedPayload = typeof ManagerCreatedPayload.Type;

export const ManagerUpdatedPayload = Schema.Struct({
  managerId: ManagerId,
  name: Schema.optional(TrimmedNonEmptyString),
  scope: Schema.optional(ScheduleScope),
  mission: Schema.optional(Schema.String),
  childModelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  childRuntimeMode: Schema.optional(RuntimeMode),
  maxChildren: Schema.optional(ManagerMaxChildren),
  intervalMinutes: Schema.optional(ManagerIntervalMinutes),
  updatedAt: IsoDateTime,
});
export type ManagerUpdatedPayload = typeof ManagerUpdatedPayload.Type;

export const ManagerPausedPayload = Schema.Struct({
  managerId: ManagerId,
  pausedAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ManagerPausedPayload = typeof ManagerPausedPayload.Type;

export const ManagerResumedPayload = Schema.Struct({
  managerId: ManagerId,
  updatedAt: IsoDateTime,
});
export type ManagerResumedPayload = typeof ManagerResumedPayload.Type;

export const ManagerDeletedPayload = Schema.Struct({
  managerId: ManagerId,
  /** Recorded so the log says whether the children survived the delete. */
  keepChildren: Schema.Boolean,
  deletedAt: IsoDateTime,
});
export type ManagerDeletedPayload = typeof ManagerDeletedPayload.Type;

export const ManagerCycleRequestedPayload = Schema.Struct({
  managerId: ManagerId,
  requestedAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ManagerCycleRequestedPayload = typeof ManagerCycleRequestedPayload.Type;

export const ManagerThreadBoundPayload = Schema.Struct({
  managerId: ManagerId,
  threadId: ThreadId,
  updatedAt: IsoDateTime,
});
export type ManagerThreadBoundPayload = typeof ManagerThreadBoundPayload.Type;

export const ManagerCycleRecordedPayload = Schema.Struct({
  managerId: ManagerId,
  occurredAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ManagerCycleRecordedPayload = typeof ManagerCycleRecordedPayload.Type;
