import * as DateTime from "effect/DateTime";

/** Formats a civil due date using the environment timezone only to determine today. */
export function formatWorkspaceTaskDueOn(
  dueOn: string | null | undefined,
  now: DateTime.DateTime,
  timeZone: string,
  locale: string,
): { label: string; fullDate: string; overdue: boolean } | null {
  if (!dueOn) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(DateTime.toEpochMillis(now));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  const year = part("year").padStart(4, "0");
  const today = `${year}-${part("month")}-${part("day")}`;
  const civil = DateTime.toEpochMillis(DateTime.makeUnsafe(`${dueOn}T12:00:00Z`));
  const fullDate = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(civil);
  const label =
    today === dueOn
      ? "Today"
      : new Intl.DateTimeFormat(locale, {
          timeZone: "UTC",
          day: "numeric",
          month: "short",
          ...(dueOn.slice(0, 4) === year ? {} : { year: "numeric" as const }),
        }).format(civil);
  return { label, fullDate, overdue: dueOn < today };
}

/** Finds the next civil-day boundary, including zones with a 23 or 25 hour day. */
export function millisecondsUntilWorkspaceMidnight(now: DateTime.DateTime, timeZone: string) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const epoch = DateTime.toEpochMillis(now);
  const today = format.format(epoch);
  let low = epoch + 1;
  let high = epoch + 48 * 60 * 60 * 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (format.format(middle) === today) low = middle + 1;
    else high = middle;
  }
  return low - epoch;
}
