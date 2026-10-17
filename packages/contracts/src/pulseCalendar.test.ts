import { expect, it, vi } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ServerConfig } from "./server.ts";
import {
  CalendarDate,
  CalendarTime,
  CalendarRangeInput,
  CalendarIngestItem,
  CalendarPage,
  PulseCalendarRpcs,
} from "./pulseCalendar.ts";

const decodeItem = Schema.decodeUnknownSync(CalendarIngestItem);
const isItem = Schema.is(CalendarIngestItem);
const isDate = Schema.is(CalendarDate);
const isRange = Schema.is(CalendarRangeInput);
const isTime = Schema.is(CalendarTime);
const isPage = Schema.is(CalendarPage);
const decodeCapabilities = Schema.decodeUnknownSync(
  Schema.Struct({ pulseCapabilities: ServerConfig.fields.pulseCapabilities }),
);
const item = {
  status: "confirmed",
  externalEventId: "event",
  occurrenceKey: "original",
  title: "Launch",
  time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-14" },
  sourceLabel: "Calendar",
  attendees: [],
  attendeesTruncated: false,
  hasDescription: false,
};
const range = { startOn: "2026-10-13", endBefore: "2026-10-14", timeZone: "Africa/Johannesburg" };

it("decodes confirmed records and minimal cancellations independently of host globals", () => {
  vi.stubGlobal("Buffer", undefined);
  vi.stubGlobal("TextEncoder", undefined);
  try {
    expect(decodeItem(item)).toEqual(item);
    expect(
      isItem({
        status: "cancelled",
        externalEventId: "event",
        occurrenceKey: "original",
      }),
    ).toBe(true);
    expect(isItem({ ...item, time: undefined })).toBe(false);
    expect(isItem({ ...item, status: "tentative" })).toBe(false);
    expect(isRange(range)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each(["2026-02-29", "1900-02-29", "2026-13-01", "0000-01-01", "2026-10-00", "26-10-13"])(
  "rejects invalid Gregorian date %s",
  (date) => {
    expect(isDate(date)).toBe(false);
  },
);
it("accepts leap days and bounds ranges, zones, pages and cursors", () => {
  expect(isDate("2000-02-29")).toBe(true);
  for (const input of [
    { ...range, endBefore: range.startOn },
    { ...range, endBefore: "2026-11-14" },
    { ...range, timeZone: "Not/AZone" },
    { ...range, timeZone: "+02:00" },
    { ...range, limit: 0 },
    { ...range, limit: 101 },
    { ...range, cursor: "x".repeat(4097) },
  ])
    expect(isRange(input)).toBe(false);
  expect(isRange({ ...range, endBefore: "2026-11-13", limit: 100 })).toBe(true);
});
it("validates ordered instants and exclusive all-day ends", () => {
  for (const time of [
    {
      kind: "timed",
      start: "2026-10-13T07:00:00",
      end: "2026-10-13T08:00:00Z",
      sourceTimeZone: "UTC",
    },
    {
      kind: "timed",
      start: "2026-02-30T07:00:00Z",
      end: "2026-03-01T08:00:00Z",
      sourceTimeZone: "UTC",
    },
    {
      kind: "timed",
      start: "2026-10-13T08:00:00Z",
      end: "2026-10-13T07:00:00Z",
      sourceTimeZone: "UTC",
    },
    { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-13" },
  ])
    expect(isTime(time)).toBe(false);
});
it("bounds normalized metadata and description without body fanout", () => {
  for (const patch of [
    { title: "x".repeat(301) },
    { attendees: Array.from({ length: 21 }, () => ({ name: "A" })) },
    { description: "x".repeat(2001) },
    { descriptionPreview: "x".repeat(161) },
    { joinUrl: "x".repeat(2049) },
    { title: "\ud800" },
  ])
    expect(isItem({ ...item, ...patch })).toBe(false);
});
it("rejects aggregate oversized pages with escaped Unicode", () => {
  const event = {
    ...item,
    id: "wce_00000000-0000-0000-0000-000000000001",
    revision: 1,
    title: "\u0000".repeat(300),
    attendees: Array.from({ length: 20 }, () => ({ name: "\u0000".repeat(200) })),
  };
  expect(
    isPage({
      events: Array.from({ length: 10 }, () => ({ ...event })),
      incomplete: false,
      sourceStates: [],
    }),
  ).toBe(false);
});
it("keeps the capability optional for old server configs and exposes no write RPC", () => {
  const decode = decodeCapabilities;
  expect(decode({})).toEqual({});
  expect(decode({ pulseCapabilities: {} })).toEqual({ pulseCapabilities: {} });
  expect(decode({ pulseCapabilities: { workspaceCalendar: true } })).toEqual({
    pulseCapabilities: { workspaceCalendar: true },
  });
  expect(PulseCalendarRpcs.map((rpc) => rpc._tag)).toEqual([
    "pulse.calendar.listRange",
    "pulse.calendar.get",
  ]);
});
