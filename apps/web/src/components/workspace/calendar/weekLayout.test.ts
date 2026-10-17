import { expect, it } from "vite-plus/test";
import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import {
  packOverlaps,
  weekSegments,
  sortCalendarEvents,
  segmentHitInsets,
  weekTimeline,
} from "./weekLayout";

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
  ).toEqual([
    [90, 120],
    [180, 210],
  ]);
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

it("keeps coarse hit areas within the day and separate for touching events", () => {
  const pieces = weekSegments(
    [
      event("first", "2026-10-13T09:00:00Z", "2026-10-13T09:30:00Z"),
      event("next", "2026-10-13T09:30:00Z", "2026-10-13T10:00:00Z"),
      event("late", "2026-10-13T23:50:00Z", "2026-10-14T00:00:00Z"),
    ],
    "2026-10-13",
    "UTC",
  );
  expect(segmentHitInsets(pieces[0]!, pieces, 1440)).toEqual({ before: 20, after: 0 });
  expect(segmentHitInsets(pieces[1]!, pieces, 1440)).toEqual({ before: 0, after: 20 });
  expect(segmentHitInsets(pieces[2]!, pieces, 1440)).toEqual({ before: 36, after: 0 });
});
it("aligns ordinary days around the shared repeated-hour band and preserves crossing duration", () => {
  const timeline = weekTimeline("2026-11-01", "America/New_York");
  expect(timeline.hours.filter((row) => row.label === "01:00").map((row) => row.minute)).toEqual([
    60, 120,
  ]);
  expect(timeline.days[0]!.missing).toEqual([{ startMinute: 120, endMinute: 180 }]);
  const pieces = weekSegments(
    [event("cross", "2026-10-26T05:30:00Z", "2026-10-26T06:30:00Z")],
    "2026-11-01",
    "America/New_York",
    timeline,
  );
  expect(pieces.map((row) => [row.startMinute, row.endMinute])).toEqual([
    [90, 120],
    [180, 210],
  ]);
  expect(pieces.reduce((total, row) => total + row.endMinute - row.startMinute, 0)).toBe(60);
});
it("keeps a half-hour fold aligned in Australia/Lord_Howe", () => {
  const timeline = weekTimeline("2026-04-05", "Australia/Lord_Howe");
  expect(timeline.minutes).toBe(1470);
  expect(timeline.hours.find((row) => row.label === "09:00")?.minute).toBe(570);
  expect(timeline.days[6]!.note).toBe("Clocks go back, 01:30 to 02:00 repeats");
});
