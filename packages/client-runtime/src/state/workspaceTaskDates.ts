import * as DateTime from "effect/DateTime";
import { WorkspaceTaskDueOn } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isGregorianDate = Schema.is(WorkspaceTaskDueOn);

const dayFormats = new Map<string, { format: Intl.DateTimeFormat; usingUtcFallback: boolean }>();
function dayFormatter(timeZone: string) {
  const cached = dayFormats.get(timeZone);
  if (cached) return cached;
  const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  let result;
  try {
    result = {
      format: new Intl.DateTimeFormat("en-US", { ...options, timeZone }),
      usingUtcFallback: false,
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    result = {
      format: new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }),
      usingUtcFallback: true,
    };
  }
  if (dayFormats.size >= 64) dayFormats.clear();
  dayFormats.set(timeZone, result);
  return result;
}

const formats = new Map<string, ReturnType<typeof makeFormats>>();
function makeFormats(timeZone: string, locale: string | undefined) {
  return {
    ...dayFormatter(timeZone),
    full: new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    short: new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "short" }),
    withYear: new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    relative:
      typeof Intl.RelativeTimeFormat === "function"
        ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
        : null,
  };
}
function cachedFormats(timeZone: string, locale: string | undefined) {
  const key = `${timeZone}\0${locale ?? ""}`;
  const cached = formats.get(key);
  if (cached) return cached;
  const result = makeFormats(timeZone, locale);
  if (formats.size >= 64) formats.clear();
  formats.set(key, result);
  return result;
}

/** Formats a civil due date using the environment timezone only to determine today. */
export function formatWorkspaceTaskDueOn(
  dueOn: string | null | undefined,
  now: DateTime.DateTime,
  timeZone: string,
  locale: string | undefined,
): { label: string; fullDate: string; overdue: boolean; usingUtcFallback?: true } | null {
  if (!dueOn || !isGregorianDate(dueOn)) return null;
  const { format, usingUtcFallback, full, short, withYear, relative } = cachedFormats(
    timeZone,
    locale,
  );
  const parts = format.formatToParts(DateTime.toEpochMillis(now));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  const year = part("year").padStart(4, "0");
  const today = `${year}-${part("month")}-${part("day")}`;
  const civil = DateTime.toEpochMillis(DateTime.makeUnsafe(`${dueOn}T12:00:00Z`));
  const fullDate = full.format(civil);
  const label =
    today === dueOn
      ? typeof Intl.RelativeTimeFormat === "function" && relative
        ? relative.format(0, "day")
        : "Today"
      : (dueOn.slice(0, 4) === year ? short : withYear).format(civil);
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
