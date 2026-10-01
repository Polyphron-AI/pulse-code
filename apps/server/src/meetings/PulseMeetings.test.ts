import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { type MeetingId, TextGenerationError } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { describe, expect } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as ServerSettings from "../serverSettings.ts";
import {
  TextGeneration,
  type MeetingSummaryGenerationInput,
  type MeetingSummaryGenerationResult,
} from "../textGeneration/TextGeneration.ts";
import {
  DEFAULT_MEETING_TITLE,
  PulseMeetings,
  layer as pulseMeetingsLayer,
} from "./PulseMeetings.ts";

type SummaryHandler = (
  input: MeetingSummaryGenerationInput,
) => Effect.Effect<MeetingSummaryGenerationResult, TextGenerationError>;

const unused = (operation: string) => () => Effect.die(`${operation} is not used by meetings`);

function makeLayer(handler: { current: SummaryHandler }) {
  const textGeneration = Layer.succeed(
    TextGeneration,
    TextGeneration.of({
      generateCommitMessage: unused("generateCommitMessage"),
      generatePrContent: unused("generatePrContent"),
      generateBranchName: unused("generateBranchName"),
      generateThreadTitle: unused("generateThreadTitle"),
      generateThreadHandoff: unused("generateThreadHandoff"),
      generateMeetingSummary: (input) => handler.current(input),
    }),
  );
  return pulseMeetingsLayer.pipe(
    Layer.provide(textGeneration),
    Layer.provide(ServerSettings.layerTest()),
    Layer.provide(SqlitePersistenceMemory),
    Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-meetings-test-" })),
    Layer.provideMerge(NodeServices.layer),
  );
}

const segment = (index: number, text: string) => ({
  index,
  startMs: index * 5_000,
  endMs: index * 5_000 + 4_000,
  text,
});

/** Resolves once the stored summary has left the pending state. */
const awaitSettledSummary = (id: MeetingId) =>
  Effect.gen(function* () {
    const meetings = yield* PulseMeetings;
    const settled = yield* meetings.revisions.pipe(
      Stream.mapEffect(() => meetings.get(id)),
      Stream.filter((detail) => detail.summaryStatus !== "pending"),
      Stream.runHead,
    );
    return Option.getOrThrow(settled);
  });

const recordMeeting = (title?: string) =>
  Effect.gen(function* () {
    const meetings = yield* PulseMeetings;
    const created = yield* meetings.create({
      startedAt: "2026-10-01T10:00:00.000Z",
      ...(title !== undefined ? { title } : {}),
    });
    yield* meetings.appendSegments(created.id, [segment(0, "We ship Friday."), segment(1, "Ana")]);
    return created.id;
  });

const finishInput = (id: MeetingId) => ({
  id,
  endedAt: "2026-10-01T10:30:00.000Z",
  durationMs: 1_800_000,
});

