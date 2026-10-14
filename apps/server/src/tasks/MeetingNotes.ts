import {
  MeetingNote,
  MeetingNoteInput,
  MeetingNotesError,
  type MeetingNoteKey,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SqlClient from "effect/unstable/sql/SqlClient";
const recordSchema = Schema.fromJsonString(MeetingNote);
const decode = Schema.decodeUnknownEffect(recordSchema);
const encode = Schema.encodeEffect(recordSchema);
const validate = Schema.decodeEffect(MeetingNoteInput);
const isNotesError = Schema.is(MeetingNotesError);

export const makeMeetingNotes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const changes = yield* SubscriptionRef.make(0);
  const failure = () =>
    new MeetingNotesError({ message: "Meeting notes could not be saved or loaded. Try again." });
  const get = Effect.fn("MeetingNotes.get")(function* (key: MeetingNoteKey) {
    const rows = yield* sql<{
      record_json: string;
    }>`SELECT record_json FROM meeting_notes WHERE account_id = ${key.accountId} AND event_id = ${key.eventId}`;
    return rows[0] ? yield* decode(rows[0].record_json) : null;
  }, Effect.mapError(failure));
  const save = Effect.fn("MeetingNotes.save")(function* (raw: MeetingNoteInput) {
    const input = yield* validate(raw).pipe(
      Effect.mapError(
        () => new MeetingNotesError({ message: "Check the note title, text and project." }),
      ),
    );
    const result = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const previous = yield* get(input);
          if ((previous?.revision ?? null) !== input.revision)
            return yield* new MeetingNotesError({
              message:
                "These notes changed elsewhere. Reload the saved notes before editing again.",
            });
          if (input.projectId !== null && input.projectId !== previous?.projectId) {
            const projects =
              yield* sql`SELECT project_id FROM projection_projects WHERE project_id = ${input.projectId} AND deleted_at IS NULL`;
            if (!projects.length)
              return yield* new MeetingNotesError({
                message: "Choose an existing project in this environment.",
              });
          }
          const next: MeetingNote = {
            ...input,
            revision: (previous?.revision ?? -1) + 1,
            updatedAt: DateTime.formatIso(yield* DateTime.now),
          };
          const encoded = yield* encode(next);
          yield* sql`INSERT INTO meeting_notes (account_id, event_id, record_json) VALUES (${input.accountId}, ${input.eventId}, ${encoded}) ON CONFLICT(account_id,event_id) DO UPDATE SET record_json = excluded.record_json`;
          return next;
        }),
      )
      .pipe(Effect.mapError((error) => (isNotesError(error) ? error : failure())));
    yield* SubscriptionRef.update(changes, (revision) => revision + 1);
    return result;
  });
  return {
    get,
    save,
    subscribe: (key: MeetingNoteKey) =>
      SubscriptionRef.changes(changes).pipe(Stream.mapEffect(() => get(key))),
  };
});
export type MeetingNotes = Effect.Success<typeof makeMeetingNotes>;
