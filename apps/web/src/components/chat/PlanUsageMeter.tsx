import type { ServerProvider, ServerProviderUsageLimits } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { LimitWindows } from "../usage/UsageLimits";
import { formatElapsedDurationLabel } from "../../timestampFormat";
import { composerFloatingLayerProps } from "./composerEventScope";
import {
  isPlanUsageCritical,
  planUsagePercent,
  selectPlanUsageHeadlineWindow,
} from "./PlanUsageMeter.logic";

/**
 * Subscription plan utilization for the provider instance the composer is
 * pointed at. The ring tracks whichever window is closest to its limit; the
 * popover breaks out every window using the same rows as the /usage-limits
 * banner and the Usage page, so the three never disagree.
 */
export function PlanUsageMeter(props: {
  driver: ServerProvider["driver"];
  usageLimits: ServerProviderUsageLimits;
}) {
  const { driver, usageLimits } = props;
  // Re-anchored each time the popover opens: the countdowns and the "checked"
  // age must be right when read, and must not tick while closed. A ticking
  // clock would repaint the composer every minute for no decision to be made.
  const [now, setNow] = useState(() => Date.now());
  const headline = selectPlanUsageHeadlineWindow(usageLimits.windows);
  if (headline === null) return null;

  const percent = planUsagePercent(headline);
  const usageColor = isPlanUsageCritical(percent)
    ? "var(--color-error)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);

  return (
    <Popover onOpenChange={(open) => open && setNow(Date.now())}>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7 rounded-full hover:text-muted-foreground data-pressed:text-muted-foreground"
            aria-label={`Plan usage ${percent}% of ${headline.label} used`}
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
        {...composerFloatingLayerProps}
        tooltipStyle
        side="top"
        align="end"
        viewportClassName="p-0"
        className="w-80 max-w-none text-left whitespace-normal"
      >
        <div className="flex flex-col gap-2 p-[var(--floating-content-inset)]">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">Plan usage</div>
            <PlanUsageCheckedAt checkedAt={usageLimits.checkedAt} now={now} />
          </div>
          <LimitWindows compact driver={driver} windows={usageLimits.windows} now={now} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/** How long ago the provider last reported these windows. */
function PlanUsageCheckedAt({ checkedAt, now }: { checkedAt: string; now: number }) {
  const label = formatElapsedDurationLabel(checkedAt, now);
  if (!label) return null;
  return (
    <div className="text-secondary-label text-[11px]">
      {label === "just now" ? "checked just now" : `checked ${label} ago`}
    </div>
  );
}
