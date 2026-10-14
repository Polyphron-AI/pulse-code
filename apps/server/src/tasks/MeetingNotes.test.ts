import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import { ProjectId } from "@t3tools/contracts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { makeMeetingNotes } from "./MeetingNotes.ts";
const layer = Layer.merge(SqlitePersistenceMemory, NodeServices.layer);
const input = {
  accountId: "account",
  eventId: "event",
  title: "Planning notes",
  text: "Prepare launch copy",
  projectId: null,
  revision: null,
};
it.effect("streams committed notes to the selected meeting", () =>
  Effect.gen(function* () {
    const notes = yield* makeMeetingNotes;
    const subscriber = yield* notes.subscribe(input).pipe(
      Stream.filter((note) => note !== null),
      Stream.take(1),
      Stream.runCollect,
      Effect.forkChild,
    );
    const saved = yield* notes.save(input);
    assert.deepEqual(yield* Fiber.join(subscriber), [saved]);
  }).pipe(Effect.provide(layer)),
);
it.effect("persists notes by account and event and allows clearing content", () =>
  Effect.gen(function* () {
    const notes = yield* makeMeetingNotes;
    const created = yield* notes.save(input);
    assert.strictEqual(created.revision, 0);
    const updated = yield* notes.save({ ...created, text: "" });
    assert.strictEqual(updated.revision, 1);
    const fresh = yield* makeMeetingNotes;
    assert.deepEqual(yield* fresh.get(input), updated);
    assert.isNull(yield* fresh.get({ ...input, accountId: "different" }));
  }).pipe(Effect.provide(layer)),
);
it.effect("rejects stale edits and duplicate initial saves without losing content", () =>
  Effect.gen(function* () {
    const notes = yield* makeMeetingNotes;
    const created = yield* notes.save(input);
    const updated = yield* notes.save({ ...created, text: "Latest" });
    const stale = yield* notes.save({ ...created, text: "Stale" }).pipe(Effect.flip);
    assert.include(stale.message, "changed elsewhere");
    const duplicate = yield* notes.save(input).pipe(Effect.flip);
    assert.include(duplicate.message, "changed elsewhere");
    assert.deepEqual(yield* notes.get(input), updated);
  }).pipe(Effect.provide(layer)),
);
it.effect("rejects nonexistent project links and oversized notes", () =>
  Effect.gen(function* () {
    const notes = yield* makeMeetingNotes;
    const missing = yield* notes
      .save({ ...input, projectId: ProjectId.make("missing") })
      .pipe(Effect.flip);
    assert.include(missing.message, "existing project");
    const oversized = yield* notes.save({ ...input, text: "x".repeat(100001) }).pipe(Effect.flip);
    assert.include(oversized.message, "Check the note");
    assert.isNull(yield* notes.get(input));
  }).pipe(Effect.provide(layer)),
);
