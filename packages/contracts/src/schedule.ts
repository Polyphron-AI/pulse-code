import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CommandId,
  IsoDateTime,
  ProjectId,
  ScheduleId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./model.ts";

/**
 * Scheduled Chats domain contracts: a schedule fires one turn per day at a
 * local wall-clock time, in one persistent thread per targeted project. See
 * docs/plans/2026-08-21-scheduled-chats-design.md.
 */

export const SCHEDULE_LIMIT_MINUTES_MIN = 1;
export const SCHEDULE_LIMIT_MINUTES_MAX = 120;
export const DEFAULT_SCHEDULE_MAX_RUN_MINUTES = 15;
export const DEFAULT_SCHEDULE_MAX_TURN_MINUTES = 10;
export const DEFAULT_SCHEDULE_HANDOFF_PATH_TEMPLATE = "handoff/{date}.md";
/** Consecutive per-project failures at which the server auto-pauses a schedule. */
export const SCHEDULE_AUTO_PAUSE_FAILURE_STREAK = 3;

export const ScheduleHourLocal = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 23 }));
export type ScheduleHourLocal = typeof ScheduleHourLocal.Type;
export const ScheduleMinuteLocal = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 59 }));
export type ScheduleMinuteLocal = typeof ScheduleMinuteLocal.Type;

export const ScheduleIntervalUnit = Schema.Literals(["minutes", "hours", "days", "weeks"]);
export type ScheduleIntervalUnit = typeof ScheduleIntervalUnit.Type;
export const ScheduleHandoffGitPolicy = Schema.Literals(["ignore", "commit"]);
export type ScheduleHandoffGitPolicy = typeof ScheduleHandoffGitPolicy.Type;
export const ScheduleInterval = Schema.Struct({
  value: Schema.Number.check(Schema.isGreaterThan(0)),
  unit: ScheduleIntervalUnit,
});
export type ScheduleInterval = typeof ScheduleInterval.Type;

const SCHEDULE_INTERVAL_UNIT_MINUTES: Readonly<Record<ScheduleIntervalUnit, number>> = {
  minutes: 1,
  hours: 60,
  days: 1_440,
  weeks: 10_080,
};

/** A compatible interval resolves exactly to whole minutes. */
export function scheduleIntervalMinutes(interval: ScheduleInterval): number | null {
  const minutes = interval.value * SCHEDULE_INTERVAL_UNIT_MINUTES[interval.unit];
  const rounded = Math.round(minutes);
  return Number.isSafeInteger(rounded) && rounded > 0 && Math.abs(minutes - rounded) < 1e-9
    ? rounded
    : null;
}

/** Wall-clock budget for a whole occurrence or a single turn within it. */
export const ScheduleLimitMinutes = Schema.Int.check(
  Schema.isBetween({ minimum: SCHEDULE_LIMIT_MINUTES_MIN, maximum: SCHEDULE_LIMIT_MINUTES_MAX }),
);
export type ScheduleLimitMinutes = typeof ScheduleLimitMinutes.Type;

/**
 * Project scope is the daily check-in for one project. Environment scope
 * targets a selected set of projects (or "all"), and an occurrence fans out
 * one turn per targeted project.
 */
export const ScheduleScope = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("project"),
    projectId: ProjectId,
  }),
  Schema.Struct({
    _tag: Schema.Literal("environment"),
    projectIds: Schema.Union([Schema.Array(ProjectId), Schema.Literal("all")]),
  }),
]);
export type ScheduleScope = typeof ScheduleScope.Type;

/**
 * Why an occurrence failed. "timeout:run"/"timeout:turn" are the watchdog
 * leashes, "auth" is the pre-flight credential probe, "provider" means the
 * provider was unavailable at fire time (CLI missing, spawn failed, or the
 * schedule's model selection names a provider instance that is no longer
 * configured); "dirty" means the fire was skipped because the project's
 * working tree had uncommitted changes (skip-if-dirty) — dirty failures never
 * count toward the auto-pause streak; "error" is the generic case, detailed
 * by the optional message on the failed event.
 */