describe("PulseMeetings", () => {
  it.effect("overwrites a resent segment instead of duplicating it", () => {
    const handler = { current: unused("generateMeetingSummary") as SummaryHandler };
    return Effect.gen(function* () {
      const meetings = yield* PulseMeetings;
      const id = yield* recordMeeting();
      const row = yield* meetings.appendSegments(id, [segment(1, "Ana owns the release notes.")]);
      expect(row.segmentCount).toBe(2);

      const detail = yield* meetings.get(id);
      expect(detail.segments.map((entry) => entry.text)).toEqual([
        "We ship Friday.",
        "Ana owns the release notes.",
      ]);
      const listed = yield* meetings.list;
      expect(listed).toHaveLength(1);
      expect(listed[0]).not.toHaveProperty("segments");
    }).pipe(Effect.provide(makeLayer(handler)));
  });

  it.effect("finishes immediately with a pending summary, then stores the summary", () => {
    const handler: { current: SummaryHandler } = { current: unused("generateMeetingSummary") };
    return Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const prompts: Array<MeetingSummaryGenerationInput> = [];
      handler.current = (input) => {
        prompts.push(input);
        return Deferred.await(gate).pipe(
          Effect.as({ summary: "## Summary\n- Ship Friday", title: "Release sync" }),
        );
      };
      const meetings = yield* PulseMeetings;
      const id = yield* recordMeeting();

      const finished = yield* meetings.finish(finishInput(id));
      expect(finished.status).toBe("ready");
      expect(finished.summaryStatus).toBe("pending");
      expect(finished.title).toBe(DEFAULT_MEETING_TITLE);

      yield* Deferred.succeed(gate, undefined);
      const settled = yield* awaitSettledSummary(id);
      expect(settled.summaryStatus).toBe("ready");
      expect(settled.summary).toBe("## Summary\n- Ship Friday");
      expect(settled.title).toBe("Release sync");
      expect(settled.summaryModel).not.toBeNull();
      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.transcript).toBe("[00:00] We ship Friday.\n[00:05] Ana");
      expect(prompts[0]?.title).toBeUndefined();
    }).pipe(Effect.provide(makeLayer(handler)));
  });

  it.effect("keeps a title the user chose", () => {
    const handler: { current: SummaryHandler } = {
      current: () => Effect.succeed({ summary: "Notes", title: "Suggested" }),
    };
    return Effect.gen(function* () {
      const meetings = yield* PulseMeetings;
      const id = yield* recordMeeting("Board review");
      yield* meetings.finish(finishInput(id));
      const settled = yield* awaitSettledSummary(id);
      expect(settled.title).toBe("Board review");
    }).pipe(Effect.provide(makeLayer(handler)));
  });

  it.effect("stores a failed summary and succeeds when retried", () => {
    const handler: { current: SummaryHandler } = {
      current: () =>
        Effect.fail(
          new TextGenerationError({
            operation: "generateMeetingSummary",
            detail: "quota exceeded",
          }),
        ),
    };
    return Effect.gen(function* () {
      const meetings = yield* PulseMeetings;
      const id = yield* recordMeeting();
      yield* meetings.finish(finishInput(id));
      const failed = yield* awaitSettledSummary(id);
      expect(failed.summaryStatus).toBe("failed");
      expect(failed.summaryError).toContain("quota exceeded");

      handler.current = () => Effect.succeed({ summary: "Recovered summary" });
      const retried = yield* meetings.summarize(id);
      expect(retried.summaryStatus).toBe("pending");
      const ready = yield* awaitSettledSummary(id);
      expect(ready.summaryStatus).toBe("ready");
      expect(ready.summary).toBe("Recovered summary");
      expect(ready.summaryError).toBeNull();
    }).pipe(Effect.provide(makeLayer(handler)));
  });

  it.effect("coalesces concurrent summarize calls into one generation", () => {
    const handler: { current: SummaryHandler } = { current: unused("generateMeetingSummary") };
    return Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      let calls = 0;
      handler.current = () => {
        calls += 1;
        return Deferred.await(gate).pipe(Effect.as({ summary: "Once" }));
      };
      const meetings = yield* PulseMeetings;
      const id = yield* recordMeeting();
      yield* meetings.finish(finishInput(id));
      const rows = yield* Effect.all(
        [meetings.summarize(id), meetings.summarize(id), meetings.summarize(id)],
        { concurrency: "unbounded" },
      );
      expect(rows.every((row) => row.summaryStatus === "pending")).toBe(true);

      yield* Deferred.succeed(gate, undefined);
      const settled = yield* awaitSettledSummary(id);
      expect(settled.summary).toBe("Once");
      expect(calls).toBe(1);
    }).pipe(Effect.provide(makeLayer(handler)));
  });

  it.effect("publishes a revision naming the meeting when it is deleted", () => {
    const handler = { current: unused("generateMeetingSummary") as SummaryHandler };
    return Effect.gen(function* () {
      const meetings = yield* PulseMeetings;
      const id = yield* recordMeeting();
      const before = Option.getOrThrow(yield* meetings.revisions.pipe(Stream.runHead));

      const next = yield* meetings.revisions.pipe(
        Stream.filter((change) => change.revision > before.revision),
        Stream.runHead,
        Effect.forkChild,
      );
      yield* meetings.delete(id);
      expect(Option.getOrThrow(yield* Fiber.join(next)).meetingId).toBe(id);
      expect(yield* meetings.list).toHaveLength(0);
      const missing = yield* meetings.get(id).pipe(Effect.flip);
      expect(missing.message).toBe("Meeting not found.");
    }).pipe(Effect.provide(makeLayer(handler)));
  });

  it.effect("rejects segments after the meeting finishes", () => {
    const handler: { current: SummaryHandler } = {
      current: () => Effect.succeed({ summary: "Done" }),
    };
    return Effect.gen(function* () {
      const meetings = yield* PulseMeetings;
      const id = yield* recordMeeting();
      yield* meetings.finish(finishInput(id));
      const error = yield* meetings.appendSegments(id, [segment(2, "late")]).pipe(Effect.flip);
      expect(error._tag).toBe("PulseMeetingsError");
      yield* awaitSettledSummary(id);
    }).pipe(Effect.provide(makeLayer(handler)));
  });
});
