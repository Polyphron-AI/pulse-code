import type { ServerProvider } from "@t3tools/contracts";

import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { formatElapsedDurationLabel } from "../../timestampFormat";
import {
  clampPlanUsagePercent,
  formatResetCountdown,
  isPlanUsageCritical,
  selectPlanUsageHeadlineWindow,
} from "./PlanUsageMeter.logic";

/**
 * Subscription plan utilization for the provider instance the composer is
 * pointed at. The ring tracks whichever window is closest to its limit; the
 * popover breaks out every window with its reset countdown.
 */
export function PlanUsageMeter(props: { planUsage: NonNullable<ServerProvider["planUsage"]> }) {
  const { planUsage } = props;
  const headline = selectPlanUsageHeadlineWindow(planUsage.windows);
  if (headline === null) return null;

  const percent = clampPlanUsagePercent(headline.usedPercent);
  const critical = isPlanUsageCritical(percent);
  const usageColor = critical
    ? "var(--color-error)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);

  // One timestamp per render; nothing ticks, so nothing repaints on its own.
  const now = Date.now();
  const updatedLabel = formatElapsedDurationLabel(planUsage.capturedAt, now);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7 rounded-full hover:text-muted-foreground data-pressed:text-muted-foreground"
            aria-label={`Plan usage ${Math.round(percent)}% of ${headline.label} used`}
          >
            <span className="relative flex size-5 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 size-full transform-gpu mx-0!"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted-foreground) 24%, transparent)"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke={usageColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
            </span>
          </Button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        viewportClassName="p-0"
        className="w-64 max-w-none text-left whitespace-normal"
      >
        <div className="flex flex-col gap-2 p-[var(--floating-content-inset)]">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">Plan usage</div>
            {planUsage.planLabel ? (
              <div className="text-secondary-label text-[11px]">{planUsage.planLabel}</div>
            ) : null}
          </div>
          {planUsage.windows.map((window) => (
            <PlanUsageMeterWindow key={window.id} window={window} now={now} />
          ))}
          <div className="text-secondary-label text-[11px]">
            {updatedLabel === "just now" ? "updated just now" : `updated ${updatedLabel} ago`}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function PlanUsageMeterWindow(props: {
  window: NonNullable<ServerProvider["planUsage"]>["windows"][number];
  now: number;
}) {
  const percent = clampPlanUsagePercent(props.window.usedPercent);
  const resetLabel =
    props.window.resetsAt !== undefined
      ? formatResetCountdown(props.window.resetsAt, props.now)
      : null;
  const barColor = isPlanUsageCritical(percent)
    ? "var(--color-error)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
        <span className="text-secondary-label">{props.window.label}</span>
        <span className="font-medium tabular-nums text-secondary-label">
          {Math.round(percent)}% used
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
        role="progressbar"
        aria-label={`${props.window.label} plan usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
        />
      </div>
      {resetLabel !== null ? (
        <div className="text-secondary-label text-[11px]">resets in {resetLabel}</div>
      ) : null}
    </div>
  );
}
