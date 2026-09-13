import { describe, expect, it } from "vite-plus/test";

import {
  clampPlanUsagePercent,
  formatResetCountdown,
  isPlanUsageCritical,
  selectPlanUsageHeadlineWindow,
  type PlanUsageWindow,
} from "./PlanUsageMeter.logic";

function window(id: string, label: string, usedPercent: number): PlanUsageWindow {
  return { id, label, usedPercent } as PlanUsageWindow;
}

describe("selectPlanUsageHeadlineWindow", () => {
  it("picks the window closest to its limit", () => {
    const weekly = window("weekly", "Weekly", 71);
    expect(
      selectPlanUsageHeadlineWindow([window("5h", "5h", 12), weekly, window("opus", "Opus", 4)]),
    ).toBe(weekly);
  });

  it("returns null with no usable windows", () => {
    expect(selectPlanUsageHeadlineWindow([])).toBeNull();
    expect(selectPlanUsageHeadlineWindow([window("5h", "5h", Number.NaN)])).toBeNull();
  });
});

describe("clampPlanUsagePercent", () => {
  it("clamps out-of-range and non-finite values", () => {
    expect(clampPlanUsagePercent(42.5)).toBe(42.5);
    expect(clampPlanUsagePercent(140)).toBe(100);
    expect(clampPlanUsagePercent(-3)).toBe(0);
    expect(clampPlanUsagePercent(Number.NaN)).toBe(0);
  });
});

describe("isPlanUsageCritical", () => {
  it("turns destructive at 90 percent", () => {
    expect(isPlanUsageCritical(89.9)).toBe(false);
    expect(isPlanUsageCritical(90)).toBe(true);
    expect(isPlanUsageCritical(100)).toBe(true);
  });
});

describe("formatResetCountdown", () => {
  const now = Date.parse("2026-09-13T12:00:00.000Z");

  it("formats days, hours, and minutes", () => {
    expect(formatResetCountdown("2026-09-13T14:10:00.000Z", now)).toBe("2h 10m");
    expect(formatResetCountdown("2026-09-13T12:30:00.000Z", now)).toBe("30m");
    expect(formatResetCountdown("2026-09-13T15:00:00.000Z", now)).toBe("3h");
    expect(formatResetCountdown("2026-09-16T15:00:00.000Z", now)).toBe("3d 3h");
    expect(formatResetCountdown("2026-09-16T12:00:00.000Z", now)).toBe("3d");
  });

  it("returns null once the window has reset or the instant is unreadable", () => {
    expect(formatResetCountdown("2026-09-13T11:00:00.000Z", now)).toBeNull();
    expect(formatResetCountdown("not-a-date", now)).toBeNull();
  });
});
