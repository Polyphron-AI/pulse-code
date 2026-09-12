import { describe, expect, it } from "vite-plus/test";

import { ManagerId, ScheduleId } from "./baseSchemas.ts";
import {
  isManagerThreadOrigin,
  managerIdFromThreadOrigin,
  managerState,
  managerThreadOrigin,
} from "./manager.ts";
import { isScheduleThreadOrigin, scheduleThreadOrigin } from "./schedule.ts";

const managerId = ManagerId.make("manager-1");

describe("managerState", () => {
  it("reports watching when there is a mission and no pause", () => {
    expect(managerState({ mission: "Keep the build green.", pausedAt: null })).toBe("watching");
  });

  it("reports paused when a mission exists and pausedAt is set", () => {
    expect(
      managerState({ mission: "Keep the build green.", pausedAt: "2026-01-01T00:00:00.000Z" }),
    ).toBe("paused");
  });

  it("reports no-mission for a blank mission, whatever the pause flag says", () => {
    expect(managerState({ mission: "", pausedAt: null })).toBe("no-mission");
    expect(managerState({ mission: "   \n\t ", pausedAt: null })).toBe("no-mission");
    expect(managerState({ mission: "  ", pausedAt: "2026-01-01T00:00:00.000Z" })).toBe(
      "no-mission",
    );
  });
});

describe("manager thread origins", () => {
  it("round-trips a manager id through its origin", () => {
    const origin = managerThreadOrigin(managerId);
    expect(origin).toBe("manager:manager-1");
    expect(isManagerThreadOrigin(origin)).toBe(true);
    expect(managerIdFromThreadOrigin(origin)).toBe(managerId);
  });

  it("does not claim user or schedule origins", () => {
    const scheduleOrigin = scheduleThreadOrigin(ScheduleId.make("schedule-1"));
    expect(isManagerThreadOrigin("user")).toBe(false);
    expect(isManagerThreadOrigin(scheduleOrigin)).toBe(false);
    expect(managerIdFromThreadOrigin("user")).toBeNull();
    expect(managerIdFromThreadOrigin(scheduleOrigin)).toBeNull();
  });

  it("leaves the schedule origin helper unaffected", () => {
    expect(isScheduleThreadOrigin(scheduleThreadOrigin(ScheduleId.make("schedule-1")))).toBe(true);
    expect(isScheduleThreadOrigin(managerThreadOrigin(managerId))).toBe(false);
  });
});