export const ScheduleOccurrenceFailureReason = Schema.Literals([
  "timeout:run",
  "timeout:turn",
  "auth",
  "provider",
  "dirty",
  "error",
]);
export type ScheduleOccurrenceFailureReason = typeof ScheduleOccurrenceFailureReason.Type;

export const ScheduleOccurrenceStatus = Schema.Literals([
  "running",
  "completed",
  "failed",
  "skipped",
]);
export type ScheduleOccurrenceStatus = typeof ScheduleOccurrenceStatus.Type;
export const ScheduleOccurrenceSkipReason = Schema.Literal("thread-running");
export type ScheduleOccurrenceSkipReason = typeof ScheduleOccurrenceSkipReason.Type;

/**
 * Per-project schedule state. Project-scoped schedules have exactly one
 * entry; environment-scoped schedules have one per targeted project. The
 * persistent thread and the exactly-once occurrence key both live here, so
 * per-project delivery holds independently under environment fan-out.
 */
export const ScheduleProjectState = Schema.Struct({
  projectId: ProjectId,
  /** Persistent thread this schedule appends turns to; null until first fire. */
  threadId: Schema.NullOr(ThreadId),
  /** Last started occurrence key, e.g. `scheduled:<scheduleId>:<date>:<projectId>`. */
  lastOccurrenceKey: Schema.NullOr(TrimmedNonEmptyString),
  lastOccurrenceStatus: Schema.NullOr(ScheduleOccurrenceStatus),
  lastOccurrenceFailureReason: Schema.optional(Schema.NullOr(ScheduleOccurrenceFailureReason)),
  lastOccurrenceFailureMessage: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  lastOccurrenceAt: Schema.NullOr(IsoDateTime),
  /**
   * Consecutive failed occurrences for this project ("dirty" skips excluded).
   * Resets to 0 on a completed occurrence and on schedule resume; at
   * SCHEDULE_AUTO_PAUSE_FAILURE_STREAK the decider auto-pauses the schedule.
   */
  consecutiveFailures: Schema.Int.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  skippedRunCount: Schema.Int.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  lastSkipReason: Schema.optional(Schema.NullOr(ScheduleOccurrenceSkipReason)),
  lastSkippedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  lastScheduledOccurrenceKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  manualRunRequestKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  manualRunRequestedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type ScheduleProjectState = typeof ScheduleProjectState.Type;

export const OrchestrationSchedule = Schema.Struct({
  id: ScheduleId,
  scope: ScheduleScope,
  hourLocal: ScheduleHourLocal,
  minuteLocal: ScheduleMinuteLocal,
  /** Absent on persisted v1 schedules, which remain daily-at-time schedules. */
  interval: Schema.optional(Schema.NullOr(ScheduleInterval)),
  /** Reset only when the interval itself is created or changed. */
  intervalAnchorAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  /** Absent on schedules created before handoff Git management shipped. */
  handoffGitPolicy: Schema.optional(Schema.NullOr(ScheduleHandoffGitPolicy)),
  /** IANA time zone name; validity is a decider invariant. */
  timezone: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  /** Intended long-term prompt source; v1 carries it but runs raw prompt text. */
  workflowScriptRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  /** Per-schedule model override; absent/null means the project's defaults. */
  modelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  /**
   * Skip firing when the project's working tree is dirty. Absent/null means
   * the scope default — on for environment scope, off for project scope
   * (see scheduleSkipIfDirty).
   */
  skipIfDirty: Schema.optional(Schema.NullOr(Schema.Boolean)),
  /**
   * Why the server auto-paused this schedule, e.g. "paused after 3 failures:
   * auth". Absent/null when the schedule is not auto-paused; cleared on
   * resume.
   */
  autoPausedReason: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  handoffPathTemplate: TrimmedNonEmptyString.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SCHEDULE_HANDOFF_PATH_TEMPLATE)),
  ),
  maxRunMinutes: ScheduleLimitMinutes.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SCHEDULE_MAX_RUN_MINUTES)),
  ),
  maxTurnMinutes: ScheduleLimitMinutes.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_SCHEDULE_MAX_TURN_MINUTES)),
  ),
  pausedAt: Schema.NullOr(IsoDateTime),
  projectStates: Schema.Array(ScheduleProjectState),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type OrchestrationSchedule = typeof OrchestrationSchedule.Type;

