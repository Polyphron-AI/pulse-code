import { useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";
import {
  displayDayBounds,
  formatDay,
  formatEventOffsetTime,
  formatEventRange,
  weekDates,
} from "@t3tools/client-runtime/calendar/dates";
import type { CalendarAgendaProps } from "./CalendarAgenda";
import { packOverlaps, sortCalendarEvents, weekSegments } from "./weekLayout";

export function CalendarWeek(
  props: Pick<
    CalendarAgendaProps,
    "day" | "timeZone" | "events" | "dueTasks" | "onSelect" | "onOpenTask"
  >,
) {
  const { day, timeZone, events } = props;
  const days = useMemo(
    () => weekDates(day).map((date) => ({ date, ...displayDayBounds(date, timeZone) })),
    [day, timeZone],
  );
  const segments = useMemo(() => {
    const pieces = weekSegments(events, day, timeZone);
    // Pack the visible 44px targets as well as their actual intervals, so short blocks do not cover each other.
    return weekDates(day).flatMap((date) =>
      packOverlaps(
        pieces
          .filter((piece) => piece.day === date)
          .map((piece) => ({
            ...piece,
            endMinute: Math.max(piece.endMinute, piece.startMinute + 55),
          })),
      ),
    );
  }, [events, day, timeZone]);
  const scroll = useRef<HTMLDivElement | null>(null);
  const scrolledWeek = useRef<string | null>(null);
  const week = `${days[0]!.date}:${timeZone}`;
  useLayoutEffect(() => {
    if (scroll.current && segments.length && scrolledWeek.current !== week) {
      scroll.current.scrollTop = Math.max(
        0,
        Math.min(...segments.map((segment) => segment.startMinute)) * 0.8 - 48,
      );
      scrolledWeek.current = week;
    }
  }, [segments, week]);
  const untimed = useMemo(
    () => sortCalendarEvents(events).filter((event) => event.time.kind === "all-day"),
    [events],
  );
  const minutes = Math.max(...days.map((date) => date.minutes));
  const activate = (event: Parameters<CalendarAgendaProps["onSelect"]>[0]) => ({
    onClick: () => props.onSelect(event),
    onKeyDown: (key: KeyboardEvent<HTMLButtonElement>) => {
      if ((key.key === "Enter" || key.key === " ") && !key.repeat) {
        key.preventDefault();
        props.onSelect(event);
      }
    },
  });
  return (
    <div
      ref={scroll}
      role="region"
      aria-label="Week schedule"
      tabIndex={0}
      className="max-h-[calc(100dvh-230px)] min-h-[280px] min-w-0 overflow-auto overscroll-contain rounded-lg border border-border/60 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="min-w-[600px]">
        <div
          role="group"
          aria-label="All day and due tasks"
          className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] border-b border-border/60"
        >
          <span className="p-1 text-3xs text-muted-foreground">All day</span>
          {days.map(({ date }) => (
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
                    {...activate(event)}
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
        <div
          className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))]"
          style={{ height: minutes * 0.8 }}
        >
          <div aria-hidden="true" className="relative text-3xs text-muted-foreground">
            {Array.from({ length: Math.ceil(minutes / 60) }, (_, hour) => (
              <span key={hour} className="absolute right-1" style={{ top: hour * 48 }}>
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map(({ date, start, minutes: dayMinutes }) => (
            <div
              key={date}
              data-calendar-week-day={date}
              aria-label={formatDay(date, { weekday: "long", day: "numeric", month: "long" })}
              className="relative min-w-0 border-l border-border/60"
            >
              {Array.from({ length: Math.ceil(dayMinutes / 60) }, (_, hour) => (
                <div
                  key={hour}
                  aria-hidden="true"
                  className="pointer-events-none absolute w-full border-t border-border/60 text-3xs text-muted-foreground"
                  style={{ top: hour * 48 }}
                >
                  {dayMinutes !== 1440
                    ? formatEventOffsetTime(
                        new Date(start + hour * 3600000).toISOString(),
                        timeZone,
                      )
                    : null}
                </div>
              ))}
              {segments
                .filter((segment) => segment.day === date)
                .map((segment) => (
                  <button
                    key={segment.id}
                    type="button"
                    {...activate(segment.event)}
                    aria-label={`${segment.event.title}, ${segment.event.time.kind === "timed" ? formatEventRange(segment.event.time.start, segment.event.time.end, timeZone) : "All day"}`}
                    className="absolute z-1 cursor-pointer overflow-hidden rounded-md border border-border/60 bg-accent p-1 text-left text-3xs text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring"
                    style={{
                      top: segment.startMinute * 0.8,
                      height: (segment.endMinute - segment.startMinute) * 0.8,
                      left: `calc(${(segment.column * 100) / segment.columns}% + 2px)`,
                      width: `calc(${100 / segment.columns}% - 4px)`,
                    }}
                  >
                    <span className="block font-semibold">{segment.event.title}</span>
                    <span>
                      {formatEventOffsetTime(
                        new Date(start + segment.startMinute * 60000).toISOString(),
                        timeZone,
                      )}
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
