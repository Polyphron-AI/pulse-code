import { useRef } from "react";
import { weekDates, formatDay } from "@t3tools/client-runtime/calendar/dates";
export function CalendarDayStrip({
  day,
  onSelectDay,
  week = false,
}: {
  readonly day: string;
  readonly week?: boolean;
  readonly onSelectDay: (day: string) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div
      role="group"
      aria-label="Choose day"
      className={
        week
          ? "mb-[22px] grid h-[33px] grid-cols-[40px_repeat(7,minmax(0,1fr))]"
          : "mb-[22px] grid h-[33px] grid-cols-7 gap-1"
      }
    >
      {week ? <span aria-hidden="true" className="sticky left-0 z-10 bg-background" /> : null}
      {weekDates(day).map((value, i) => (
        <button
          key={value}
          ref={(node) => {
            buttons.current[i] = node;
          }}
          type="button"
          aria-pressed={day === value}
          tabIndex={day === value ? 0 : -1}
          onClick={() => onSelectDay(value)}
          onKeyDown={(e) => {
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 6
                  : e.key === "ArrowRight"
                    ? (i + 1) % 7
                    : e.key === "ArrowLeft"
                      ? (i + 6) % 7
                      : undefined;
            if (next !== undefined) {
              e.preventDefault();
              buttons.current[next]?.focus();
            }
          }}
          className={`${week ? "mx-0.5 " : ""}relative min-w-0 rounded-lg bg-white/[0.015] text-3xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-[6px]`}
        >
          <span className="sr-only">
            {formatDay(value, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
          <span aria-hidden="true">
            {formatDay(value, { weekday: "short" }).slice(0, 1)}{" "}
            {formatDay(value, { day: "numeric" })}
          </span>
        </button>
      ))}
    </div>
  );
}
