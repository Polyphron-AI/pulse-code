import { expect, it } from "vite-plus/test";
import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import { packOverlaps, weekSegments, sortCalendarEvents } from "./weekLayout";

const event = (id: string, start: string, end: string, title = id): CalendarOccurrenceSummary => ({
  id,
  title,
  revision: 1,
  status: "confirmed",
  sourceLabel: "Saved",
  attendees: [],
  attendeesTruncated: false,
  hasDescription: false,
  time: { kind: "timed", start, end, sourceTimeZone: "UTC" },
});
it("packs equal starts, nested overlaps and touching independent groups", () => {
  expect(
    packOverlaps([
      { id: "b", startMinute: 540, endMinute: 570 },
      { id: "a", startMinute: 540, endMinute: 660 },
      { id: "c", startMinute: 570, endMinute: 600 },
      { id: "d", startMinute: 660, endMinute: 690 },
    ]),
  ).toEqual([
    { id: "b", startMinute: 540, endMinute: 570, column: 0, columns: 2 },
    { id: "a", startMinute: 540, endMinute: 660, column: 1, columns: 2 },
    { id: "c", startMinute: 570, endMinute: 600, column: 0, columns: 2 },
    { id: "d", startMinute: 660, endMinute: 690, column: 0, columns: 1 },
  ]);
});
it("clips at display-zone midnight with an exclusive end and stable occurrence identity", () => {
  const rows = weekSegments(
    [
      event("cross", "2026-10-13T21:30:00Z", "2026-10-13T22:30:00Z"),
      event("midnight", "2026-10-13T20:00:00Z", "2026-10-13T22:00:00Z"),
    ],
    "2026-10-13",
    "Africa/Johannesburg",
  );
  expect(
    rows.map(({ id, day, startMinute, endMinute }) => ({ id, day, startMinute, endMinute })),
  ).toEqual([
    { id: "midnight", day: "2026-10-13", startMinute: 1320, endMinute: 1440 },
    { id: "cross", day: "2026-10-13", startMinute: 1410, endMinute: 1440 },
    { id: "cross", day: "2026-10-14", startMinute: 0, endMinute: 30 },
  ]);
});
it("separates the fold and skips the gap on actual 25 and 23 hour axes", () => {
  const fold = weekSegments(
    [
      event("first", "2026-11-01T05:30:00Z", "2026-11-01T05:45:00Z"),
      event("second", "2026-11-01T06:30:00Z", "2026-11-01T06:45:00Z"),
    ],
    "2026-11-01",
    "America/New_York",
  );
  expect(fold.map((s) => [s.day, s.startMinute, s.endMinute])).toEqual([
    ["2026-11-01", 90, 105],
    ["2026-11-01", 150, 165],
  ]);
  expect(
    weekSegments(
      [event("gap", "2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z")],
      "2026-03-08",
      "America/New_York",
    ).map((s) => [s.startMinute, s.endMinute]),
  ).toEqual([[90, 150]]);
});
it("orders all-day rows first then start, end, title and stable ID", () => {
  const timed = event("timed", "2026-10-13T00:00:00Z", "2026-10-13T01:00:00Z");
  const allDay = {
    ...timed,
    id: "all",
    time: { kind: "all-day" as const, startOn: "2026-10-13", endBefore: "2026-10-14" },
  };
  expect(
    sortCalendarEvents([timed, { ...allDay, id: "z", title: "Z" }, allDay]).map((e) => e.id),
  ).toEqual(["all", "z", "timed"]);
  expect(
    sortCalendarEvents([
      {
        ...timed,
        id: "long",
        time: {
          ...timed.time,
          kind: "timed",
          start: "2026-10-13T00:00:00Z",
          end: "2026-10-13T02:00:00Z",
          sourceTimeZone: "UTC",
        },
      },
      { ...timed, id: "z", title: "B" },
      { ...timed, id: "b", title: "A" },
      { ...timed, id: "a", title: "A" },
    ]).map((e) => e.id),
  ).toEqual(["a", "b", "z", "long"]);
});
it("sorts timed bounds by their actual instants across source offsets", () => {
  expect(
    sortCalendarEvents([
      event("later", "2026-10-13T08:00:00-04:00", "2026-10-13T08:30:00-04:00"),
      event("earlier", "2026-10-13T10:00:00Z", "2026-10-13T10:30:00Z"),
    ]).map((event) => event.id),
  ).toEqual(["earlier", "later"]);
});
it("keeps title before ID when equally timed Week events share a column group", () => {
  expect(
    weekSegments(
      [
        event("a", "2026-10-13T09:00:00Z", "2026-10-13T10:00:00Z", "Zulu"),
        event("z", "2026-10-13T09:00:00Z", "2026-10-13T10:00:00Z", "Alpha"),
      ],
      "2026-10-13",
      "UTC",
    ).map((segment) => [segment.id, segment.column]),
  ).toEqual([
    ["z", 0],
    ["a", 1],
  ]);
});
