/**
 * Pure schedule fold, shared by the in-memory read-model projector and the SQL
 * projection pipeline. The engine rebuilds its read model from projection
 * tables on boot, so both paths must fold schedule events identically — a
 * schedule that survives a restart has to look exactly like the one the engine
 * held in memory, or the next sweep fires the wrong day.
 *
 * @module scheduleProjection
 */
import type {
  OrchestrationSchedule,
  ProjectId,
  ProjectScheduleCreatedPayload,
  ProjectScheduleDeletedPayload,
  ProjectSchedulePausedPayload,
  ProjectScheduleResumedPayload,
  ProjectScheduleUpdatedPayload,
  ScheduleOccurrenceCompletedPayload,
  ScheduleOccurrenceFailedPayload,
  ScheduleOccurrenceStartedPayload,
  ScheduleProjectState,
} from "@t3tools/contracts";

/**
 * Upsert one project's occurrence state. Each targeted project's state is
 * independent, so environment fan-out never crosses wires.
 */
function upsertProjectState(
  schedule: OrchestrationSchedule,
  projectId: ProjectId,
  patch: Partial<Omit<ScheduleProjectState, "projectId">>,
): OrchestrationSchedule {
  const existing = schedule.projectStates.find((state) => state.projectId === projectId);
  const nextState: ScheduleProjectState = {
    projectId,
    threadId: existing?.threadId ?? null,
    lastOccurrenceKey: existing?.lastOccurrenceKey ?? null,
    lastOccurrenceStatus: existing?.lastOccurrenceStatus ?? null,
    lastOccurrenceFailureReason: existing?.lastOccurrenceFailureReason ?? null,
    lastOccurrenceAt: existing?.lastOccurrenceAt ?? null,
    consecutiveFailures: existing?.consecutiveFailures ?? 0,
    ...patch,
  };
  return {
    ...schedule,
    projectStates: existing
      ? schedule.projectStates.map((state) => (state.projectId === projectId ? nextState : state))
      : [...schedule.projectStates, nextState],
  };
}

/** A freshly created schedule: never fired, never paused, no targets yet. */
export function scheduleFromCreated(payload: ProjectScheduleCreatedPayload): OrchestrationSchedule {
  return {
    id: payload.scheduleId,
    scope: payload.scope,
    hourLocal: payload.hourLocal,
    minuteLocal: payload.minuteLocal,
    timezone: payload.timezone,
    prompt: payload.prompt,
    workflowScriptRef: payload.workflowScriptRef ?? null,
    modelSelection: payload.modelSelection ?? null,
    skipIfDirty: payload.skipIfDirty ?? null,
    autoPausedReason: null,
    handoffPathTemplate: payload.handoffPathTemplate,
    maxRunMinutes: payload.maxRunMinutes,
    maxTurnMinutes: payload.maxTurnMinutes,
    pausedAt: null,
    projectStates: [],
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    deletedAt: null,
  };
}

/** Patch semantics: an absent field means "leave it alone". */
export function applyScheduleUpdated(
  schedule: OrchestrationSchedule,
  payload: ProjectScheduleUpdatedPayload,
): OrchestrationSchedule {
  return {
    ...schedule,
    ...(payload.scope !== undefined ? { scope: payload.scope } : {}),
    ...(payload.hourLocal !== undefined ? { hourLocal: payload.hourLocal } : {}),
    ...(payload.minuteLocal !== undefined ? { minuteLocal: payload.minuteLocal } : {}),
    ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
    ...(payload.prompt !== undefined ? { prompt: payload.prompt } : {}),
    ...(payload.workflowScriptRef !== undefined
      ? { workflowScriptRef: payload.workflowScriptRef }
      : {}),
    ...(payload.modelSelection !== undefined ? { modelSelection: payload.modelSelection } : {}),
    ...(payload.skipIfDirty !== undefined ? { skipIfDirty: payload.skipIfDirty } : {}),
    ...(payload.handoffPathTemplate !== undefined
      ? { handoffPathTemplate: payload.handoffPathTemplate }
      : {}),
    ...(payload.maxRunMinutes !== undefined ? { maxRunMinutes: payload.maxRunMinutes } : {}),
    ...(payload.maxTurnMinutes !== undefined ? { maxTurnMinutes: payload.maxTurnMinutes } : {}),
    updatedAt: payload.updatedAt,
  };
}

export function applySchedulePaused(
  schedule: OrchestrationSchedule,
  payload: ProjectSchedulePausedPayload,
): OrchestrationSchedule {
  return {
    ...schedule,
    pausedAt: payload.pausedAt,
    autoPausedReason: payload.autoPausedReason ?? null,
    updatedAt: payload.updatedAt,
  };
}

/**
 * Resume clears the pause, the auto-pause reason, and every project's failure
 * streak — a resumed schedule starts clean.
 */
export function applyScheduleResumed(
  schedule: OrchestrationSchedule,
  payload: ProjectScheduleResumedPayload,
): OrchestrationSchedule {
  return {
    ...schedule,
    pausedAt: null,
    autoPausedReason: null,
    updatedAt: payload.updatedAt,
    projectStates: schedule.projectStates.map((state) => ({ ...state, consecutiveFailures: 0 })),
  };
}

/** Soft-delete only the schedule row; its threads live on untouched. */
export function applyScheduleDeleted(
  schedule: OrchestrationSchedule,
  payload: ProjectScheduleDeletedPayload,
): OrchestrationSchedule {
  return {
    ...schedule,
    deletedAt: payload.deletedAt,
    updatedAt: payload.deletedAt,
  };
}

export function applyScheduleOccurrenceStarted(
  schedule: OrchestrationSchedule,
  payload: ScheduleOccurrenceStartedPayload,
): OrchestrationSchedule {
  return upsertProjectState(schedule, payload.projectId, {
    threadId: payload.threadId,
    lastOccurrenceKey: payload.occurrenceKey,
    lastOccurrenceStatus: "running",
    lastOccurrenceFailureReason: null,
    lastOccurrenceAt: payload.startedAt,
  });
}

export function applyScheduleOccurrenceCompleted(
  schedule: OrchestrationSchedule,
  payload: ScheduleOccurrenceCompletedPayload,
): OrchestrationSchedule {
  return upsertProjectState(schedule, payload.projectId, {
    lastOccurrenceStatus: "completed",
    lastOccurrenceFailureReason: null,
    lastOccurrenceAt: payload.completedAt,
    consecutiveFailures: 0,
  });
}

export function applyScheduleOccurrenceFailed(
  schedule: OrchestrationSchedule,
  payload: ScheduleOccurrenceFailedPayload,
): OrchestrationSchedule {
  // "dirty" skips leave the streak alone: a busy working tree is not a broken
  // schedule (see the auto-pause rule in the decider).
  const priorStreak =
    schedule.projectStates.find((state) => state.projectId === payload.projectId)
      ?.consecutiveFailures ?? 0;
  return upsertProjectState(schedule, payload.projectId, {
    lastOccurrenceStatus: "failed",
    lastOccurrenceFailureReason: payload.reason,
    lastOccurrenceAt: payload.failedAt,
    consecutiveFailures: payload.reason === "dirty" ? priorStreak : priorStreak + 1,
  });
}
