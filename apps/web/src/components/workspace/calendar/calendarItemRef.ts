import { CalendarOccurrenceId, WorkspaceItemRef, type CalendarTime } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { displayDay } from "@t3tools/client-runtime/calendar/dates";

const isOccurrenceId = Schema.is(CalendarOccurrenceId);
const isWorkspaceItem = Schema.is(WorkspaceItemRef);

export const calendarItemRef = (id: string) => ({
  type: "provider-resource" as const,
  provider: "workspace-calendar",
  resourceId: id,
});

export function isCalendarItem(ref: WorkspaceItemRef) {
  return (
    ref.type === "provider-resource" &&
    ref.provider === "workspace-calendar" &&
    isOccurrenceId(ref.resourceId)
  );
}

export function parseCalendarLocation(raw: string | undefined) {
  if (raw === undefined) return null;
  try {
    const ref: unknown = JSON.parse(raw);
    return isWorkspaceItem(ref) && ref.type === "provider-resource" && isCalendarItem(ref)
      ? ref
      : null;
  } catch {
    return null;
  }
}

/** Resolve a selected occurrence's day without turning all-day dates into instants. */
export function calendarOccurrenceDay(time: CalendarTime, timeZone: string) {
  return time.kind === "all-day" ? time.startOn : displayDay(time.start, timeZone);
}
