import { describe, expect, it } from "vite-plus/test";

import {
  ProjectId,
  ScheduleId,
  type OrchestrationReadModel,
  type OrchestrationSchedule,
  type OrchestrationShellSnapshot,
} from "@t3tools/contracts";

import { attachActiveSchedules, scheduleShellStreamEvent } from "./shellScheduleProjection.ts";

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
