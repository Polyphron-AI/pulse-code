import * as Effect from "effect/Effect";
import type {
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamItem,
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

/** Old clients know snapshots but not schedule events. A fresh snapshot advances their
 * cursor without inventing an unknown event or replaying schedule-only gaps forever. */
export function makeScheduleCompatibleShellBatch<E, R>(
  schedules: boolean,
  loadSnapshot: Effect.Effect<OrchestrationShellSnapshot, E, R>,
) {
  let replacementSequence = -1;
  return Effect.fn("shell.scheduleCompatibility")(function* (
    items: ReadonlyArray<OrchestrationShellStreamItem>,
  ) {
    if (schedules) return items;
    const output: Array<OrchestrationShellStreamItem> = [];
    for (const item of items) {
      if (item.kind !== "schedule-upserted" && item.kind !== "schedule-removed") {
        output.push(item);
        continue;
      }
      if (item.sequence <= replacementSequence) continue;
      const { schedules: _schedules, ...snapshot } = yield* loadSnapshot;
      replacementSequence = snapshot.snapshotSequence;
      output.push({ kind: "snapshot", snapshot });
    }
    return output;
  });
}
