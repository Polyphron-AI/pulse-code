import { ScheduleId, type OrchestrationSchedule } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  newScheduleDraft,
  scheduleDraftFromSchedule,
  scheduleDraftHasChanges,
  scheduleDraftIssue,
  scheduleDraftPatch,
  scheduleStatusTone,
  shiftScheduleDraftTime,
} from "./scheduledChats.logic";

function makeSchedule(overrides: Partial<OrchestrationSchedule> = {}): OrchestrationSchedule {
  return {
    id: ScheduleId.make("schedule-1"),
    scope: { _tag: "environment", projectIds: "all" },
    hourLocal: 6,
    minuteLocal: 0,
    timezone: "Europe/Amsterdam",
    prompt: "Daily check-in",
    workflowScriptRef: null,
    modelSelection: null,
    skipIfDirty: null,
    autoPausedReason: null,
    handoffPathTemplate: "handoff/{date}.md",
    maxRunMinutes: 15,
    maxTurnMinutes: 10,
    pausedAt: null,
    projectStates: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("scheduleStatusTone", () => {
  it("gives every status a label and a tone", () => {
    for (const status of ["paused", "running", "failed", "completed", "never-run"] as const) {
      const tone = scheduleStatusTone(status);
      expect(tone.label.length).toBeGreaterThan(0);
      expect(tone.pillClassName.length).toBeGreaterThan(0);
      expect(tone.textClassName.length).toBeGreaterThan(0);
    }
  });

  it("separates a failure from a healthy run", () => {
    expect(scheduleStatusTone("failed").textClassName).not.toBe(
      scheduleStatusTone("completed").textClassName,
    );
  });
});

describe("shiftScheduleDraftTime", () => {
  it("steps forward within the hour", () => {
    expect(shiftScheduleDraftTime({ hourLocal: 6, minuteLocal: 0, prompt: "" }, 15)).toEqual({
      hourLocal: 6,
      minuteLocal: 15,
      prompt: "",
    });
  });

  it("carries into the next hour", () => {
    const shifted = shiftScheduleDraftTime({ hourLocal: 6, minuteLocal: 45, prompt: "" }, 30);
    expect(shifted.hourLocal).toBe(7);
    expect(shifted.minuteLocal).toBe(15);
  });

  it("wraps past midnight instead of leaving the range", () => {
    const forward = shiftScheduleDraftTime({ hourLocal: 23, minuteLocal: 45, prompt: "" }, 30);
    expect(forward).toMatchObject({ hourLocal: 0, minuteLocal: 15 });
    const backward = shiftScheduleDraftTime({ hourLocal: 0, minuteLocal: 15, prompt: "" }, -30);
    expect(backward).toMatchObject({ hourLocal: 23, minuteLocal: 45 });
  });

  it("wraps a shift larger than a day", () => {
    const shifted = shiftScheduleDraftTime({ hourLocal: 6, minuteLocal: 0, prompt: "" }, -60 * 25);
    expect(shifted).toMatchObject({ hourLocal: 5, minuteLocal: 0 });
  });

  it("keeps the prompt untouched", () => {
    expect(
      shiftScheduleDraftTime({ hourLocal: 6, minuteLocal: 0, prompt: "Stand up" }, 60).prompt,
    ).toBe("Stand up");
  });
});

describe("scheduleDraftIssue", () => {
  it("blocks a new draft until it has a prompt", () => {
    expect(scheduleDraftIssue(newScheduleDraft())).toBe(
      "Write the prompt this chat sends every day.",
    );
  });

  it("treats whitespace as empty", () => {
    expect(scheduleDraftIssue({ hourLocal: 6, minuteLocal: 0, prompt: "  \n " })).toBe(
      "Write the prompt this chat sends every day.",
    );
  });

  it("caps the prompt length", () => {
    expect(scheduleDraftIssue({ hourLocal: 6, minuteLocal: 0, prompt: "x".repeat(4_001) })).toBe(
      "Keep the prompt under 4,000 characters.",
    );
  });

  it("accepts a filled-in draft", () => {
    expect(scheduleDraftIssue({ hourLocal: 6, minuteLocal: 0, prompt: "Check CI" })).toBeNull();
  });
});

describe("scheduleDraftPatch", () => {
  it("sends nothing when the draft still matches the schedule", () => {
    const schedule = makeSchedule();
    const patch = scheduleDraftPatch(schedule, scheduleDraftFromSchedule(schedule));
    expect(patch).toEqual({});
    expect(scheduleDraftHasChanges(patch)).toBe(false);
  });

  it("sends only what changed", () => {
    const schedule = makeSchedule();
    const draft = { ...scheduleDraftFromSchedule(schedule), hourLocal: 9 };
    expect(scheduleDraftPatch(schedule, draft)).toEqual({ hourLocal: 9 });
    expect(scheduleDraftHasChanges(scheduleDraftPatch(schedule, draft))).toBe(true);
  });

  it("trims the prompt and ignores a whitespace-only edit", () => {
    const schedule = makeSchedule();
    const draft = { ...scheduleDraftFromSchedule(schedule), prompt: "  Daily check-in  " };
    expect(scheduleDraftPatch(schedule, draft)).toEqual({});
    expect(scheduleDraftPatch(schedule, { ...draft, prompt: "  New prompt " })).toEqual({
      prompt: "New prompt",
    });
  });

  it("never carries the fields this screen cannot edit", () => {
    const schedule = makeSchedule({
      modelSelection: null,
      skipIfDirty: true,
      handoffPathTemplate: "notes/{date}.md",
    });
    const patch = scheduleDraftPatch(schedule, {
      ...scheduleDraftFromSchedule(schedule),
      minuteLocal: 30,
    });
    expect(Object.keys(patch)).toEqual(["minuteLocal"]);
  });
});
