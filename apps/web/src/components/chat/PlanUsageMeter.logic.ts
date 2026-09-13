import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";

/** At or above this share of a window, the meter turns destructive. */
export const PLAN_USAGE_CRITICAL_PERCENT = 90;

/**
 * Share of a window already spent, 0-100. Derived from the same helper the
 * Limits bars use, so the ring and the rows can never disagree by a rounding
 * step.
 */
export function planUsagePercent(window: ServerProviderUsageWindow): number {
  return 100 - remainingPercent(window);
}

/**
 * The window that drives the ring: the one closest to its limit, since that is
 * the one that will stop the user first. Null when there is nothing to show.
 */
export function selectPlanUsageHeadlineWindow(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
): ServerProviderUsageWindow | null {
  let headline: ServerProviderUsageWindow | null = null;
  for (const window of windows) {
    if (!Number.isFinite(window.usedPercent)) continue;
    if (headline === null || window.usedPercent > headline.usedPercent) {
      headline = window;
    }
  }
  return headline;
}

/** Whether a share of a window should render in the destructive color. */
export function isPlanUsageCritical(percent: number): boolean {
  return percent >= PLAN_USAGE_CRITICAL_PERCENT;
}

/**
 * The limits worth putting a ring on, or null.
 *
 * An account that cannot report windows at all, or a probe that came back
 * empty, has nothing to draw: a ring stuck at zero would read as "plenty left"
 * rather than "unknown", which is the more expensive misreading.
 */
export function selectComposerPlanUsage(
  limits: ServerProviderUsageLimits | undefined,
): ServerProviderUsageLimits | null {
  if (!limits || limits.unavailable !== undefined) return null;
  return limits.windows.length > 0 ? limits : null;
}
