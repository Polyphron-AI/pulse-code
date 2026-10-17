import { expect, it, vi } from "vite-plus/test";
import {
  weekDates,
  formatEventTime,
  displayDay,
  addDays,
  formatDayHeading,
  formatWeek,
} from "./dates.ts";
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
