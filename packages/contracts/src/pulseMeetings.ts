import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const MeetingId = TrimmedNonEmptyString.check(Schema.isMaxLength(128)).pipe(
  Schema.brand("MeetingId"),
);
export type MeetingId = typeof MeetingId.Type;

export const MEETING_TITLE_MAX_LENGTH = 200;
export const MEETING_SEGMENT_TEXT_MAX_LENGTH = 20_000;
export const MEETING_APPEND_MAX_SEGMENTS = 500;

const MeetingTitle = TrimmedNonEmptyString.check(Schema.isMaxLength(MEETING_TITLE_MAX_LENGTH));

export const MeetingStatus = Schema.Literals(["recording", "ready"]);
export type MeetingStatus = typeof MeetingStatus.Type;

export const MeetingSummaryStatus = Schema.Literals(["none", "pending", "ready", "failed"]);
export type MeetingSummaryStatus = typeof MeetingSummaryStatus.Type;

export const MeetingSegment = Schema.Struct({
  index: NonNegativeInt,
  startMs: NonNegativeInt,
  endMs: NonNegativeInt,
  text: Schema.String.check(Schema.isMaxLength(MEETING_SEGMENT_TEXT_MAX_LENGTH)),
});
export type MeetingSegment = typeof MeetingSegment.Type;

/** List rows never carry transcript segments; open the detail to read them. */
export const MeetingSummaryRow = Schema.Struct({
  id: MeetingId,
  title: Schema.String,
  status: MeetingStatus,
  startedAt: IsoDateTime,
  endedAt: Schema.NullOr(IsoDateTime),
  durationMs: Schema.NullOr(NonNegativeInt),
  segmentCount: NonNegativeInt,
  summaryStatus: MeetingSummaryStatus,
  summaryPreview: Schema.NullOr(Schema.String),
});
export type MeetingSummaryRow = typeof MeetingSummaryRow.Type;

export const MeetingDetail = Schema.Struct({
  ...MeetingSummaryRow.fields,
  summary: Schema.NullOr(Schema.String),
  summaryError: Schema.NullOr(Schema.String),
  summaryModel: Schema.NullOr(Schema.String),
  segments: Schema.Array(MeetingSegment),
});
export type MeetingDetail = typeof MeetingDetail.Type;

/** One meeting changed. Carries no meeting data, so clients refetch what they show. */
export const MeetingRevision = Schema.Struct({
  revision: NonNegativeInt,
  meetingId: MeetingId,
});
export type MeetingRevision = typeof MeetingRevision.Type;

export class PulseMeetingsError extends Schema.TaggedError<PulseMeetingsError>()(
  "PulseMeetingsError",
  { message: Schema.String },
) {}

export const PULSE_MEETINGS_METHODS = {
  pulseMeetingsList: "pulse.meetings.list",
  pulseMeetingsGet: "pulse.meetings.get",
  pulseMeetingsCreate: "pulse.meetings.create",
  pulseMeetingsAppendSegments: "pulse.meetings.appendSegments",
  pulseMeetingsFinish: "pulse.meetings.finish",
  pulseMeetingsSummarize: "pulse.meetings.summarize",
  pulseMeetingsRename: "pulse.meetings.rename",
  pulseMeetingsDelete: "pulse.meetings.delete",
  pulseMeetingsRevisions: "pulse.meetings.revisions",
} as const;

const MeetingsError = Schema.Union([PulseMeetingsError, EnvironmentAuthorizationError]);

export const PulseMeetingsRpcs = [
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsList, {
    payload: Schema.Struct({}),
    success: Schema.Array(MeetingSummaryRow),
    error: MeetingsError,
  }),
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsGet, {
    payload: Schema.Struct({ id: MeetingId }),
    success: MeetingDetail,
    error: MeetingsError,
  }),
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsCreate, {
    payload: Schema.Struct({ title: Schema.optional(MeetingTitle), startedAt: IsoDateTime }),
    success: MeetingSummaryRow,
    error: MeetingsError,
  }),
  /** Idempotent by segment index: a resent segment overwrites the stored one. */
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsAppendSegments, {
    payload: Schema.Struct({
      id: MeetingId,
      segments: Schema.Array(MeetingSegment).check(Schema.isMaxLength(MEETING_APPEND_MAX_SEGMENTS)),
    }),
    success: MeetingSummaryRow,
    error: MeetingsError,
  }),
  /** Marks the meeting ready and starts its summary in the background. */
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsFinish, {
    payload: Schema.Struct({ id: MeetingId, endedAt: IsoDateTime, durationMs: NonNegativeInt }),
    success: MeetingSummaryRow,
    error: MeetingsError,
  }),
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsSummarize, {
    payload: Schema.Struct({ id: MeetingId }),
    success: MeetingSummaryRow,
    error: MeetingsError,
  }),
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsRename, {
    payload: Schema.Struct({ id: MeetingId, title: MeetingTitle }),
    success: MeetingSummaryRow,
    error: MeetingsError,
  }),
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsDelete, {
    payload: Schema.Struct({ id: MeetingId }),
    success: Schema.Void,
    error: MeetingsError,
  }),
  /** A revision that grows on every meeting change, naming the meeting that changed. */
  Rpc.make(PULSE_MEETINGS_METHODS.pulseMeetingsRevisions, {
    payload: Schema.Struct({}),
    success: MeetingRevision,
    error: EnvironmentAuthorizationError,
    stream: true,
  }),
] as const;
