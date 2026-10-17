import { expect, it, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import {
  weekDates,
  formatEventTime,
  displayDay,
  addDays,
  formatDayHeading,
  formatWeek,
  displayDayBounds,
  formatEventRange,
  formatEventOffset,
  calendarDateToLocalPickerDate,
  localPickerDateToCalendarDate,
} from "./dates.ts";
it("uses real display-zone boundaries on 23 and 25 hour days", () => {
  expect(displayDayBounds("2026-03-08", "America/New_York")).toEqual({
    start: Date.parse("2026-03-08T05:00:00Z"),
    end: Date.parse("2026-03-09T04:00:00Z"),
    minutes: 1380,
  });
  expect(displayDayBounds("2026-11-01", "America/New_York")).toEqual({
    start: Date.parse("2026-11-01T04:00:00Z"),
    end: Date.parse("2026-11-02T05:00:00Z"),
    minutes: 1500,
  });
  expect(displayDayBounds("2026-10-13", "Africa/Johannesburg").start).toBe(
    Date.parse("2026-10-12T22:00:00Z"),
  );
});
it("keeps picker calendar fields and distinguishes repeated instants", () => {
  const carrier = calendarDateToLocalPickerDate("2026-11-01");
  expect([carrier.getFullYear(), carrier.getMonth(), carrier.getDate()]).toEqual([2026, 10, 1]);
  const clicked = DateTime.toDateUtc(DateTime.makeUnsafe(0));
  clicked.setFullYear(2027, 0, 2);
  clicked.setHours(12);
  expect(localPickerDateToCalendarDate(clicked)).toBe("2027-01-02");
  const range = formatEventRange(
    "2026-11-01T05:30:00Z",
    "2026-11-01T06:30:00Z",
    "America/New_York",
  );
  expect(range).toContain("01:30 GMT-4");
  expect(range).toContain("01:30 GMT-5");
  expect(range).toContain("1 November 2026");
  expect(formatEventOffset("2026-11-01T05:30:00Z", "America/New_York")).toBe("GMT-4");
  expect(formatEventOffset(Date.parse("2026-11-01T06:30:00Z"), "America/New_York")).toBe("GMT-5");
});
it("uses calendar fields through month and DST boundaries", () => {
  expect(weekDates("2026-10-13")).toEqual([
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
  ]);
  expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  expect(displayDay("2026-10-12T23:30:00Z", "Africa/Johannesburg")).toBe("2026-10-13");
  expect(formatEventTime("2026-11-01T05:30:00Z", "America/New_York")).toBe("01:30");
  expect(formatEventTime("2026-11-01T06:30:00Z", "America/New_York")).toBe("01:30");
  expect(formatEventTime(Date.parse("2026-11-01T06:30:00Z"), "America/New_York")).toBe("01:30");
});

it("keeps the reference day-heading punctuation", () =>
  expect(formatDayHeading("2026-10-13")).toBe("Tuesday, 13 October"));

it("names both months and years when the week crosses their boundary", () => {
  expect(formatWeek("2026-10-01")).toBe("28 September – 4 October 2026");
  expect(formatWeek("2026-12-31")).toBe("28 December 2026 – 3 January 2027");
  expect(formatWeek("2026-10-13")).toBe("12 – 18 October 2026");
  expect(weekDates("2026-10-18")).toEqual(weekDates("2026-10-12"));
});

it("reuses warmed display formatters across event rows", () => {
  const construct = vi.spyOn(Intl, "DateTimeFormat");
  try {
    const instant = "2026-10-13T07:00:00Z";
    const zone = "Pacific/Chatham";
    displayDay(instant, zone);
    formatEventTime(instant, zone);
    const warmed = construct.mock.calls.length;
    for (let row = 0; row < 20; row++) {
      displayDay(instant, zone);
      formatEventTime(instant, zone);
    }
    expect(construct).toHaveBeenCalledTimes(warmed);
  } finally {
    construct.mockRestore();
  }
});

it("formats inclusive all-day dates in en-GB", async () => {
  const { formatAllDayRange } = await import("./dates.ts");
  expect(formatAllDayRange("2026-10-13", "2026-10-14")).toBe("13 October 2026, all day");
  expect(formatAllDayRange("2026-10-31", "2026-11-03")).toBe(
    "31 October 2026 to 2 November 2026, all day",
  );
});
