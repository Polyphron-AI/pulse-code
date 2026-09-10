import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeLiveStreamBudget } from "./LiveStreamBudget.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  ProjectId,
  OrchestrationSubscribeShellInput,
  ScheduleId,
  type OrchestrationReadModel,
  type OrchestrationSchedule,
  type OrchestrationShellSnapshot,
} from "@t3tools/contracts";

import {
  attachActiveSchedules,
  scheduleShellStreamEvent,
  makeScheduleCompatibleShellBatch,
} from "./shellScheduleProjection.ts";

const projectId = ProjectId.make("project-1");
const activeSchedule: OrchestrationSchedule = {
  id: ScheduleId.make("schedule-active"),
  scope: { _tag: "project", projectId },
  hourLocal: 9,
  minuteLocal: 30,
  timezone: "Africa/Johannesburg",
  prompt: "Run the daily maintenance checklist.",
  handoffPathTemplate: "handoff/{date}.md",
  maxRunMinutes: 15,
  maxTurnMinutes: 10,
  pausedAt: null,
  projectStates: [],
  createdAt: "2026-08-24T07:00:00.000Z",
  updatedAt: "2026-08-24T07:00:00.000Z",
  deletedAt: null,
};
const deletedSchedule: OrchestrationSchedule = {
  ...activeSchedule,
  id: ScheduleId.make("schedule-deleted"),
  deletedAt: "2026-08-24T08:00:00.000Z",
};

const shell: OrchestrationShellSnapshot = {
  snapshotSequence: 4,
  projects: [],
  threads: [],
  updatedAt: "2026-08-24T07:00:00.000Z",
};
const model: OrchestrationReadModel = {
  snapshotSequence: 4,
  projects: [],
  threads: [],
  schedules: [activeSchedule, deletedSchedule],
  updatedAt: "2026-08-24T07:00:00.000Z",
};

describe("schedule shell projection", () => {
  it("adds only active schedules to a shell snapshot", () => {
    expect(attachActiveSchedules(shell, model).schedules).toEqual([activeSchedule]);
  });

  it("upserts an active schedule and removes a missing or deleted one", () => {
    expect(scheduleShellStreamEvent(model, activeSchedule.id, 5)).toEqual({
      kind: "schedule-upserted",
      sequence: 5,
      schedule: activeSchedule,
    });
    expect(scheduleShellStreamEvent(model, deletedSchedule.id, 6)).toEqual({
      kind: "schedule-removed",
      sequence: 6,
      scheduleId: deletedSchedule.id,
    });
  });
});

const decodeSubscribeShell = Schema.decodeUnknownSync(OrchestrationSubscribeShellInput);

it("opts in only explicitly and older server schemas discard the new input key", () => {
  expect(decodeSubscribeShell({}).schedules).toBeUndefined();
  const oldInput = Schema.Struct({
    afterSequence: Schema.optionalKey(Schema.Number),
    requestCompletionMarker: Schema.optionalKey(Schema.Boolean),
  });
  expect(Schema.decodeUnknownSync(oldInput)({ afterSequence: 4, schedules: true })).toEqual({
    afterSequence: 4,
  });
});

effectIt.effect(
  "replaces schedule-only and mixed batches once, advances the cursor and preserves controls",
  () =>
    Effect.gen(function* () {
      let reads = 0;
      const adapt = makeScheduleCompatibleShellBatch(
        false,
        Effect.sync(() => {
          reads++;
          return { ...shell, snapshotSequence: 9, schedules: [activeSchedule] };
        }),
      );
      const first = scheduleShellStreamEvent(model, activeSchedule.id, 5);
      const second = scheduleShellStreamEvent(model, deletedSchedule.id, 6);
      const projectEvent = { kind: "project-removed" as const, projectId, sequence: 7 };
      expect(yield* adapt([first, second, projectEvent, { kind: "synchronized" }])).toEqual([
        { kind: "snapshot", snapshot: { ...shell, snapshotSequence: 9 } },
        projectEvent,
        { kind: "synchronized" },
      ]);
      expect(yield* adapt([second])).toEqual([]);
      expect(reads).toBe(1);
    }),
);

effectIt.effect("keeps opted-in schedule events without snapshot reads", () =>
  Effect.gen(function* () {
    const items = [scheduleShellStreamEvent(model, activeSchedule.id, 5)];
    const adapt = makeScheduleCompatibleShellBatch(true, Effect.die("unexpected snapshot read"));
    expect(yield* adapt(items)).toBe(items);
  }),
);

effectIt.effect("charges legacy replacement snapshots to the live byte budget", () =>
  Effect.gen(function* () {
    const budget = yield* makeLiveStreamBudget({ maxSerializedBytes: 1000 });
    const event = scheduleShellStreamEvent(model, deletedSchedule.id, 6);
    const retained = yield* budget.retain(event);
    const adapt = makeScheduleCompatibleShellBatch(
      false,
      Effect.succeed({ ...shell, updatedAt: "x".repeat(2000) }),
    );
    const result = yield* adapt([event]).pipe(
      Effect.flatMap((items) => budget.replace([retained], items)),
      Effect.result,
    );
    expect(result._tag).toBe("Failure");
  }),
);
