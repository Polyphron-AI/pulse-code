import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { WorkspaceItemRef } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Notes from "./WorkspaceNotes.ts";

const layer = Notes.layer.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
const request = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;
const input = {
  requestId: request(1),
  title: "Launch review · Meeting notes",
  body: "First draft",
};
const encodeRef = Schema.encodeEffect(Schema.fromJsonString(WorkspaceItemRef));

it.effect("rolls back the note if its request journal cannot commit", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TRIGGER reject_note_request BEFORE INSERT ON workspace_note_requests BEGIN SELECT RAISE(ABORT,'journal unavailable'); END`;
    expect((yield* notes.create(input).pipe(Effect.flip)).kind).toBe("unavailable");
    expect(yield* sql`SELECT id FROM workspace_notes`).toEqual([]);
    expect(yield* sql`SELECT request_id FROM workspace_note_requests`).toEqual([]);
    yield* sql`DROP TRIGGER reject_note_request`;
    const note = yield* notes.create(input);
    expect((yield* notes.get({ id: note.id })).body).toBe(input.body);
    expect(yield* Stream.runHead(notes.changes)).toMatchObject({ value: 1 });
  }).pipe(Effect.provide(layer)),
);

it.effect("journals maximally escaped text and canonicalizes equivalent requests", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const raw = { ...input, title: "  Launch review  ", body: "\u0000".repeat(65536) };
    const note = yield* notes.create(raw);
    expect(
      yield* notes.create({ body: raw.body, title: raw.title.trim(), requestId: raw.requestId }),
    ).toEqual(note);
    const sql = yield* SqlClient.SqlClient;
    const [row] = yield* sql<{
      size: number;
      fingerprint: string;
    }>`SELECT length(CAST(result_json AS BLOB)) AS size,fingerprint FROM workspace_note_requests`;
    expect(row!.size).toBeLessThan(512);
    expect(row!.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  }).pipe(Effect.provide(layer)),
);

it.effect("keeps journal results small after many saves of a large note", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const sql = yield* SqlClient.SqlClient;
    let note = yield* notes.create({ ...input, body: "a".repeat(60000) });
    for (let n = 2; n <= 31; n++) {
      note = yield* notes.update({
        ...input,
        requestId: request(n),
        id: note.id,
        expectedRevision: note.revision,
        body: String(n % 10).repeat(60000),
      });
    }
    const [row] = yield* sql<{ count: number; bytes: number; largest: number }>`
      SELECT count(*) AS count,sum(length(CAST(result_json AS BLOB))) AS bytes,
        max(length(CAST(result_json AS BLOB))) AS largest FROM workspace_note_requests`;
    expect(row!.count).toBe(31);
    expect(row!.largest).toBeLessThan(512);
    expect(row!.bytes).toBeLessThan(31 * 512);
    expect((yield* notes.get({ id: note.id })).body).toBe("1".repeat(60000));
  }).pipe(Effect.provide(layer)),
);

it.effect("retries one request and rejects a stale revision", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const first = yield* notes.create(input);
    expect(yield* notes.create(input)).toEqual(first);
    const update = {
      ...input,
      requestId: request(2),
      id: first.id,
      expectedRevision: first.revision,
      body: "Reviewed",
    };
    const changed = yield* notes.update(update);
    expect(changed.revision).toBe(first.revision + 1);
    expect(
      (yield* notes
        .update({ ...update, requestId: request(3), expectedRevision: first.revision })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    const restarted = yield* Notes.make;
    expect((yield* restarted.get({ id: first.id })).body).toBe("Reviewed");
    expect(yield* restarted.create(input)).toEqual(first);
    expect(yield* restarted.update(update)).toEqual(changed);
    const later = yield* restarted.update({
      ...update,
      requestId: request(4),
      expectedRevision: changed.revision,
      body: "Final",
    });
    expect(yield* restarted.update(update)).toEqual(changed);
    expect((yield* restarted.get({ id: first.id })).body).toBe("Final");
    yield* restarted.delete({
      requestId: request(5),
      id: first.id,
      expectedRevision: later.revision,
    });
    expect(yield* restarted.update(update)).toEqual(changed);
    expect((yield* restarted.get({ id: first.id }).pipe(Effect.flip)).kind).toBe("not-found");
  }).pipe(Effect.provide(layer)),
);

it.effect("conflicts on request reuse with different content or mutation kind", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const note = yield* notes.create(input);
    expect((yield* notes.create({ ...input, body: "Different" }).pipe(Effect.flip)).kind).toBe(
      "conflict",
    );
    expect(
      (yield* notes
        .delete({ requestId: input.requestId, id: note.id, expectedRevision: note.revision })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    expect((yield* notes.get({ id: note.id })).body).toBe(input.body);
  }).pipe(Effect.provide(layer)),
);

it.effect("validates service payloads and multibyte bounds before writing", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    for (const invalid of [
      { ...input, title: "  " },
      { ...input, requestId: "invalid" },
      { ...input, body: "😀".repeat(16385) },
      { ...input, title: "x".repeat(301) },
      { ...input, title: "a\uD800b" },
      { ...input, body: "a\uD800b" },
      { ...input, body: "a\uDC00b" },
    ])
      expect((yield* notes.create(invalid).pipe(Effect.flip)).kind).toBe("invalid-input");
    const note = yield* notes.create({ ...input, title: "  Kept  ", body: "😀".repeat(16384) });
    expect(note.title).toBe("Kept");
    expect((yield* notes.get({ id: note.id })).body).toBe(note.body);
    expect(
      (yield* notes
        .update({ ...input, requestId: request(2), id: note.id, expectedRevision: 0 })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    expect(
      (yield* notes
        .delete({ requestId: request(3), id: note.id, expectedRevision: -1 })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    expect((yield* notes.get({ id: "bad" }).pipe(Effect.flip)).kind).toBe("invalid-input");
  }).pipe(Effect.provide(layer)),
);

it.effect("retains tombstones and replay results without resurrecting deleted notes", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const note = yield* notes.create(input);
    const sql = yield* SqlClient.SqlClient;
    const ref = yield* encodeRef({
      type: "provider-resource",
      provider: "workspace-note",
      resourceId: note.id,
    });
    yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) VALUES('note-link','project','workspace-note', '{}',${ref},'confirmed','{}','created','updated')`;
    const deletion = { requestId: request(3), id: note.id, expectedRevision: note.revision };
    expect(
      (yield* notes
        .delete({ ...deletion, requestId: request(2), expectedRevision: note.revision + 1 })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    yield* notes.delete(deletion);
    const restarted = yield* Notes.make;
    yield* restarted.delete(deletion);
    expect(yield* restarted.create(input)).toEqual(note);
    expect((yield* restarted.get({ id: note.id }).pipe(Effect.flip)).kind).toBe("not-found");
    expect((yield* restarted.read({ id: note.id }).pipe(Effect.flip)).kind).toBe("not-found");
    expect(
      (yield* restarted
        .update({ ...input, requestId: request(4), id: note.id, expectedRevision: note.revision })
        .pipe(Effect.flip)).kind,
    ).toBe("not-found");
    expect(yield* sql`SELECT deleted,revision FROM workspace_notes`).toEqual([
      { deleted: 1, revision: note.revision + 1 },
    ]);
    expect(
      yield* sql`SELECT ref_b_json,status FROM workspace_links WHERE link_id='note-link'`,
    ).toEqual([{ ref_b_json: ref, status: "confirmed" }]);
  }).pipe(Effect.provide(layer)),
);

