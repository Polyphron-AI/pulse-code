import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";
import {
  formatWorkspaceTaskDueOn,
  millisecondsUntilWorkspaceMidnight,
} from "./workspaceTaskDates.ts";
it("uses the environment's Johannesburg midnight and preserves the civil day", () => {
  const date = "2026-10-16";
  expect(
    formatWorkspaceTaskDueOn(
      date,
      DateTime.makeUnsafe("2026-10-15T21:59:59Z"),
      "Africa/Johannesburg",
      "en-GB",
    ),
  ).toMatchObject({ label: "16 Oct", overdue: false });
  expect(
    formatWorkspaceTaskDueOn(
      date,
      DateTime.makeUnsafe("2026-10-15T22:00:00Z"),
      "Africa/Johannesburg",
      "en-GB",
    ),
  ).toMatchObject({ label: "Today", overdue: false });
  expect(
    formatWorkspaceTaskDueOn(
      date,
      DateTime.makeUnsafe("2026-10-16T22:00:00Z"),
      "Africa/Johannesburg",
      "en-GB",
    ),
  ).toMatchObject({ label: "16 Oct", overdue: true });
  expect(date).toBe("2026-10-16");
});
it.each([
  "2026-03-08T06:59:59Z",
  "2026-03-08T07:00:00Z",
  "2026-11-01T05:59:59Z",
  "2026-11-01T06:00:00Z",
])("keeps New York civil dates stable through DST at %s", (instant) => {
  const dueOn = instant.slice(0, 10);
  expect(
    formatWorkspaceTaskDueOn(dueOn, DateTime.makeUnsafe(instant), "America/New_York", "en-GB"),
  ).toMatchObject({ label: "Today", overdue: false });
});
it("includes a different year, exposes the full date and leaves absent dates empty", () => {
  const now = DateTime.makeUnsafe("2026-12-31T23:00:00Z");
  expect(formatWorkspaceTaskDueOn("2026-10-16", now, "Africa/Johannesburg", "en-GB")).toEqual({
    label: "16 Oct 2026",
    fullDate: "16 October 2026",
    overdue: true,
  });
  expect(formatWorkspaceTaskDueOn(null, now, "UTC", "en-GB")).toBeNull();
  expect(formatWorkspaceTaskDueOn("0001-01-01", now, "UTC", "en-GB")?.fullDate).toBe("1 January 1");
});

it.each([
  ["2026-03-08T05:00:00Z", 23],
  ["2026-11-01T04:00:00Z", 25],
])("schedules the next New York midnight from %s across DST", (instant, hours) => {
  expect(millisecondsUntilWorkspaceMidnight(DateTime.makeUnsafe(instant), "America/New_York")).toBe(
    Number(hours) * 60 * 60 * 1000,
  );
});
