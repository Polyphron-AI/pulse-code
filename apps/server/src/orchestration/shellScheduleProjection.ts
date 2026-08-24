import type {
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
  ScheduleId,
} from "@t3tools/contracts";

export function attachActiveSchedules(
  snapshot: OrchestrationShellSnapshot,
  readModel: OrchestrationReadModel,
): OrchestrationShellSnapshot {
  return {
    ...snapshot,
    schedules: (readModel.schedules ?? []).filter((schedule) => schedule.deletedAt === null),
  };
}

export function scheduleShellStreamEvent(
  readModel: OrchestrationReadModel,
  scheduleId: ScheduleId,
  sequence: number,
): OrchestrationShellStreamEvent {
  const schedule = (readModel.schedules ?? []).find(
    (candidate) => candidate.id === scheduleId && candidate.deletedAt === null,
  );
  return schedule === undefined
    ? { kind: "schedule-removed", sequence, scheduleId }
    : { kind: "schedule-upserted", sequence, schedule };
}
