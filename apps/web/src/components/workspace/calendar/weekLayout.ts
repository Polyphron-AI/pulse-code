import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { displayDayBounds, weekDates } from "@t3tools/client-runtime/calendar/dates";

type Interval = {
  readonly id: string;
  readonly title?: string;
  readonly startMinute: number;
  readonly endMinute: number;
};
export function packOverlaps<T extends Interval>(intervals: readonly T[]) {
  const result: Array<T & { column: number; columns: number }> = [];
  let active: Array<{ end: number; column: number }> = [];
  let group = 0;
  let width = 0;
  const finish = () => {
    for (let i = group; i < result.length; i++) result[i]!.columns = width;
    group = result.length;
    width = 0;
  };
  for (const interval of [...intervals].sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      a.endMinute - b.endMinute ||
      (a.title ?? "").localeCompare(b.title ?? "") ||
      a.id.localeCompare(b.id),
  )) {
    active = active.filter((value) => value.end > interval.startMinute);
    if (!active.length) finish();
    let column = 0;
    while (active.some((value) => value.column === column)) column++;
    active.push({ end: interval.endMinute, column });
    width = Math.max(width, active.length);
    result.push({ ...interval, column, columns: 1 });
  }
  finish();
  return result;
}
export function sortCalendarEvents(events: readonly CalendarOccurrenceSummary[]) {
  const bounds = (event: CalendarOccurrenceSummary) =>
    event.time.kind === "all-day"
      ? ([
          Date.parse(`${event.time.startOn}T00:00:00Z`),
          Date.parse(`${event.time.endBefore}T00:00:00Z`),
        ] as const)
      : ([Date.parse(event.time.start), Date.parse(event.time.end)] as const);
  return [...events].sort((a, b) => {
    const [startA, endA] = bounds(a);
    const [startB, endB] = bounds(b);
    return (
      Number(b.time.kind === "all-day") - Number(a.time.kind === "all-day") ||
      startA - startB ||
      endA - endB ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
    );
  });
}

export const MINUTE_MS = 60_000;
export const PX_PER_MINUTE = 0.8;
export const HOUR_PX = 60 * PX_PER_MINUTE;
export const MIN_TOUCH_TARGET_PX = 44;
export const DAY_MINUTES = 24 * 60;
const clockLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** A single wall-time axis inserts a repeated interval for every column. Missing intervals stay empty. */
export function weekTimeline(day: string, timeZone: string) {
  const offsetAt = (instant: number) =>
    DateTime.zonedOffset(DateTime.makeZonedUnsafe(instant, { timeZone }));
  const days = weekDates(day).map((date) => {
    const bounds = displayDayBounds(date, timeZone);
    const midnight = Date.parse(`${date}T00:00:00Z`);
    const runs: Array<{ start: number; end: number; wallStart: number }> = [];
    let start = bounds.start;
    let offset = offsetAt(start);
    for (let probe = start + 60 * MINUTE_MS; probe <= bounds.end; probe += 60 * MINUTE_MS) {
      const until = Math.min(probe, bounds.end - 1);
      const nextOffset = offsetAt(until);
      if (nextOffset === offset) continue;
      let low = start;
      let high = until;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (offsetAt(middle) === offset) low = middle;
        else high = middle;
      }
      runs.push({ start, end: high, wallStart: (start + offset - midnight) / MINUTE_MS });
      start = high;
      offset = nextOffset;
    }
    runs.push({ start, end: bounds.end, wallStart: (start + offset - midnight) / MINUTE_MS });
    const first = runs[0]!;
    const second = runs[1];
    const before = first.wallStart + (first.end - first.start) / MINUTE_MS;
    const transition = second ? { before, after: second.wallStart } : undefined;
    return { date, ...bounds, runs, transition };
  });
  const fold = days.find(
    (date) => date.transition && date.transition.after < date.transition.before,
  )?.transition;
  const repeated = fold ? fold.before - fold.after : 0;
  const axisMinute = (wall: number, second = false) =>
    wall + (fold && (second || wall >= fold.before) ? repeated : 0);
  const columns = days.map((date) => {
    const spans = date.runs.flatMap((run, index) => {
      const boundary = fold ? run.start + (fold.before - run.wallStart) * MINUTE_MS : run.end;
      const cuts =
        boundary > run.start && boundary < run.end
          ? [run.start, boundary, run.end]
          : [run.start, run.end];
      return cuts.slice(0, -1).map((start, i) => {
        const end = cuts[i + 1]!;
        const wall = run.wallStart + (start - run.start) / MINUTE_MS;
        const startMinute = axisMinute(
          wall,
          Boolean(
            fold && index > 0 && date.transition && date.transition.after < date.transition.before,
          ),
        );
        return { start, end, startMinute, endMinute: startMinute + (end - start) / MINUTE_MS };
      });
    });
    const missing: Array<{ startMinute: number; endMinute: number }> = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.startMinute > cursor)
        missing.push({ startMinute: cursor, endMinute: span.startMinute });
      cursor = span.endMinute;
    }
    const note = date.transition
      ? date.transition.after < date.transition.before
        ? `Clocks go back, ${clockLabel(date.transition.after)} to ${clockLabel(date.transition.before)} repeats`
        : `Clocks go forward, ${clockLabel(date.transition.before)} to ${clockLabel(date.transition.after)} is skipped`
      : undefined;
    return { ...date, spans, missing, note };
  });
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    label: clockLabel(hour * 60),
    minute: axisMinute(hour * 60),
  }));
  if (fold)
    for (let minute = fold.after; minute < fold.before; minute += 60)
      hours.push({ label: clockLabel(minute), minute: axisMinute(minute, true) });
  hours.sort((a, b) => a.minute - b.minute);
  return { days: columns, hours, minutes: DAY_MINUTES + repeated };
}

