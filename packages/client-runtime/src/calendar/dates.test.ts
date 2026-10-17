import { expect, it } from "vite-plus/test";
import { weekDates, formatEventTime, displayDay, addDays, formatDayHeading } from "./dates.ts";
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
