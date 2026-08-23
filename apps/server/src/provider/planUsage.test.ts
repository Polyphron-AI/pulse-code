import { describe, expect, it } from "@effect/vitest";
import {
  EventId,
  ProviderDriverKind,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";

import { mergePlanUsage, planUsageDeltaFromRuntimeEvent } from "./planUsage.ts";

const makeRateLimitsEvent = (driver: string, rateLimits: unknown): ProviderRuntimeEvent => ({
  eventId: EventId.make("evt-1"),
  provider: ProviderDriverKind.make(driver),
  threadId: ThreadId.make("thread-1"),
  createdAt: "2026-08-23T12:00:00.000Z",
  type: "account.rate-limits.updated",
  payload: { rateLimits },
});

describe("planUsageDeltaFromRuntimeEvent", () => {
  it("normalizes a codex rate-limit snapshot into both windows", () => {
    const delta = planUsageDeltaFromRuntimeEvent(
      makeRateLimitsEvent("codex", {
        rateLimits: {
          planType: "plus",
          primary: { usedPercent: 43, resetsAt: 1_800_000_000, windowDurationMins: 300 },
          secondary: { usedPercent: 12, resetsAt: 1_800_000_000_000, windowDurationMins: 10_080 },
        },
      }),
    );

    expect(delta).toBeDefined();
    expect(delta?.planLabel).toBe("Plus");
    expect(delta?.windows).toEqual([
      {
        id: "codex-300m",
        label: "5h",
        usedPercent: 43,
        resetsAt: "2027-01-15T08:00:00.000Z",
        windowMinutes: 300,
      },
      {
        id: "codex-10080m",
        label: "Weekly",
        usedPercent: 12,
        // Millisecond-epoch emitters are tolerated too.
        resetsAt: "2027-01-15T08:00:00.000Z",
        windowMinutes: 10_080,
      },
    ]);
  });

  it("tolerates a sparse codex update carrying only the primary window", () => {
    const delta = planUsageDeltaFromRuntimeEvent(
      makeRateLimitsEvent("codex", {
        rateLimits: { primary: { usedPercent: 250 } },
      }),
    );

    expect(delta?.planLabel).toBeUndefined();
    expect(delta?.windows).toEqual([{ id: "codex-primary", label: "Primary", usedPercent: 100 }]);
  });

  it("normalizes a claude rate_limit_event into its named window", () => {
    const delta = planUsageDeltaFromRuntimeEvent(
      makeRateLimitsEvent("claudeAgent", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed",
          rateLimitType: "seven_day",
          utilization: 61.5,
          resetsAt: 1_800_000_000,
        },
      }),
    );

    expect(delta?.windows).toEqual([
      {
        id: "claude-seven_day",
        label: "Weekly",
        usedPercent: 61.5,
        resetsAt: "2027-01-15T08:00:00.000Z",
        windowMinutes: 10_080,
      },
    ]);
  });

  it("drops claude events without a recognizable window", () => {
    expect(
      planUsageDeltaFromRuntimeEvent(
        makeRateLimitsEvent("claudeAgent", {
          rate_limit_info: { status: "allowed", rateLimitType: "overage", utilization: 5 },
        }),
      ),
    ).toBeUndefined();
    expect(
      planUsageDeltaFromRuntimeEvent(
        makeRateLimitsEvent("claudeAgent", {
          rate_limit_info: { status: "allowed" },
        }),
      ),
    ).toBeUndefined();
  });

  it("ignores unrecognized payloads and other event types", () => {
    expect(planUsageDeltaFromRuntimeEvent(makeRateLimitsEvent("codex", null))).toBeUndefined();
    expect(
      planUsageDeltaFromRuntimeEvent(
        makeRateLimitsEvent("grok", {
          rateLimits: { primary: { usedPercent: 50, windowDurationMins: 300 } },
        }),
      ),
    ).toBeUndefined();
  });
});

describe("mergePlanUsage", () => {
  it("replaces windows by id and keeps unseen siblings, ordered shortest first", () => {
    const previous = mergePlanUsage(
      undefined,
      {
        windows: [
          { id: "claude-seven_day", label: "Weekly", usedPercent: 40, windowMinutes: 10_080 },
        ],
      },
      "2026-08-23T11:00:00.000Z",
    );

    const merged = mergePlanUsage(
      previous,
      {
        windows: [{ id: "claude-five_hour", label: "5h", usedPercent: 80, windowMinutes: 300 }],
      },
      "2026-08-23T12:00:00.000Z",
    );

    expect(merged.capturedAt).toBe("2026-08-23T12:00:00.000Z");
    expect(merged.windows.map((window) => window.id)).toEqual([
      "claude-five_hour",
      "claude-seven_day",
    ]);
  });

  it("keeps the previous plan label when a delta omits it", () => {
    const previous = mergePlanUsage(
      undefined,
      { planLabel: "Pro", windows: [] },
      "2026-08-23T11:00:00.000Z",
    );
    const merged = mergePlanUsage(previous, { windows: [] }, "2026-08-23T12:00:00.000Z");
    expect(merged.planLabel).toBe("Pro");
  });
});