it.effect("reads UTF-8 chunks without mixing revisions or accepting split offsets", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const body = "a" + "😀".repeat(16000);
    const note = yield* notes.create({ ...input, body });
    const first = yield* notes.read({ id: note.id });
    expect(Buffer.byteLength(first.body.text)).toBeLessThanOrEqual(24000);
    expect(first.body.text).not.toContain("�");
    expect(first.body.truncated).toBe(true);
    const second = yield* notes.read({
      id: note.id,
      offset: first.body.nextOffset!,
      revision: first.revision,
    });
    const third = yield* notes.read({
      id: note.id,
      offset: second.body.nextOffset!,
      revision: first.revision,
    });
    expect(first.body.text + second.body.text + third.body.text).toBe(body);
    expect(third.body).toMatchObject({ truncated: false });
    expect(third.body).not.toHaveProperty("nextOffset");
    for (const continuation of [
      { offset: 2, revision: first.revision },
      { offset: 1 },
      { offset: 65536, revision: first.revision },
    ])
      expect((yield* notes.read({ id: note.id, ...continuation }).pipe(Effect.flip)).kind).toBe(
        "invalid-input",
      );
    yield* notes.update({
      ...input,
      requestId: request(2),
      id: note.id,
      expectedRevision: note.revision,
      body: "Changed",
    });
    expect(
      (yield* notes
        .read({ id: note.id, offset: first.body.nextOffset!, revision: first.revision })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
  }).pipe(Effect.provide(layer)),
);

