import { expect, it } from "vite-plus/test";
import { googleScheduleUrl, validatedConferenceUrl } from "./calendarLinks.ts";

it.each([
  "https://meet.google.com/abc-defg-hij?authuser=2&hs=122",
  "https://us02web.zoom.us/j/123456789?pwd=a%2Bb&from=addon",
  "https://zoom.us/wc/123456789/join?pwd=keep%3D",
  "HTTPS://Zoom.us/j/1?pwd=X",
  "https://teams.microsoft.com/l/meetup-join/19%3Ameeting/thread?context=%7B%7D",
  "https://teams.live.com/meet/123456?p=abc",
])("preserves the exact conference URL %s", (url) => {
  expect(validatedConferenceUrl(url)).toBe(url);
});

it.each([
  "https://meet.google.com.evil.test/abc-defg-hij",
  "https://evilzoom.us/j/123",
  "https://zoom.us.evil.test/j/123",
  "http://meet.google.com/abc-defg-hij",
  "file:///j/123",
  "data:text/plain,join",
  "https://user:secret@zoom.us/j/123",
  "https://user@zoom.us/j/1",
  "https://zoom.us:444/j/123",
  "https:zoom.us:444/j/123",
  "https:zoom.us/j/123",
  "https:/zoom.us/j/123",
  "https://zoom.us:/j/1",
  "https://zoom.us/j/123?pwd=two words",
  "https://zoom.us:443/j/123",
  "https://zoom.us/j/12\n3",
  "https://zoom.us/j/123\n",
  "\thttps://meet.google.com/abc-defg-hij",
  "https://zoom.us\\@evil.test/j/123",
  "https://zoom.us/profile/123",
  "https://meet.google.com/landing",
  "https://teams.microsoft.com/unknown/123",
  "javascript:alert(1)",
  "not a URL",
  "",
  "https://zoom.us/j/123?pwd=a\u0001b",
  `https://zoom.us/j/123?${"x".repeat(2048)}`,
])("rejects unsafe or unsupported conference URL %s", (url) => {
  expect(validatedConferenceUrl(url)).toBeUndefined();
});

it.each([
  ["2026-10-13", "https://calendar.google.com/calendar/r/day/2026/10/13"],
  ["2028-02-29", "https://calendar.google.com/calendar/r/day/2028/2/29"],
  ["2026-01-01", "https://calendar.google.com/calendar/r/day/2026/1/1"],
])("hands off only the selected calendar date %s", (day, expected) => {
  expect(googleScheduleUrl(day)).toBe(expected);
});

it("encodes an explicitly chosen account hint without changing the trusted destination", () => {
  expect(googleScheduleUrl("2026-10-13", "person+calendar@example.test")).toBe(
    "https://calendar.google.com/calendar/r/day/2026/10/13?authuser=person%2Bcalendar%40example.test",
  );
  expect(googleScheduleUrl("2026-10-13", "")).toBe(
    "https://calendar.google.com/calendar/r/day/2026/10/13",
  );
});

it.each([
  "",
  "2026-2-03",
  "2026-02-29",
  "2026-04-31",
  "2026-13-01",
  "2026-00-01",
  "2026-01-00",
  "garbage",
  "2026-10-13T00:00:00Z",
  "2026-10-13\n",
])("rejects invalid calendar date %s outside decoded routes", (day) =>
  expect(() => googleScheduleUrl(day)).toThrow("Choose a valid calendar date."),
);
