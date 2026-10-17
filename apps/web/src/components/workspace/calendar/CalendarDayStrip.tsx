import { useRef } from "react";
import { weekDates, formatDay } from "@t3tools/client-runtime/calendar/dates";
export function CalendarDayStrip({
  day,
  onSelectDay,
}: {
  readonly day: string;
  readonly onSelectDay: (day: string) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div role="group" aria-label="Choose day" className="mb-[22px] grid h-[33px] grid-cols-7 gap-1">
      {weekDates(day).map((value, i) => (
        <button
          key={value}
          ref={(node) => {
            buttons.current[i] = node;
          }}
          type="button"
          aria-label={formatDay(value, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          aria-pressed={day === value}
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
          className="min-w-0 rounded-lg bg-card text-3xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {formatDay(value, { weekday: "short" }).slice(0, 1)}{" "}
          {formatDay(value, { day: "numeric" })}
        </button>
      ))}
    </div>
  );
}
