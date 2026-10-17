import {
  WorkspaceNote,
  WorkspaceNoteCreate,
  WorkspaceNoteGet,
  WorkspaceNoteUpdate,
  WorkspaceNoteDelete,
  WorkspaceNoteRestore,
  WorkspaceNoteRead,
  WorkspaceNotesError,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Struct from "effect/Struct";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeCrypto from "node:crypto";
import { sliceUtf8 } from "../mail/MailImapRead.ts";

// The fingerprint-matched input supplies the original body without storing it per save.
const NoteJson = Schema.fromJsonString(WorkspaceNote.mapFields(Struct.omit(["body"])));
const VoidJson = Schema.fromJsonString(Schema.Null);
const encodeCreate = Schema.encodeSync(Schema.fromJsonString(WorkspaceNoteCreate));
const encodeUpdate = Schema.encodeSync(Schema.fromJsonString(WorkspaceNoteUpdate));
const encodeDelete = Schema.encodeSync(Schema.fromJsonString(WorkspaceNoteDelete));
const encodeRestore = Schema.encodeSync(Schema.fromJsonString(WorkspaceNoteRestore));
const isNotesError = Schema.is(WorkspaceNotesError);
const decodeNote = Schema.decodeUnknownEffect(WorkspaceNote);
const fail = (kind: WorkspaceNotesError["kind"], message: string) =>
  new WorkspaceNotesError({ kind, message });
const conflict = () =>
  fail("conflict", "This note changed. Reload it before saving. Your draft has been kept.");
const missing = () => fail("not-found", "This note is unavailable. Its links have been kept.");
const decode = <S extends Schema.Top>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(() =>
      fail(
        "invalid-input",
        "Use a valid note ID, request ID, revision and bounded title and text.",
      ),
    ),
  );

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const counter = yield* SubscriptionRef.make(0);
  const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError((error) =>
        isNotesError(error)
          ? error
          : fail("unavailable", "Notes could not be saved or read. Their links have been kept."),
      ),
    );
  const get = Effect.fnUntraced(function* (input: typeof WorkspaceNoteGet.Type) {
    const { id } = yield* decode(WorkspaceNoteGet, input);
    const rows =
      yield* sql<WorkspaceNote>`SELECT id,title,body,revision,created_at AS "createdAt",updated_at AS "updatedAt" FROM workspace_notes WHERE id=${id} AND deleted=0`;
    if (!rows[0]) return yield* missing();
    return yield* decodeNote(rows[0]);
  }, safe);

  // The durable journal and note mutation commit together. Announce only the new commit.
  const mutate = <A, E>(
    requestId: string,
    canonical: string,
    resultSchema: Schema.Codec<A, string>,
    write: Effect.Effect<A, E>,
  ) =>
    safe(
      Effect.gen(function* () {
        const fingerprint = NodeCrypto.createHash("sha256").update(canonical).digest("hex");
        const outcome = yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<{
              fingerprint: string;
              resultJson: string;
            }>`SELECT fingerprint,result_json AS "resultJson" FROM workspace_note_requests WHERE request_id=${requestId}`;
            const replay = rows[0];
            if (replay) {
              if (replay.fingerprint !== fingerprint)
                return yield* fail(
                  "conflict",
                  "This request ID was already used for a different note change.",
                );
              return {
                result: yield* Schema.decodeUnknownEffect(resultSchema)(replay.resultJson),
                changed: false,
              };
            }
            const result = yield* write;
            const resultJson = yield* Schema.encodeEffect(resultSchema)(result);
            yield* sql`INSERT INTO workspace_note_requests(request_id,fingerprint,result_json) VALUES(${requestId},${fingerprint},${resultJson})`;
            return { result, changed: true };
          }),
        );
        if (outcome.changed) yield* SubscriptionRef.update(counter, (n) => n + 1);
        return outcome.result;
      }).pipe(Effect.uninterruptible),
    );
  const requireRevision = Effect.fnUntraced(function* (id: string) {
    const rows = yield* sql`SELECT id FROM workspace_notes WHERE id=${id} AND deleted=0`;
    return yield* rows.length ? conflict() : missing();
  });

  return {
    get,
    changes: SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0)),
    create: Effect.fnUntraced(function* (raw: WorkspaceNoteCreate) {
      const input = yield* decode(WorkspaceNoteCreate, raw);
      const result = yield* mutate(
        input.requestId,
        `create:${encodeCreate(input)}`,
        NoteJson,
        Effect.gen(function* () {
          const id = `wsn_${yield* crypto.randomUUIDv4}`;
          const now = yield* DateTime.nowAsDate;
          const at = now.toISOString();
          yield* sql`INSERT INTO workspace_notes(id,title,body,revision,created_at,updated_at) VALUES(${id},${input.title},${input.body},1,${at},${at})`;
          return yield* get({ id });
        }),
      );
      return { ...result, body: input.body };
    }, safe),
    update: Effect.fnUntraced(function* (raw: WorkspaceNoteUpdate) {
      const input = yield* decode(WorkspaceNoteUpdate, raw);
      const result = yield* mutate(
        input.requestId,
        `update:${encodeUpdate(input)}`,
        NoteJson,
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          const rows =
            yield* sql`UPDATE workspace_notes SET title=${input.title},body=${input.body},revision=revision+1,updated_at=${now.toISOString()} WHERE id=${input.id} AND revision=${input.expectedRevision} AND deleted=0 RETURNING revision`;
          if (!rows.length) return yield* requireRevision(input.id);
          return yield* get({ id: input.id });
        }),
      );
      return { ...result, body: input.body };
    }, safe),
    delete: Effect.fnUntraced(function* (raw: WorkspaceNoteDelete) {
      const input = yield* decode(WorkspaceNoteDelete, raw);
      yield* mutate(
        input.requestId,
        `delete:${encodeDelete(input)}`,
        VoidJson,
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          const rows =
            yield* sql`UPDATE workspace_notes SET deleted=1,revision=revision+1,updated_at=${now.toISOString()} WHERE id=${input.id} AND revision=${input.expectedRevision} AND deleted=0 RETURNING revision`;
          if (!rows.length) return yield* requireRevision(input.id);
          return null;
        }),
      );
    }, safe),
    restore: Effect.fnUntraced(function* (raw: WorkspaceNoteRestore) {
      const input = yield* decode(WorkspaceNoteRestore, raw);
      yield* mutate(
        input.requestId,
        `restore:${encodeRestore(input)}`,
        VoidJson,
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          const rows =
            yield* sql`UPDATE workspace_notes SET deleted=0,revision=revision+1,updated_at=${now.toISOString()} WHERE id=${input.id} AND revision=${input.expectedRevision} AND deleted=1 RETURNING revision`;
          if (!rows.length) {
            const exists = yield* sql`SELECT id FROM workspace_notes WHERE id=${input.id}`;
            return yield* exists.length ? conflict() : missing();
          }
          return null;
        }),
      );
    }, safe),
    read: Effect.fnUntraced(function* (raw: WorkspaceNoteRead) {
      const input = yield* decode(WorkspaceNoteRead, raw);
      const note = yield* get({ id: input.id });
      if (input.revision !== undefined && input.revision !== note.revision)
        return yield* conflict();
      const offset = input.offset ?? 0;
      const bytes = Buffer.from(note.body, "utf8");
      if (offset > bytes.length || (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80))
        return yield* fail(
          "invalid-input",
          "Use the nextOffset and revision returned by the previous read.",
        );
      return {
        id: note.id,
        title: note.title,
        revision: note.revision,
        body: sliceUtf8(note.body, offset, 24000),
      };
    }, safe),
  };
});
export class WorkspaceNotes extends Context.Service<WorkspaceNotes, Effect.Success<typeof make>>()(
  "t3/workspace/WorkspaceNotes",
) {}
export const layer = Layer.effect(WorkspaceNotes, make);