/**
 * Who started a thread: an interactive user or a schedule
 * (`schedule:<scheduleId>`). Absent on persisted pre-schedule events, which
 * consumers must read as "user".
 */
export const ThreadOrigin = Schema.Union([
  Schema.Literal("user"),
  TrimmedNonEmptyString.check(Schema.isPattern(/^schedule:.+$/)),
]);
export type ThreadOrigin = typeof ThreadOrigin.Type;
export const DEFAULT_THREAD_ORIGIN: ThreadOrigin = "user";

export function scheduleThreadOrigin(scheduleId: ScheduleId): ThreadOrigin {
  return `schedule:${scheduleId}`;
}

/**
 * Effective skip-if-dirty for a schedule: an explicit value wins; absent/null
 * defaults by scope — on for environment scope (an unattended sweep must not
 * trample half-done work), off for project scope (a deliberate single-project
 * check-in).
 */
export function scheduleSkipIfDirty(
  schedule: Pick<OrchestrationSchedule, "scope" | "skipIfDirty">,
): boolean {
  return schedule.skipIfDirty ?? schedule.scope._tag === "environment";
}

export function scheduleIdFromThreadOrigin(origin: ThreadOrigin): ScheduleId | null {
  const rest = origin.startsWith("schedule:") ? origin.slice("schedule:".length) : "";
  return rest.length > 0 ? ScheduleId.make(rest) : null;
}

/**
 * Deterministic per-project occurrence identity: one key per schedule, local
 * date, and project. The decider rejects a re-start of the recorded last key,
 * so restarts, double ticks, and catch-up sweeps cannot double-fire a day.
 */
export function scheduleOccurrenceKey(input: {
  readonly scheduleId: ScheduleId;
  readonly dateLocal: string;
  readonly projectId: ProjectId;
}): string {
  return `scheduled:${input.scheduleId}:${input.dateLocal}:${input.projectId}`;
}

// --- Commands ---

export const ProjectScheduleCreateCommand = Schema.Struct({
  type: Schema.Literal("project.schedule.create"),
  commandId: CommandId,
  scheduleId: ScheduleId,
  scope: ScheduleScope,
  hourLocal: ScheduleHourLocal,
  minuteLocal: ScheduleMinuteLocal,
  interval: Schema.optional(ScheduleInterval),
  handoffGitPolicy: Schema.optional(ScheduleHandoffGitPolicy),
  timezone: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  workflowScriptRef: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(ModelSelection),
  skipIfDirty: Schema.optional(Schema.Boolean),
  handoffPathTemplate: Schema.optional(TrimmedNonEmptyString),
  maxRunMinutes: Schema.optional(ScheduleLimitMinutes),
  maxTurnMinutes: Schema.optional(ScheduleLimitMinutes),
  createdAt: IsoDateTime,
});
export type ProjectScheduleCreateCommand = typeof ProjectScheduleCreateCommand.Type;

export const ProjectScheduleUpdateCommand = Schema.Struct({
  type: Schema.Literal("project.schedule.update"),
  commandId: CommandId,
  scheduleId: ScheduleId,
  scope: Schema.optional(ScheduleScope),
  hourLocal: Schema.optional(ScheduleHourLocal),
  minuteLocal: Schema.optional(ScheduleMinuteLocal),
  interval: Schema.optional(Schema.NullOr(ScheduleInterval)),
  handoffGitPolicy: Schema.optional(Schema.NullOr(ScheduleHandoffGitPolicy)),
  timezone: Schema.optional(TrimmedNonEmptyString),
  prompt: Schema.optional(TrimmedNonEmptyString),
  // Absent = leave unchanged; null = clear the script reference.
  workflowScriptRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  // Absent = leave unchanged; null = clear back to the project's defaults.
  modelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  // Absent = leave unchanged; null = clear back to the scope default.
  skipIfDirty: Schema.optional(Schema.NullOr(Schema.Boolean)),
  handoffPathTemplate: Schema.optional(TrimmedNonEmptyString),
  maxRunMinutes: Schema.optional(ScheduleLimitMinutes),
  maxTurnMinutes: Schema.optional(ScheduleLimitMinutes),
});
export type ProjectScheduleUpdateCommand = typeof ProjectScheduleUpdateCommand.Type;

