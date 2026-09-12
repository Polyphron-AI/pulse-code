import { describe, expect, it } from "@effect/vitest";
import type { OrchestrationThreadActivity, ThreadWatchdog } from "@t3tools/contracts";

import {
  latestWatchdogEscalationReason,
  watchdogInterventionsLabel,
  watchdogMarker,
} from "./watchdog.ts";

function activity(
  kind: string,
  payload: unknown,
  id = `event_${kind}`,
): OrchestrationThreadActivity {
  return {
    id,
    tone: "approval",
    kind,
    summary: "Watchdog escalated",
    payload,
    turnId: null,
    createdAt: "2026-09-11T00:00:00.000Z",
  } as unknown as OrchestrationThreadActivity;
}

function watchdog(overrides: Partial<ThreadWatchdog> = {}): ThreadWatchdog {
  return {
    enabled: true,
    rules: "",
    modelSelection: null,
    escalatedAt: null,
    interventions: 0,
    ...overrides,
  } as ThreadWatchdog;
}

describe("latestWatchdogEscalationReason", () => {
  it("returns null with no escalation", () => {
    expect(latestWatchdogEscalationReason([])).toBeNull();
    expect(latestWatchdogEscalationReason([activity("tool.completed", {})])).toBeNull();
  });

  it("reads the reason from the newest escalation", () => {
    const reason = latestWatchdogEscalationReason([
      activity("watchdog.escalated", { reason: "first" }, "a"),
      activity("tool.completed", {}, "b"),
      activity("watchdog.escalated", { reason: "second" }, "c"),
    ]);
    expect(reason).toBe("second");
  });

  it("treats a missing or blank reason as none", () => {
    expect(latestWatchdogEscalationReason([activity("watchdog.escalated", {})])).toBeNull();
    expect(
      latestWatchdogEscalationReason([activity("watchdog.escalated", { reason: "   " })]),
    ).toBeNull();
  });
});

describe("watchdogMarker", () => {
  it("draws nothing when absent or off", () => {
    expect(watchdogMarker(null)).toBe("none");
    expect(watchdogMarker(undefined)).toBe("none");
    expect(watchdogMarker(watchdog({ enabled: false }))).toBe("none");
  });

  it("draws the plain eye when enabled", () => {
    expect(watchdogMarker(watchdog())).toBe("on");
  });

  it("draws the stuck variant once escalated", () => {
    expect(watchdogMarker(watchdog({ escalatedAt: "2026-09-11T00:00:00.000Z" }))).toBe("stuck");
  });

  it("ignores an escalation on a disabled watchdog", () => {
    expect(
      watchdogMarker(watchdog({ enabled: false, escalatedAt: "2026-09-11T00:00:00.000Z" })),
    ).toBe("none");
  });
});

describe("watchdogInterventionsLabel", () => {
  it("hides a zero count and singularises one", () => {
    expect(watchdogInterventionsLabel(0)).toBeNull();
    expect(watchdogInterventionsLabel(1)).toBe("1 intervention");
    expect(watchdogInterventionsLabel(4)).toBe("4 interventions");
  });
});
