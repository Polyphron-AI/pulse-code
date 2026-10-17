import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { IsoDateTime, NonNegativeInt, PositiveInt } from "./baseSchemas.ts";
import { WorkspaceTaskDueOn } from "./pulseWorkspaceTools.ts";

export const CalendarDate = WorkspaceTaskDueOn;
const text = (max: number) =>
  Schema.String.check(
    Schema.isMaxLength(max),
    Schema.makeFilter((value) => {
      for (const char of value) {
        const code = char.codePointAt(0)!;
        if (code >= 0xd800 && code <= 0xdfff) return false;
      }
      return true;
    }),
  );
const Title = text(300).check(Schema.isMinLength(1));
const SourceId = text(512).check(Schema.isMinLength(1));
const isDate = Schema.is(CalendarDate);
const TimeZone = text(100).check(
  Schema.isMinLength(1),
  Schema.isPattern(/^[A-Za-z]/),
  Schema.makeFilter((value) => {
    try {
      return (
        new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone.length > 0
      );
    } catch {
      return false;
    }
  }),
);
const Instant = IsoDateTime.check(
  Schema.isMaxLength(40),
  Schema.makeFilter(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
        value,
      ) &&
      isDate(value.slice(0, 10)) &&
      Number.isFinite(Date.parse(value)),
  ),
);
export const CalendarOccurrenceId = Schema.String.check(
  Schema.isPattern(/^wce_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
);
export type CalendarOccurrenceId = typeof CalendarOccurrenceId.Type;
export const CalendarTime = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("timed"),
    start: Instant,
    end: Instant,
    sourceTimeZone: TimeZone,
  }).check(Schema.makeFilter((time) => Date.parse(time.start) < Date.parse(time.end))),
  Schema.Struct({
    kind: Schema.Literal("all-day"),
    startOn: CalendarDate,
    endBefore: CalendarDate,
  }).check(Schema.makeFilter((time) => time.startOn < time.endBefore)),
]);
export type CalendarTime = typeof CalendarTime.Type;
const eventFields = {
  title: Title,
  time: CalendarTime,
  sourceLabel: text(200),
  attendees: Schema.Array(
    Schema.Struct({ name: text(200), initials: Schema.optionalKey(text(10)) }),
  ).check(Schema.isMaxLength(20)),
  attendeesTruncated: Schema.Boolean,
  hasDescription: Schema.Boolean,
  descriptionPreview: Schema.optionalKey(text(160)),
  joinUrl: Schema.optionalKey(text(2048)),
};
export const CalendarOccurrenceSummary = Schema.Struct({
  id: CalendarOccurrenceId,
  ...eventFields,
  status: Schema.Literal("confirmed"),
  revision: PositiveInt,
});
export type CalendarOccurrenceSummary = typeof CalendarOccurrenceSummary.Type;
export const CalendarOccurrence = Schema.Struct({
  ...CalendarOccurrenceSummary.fields,
  description: Schema.optionalKey(text(2000)),
});
export type CalendarOccurrence = typeof CalendarOccurrence.Type;
export const CalendarIngestItem = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("confirmed"),
    externalEventId: SourceId,
    occurrenceKey: SourceId,
    ...eventFields,
    description: Schema.optionalKey(text(2000)),
  }),
  Schema.Struct({
    status: Schema.Literal("cancelled"),
    externalEventId: SourceId,
    occurrenceKey: SourceId,
  }),
]);
export type CalendarIngestItem = typeof CalendarIngestItem.Type;
const Cursor = text(4096).check(Schema.isMinLength(1));
export const CalendarRangeInput = Schema.Struct({
  startOn: CalendarDate,
  endBefore: CalendarDate,
  timeZone: TimeZone,
  cursor: Schema.optionalKey(Cursor),
  limit: Schema.optionalKey(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
}).check(
  Schema.makeFilter((range) => {
    const days =
      (Date.parse(`${range.endBefore}T00:00:00Z`) - Date.parse(`${range.startOn}T00:00:00Z`)) /
      86400000;
    return days >= 1 && days <= 31;
  }),
);
export type CalendarRangeInput = typeof CalendarRangeInput.Type;
export const CalendarSourceState = Schema.Struct({
  connectionId: SourceId,
  calendarId: SourceId,
  generation: NonNegativeInt,
  state: Schema.Literals(["ready", "unavailable", "disconnected", "unselected"]),
});
export type CalendarSourceState = typeof CalendarSourceState.Type;
// Count serialized UTF-8 bytes without Node or TextEncoder in native clients.
const serializedBytes = (value: unknown) => {
  let bytes = 0;
  for (const char of JSON.stringify(value)) {
    const code = char.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
};
export const CalendarPage = Schema.Struct({
  events: Schema.Array(CalendarOccurrenceSummary).check(Schema.isMaxLength(100)),
  nextCursor: Schema.optionalKey(Cursor),
  incomplete: Schema.Boolean,
  sourceStates: Schema.Array(CalendarSourceState).check(Schema.isMaxLength(100)),
}).check(Schema.makeFilter((page) => serializedBytes(page) <= 65536));
export type CalendarPage = typeof CalendarPage.Type;
export const CalendarGetInput = Schema.Struct({ id: CalendarOccurrenceId });
export const CalendarReadInput = Schema.Struct({
  id: CalendarOccurrenceId,
  offset: Schema.optionalKey(NonNegativeInt.check(Schema.isLessThanOrEqualTo(8000))),
});
export type CalendarReadInput = typeof CalendarReadInput.Type;
export const CalendarReadResult = Schema.Struct({
  ...CalendarOccurrenceSummary.fields,
  body: Schema.Struct({
    text: text(2000),
    nextOffset: Schema.optionalKey(PositiveInt),
    truncated: Schema.Boolean,
  }),
}).check(Schema.makeFilter((result) => serializedBytes(result) <= 32000));
export type CalendarReadResult = typeof CalendarReadResult.Type;
export class CalendarError extends Schema.TaggedError<CalendarError>()("CalendarError", {
  kind: Schema.Literals([
    "invalid-input",
    "not-found",
    "unavailable",
    "disconnected",
    "conflict",
    "rate-limited",
  ]),
  message: Schema.String,
}) {}
const error = Schema.Union([CalendarError, EnvironmentAuthorizationError]);
export const PULSE_CALENDAR_METHODS = {
  calendarListRange: "pulse.calendar.listRange",
  calendarGet: "pulse.calendar.get",
} as const;
export const PulseCalendarRpcs = [
  Rpc.make(PULSE_CALENDAR_METHODS.calendarListRange, {
    payload: CalendarRangeInput,
    success: CalendarPage,
    error,
  }),
  Rpc.make(PULSE_CALENDAR_METHODS.calendarGet, {
    payload: CalendarGetInput,
    success: CalendarOccurrence,
    error,
  }),
] as const;
