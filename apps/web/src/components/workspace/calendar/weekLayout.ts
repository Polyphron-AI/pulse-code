import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
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
export function weekSegments(
  events: readonly CalendarOccurrenceSummary[],
  day: string,
  timeZone: string,
) {
  return weekDates(day).flatMap((value) => {
    const bounds = displayDayBounds(value, timeZone);
    return packOverlaps(
      sortCalendarEvents(events).flatMap((event) => {
        if (event.time.kind !== "timed") return [];
        const start = Math.max(bounds.start, Date.parse(event.time.start));
        const end = Math.min(bounds.end, Date.parse(event.time.end));
        return start < end
          ? [
              {
                id: event.id,
                title: event.title,
                event,
                day: value,
                startMinute: (start - bounds.start) / 60000,
                endMinute: (end - bounds.start) / 60000,
              },
            ]
          : [];
      }),
    );
  });
}