export function weekSegments(
  events: readonly CalendarOccurrenceSummary[],
  day: string,
  timeZone: string,
  timeline = weekTimeline(day, timeZone),
) {
  return timeline.days.flatMap(({ date, spans }) =>
    packOverlaps(
      events.flatMap((event) => {
        if (event.time.kind !== "timed") return [];
        const eventStart = Date.parse(event.time.start);
        const eventEnd = Date.parse(event.time.end);
        return spans.flatMap((span) => {
          const start = Math.max(span.start, eventStart);
          const end = Math.min(span.end, eventEnd);
          return start < end
            ? [
                {
                  id: event.id,
                  title: event.title,
                  event,
                  day: date,
                  start,
                  startMinute: span.startMinute + (start - span.start) / MINUTE_MS,
                  endMinute: span.startMinute + (end - span.start) / MINUTE_MS,
                },
              ]
            : [];
        });
      }),
    ),
  );
}

/** Grow only into free vertical space. Adjacent intervals keep separate hit areas. */
export function segmentHitInsets(
  segment: ReturnType<typeof weekSegments>[number],
  peers: ReturnType<typeof weekSegments>,
  minutes: number,
) {
  const height = (segment.endMinute - segment.startMinute) * PX_PER_MINUTE;
  const extra = Math.max(0, MIN_TOUCH_TARGET_PX - height);
  const previous = Math.max(
    0,
    ...peers.filter((peer) => peer.endMinute <= segment.startMinute).map((peer) => peer.endMinute),
  );
  const next = Math.min(
    minutes,
    ...peers
      .filter((peer) => peer.startMinute >= segment.endMinute)
      .map((peer) => peer.startMinute),
  );
  const beforeLimit = ((segment.startMinute - previous) * PX_PER_MINUTE) / 2;
  const afterLimit = ((next - segment.endMinute) * PX_PER_MINUTE) / 2;
  let before = Math.min(extra / 2, beforeLimit);
  const after = Math.min(extra - before, afterLimit);
  before = Math.min(extra - after, beforeLimit);
  return { before, after };
}
