import { describe, expect, it } from "vite-plus/test";
import type { ServerProvider } from "@t3tools/contracts";

import { buildComposerUsageAlertBody, buildComposerUsageLabel } from "./composerUsage";

type PlanUsage = NonNullable<ServerProvider["planUsage"]>;

const NOW = Date.parse("2026-09-13T12:00:00.000Z");

function planUsage(
  windows: ReadonlyArray<{ id: string; label: string; usedPercent: number; resetsAt?: string }>,
  planLabel?: string,
): PlanUsage {
  return {
    windows,
    capturedAt: "2026-09-13T11:59:00.000Z",
    ...(planLabel ? { planLabel } : {}),
  } as PlanUsage;
}

describe("buildComposerUsageLabel", () => {
  it("shows the busiest window", () => {
    const label = buildComposerUsageLabel({
      planUsage: planUsage([
        { id: "5h", label: "5h", usedPercent: 42.4 },
        { id: "weekly", label: "Weekly", usedPercent: 11 },
      ]),
      costUsd: null,
    });
    expect(label).toBe("5h 42%");
  });

  it("hides cost on a subscription plan", () => {
    const input = {
      planUsage: planUsage([{ id: "5h", label: "5h", usedPercent: 42 }]),
      costUsd: 1.5,
    };
    expect(buildComposerUsageLabel(input)).toBe("5h 42%");
    expect(buildComposerUsageAlertBody(input, NOW)).not.toContain("$");
  });

  it("shows cost alone when the provider reports no plan windows", () => {
    expect(buildComposerUsageLabel({ planUsage: null, costUsd: 1.5 })).toBe("$1.50");
    expect(buildComposerUsageLabel({ planUsage: null, costUsd: 0.004 })).toBe("<$0.01");
  });

  it("returns null when there is nothing to show", () => {
    expect(buildComposerUsageLabel({ planUsage: null, costUsd: null })).toBeNull();
    expect(buildComposerUsageLabel({ planUsage: null, costUsd: 0 })).toBeNull();
    expect(buildComposerUsageLabel({ planUsage: planUsage([]), costUsd: null })).toBeNull();
  });
});

describe("buildComposerUsageAlertBody", () => {
  it("lists every window with a live reset countdown", () => {
    const body = buildComposerUsageAlertBody(
      {
        planUsage: planUsage(
          [
            { id: "5h", label: "5h", usedPercent: 42, resetsAt: "2026-09-13T14:10:00.000Z" },
            { id: "weekly", label: "Weekly", usedPercent: 11 },
          ],
          "Pro",
        ),
        costUsd: null,
      },
      NOW,
    );
    expect(body).toBe("Pro\n5h: 42% used · resets in 2h 10m\nWeekly: 11% used");
  });

  it("notes the API rate on the cost line", () => {
    expect(buildComposerUsageAlertBody({ planUsage: null, costUsd: 1.5 }, NOW)).toBe(
      "Session cost: $1.50 at API rates",
    );
  });
});
