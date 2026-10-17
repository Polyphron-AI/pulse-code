import { expect, it, vi } from "vite-plus/test";
import { calendarHandoffUrl, openCalendarHandoff } from "./calendarHandoff";

it.each([
  undefined,
  "",
  "malformed",
  "http://meet.google.com/abc-defg-hij",
  "file:///j/123",
  "data:text/plain,join",
  "javascript:alert(1)",
  "https://user:pass@zoom.us/j/123",
  "https://zoom.us:444/j/123",
  "https:zoom.us:444/j/123",
  "https:zoom.us/j/123",
  "https:/zoom.us/j/123",
  "https://zoom.us:/j/1",
  "https://zoom.us/j/123?pwd=two words",
  "https://meet.google.com.evil.test/abc-defg-hij",
  "https://zoom.us.evil.test/j/123",
  "https://evilzoom.us/j/123",
  "https://zoom.us/profile/123",
  "https://meet.google.com/landing",
  "https://teams.microsoft.com/unknown/123",
  "https://zoom.us/j/12\n3",
  "https://zoom.us/j/123?pwd=a\u0000b",
])("never opens an unsafe or missing meeting address %s", async (raw) => {
  const opener = vi.fn();
  const target = { kind: "meeting" as const, ...(raw === undefined ? {} : { raw }) };
  expect(calendarHandoffUrl(target)).toEqual({ error: "No meeting link is available." });
  expect(await openCalendarHandoff(target, opener)).toEqual({
    state: "unavailable",
    error: "No meeting link is available.",
  });
  expect(opener).not.toHaveBeenCalled();
});

it.each([
  "https://meet.google.com/abc-defg-hij?authuser=2&hs=122#keep%2Bexact",
  "https://tenant.zoom.us/j/123456789?pwd=AbC%2B123&tk=exact&pwd=two+words#keep",
  "https://teams.microsoft.com/l/meetup-join/19%3Ameeting/thread?context=%7b%7d",
  "https://teams.live.com/meet/123456?p=abc%2Bdef",
  "HTTPS://Zoom.us/j/1?pwd=X",
  "https://ZOOM.US/j/1?pwd=lower%2bcase&bare&empty=&punct=!'~*#keep%2b",
])("opens the exact meeting query on the requesting client in the gesture %s", async (url) => {
  const requestingClientOpener = vi.fn().mockResolvedValue(undefined);
  const result = openCalendarHandoff(
    { kind: "meeting", raw: `  ${url}  ` },
    requestingClientOpener,
  );
  expect(requestingClientOpener).toHaveBeenCalledExactlyOnceWith(url);
  expect(await result).toEqual({ state: "opened", url });
  expect(await openCalendarHandoff({ kind: "meeting", raw: url })).toEqual({
    state: "fallback",
    url,
  });
});

it("retains the address after an explicit desktop rejection", async () => {
  const url = "https://zoom.us/j/123?pwd=exact%2Bbytes";
  const opener = vi.fn().mockRejectedValue(new Error("Unable to open link."));
  expect(await openCalendarHandoff({ kind: "meeting", raw: url }, opener)).toEqual({
    state: "rejected",
    url,
    error: "Unable to open meeting link. Copy the address and open it on this device.",
  });
});

it("builds a fixed Schedule destination using only the selected date", async () => {
  const opener = vi.fn().mockResolvedValue(undefined);
  const url = "https://calendar.google.com/calendar/r/day/2026/10/13";
  expect(await openCalendarHandoff({ kind: "google-calendar", day: "2026-10-13" }, opener)).toEqual(
    { state: "opened", url },
  );
  expect(opener).toHaveBeenCalledExactlyOnceWith(url);
  expect(calendarHandoffUrl({ kind: "google-calendar", day: "2026-02-29" })).toEqual({
    error: "Choose a valid calendar date.",
  });
  expect(await openCalendarHandoff({ kind: "google-calendar", day: "2026-02-29" }, opener)).toEqual(
    { state: "unavailable", error: "Choose a valid calendar date." },
  );
  expect(opener).toHaveBeenCalledTimes(1);
});
