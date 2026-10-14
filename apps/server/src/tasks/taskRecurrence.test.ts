import { expect, it } from "vite-plus/test";
import { nextTaskDueDate } from "./taskRecurrence.ts";

it("skips missed fixed dates and never reuses an early-completed occurrence", () => {
  const recurrence = { mode: "fixed", frequency: "weekly", interval: 2 } as const;
  expect(nextTaskDueDate(recurrence, "2026-01-05", "2026-01-05", "2026-02-02")).toBe("2026-02-16");
  expect(nextTaskDueDate(recurrence, "2026-01-05", "2026-02-02", "2026-01-30")).toBe("2026-02-16");
});

it("preserves the original monthly day across shorter months and leap years", () => {
  const recurrence = { mode: "fixed", frequency: "monthly", interval: 1 } as const;
  expect(nextTaskDueDate(recurrence, "2028-01-31", "2028-01-31", "2028-01-31")).toBe("2028-02-29");
  expect(nextTaskDueDate(recurrence, "2028-01-31", "2028-02-29", "2028-02-29")).toBe("2028-03-31");
  expect(nextTaskDueDate(recurrence, "2026-01-31", "2026-01-31", "2026-03-30")).toBe("2026-03-31");
});

it("uses completion day for completion-based intervals and date-only arithmetic at DST", () => {
  expect(
    nextTaskDueDate(
      { mode: "after_completion", frequency: "daily", interval: 1 },
      null,
      "2026-04-01",
      "2026-03-08",
    ),
  ).toBe("2026-03-09");
  expect(
    nextTaskDueDate(
      { mode: "after_completion", frequency: "monthly", interval: 1 },
      null,
      null,
      "2026-01-31",
    ),
  ).toBe("2026-02-28");
});
