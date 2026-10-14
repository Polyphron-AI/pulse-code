import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { NonNegativeInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const MeetingNoteKey = Schema.Struct({
  accountId: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  eventId: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
});
export type MeetingNoteKey = typeof MeetingNoteKey.Type;
export const MeetingNoteInput = Schema.Struct({
  ...MeetingNoteKey.fields,
  revision: Schema.NullOr(NonNegativeInt),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(4096)),
  text: Schema.String.check(Schema.isMaxLength(100000)),
  projectId: Schema.NullOr(ProjectId),
});
export type MeetingNoteInput = typeof MeetingNoteInput.Type;
export const MeetingNote = Schema.Struct({
  ...MeetingNoteInput.fields,
  revision: NonNegativeInt,
  updatedAt: Schema.String,
});
export type MeetingNote = typeof MeetingNote.Type;
export class MeetingNotesError extends Schema.TaggedError<MeetingNotesError>()(
  "MeetingNotesError",
  { message: Schema.String },
) {}
export const MEETING_NOTES_METHODS = {
  meetingNotesSubscribe: "meetingNotes.subscribe",
  meetingNotesSave: "meetingNotes.save",
} as const;
export const MeetingNotesRpcs = [
  Rpc.make(MEETING_NOTES_METHODS.meetingNotesSubscribe, {
    payload: MeetingNoteKey,
    success: Schema.NullOr(MeetingNote),
    stream: true,
    error: Schema.Union([MeetingNotesError, EnvironmentAuthorizationError]),
  }),
  Rpc.make(MEETING_NOTES_METHODS.meetingNotesSave, {
    payload: MeetingNoteInput,
    success: MeetingNote,
    error: Schema.Union([MeetingNotesError, EnvironmentAuthorizationError]),
  }),
] as const;
