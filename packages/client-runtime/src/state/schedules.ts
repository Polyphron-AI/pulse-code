/**
 * Scheduled chats, client side: entity atoms, mutation atoms, wall-clock math,
 * and the row summaries every surface renders. Web and mobile both import from
 * `@t3tools/client-runtime/state/schedules`, so a schedule reads the same way
 * on a phone as it does in Settings.
 */
import type {
  OrchestrationSchedule,
  ProjectId,
  ScheduleOccurrenceFailureReason,
  ScheduleOccurrenceStatus,
} from "@t3tools/contracts";

export * from "./scheduleCommands.ts";
export * from "./scheduleEntities.ts";
export * from "./schedulePresentation.ts";
export * from "./scheduleTime.ts";

/**
 * The projects an occurrence will fan out to. Environment schedules can target
 * "all", which is resolved against the environment's live project list so a
 * project added after the schedule was written is included.
 */
export function scheduleTargetProjectIds(
  schedule: Pick<OrchestrationSchedule, "scope">,
  environmentProjectIds: ReadonlyArray<ProjectId>,
): ReadonlyArray<ProjectId> {
  if (schedule.scope._tag === "project") return [schedule.scope.projectId];
  return schedule.scope.projectIds === "all"
    ? environmentProjectIds
    : schedule.scope.projectIds.filter((projectId) => environmentProjectIds.includes(projectId));
}

export interface ScheduleRunSummary {
  /** Most recent occurrence timestamp across every targeted project. */
  readonly lastRunAt: string | null;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
  /** Projects with a recorded occurrence; 0 means the schedule never fired. */
  readonly reported: number;
  /**
   * The failure to name in the row. Environment fan-out can fail several ways
   * at once, so this is the reason attached to the most recent failure.
   */
  readonly failureReason: ScheduleOccurrenceFailureReason | null;
  /** Highest consecutive-failure streak across projects, for the auto-pause hint. */
  readonly consecutiveFailures: number;
}

const EMPTY_RUN_SUMMARY: ScheduleRunSummary = Object.freeze({
  lastRunAt: null,
  running: 0,
  completed: 0,
  failed: 0,
  reported: 0,
  failureReason: null,
  consecutiveFailures: 0,
});

/**
 * Collapses per-project occurrence state into what a schedule row shows. Only
 * projects that have actually run are counted, so a brand-new schedule reads
 * "never run" rather than "0 of 5 failed".
 */
export function scheduleRunSummary(
  schedule: Pick<OrchestrationSchedule, "projectStates">,
): ScheduleRunSummary {
  if (schedule.projectStates.length === 0) return EMPTY_RUN_SUMMARY;

  let lastRunAt: string | null = null;
  let running = 0;
  let completed = 0;
  let failed = 0;
  let reported = 0;
  let failureReason: ScheduleOccurrenceFailureReason | null = null;
  let latestFailureAt: string | null = null;
  let consecutiveFailures = 0;

  for (const state of schedule.projectStates) {
    consecutiveFailures = Math.max(consecutiveFailures, state.consecutiveFailures);
    const status: ScheduleOccurrenceStatus | null = state.lastOccurrenceStatus;
    if (status === null) continue;
    reported += 1;
    if (status === "running") running += 1;
    if (status === "completed") completed += 1;
    if (status === "failed") failed += 1;
    if (state.lastOccurrenceAt !== null) {
      if (lastRunAt === null || state.lastOccurrenceAt > lastRunAt) {
        lastRunAt = state.lastOccurrenceAt;
      }
      if (
        status === "failed" &&
        (latestFailureAt === null || state.lastOccurrenceAt > latestFailureAt)
      ) {
        latestFailureAt = state.lastOccurrenceAt;
        failureReason = state.lastOccurrenceFailureReason ?? "error";
      }
    } else if (status === "failed" && failureReason === null) {
      failureReason = state.lastOccurrenceFailureReason ?? "error";
    }
  }

  return { lastRunAt, running, completed, failed, reported, failureReason, consecutiveFailures };
}

/**
 * The single status a row leads with. `running` wins over a failure so an
 * in-flight run never reads as broken, and `never-run` is distinct from
 * `completed` so a schedule that has not fired yet says so.
 */
export type ScheduleRowStatus = "paused" | "running" | "failed" | "completed" | "never-run";

export function scheduleRowStatus(
  schedule: Pick<OrchestrationSchedule, "pausedAt" | "projectStates">,
  summary: ScheduleRunSummary = scheduleRunSummary(schedule),
): ScheduleRowStatus {
  if (schedule.pausedAt !== null) return "paused";
  if (summary.running > 0) return "running";
  if (summary.reported === 0) return "never-run";
  return summary.failed > 0 ? "failed" : "completed";
}

/** Sort order for the settings list: broken first, then paused, then by time. */
export function compareSchedulesForDisplay(
  left: OrchestrationSchedule,
  right: OrchestrationSchedule,
): number {
  const rank = (schedule: OrchestrationSchedule) => {
    const status = scheduleRowStatus(schedule);
    if (status === "failed") return 0;
    if (status === "paused") return 1;
    return 2;
  };
  const rankDelta = rank(left) - rank(right);
  if (rankDelta !== 0) return rankDelta;
  const timeDelta =
    left.hourLocal * 60 + left.minuteLocal - (right.hourLocal * 60 + right.minuteLocal);
  if (timeDelta !== 0) return timeDelta;
  return left.createdAt.localeCompare(right.createdAt);
}
