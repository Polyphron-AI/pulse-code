import { expect, it } from "vite-plus/test";
import { validatedConferenceUrl } from "./calendarLinks.ts";

it.each([
  "https://meet.google.com/abc-defg-hij?authuser=2&hs=122",
  "https://us02web.zoom.us/j/123456789?pwd=a%2Bb&from=addon",
  "https://zoom.us/wc/123456789/join?pwd=keep%3D",
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
  "https://zoom.us:444/j/123",
  "https://zoom.us:443/j/123",
  "https://zoom.us/j/12\n3",
  "https://zoom.us\\@evil.test/j/123",
  "https://zoom.us/profile/123",
  "https://meet.google.com/landing",
  "https://teams.microsoft.com/unknown/123",
  `https://zoom.us/j/123?${"x".repeat(2048)}`,
])("rejects unsafe or unsupported conference URL %s", (url) => {
  expect(validatedConferenceUrl(url)).toBeUndefined();
});
