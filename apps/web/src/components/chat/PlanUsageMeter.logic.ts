import type { ServerProvider } from "@t3tools/contracts";

export type PlanUsageWindow = NonNullable<ServerProvider["planUsage"]>["windows"][number];

/** At or above this share of a window, the meter turns destructive. */
export const PLAN_USAGE_CRITICAL_PERCENT = 90;

/** Clamp a reported window share into the 0-100 the UI can draw. */
export function clampPlanUsagePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * The window that drives the ring: the one closest to its limit, since that is
 * the one that will stop the user first. Null when there is nothing to show.
 */
export function selectPlanUsageHeadlineWindow(
  windows: ReadonlyArray<PlanUsageWindow>,
): PlanUsageWindow | null {
  let headline: PlanUsageWindow | null = null;
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

/** "2h 10m" until an ISO instant, or null once it has passed. */
export function formatResetCountdown(resetsAt: string, now: number): string | null {
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target) || target <= now) return null;
  const totalMinutes = Math.ceil((target - now) / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}
