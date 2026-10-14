import type { PulseTaskRecurrence } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Calendar dates stay date-only; no elapsed-hour arithmetic across DST changes. */
export function nextTaskDueDate(
  recurrence: PulseTaskRecurrence,
  anchorDate: string | null,
  currentDueDate: string | null,
  completionDate: string,
): string {
  const baseDate = recurrence.mode === "fixed" ? anchorDate! : completionDate;
  const base = DateTime.makeUnsafe(`${baseDate}T00:00:00Z`);
  const threshold =
    recurrence.mode === "fixed" && currentDueDate && currentDueDate > completionDate
      ? currentDueDate
      : completionDate;
  const end = DateTime.makeUnsafe(`${threshold}T00:00:00Z`);
  let steps = 1;
  if (recurrence.mode === "fixed") {
    if (recurrence.frequency === "monthly") {
      const startParts = DateTime.toPartsUtc(base);
      const endParts = DateTime.toPartsUtc(end);
      steps = Math.max(
        1,
        Math.floor(
          ((endParts.year - startParts.year) * 12 + endParts.month - startParts.month) /
            recurrence.interval,
        ),
      );
    } else {
      const days = (end.epochMilliseconds - base.epochMilliseconds) / 86_400_000;
      steps = Math.max(
        1,
        Math.floor(days / (recurrence.interval * (recurrence.frequency === "weekly" ? 7 : 1))) + 1,
      );
    }
  }
  const advance = (count: number) =>
    DateTime.formatIsoDateUtc(
      DateTime.add(
        base,
        recurrence.frequency === "monthly"
          ? { months: count * recurrence.interval }
          : { days: count * recurrence.interval * (recurrence.frequency === "weekly" ? 7 : 1) },
      ),
    );
  const next = advance(steps);
  return next <= threshold ? advance(steps + 1) : next;
}
