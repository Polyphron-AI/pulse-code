/**
 * Compact plan-usage and cost readout for the expanded composer toolbar.
 *
 * @module lib/composerUsage
 */
import type { ServerProvider } from "@t3tools/contracts";
import { formatThreadCostUsd } from "@t3tools/shared/usageFormat";

import { formatCountdown } from "./time";

type PlanUsage = NonNullable<ServerProvider["planUsage"]>;
type PlanUsageWindow = PlanUsage["windows"][number];

export type ComposerUsageInput = {
  readonly planUsage: PlanUsage | null;
  readonly costUsd: number | null;
};

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** The window closest to its limit, which is the one that stops work first. */
export function selectComposerUsageWindow(
  windows: ReadonlyArray<PlanUsageWindow>,
): PlanUsageWindow | null {
  let headline: PlanUsageWindow | null = null;
  for (const window of windows) {
    if (!Number.isFinite(window.usedPercent)) continue;
    if (headline === null || window.usedPercent > headline.usedPercent) headline = window;
  }
  return headline;
}

/**
 * Cost is hidden whenever the provider reports plan windows: subscription
 * users are not billed per token, so the API-rate figure would mislead. Same
 * rule the web meter applies.
 */
function visibleCostLabel(input: ComposerUsageInput): string | null {
  if ((input.planUsage?.windows.length ?? 0) > 0) return null;
  return formatThreadCostUsd(input.costUsd);
}

/**
 * The toolbar label, or null when there is nothing worth a control. Carries no
 * countdown, so it is safe to memoize.
 */
export function buildComposerUsageLabel(input: ComposerUsageInput): string | null {
  const headline = selectComposerUsageWindow(input.planUsage?.windows ?? []);
  const costLabel = visibleCostLabel(input);
  if (headline === null) return costLabel;
  const percent = Math.round(clampPercent(headline.usedPercent));
  return costLabel === null
    ? `${headline.label} ${percent}%`
    : `${headline.label} ${percent}% · ${costLabel}`;
}

/**
 * The alert detail. Reset countdowns go stale, so build this at press time
 * rather than caching it alongside the label.
 */
export function buildComposerUsageAlertBody(input: ComposerUsageInput, now: number): string {
  const lines: string[] = [];
  if (input.planUsage?.planLabel) lines.push(input.planUsage.planLabel);
  for (const window of input.planUsage?.windows ?? []) {
    const percent = Math.round(clampPercent(window.usedPercent));
    const resetsMs = window.resetsAt === undefined ? Number.NaN : Date.parse(window.resetsAt);
    const reset =
      Number.isNaN(resetsMs) || resetsMs <= now ? null : formatCountdown(resetsMs - now);
    lines.push(`${window.label}: ${percent}% used${reset === null ? "" : ` · resets in ${reset}`}`);
  }
  const costLabel = visibleCostLabel(input);
  if (costLabel !== null) lines.push(`Session cost: ${costLabel} at API rates`);
  return lines.join("\n");
}
