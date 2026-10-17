import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { IsoDateTime, NonNegativeInt, PositiveInt } from "./baseSchemas.ts";

const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const RequestId = Schema.String.check(Schema.isPattern(new RegExp(`^${uuid}$`)));
export const WorkspaceNoteId = Schema.String.check(Schema.isPattern(new RegExp(`^wsn_${uuid}$`)));
const Title = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(300));
// UTF-8 bounds also apply in native clients without Buffer or TextEncoder globals.
const utf8Length = (value: string) => {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
};
const Body = Schema.String.check(Schema.makeFilter((text) => utf8Length(text) <= 65536));
export const WorkspaceNote = Schema.Struct({
  id: WorkspaceNoteId,
  title: Title,
  body: Body,
  revision: PositiveInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkspaceNote = typeof WorkspaceNote.Type;
export const WorkspaceNoteCreate = Schema.Struct({
  requestId: RequestId,
  title: Title,
  body: Body,
});
export type WorkspaceNoteCreate = typeof WorkspaceNoteCreate.Type;
export const WorkspaceNoteGet = Schema.Struct({ id: WorkspaceNoteId });
export const WorkspaceNoteUpdate = Schema.Struct({
  ...WorkspaceNoteCreate.fields,
  id: WorkspaceNoteId,
  expectedRevision: PositiveInt,
});
export type WorkspaceNoteUpdate = typeof WorkspaceNoteUpdate.Type;
export const WorkspaceNoteDelete = Schema.Struct({
  requestId: RequestId,
  id: WorkspaceNoteId,
  expectedRevision: PositiveInt,
});
export type WorkspaceNoteDelete = typeof WorkspaceNoteDelete.Type;
export const WorkspaceNoteRead = Schema.Struct({
  id: WorkspaceNoteId,
  offset: Schema.optionalKey(NonNegativeInt.check(Schema.isLessThanOrEqualTo(65536))),
  revision: Schema.optionalKey(PositiveInt),
}).check(Schema.makeFilter((input) => !input.offset || input.revision !== undefined));
export type WorkspaceNoteRead = typeof WorkspaceNoteRead.Type;
export const WorkspaceNoteReadResult = Schema.Struct({
  id: WorkspaceNoteId,
  title: Title,
  revision: PositiveInt,
  body: Schema.Struct({
    text: Schema.String.check(Schema.makeFilter((text) => utf8Length(text) <= 24000)),
    nextOffset: Schema.optionalKey(PositiveInt.check(Schema.isLessThanOrEqualTo(65536))),
    truncated: Schema.Boolean,
  }),
});
export type WorkspaceNoteReadResult = typeof WorkspaceNoteReadResult.Type;
export class WorkspaceNotesError extends Schema.TaggedError<WorkspaceNotesError>()(
  "WorkspaceNotesError",
  {
    kind: Schema.Literals(["invalid-input", "not-found", "conflict", "unavailable"]),
    message: Schema.String,
  },
) {}
const error = Schema.Union([WorkspaceNotesError, EnvironmentAuthorizationError]);
export const PULSE_NOTES_METHODS = {
  notesCreate: "pulse.notes.create",
  notesGet: "pulse.notes.get",
  notesRead: "pulse.notes.read",
  notesUpdate: "pulse.notes.update",
  notesDelete: "pulse.notes.delete",
  notesSubscribeChanges: "pulse.notes.subscribeChanges",
} as const;
export const PulseNotesRpcs = [
  Rpc.make(PULSE_NOTES_METHODS.notesCreate, {
    payload: WorkspaceNoteCreate,
    success: WorkspaceNote,
    error,
  }),
  Rpc.make(PULSE_NOTES_METHODS.notesGet, {
    payload: WorkspaceNoteGet,
    success: WorkspaceNote,
    error,
  }),
  Rpc.make(PULSE_NOTES_METHODS.notesRead, {
    payload: WorkspaceNoteRead,
    success: WorkspaceNoteReadResult,
    error,
  }),
  Rpc.make(PULSE_NOTES_METHODS.notesUpdate, {
    payload: WorkspaceNoteUpdate,
    success: WorkspaceNote,
    error,
  }),
  Rpc.make(PULSE_NOTES_METHODS.notesDelete, {
    payload: WorkspaceNoteDelete,
    success: Schema.Void,
    error,
  }),
  Rpc.make(PULSE_NOTES_METHODS.notesSubscribeChanges, {
    payload: Schema.Struct({}),
    success: NonNegativeInt,
    error: EnvironmentAuthorizationError,
    stream: true,
  }),
] as const;
