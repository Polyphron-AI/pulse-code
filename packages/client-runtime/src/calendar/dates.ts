import * as DateTime from "effect/DateTime";
/** Date-only values are UTC field carriers, never host-local instants. */
const date = (day: string) => DateTime.toDateUtc(DateTime.makeUnsafe(`${day}T12:00:00Z`));
// Calendar uses the reference locale until workspace locale selection is available.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let value = formatters.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat("en-GB", options);
    if (formatters.size >= 64) formatters.delete(formatters.keys().next().value!);
    formatters.set(key, value);
  }
  return value;
}
export function addDays(day: string, count: number) {
  const value = date(day);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function weekDates(day: string) {
  const monday = addDays(day, -((date(day).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function displayDay(instant: string, timeZone: string) {
  const parts = formatter({
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(DateTime.toEpochMillis(DateTime.makeUnsafe(instant)));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const formatEventTime = (instant: string, timeZone: string) =>
  formatter({
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(DateTime.toEpochMillis(DateTime.makeUnsafe(instant)));
export const formatDay = (day: string, options: Intl.DateTimeFormatOptions) =>
  formatter({ ...options, timeZone: "UTC" }).format(date(day));
export const formatDayHeading = (day: string) =>
  `${formatDay(day, { weekday: "long" })}, ${formatDay(day, { day: "numeric", month: "long" })}`;
export function formatWeek(day: string) {
  const days = weekDates(day);
  const first = days[0]!;
  const last = days[6]!;
  return `${formatDay(first, { day: "numeric", ...(first.slice(0, 7) !== last.slice(0, 7) ? { month: "long" } : {}), ...(first.slice(0, 4) !== last.slice(0, 4) ? { year: "numeric" } : {}) })} – ${formatDay(last, { day: "numeric", month: "long", year: "numeric" })}`;
}