export const ProjectSchedulePauseCommand = Schema.Struct({
  type: Schema.Literal("project.schedule.pause"),
  commandId: CommandId,
  scheduleId: ScheduleId,
});
export type ProjectSchedulePauseCommand = typeof ProjectSchedulePauseCommand.Type;

export const ProjectScheduleResumeCommand = Schema.Struct({
  type: Schema.Literal("project.schedule.resume"),
  commandId: CommandId,
  scheduleId: ScheduleId,
});
export type ProjectScheduleResumeCommand = typeof ProjectScheduleResumeCommand.Type;

export const ProjectScheduleDeleteCommand = Schema.Struct({
  type: Schema.Literal("project.schedule.delete"),
  commandId: CommandId,
  scheduleId: ScheduleId,
});
export type ProjectScheduleDeleteCommand = typeof ProjectScheduleDeleteCommand.Type;

export const ProjectScheduleRunCommand = Schema.Struct({
  type: Schema.Literal("project.schedule.run"),
  commandId: CommandId,
  scheduleId: ScheduleId,
  createdAt: IsoDateTime,
});
export type ProjectScheduleRunCommand = typeof ProjectScheduleRunCommand.Type;

// Occurrence commands are server-internal: the ScheduleReactor dispatches
// them with a deterministic commandId (`scheduled:<scheduleId>:<occurrenceKey>`)
// so command-receipt idempotency backs the decider's exactly-once check.

export const ScheduleOccurrenceStartCommand = Schema.Struct({
  type: Schema.Literal("schedule.occurrence.start"),
  commandId: CommandId,
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  /** The schedule's persistent thread for this project. */
  threadId: ThreadId,
  startedAt: IsoDateTime,
  trigger: Schema.optional(Schema.Literals(["scheduled", "manual"])),
});
export type ScheduleOccurrenceStartCommand = typeof ScheduleOccurrenceStartCommand.Type;

export const ScheduleOccurrenceCompleteCommand = Schema.Struct({
  type: Schema.Literal("schedule.occurrence.complete"),
  commandId: CommandId,
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  completedAt: IsoDateTime,
});
export type ScheduleOccurrenceCompleteCommand = typeof ScheduleOccurrenceCompleteCommand.Type;

export const ScheduleOccurrenceFailCommand = Schema.Struct({
  type: Schema.Literal("schedule.occurrence.fail"),
  commandId: CommandId,
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  reason: ScheduleOccurrenceFailureReason,
  message: Schema.optional(TrimmedNonEmptyString),
  failedAt: IsoDateTime,
});
export type ScheduleOccurrenceFailCommand = typeof ScheduleOccurrenceFailCommand.Type;

export const ScheduleOccurrenceSkipCommand = Schema.Struct({
  type: Schema.Literal("schedule.occurrence.skip"),
  commandId: CommandId,
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  reason: ScheduleOccurrenceSkipReason,
  skippedAt: IsoDateTime,
  trigger: Schema.Literals(["scheduled", "manual"]),
});
export type ScheduleOccurrenceSkipCommand = typeof ScheduleOccurrenceSkipCommand.Type;

// --- Event payloads ---

