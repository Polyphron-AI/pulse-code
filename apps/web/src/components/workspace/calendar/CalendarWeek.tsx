import { useLayoutEffect, useMemo, useRef } from "react";
import {
  formatDay,
  formatEventOffsetTime,
  formatEventRange,
  formatEventTime,
} from "@t3tools/client-runtime/calendar/dates";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../../ui/tooltip";
import { CalendarDayStrip } from "./CalendarDayStrip";
import type { CalendarAgendaProps } from "./CalendarAgenda";
import {
  HOUR_PX,
  PX_PER_MINUTE,
  segmentHitInsets,
  sortCalendarEvents,
  weekSegments,
  weekTimeline,
} from "./weekLayout";

export function CalendarWeek(
  props: Pick<
    CalendarAgendaProps,
    "day" | "timeZone" | "events" | "dueTasks" | "onSelect" | "onOpenTask" | "onSelectDay"
  >,
) {
  const { day, timeZone, events } = props;
  const timeline = useMemo(() => weekTimeline(day, timeZone), [day, timeZone]);
  const days = timeline.days;
  const segments = useMemo(
    () => weekSegments(events, day, timeZone, timeline),
    [events, day, timeZone, timeline],
  );
  const header = useRef<HTMLDivElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const gutter = useRef<HTMLDivElement | null>(null);
  const scroll = useRef<HTMLDivElement | null>(null);
  const scrolledWeek = useRef<string | null>(null);
  const scrolledDay = useRef<string | null>(null);
  const selection = `${days[0]!.date}:${day}:${timeZone}`;
  useLayoutEffect(() => {
    if (!scroll.current) return;
    const column = grid.current?.querySelector<HTMLElement>(`[data-calendar-week-day="${day}"]`);
    if (column && scrolledDay.current !== selection) {
      const width = column.offsetWidth;
      const target =
        column.offsetLeft -
        (grid.current?.offsetLeft ?? 0) -
        (scroll.current.clientWidth + (gutter.current?.offsetWidth ?? 0) - width) / 2;
      const snapped = width > 0 ? Math.round(target / width) * width : 0;
      scroll.current.scrollLeft = Math.max(
        0,
        Math.min(scroll.current.scrollWidth - scroll.current.clientWidth, snapped),
      );
      scrolledDay.current = selection;
    }
    if (segments.length && scrolledWeek.current !== selection) {
      // The grid's flow offset includes the sticky header; subtract it to reveal the preceding hour.
      scroll.current.scrollTop = Math.max(
        0,
        (grid.current?.offsetTop ?? 0) -
          (header.current?.offsetHeight ?? 0) +
          Math.floor(Math.min(...segments.map((segment) => segment.startMinute)) / 60) * HOUR_PX -
          HOUR_PX,
      );
      scrolledWeek.current = selection;
    }
  }, [day, segments, selection]);
  const untimed = useMemo(
    () => sortCalendarEvents(events).filter((event) => event.time.kind === "all-day"),
    [events],
  );
  const minutes = timeline.minutes;
  return (
    <div className="relative min-w-0">
      <div
        ref={scroll}
        role="region"
        aria-label="Week schedule"
        tabIndex={0}
        className="max-h-[calc(100dvh-180px)] max-sm:max-h-[calc(100dvh-224px)] min-h-[280px] min-w-0 overflow-auto overscroll-contain [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-ring"
      >
        {/* The shell and toolbar reserve 180px, or 224px with the compact shell row. */}
        {/* 600px keeps seven columns readable while the region scrolls horizontally. */}
        <div className="min-w-[600px]">
          <div ref={header} className="sticky top-0 z-20 bg-background">
            <CalendarDayStrip day={day} onSelectDay={props.onSelectDay} week />
            <div
              role="group"
              aria-label="All day and due tasks"
              className="rounded-t-lg border border-border/60 bg-background"
            >
              <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))]">
                <span className="sticky left-0 z-10 border-r border-border/60 bg-background p-1 text-3xs text-muted-foreground">
                  All day
                </span>
                {days.map(({ date, note, description }) => (
                  <div key={date} className="min-w-0 border-l border-border/60 p-1">
                    <p
                      className={
                        date === day
                          ? "mb-2 text-3xs text-primary"
                          : "mb-2 text-3xs text-muted-foreground"
                      }
                    >
                      {formatDay(date, { weekday: "short", day: "numeric" })}
                    </p>
                    {note ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <p
                              tabIndex={0}
                              className="mb-2 truncate text-3xs text-muted-foreground"
                            />
                          }
                        >
                          {note}
                        </TooltipTrigger>
                        <TooltipPopup>{description}</TooltipPopup>
                      </Tooltip>
                    ) : null}
                  </div>
                ))}
              </div>
              {untimed.length || props.dueTasks.length ? (
                <div className="grid grid-cols-[40px_minmax(0,1fr)]">
                  <span
                    aria-hidden="true"
                    className="sticky left-0 z-10 border-r border-border/60 bg-background"
                  />
                  <div
                    role="region"
                    aria-label="All-day items"
                    tabIndex={0}
                    className="grid max-h-36 grid-cols-7 overflow-y-auto [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {days.map(({ date }) => (
                      <div key={date} className="min-w-0 border-l border-border/60 p-1">
                        {untimed
                          .filter(
                            (event) =>
                              event.time.kind === "all-day" &&
                              event.time.startOn <= date &&
                              date < event.time.endBefore,
                          )
                          .map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => props.onSelect(event)}
                              className="mb-1 min-h-8 w-full cursor-pointer rounded-md border border-border/60 bg-white/[0.015] p-1 text-left text-3xs wrap-anywhere focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
                            >
                              {event.title}
                            </button>
                          ))}
                        {props.dueTasks
                          .filter((task) => task.dueOn === date)
                          .map((task) => (
                            <button
                              key={task.ref.taskId}
                              type="button"
                              onClick={() => props.onOpenTask?.(task)}
                              className="mb-1 min-h-8 w-full cursor-pointer rounded-md p-1 text-left text-3xs wrap-anywhere underline focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
                            >
                              {task.title}
                              {task.done ? " · Completed" : ""}
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div
            ref={grid}
            className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] rounded-b-lg border-x border-b border-border/60"
            style={{ height: minutes * PX_PER_MINUTE }}
          >
            <div
              ref={gutter}
              aria-hidden="true"
              className="sticky left-0 z-10 border-r border-border/60 bg-background text-3xs text-muted-foreground"
            >
              {timeline.hours.map(({ label, minute }) => (
                <span
                  key={minute}
                  data-calendar-hour={label}
                  className="absolute right-1"
                  style={{ top: minute * PX_PER_MINUTE }}
                >
                  {label}
                </span>
              ))}
            </div>
            {days.map(({ date, missing, description }) => {
              const pieces = segments.filter((segment) => segment.day === date);
              return (
                <div
                  key={date}
                  data-calendar-week-day={date}
                  role="group"
                  aria-label={formatDay(date, { weekday: "long", day: "numeric", month: "long" })}
                  aria-description={description}
                  className="relative min-w-0 border-l border-border/60"
                >
                  {timeline.hours.map(({ minute }) => (
                    <div
                      key={minute}
                      aria-hidden="true"
                      className="pointer-events-none absolute w-full border-t border-border/60"
                      style={{ top: minute * PX_PER_MINUTE }}
                    />
                  ))}
                  {missing.map((span) => (
                    <div
                      key={span.startMinute}
                      aria-hidden="true"
                      className="pointer-events-none absolute w-full bg-muted"
                      style={{
                        top: span.startMinute * PX_PER_MINUTE,
                        height: (span.endMinute - span.startMinute) * PX_PER_MINUTE,
                      }}
                    />
                  ))}
                  {pieces.map((segment) => {
                    const insets = segmentHitInsets(segment, pieces, minutes);
                    const range =
                      segment.event.time.kind === "timed"
                        ? formatEventRange(
                            segment.event.time.start,
                            segment.event.time.end,
                            timeZone,
                          )
                        : "All day";
                    const start = segment.ambiguous
                      ? formatEventOffsetTime(segment.start, timeZone).replace(
                          /^\d{2}:\d{2}\s/u,
                          "",
                        )
                      : formatEventTime(segment.start, timeZone);
                    return (
                      <button
                        key={`${segment.id}:${segment.start}`}
                        type="button"
                        onClick={() => props.onSelect(segment.event)}
                        aria-label={`${segment.event.title}, ${range}`}
                        className="absolute z-1 cursor-pointer rounded-md border border-border/60 bg-background text-left text-3xs text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-[calc(-1*var(--hit-before))] pointer-coarse:after:bottom-[calc(-1*var(--hit-after))]"
                        style={
                          {
                            top: segment.startMinute * PX_PER_MINUTE,
                            height: (segment.endMinute - segment.startMinute) * PX_PER_MINUTE,
                            left: `calc(${(segment.column * 100) / segment.columns}% + 2px)`,
                            width: `calc(${100 / segment.columns}% - 4px)`,
                            "--hit-before": `${insets.before}px`,
                            "--hit-after": `${insets.after}px`,
                          } as React.CSSProperties
                        }
                      >
                        <span className="flex h-full min-w-0 items-center gap-1 overflow-hidden rounded-md bg-white/[0.015] px-1 whitespace-nowrap">
                          <span
                            className={`${segment.ambiguous ? "min-w-[4ch]" : "min-w-0"} ${(segment.endMinute - segment.startMinute) * PX_PER_MINUTE >= 36 ? "line-clamp-2 whitespace-normal" : "truncate"} font-semibold`}
                          >
                            {segment.event.title}
                          </span>
                          {segment.ambiguous ? (
                            <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                              {start}
                            </span>
                          ) : (
                            <span className="@container min-w-0 flex-1 text-muted-foreground">
                              <span className="hidden whitespace-nowrap @min-[5ch]:block">
                                {start}
                              </span>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-linear-to-t from-background to-transparent"
      />
    </div>
  );
}
