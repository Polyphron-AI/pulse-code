import * as DateTime from "effect/DateTime";
import { WorkspaceTaskDueOn } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isGregorianDate = Schema.is(WorkspaceTaskDueOn);

function dayFormatter(timeZone: string) {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  try {
    return {
      format: new Intl.DateTimeFormat("en-US", { ...options, timeZone }),
      usingUtcFallback: false,
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      format: new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }),
      usingUtcFallback: true,
    };
  }
}

/** Formats a civil due date using the environment timezone only to determine today. */
export function formatWorkspaceTaskDueOn(
  dueOn: string | null | undefined,
  now: DateTime.DateTime,
  timeZone: string,
  locale: string | undefined,
): { label: string; fullDate: string; overdue: boolean; usingUtcFallback?: true } | null {
  if (!dueOn || !isGregorianDate(dueOn)) return null;
  const { format, usingUtcFallback } = dayFormatter(timeZone);
  const parts = format.formatToParts(DateTime.toEpochMillis(now));
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
      ? typeof Intl.RelativeTimeFormat === "function"
        ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day")
        : "Today"
      : new Intl.DateTimeFormat(locale, {
          timeZone: "UTC",
          day: "numeric",
          month: "short",
          ...(dueOn.slice(0, 4) === year ? {} : { year: "numeric" as const }),
        }).format(civil);
  return {
    label: label.charAt(0).toLocaleUpperCase(locale) + label.slice(1),
    fullDate,
    overdue: dueOn < today,
    ...(usingUtcFallback ? { usingUtcFallback: true as const } : {}),
  };
}

/** Finds the next civil-day boundary, including zones with a 23 or 25 hour day. */
export function millisecondsUntilWorkspaceMidnight(now: DateTime.DateTime, timeZone: string) {
  const { format } = dayFormatter(timeZone);
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
