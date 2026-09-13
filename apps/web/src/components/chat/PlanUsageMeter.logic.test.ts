import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isPlanUsageCritical,
  planUsagePercent,
  selectComposerPlanUsage,
  selectPlanUsageHeadlineWindow,
} from "./PlanUsageMeter.logic";

function window(id: string, usedPercent: number): ServerProviderUsageWindow {
  return { id, kind: "session", label: id, usedPercent } as ServerProviderUsageWindow;
}

function limits(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
  unavailable?: ServerProviderUsageLimits["unavailable"],
): ServerProviderUsageLimits {
  return {
    checkedAt: "2026-01-01T00:00:00.000Z",
    windows,
    ...(unavailable ? { unavailable } : {}),
  } as ServerProviderUsageLimits;
}

describe("planUsagePercent", () => {
  it("reports the spent share, clamped to the drawable range", () => {
    expect(planUsagePercent(window("a", 42))).toBe(42);
    expect(planUsagePercent(window("a", 0))).toBe(0);
    expect(planUsagePercent(window("a", 100))).toBe(100);
  });

  it("agrees with the percent-left the popover rows show", () => {
    const spent = planUsagePercent(window("a", 63.4));
    expect(spent).toBe(63);
  });
});

describe("selectPlanUsageHeadlineWindow", () => {
  it("picks the window closest to its limit", () => {
    const busiest = window("weekly", 88);
    expect(selectPlanUsageHeadlineWindow([window("session", 12), busiest, window("x", 40)])).toBe(
      busiest,
    );
  });

  it("returns null when there are no windows", () => {
    expect(selectPlanUsageHeadlineWindow([])).toBeNull();
  });
});

describe("isPlanUsageCritical", () => {
  it("turns destructive at 90 percent and not before", () => {
    expect(isPlanUsageCritical(89)).toBe(false);
    expect(isPlanUsageCritical(90)).toBe(true);
    expect(isPlanUsageCritical(100)).toBe(true);
  });
});

describe("selectComposerPlanUsage", () => {
  it("shows limits that report at least one window", () => {
    const reported = limits([window("session", 10)]);
    expect(selectComposerPlanUsage(reported)).toBe(reported);
  });

  it("hides an instance with no limits, no windows, or an unavailable probe", () => {
    expect(selectComposerPlanUsage(undefined)).toBeNull();
    expect(selectComposerPlanUsage(limits([]))).toBeNull();
    expect(
      selectComposerPlanUsage(limits([window("session", 10)], { reason: "unsupported" })),
    ).toBeNull();
    expect(
      selectComposerPlanUsage(limits([window("session", 10)], { reason: "probeFailed" })),
    ).toBeNull();
  });
});
