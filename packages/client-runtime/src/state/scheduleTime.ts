/**
 * Wall-clock math for scheduled chats, shared by web and mobile.
 *
 * A schedule stores an hour, a minute, and an IANA time zone; the server fires
 * on local dates. The client only needs to answer "when is the next fire?" and
 * "what does this row say?", so everything here is `Intl`-only and pure — no
 * date library, and no assumption that the viewer shares the schedule's zone.
 */
import type { OrchestrationSchedule, ScheduleOccurrenceFailureReason } from "@t3tools/contracts";

/** How many local dates to try before giving up on finding a future fire. */
const NEXT_RUN_LOOKAHEAD_DAYS = 3;
const DAY_MS = 86_400_000;

interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    // An unknown zone reaching the client means a schedule was written by a
    // newer/other host; the row still has to render, so callers fall back.
    return null;
  }
}

function localParts(timeZone: string, epochMs: number): LocalDateParts | null {
  const formatter = partsFormatter(timeZone);
  if (!formatter) return null;
  const parts = formatter.formatToParts(epochMs);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    return value === undefined ? Number.NaN : Number.parseInt(value, 10);
  };
  const result = {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
  return Object.values(result).some(Number.isNaN) ? null : result;
}

/** Offset in ms that `timeZone` is ahead of UTC at `epochMs`. */
function zoneOffsetMs(timeZone: string, epochMs: number): number | null {
  const parts = localParts(timeZone, epochMs);
  if (!parts) return null;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Second-truncated, so re-add the sub-second remainder before differencing.
  return asUtc - (epochMs - (epochMs % 1_000));
}

/**
 * Epoch ms for a wall-clock time in a zone. Two passes because the offset
 * depends on the instant we are solving for; on a spring-forward gap the
 * nonexistent time lands on the instant just after the jump, which is when the
 * server's date-based sweep fires it too.
 */
export function zonedWallClockToEpochMs(input: {
  readonly timeZone: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}): number | null {
  const naive = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute);
  const firstOffset = zoneOffsetMs(input.timeZone, naive);
  if (firstOffset === null) return null;
  const candidate = naive - firstOffset;
  const secondOffset = zoneOffsetMs(input.timeZone, candidate);
  return secondOffset === null ? null : naive - secondOffset;
}

export type ScheduleTiming = Pick<
  OrchestrationSchedule,
  "hourLocal" | "minuteLocal" | "timezone" | "pausedAt"
>;

/**
 * Next fire instant in epoch ms, or null when the schedule is paused or its
 * time zone is unreadable here. Walks forward by local date so a fire that
 * already passed today rolls to tomorrow.
 */
export function nextScheduleRunAtMs(schedule: ScheduleTiming, nowMs: number): number | null {
  if (schedule.pausedAt !== null) return null;
  for (let dayOffset = 0; dayOffset <= NEXT_RUN_LOOKAHEAD_DAYS; dayOffset += 1) {
    const dayParts = localParts(schedule.timezone, nowMs + dayOffset * DAY_MS);
    if (!dayParts) return null;
    const candidate = zonedWallClockToEpochMs({
      timeZone: schedule.timezone,
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day,
      hour: schedule.hourLocal,
      minute: schedule.minuteLocal,
    });
    if (candidate !== null && candidate > nowMs) return candidate;
  }
  return null;
}

/** `06:00` — the schedule's own wall clock, never the viewer's. */
export function formatScheduleLocalTime(schedule: {
  readonly hourLocal: number;
  readonly minuteLocal: number;
}): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(schedule.hourLocal)}:${pad(schedule.minuteLocal)}`;
}

/**
 * Short zone label for a row, e.g. `GMT+2`. Falls back to the raw IANA name
 * when the runtime cannot resolve the zone.
 */
export function formatScheduleTimeZoneLabel(timeZone: string, nowMs: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(nowMs);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** The viewer's own zone, for defaulting a new schedule. */
export function resolveViewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Every IANA zone this runtime knows, for the editor's zone picker. */
export function supportedTimeZones(): ReadonlyArray<string> {
  const supported = Intl.supportedValuesOf?.("timeZone");
  if (supported && supported.length > 0) return supported;
  // Older runtimes (and React Native without full-ICU) expose no list; the
  // viewer's own zone is still a valid choice.
  return [resolveViewerTimeZone()];
}

export const SCHEDULE_FAILURE_REASON_LABELS: Readonly<
  Record<ScheduleOccurrenceFailureReason, string>
> = {
  "timeout:run": "Hit the run time limit",
  "timeout:turn": "A turn hit its time limit",
  auth: "Provider sign-in expired",
  provider: "Provider unavailable",
  dirty: "Skipped — uncommitted changes",
  error: "Failed",
};