export const ProjectScheduleCreatedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  scope: ScheduleScope,
  hourLocal: ScheduleHourLocal,
  minuteLocal: ScheduleMinuteLocal,
  interval: Schema.optional(Schema.NullOr(ScheduleInterval)),
  handoffGitPolicy: Schema.optional(Schema.NullOr(ScheduleHandoffGitPolicy)),
  timezone: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  workflowScriptRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  modelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  skipIfDirty: Schema.optional(Schema.NullOr(Schema.Boolean)),
  handoffPathTemplate: TrimmedNonEmptyString,
  maxRunMinutes: ScheduleLimitMinutes,
  maxTurnMinutes: ScheduleLimitMinutes,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectScheduleCreatedPayload = typeof ProjectScheduleCreatedPayload.Type;

export const ProjectScheduleUpdatedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  scope: Schema.optional(ScheduleScope),
  hourLocal: Schema.optional(ScheduleHourLocal),
  minuteLocal: Schema.optional(ScheduleMinuteLocal),
  interval: Schema.optional(Schema.NullOr(ScheduleInterval)),
  handoffGitPolicy: Schema.optional(Schema.NullOr(ScheduleHandoffGitPolicy)),
  timezone: Schema.optional(TrimmedNonEmptyString),
  prompt: Schema.optional(TrimmedNonEmptyString),
  workflowScriptRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  modelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  skipIfDirty: Schema.optional(Schema.NullOr(Schema.Boolean)),
  handoffPathTemplate: Schema.optional(TrimmedNonEmptyString),
  maxRunMinutes: Schema.optional(ScheduleLimitMinutes),
  maxTurnMinutes: Schema.optional(ScheduleLimitMinutes),
  updatedAt: IsoDateTime,
});
export type ProjectScheduleUpdatedPayload = typeof ProjectScheduleUpdatedPayload.Type;

export const ProjectSchedulePausedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  pausedAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /**
   * Present when the server paused the schedule itself (failure-streak
   * auto-pause), e.g. "paused after 3 failures: auth". Absent on a
   * user-initiated pause.
   */
  autoPausedReason: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectSchedulePausedPayload = typeof ProjectSchedulePausedPayload.Type;

export const ProjectScheduleResumedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  updatedAt: IsoDateTime,
});
export type ProjectScheduleResumedPayload = typeof ProjectScheduleResumedPayload.Type;

export const ProjectScheduleDeletedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  // Delete preserves the schedule's threads; only the schedule row is
  // soft-deleted.
  deletedAt: IsoDateTime,
});
export type ProjectScheduleDeletedPayload = typeof ProjectScheduleDeletedPayload.Type;

export const ProjectScheduleRunRequestedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  projectId: ProjectId,
  requestKey: TrimmedNonEmptyString,
  requestedAt: IsoDateTime,
});
export type ProjectScheduleRunRequestedPayload = typeof ProjectScheduleRunRequestedPayload.Type;

export const ScheduleOccurrenceStartedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  threadId: ThreadId,
  startedAt: IsoDateTime,
  trigger: Schema.optional(Schema.Literals(["scheduled", "manual"])),
});
export type ScheduleOccurrenceStartedPayload = typeof ScheduleOccurrenceStartedPayload.Type;

export const ScheduleOccurrenceCompletedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  completedAt: IsoDateTime,
});
export type ScheduleOccurrenceCompletedPayload = typeof ScheduleOccurrenceCompletedPayload.Type;

export const ScheduleOccurrenceFailedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  reason: ScheduleOccurrenceFailureReason,
  message: Schema.optional(TrimmedNonEmptyString),
  failedAt: IsoDateTime,
});
export type ScheduleOccurrenceFailedPayload = typeof ScheduleOccurrenceFailedPayload.Type;

export const ScheduleOccurrenceSkippedPayload = Schema.Struct({
  scheduleId: ScheduleId,
  occurrenceKey: TrimmedNonEmptyString,
  projectId: ProjectId,
  reason: ScheduleOccurrenceSkipReason,
  skippedAt: IsoDateTime,
  trigger: Schema.Literals(["scheduled", "manual"]),
});
export type ScheduleOccurrenceSkippedPayload = typeof ScheduleOccurrenceSkippedPayload.Type;