it.effect("restores a tombstone and its existing links across restart", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const note = yield* notes.create(input);
    const sql = yield* SqlClient.SqlClient;
    const ref = yield* encodeRef({
      type: "provider-resource",
      provider: "workspace-note",
      resourceId: note.id,
    });
    yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) VALUES('restored-link','project','workspace-note','{}',${ref},'confirmed','{}','created','updated')`;
    yield* notes.delete({ requestId: request(2), id: note.id, expectedRevision: note.revision });
    const restarted = yield* Notes.make;
    const restoration = { requestId: request(3), id: note.id, expectedRevision: note.revision + 1 };
    expect(yield* restarted.restore(restoration)).toBeUndefined();
    const restored = yield* restarted.get({ id: note.id });
    expect(restored).toEqual({ ...note, revision: note.revision + 2 });
    yield* restarted.restore(restoration);
    expect((yield* restarted.get({ id: note.id })).revision).toBe(restored.revision);
    expect(yield* Stream.runHead(restarted.changes)).toMatchObject({ value: 1 });
    expect(
      yield* sql`SELECT ref_b_json,status FROM workspace_links WHERE link_id='restored-link'`,
    ).toEqual([{ ref_b_json: ref, status: "confirmed" }]);
  }).pipe(Effect.provide(layer)),
);

it.effect("rejects stale, active, missing and invalid restores with typed outcomes", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const note = yield* notes.create(input);
    const restoration = { requestId: request(3), id: note.id, expectedRevision: note.revision };
    expect(yield* notes.restore(restoration).pipe(Effect.flip)).toMatchObject({
      _tag: "WorkspaceNotesError",
      kind: "conflict",
    });
    yield* notes.delete({ requestId: request(2), id: note.id, expectedRevision: note.revision });
    expect(yield* notes.restore(restoration).pipe(Effect.flip)).toMatchObject({
      _tag: "WorkspaceNotesError",
      kind: "conflict",
    });
    expect(
      yield* notes.restore({ ...restoration, requestId: input.requestId }).pipe(Effect.flip),
    ).toMatchObject({ kind: "conflict" });
    expect(
      yield* notes.restore({ ...restoration, id: `wsn_${request(99)}` }).pipe(Effect.flip),
    ).toMatchObject({ kind: "not-found" });
    for (const invalid of [
      { ...restoration, expectedRevision: 0 },
      { ...restoration, id: "bad" },
      { ...restoration, requestId: "bad" },
    ])
      expect(yield* notes.restore(invalid).pipe(Effect.flip)).toMatchObject({
        kind: "invalid-input",
      });
    const sql = yield* SqlClient.SqlClient;
    expect(yield* sql`SELECT request_id FROM workspace_note_requests`).toHaveLength(2);
    expect(yield* Stream.runHead(notes.changes)).toMatchObject({ value: 2 });
    expect(yield* notes.get({ id: note.id }).pipe(Effect.flip)).toMatchObject({
      kind: "not-found",
    });
  }).pipe(Effect.provide(layer)),
);

it.effect("allows one restore revision winner and never resurrects on a restore replay", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const note = yield* notes.create(input);
    yield* notes.delete({ requestId: request(2), id: note.id, expectedRevision: note.revision });
    const restore = { requestId: request(3), id: note.id, expectedRevision: note.revision + 1 };
    const results = yield* Effect.all(
      [restore, { ...restore, requestId: request(4) }].map((input) =>
        notes.restore(input).pipe(Effect.result),
      ),
      { concurrency: "unbounded" },
    );
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
    expect(results.find((result) => result._tag === "Failure")).toMatchObject({
      failure: { kind: "conflict" },
    });
    const winner = results[0]!._tag === "Success" ? restore : { ...restore, requestId: request(4) };
    const changed = yield* notes.update({
      ...input,
      requestId: request(5),
      id: note.id,
      expectedRevision: note.revision + 2,
      body: "After restore",
    });
    yield* notes.restore(winner);
    expect(yield* notes.get({ id: note.id })).toEqual(changed);
    yield* notes.delete({ requestId: request(6), id: note.id, expectedRevision: changed.revision });
    const restarted = yield* Notes.make;
    yield* restarted.restore(winner);
    expect(yield* restarted.get({ id: note.id }).pipe(Effect.flip)).toMatchObject({
      kind: "not-found",
    });
    expect(yield* Stream.runHead(notes.changes)).toMatchObject({ value: 5 });
  }).pipe(Effect.provide(layer)),
);

it.effect("commits each concurrent request once and allows only one revision winner", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const copies = yield* Effect.all([notes.create(input), notes.create(input)], {
      concurrency: "unbounded",
    });
    expect(copies[0]).toEqual(copies[1]);
    const note = copies[0];
    const results = yield* Effect.all(
      [2, 3].map((n) =>
        notes
          .update({
            ...input,
            requestId: request(n),
            id: note.id,
            expectedRevision: note.revision,
            body: `Draft ${n}`,
          })
          .pipe(Effect.result),
      ),
      { concurrency: "unbounded" },
    );
    expect(results.filter((r) => r._tag === "Success")).toHaveLength(1);
    expect((yield* notes.get({ id: note.id })).revision).toBe(note.revision + 1);
  }).pipe(Effect.provide(layer)),
);

it.effect("announces committed changes without retransmitting bodies or announcing replays", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const sql = yield* SqlClient.SqlClient;
    const assertEmission = Effect.fnUntraced(function* (count: number) {
      expect(yield* Stream.runHead(notes.changes)).toMatchObject({ value: count });
      const rows = yield* sql`SELECT request_id FROM workspace_note_requests`;
      expect(rows).toHaveLength(count);
    });
    const note = yield* notes.create(input);
    yield* assertEmission(1);
    yield* notes.create(input);
    yield* assertEmission(1);
    yield* notes.create({ ...input, body: "Conflict" }).pipe(Effect.flip);
    yield* assertEmission(1);
    yield* notes.update({
      ...input,
      requestId: request(2),
      id: note.id,
      expectedRevision: note.revision,
    });
    yield* assertEmission(2);
    yield* notes
      .update({
        ...input,
        requestId: request(4),
        id: note.id,
        expectedRevision: note.revision,
      })
      .pipe(Effect.flip);
    yield* assertEmission(2);
    yield* notes.delete({
      requestId: request(3),
      id: note.id,
      expectedRevision: note.revision + 1,
    });
    yield* assertEmission(3);
    yield* notes.delete({
      requestId: request(3),
      id: note.id,
      expectedRevision: note.revision + 1,
    });
    yield* assertEmission(3);
  }).pipe(Effect.provide(layer)),
);
