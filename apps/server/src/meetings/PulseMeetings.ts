import {
  type MeetingDetail,
  type MeetingId,
  type MeetingRevision,
  type MeetingSegment,
  type MeetingSummaryRow,
  PulseMeetingsError,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as ServerConfig from "../config.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import * as MeetingRepository from "./MeetingRepository.ts";

export const DEFAULT_MEETING_TITLE = "Untitled meeting";
export const INTERRUPTED_SUMMARY_ERROR = "Summary was interrupted. Regenerate to try again.";
const EMPTY_TRANSCRIPT_ERROR = "The meeting has no transcript to summarize.";
const EMPTY_SUMMARY_ERROR = "The provider returned an empty summary.";

type MeetingsEffect<A> = Effect.Effect<A, PulseMeetingsError>;

export class PulseMeetings extends Context.Service<
  PulseMeetings,
  {
    readonly list: MeetingsEffect<ReadonlyArray<MeetingSummaryRow>>;
    readonly get: (id: MeetingId) => MeetingsEffect<MeetingDetail>;
    readonly create: (input: {
      readonly title?: string | undefined;
      readonly startedAt: string;
    }) => MeetingsEffect<MeetingSummaryRow>;
    readonly appendSegments: (
      id: MeetingId,
      segments: ReadonlyArray<MeetingSegment>,
    ) => MeetingsEffect<MeetingSummaryRow>;
    /** Marks the meeting ready and starts its summary without waiting for it. */
    readonly finish: (input: {
      readonly id: MeetingId;
      readonly endedAt: string;
      readonly durationMs: number;
    }) => MeetingsEffect<MeetingSummaryRow>;
    /** Starts a summary. A call while one is already running returns the pending row. */
    readonly summarize: (id: MeetingId) => MeetingsEffect<MeetingSummaryRow>;
    readonly rename: (id: MeetingId, title: string) => MeetingsEffect<MeetingSummaryRow>;
    readonly delete: (id: MeetingId) => MeetingsEffect<void>;
    /** Grows on every meeting change and names the meeting, so clients refetch only what changed. */
    readonly revisions: Stream.Stream<MeetingRevision>;
  }
>()("t3/meetings/PulseMeetings") {}

/** Formats a millisecond offset as mm:ss, letting minutes exceed 59. */
export function formatMeetingOffset(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatMeetingTranscript(segments: ReadonlyArray<MeetingSegment>): string {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment) => `[${formatMeetingOffset(segment.startMs)}] ${segment.text.trim()}`)
    .join("\n");
}

interface SummaryOutcome {
  readonly state: MeetingRepository.MeetingSummaryState;
  readonly title?: string | undefined;
}

const notFound = () => new PulseMeetingsError({ message: "Meeting not found." });

export const make = Effect.gen(function* () {
  const repository = yield* MeetingRepository.MeetingRepository;
  const textGeneration = yield* TextGeneration;
  const serverSettings = yield* ServerSettingsService;
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const scope = yield* Effect.scope;

  // Summaries run in an empty directory so provider CLIs never read project files or instructions.
  const summaryCwd = path.join(config.stateDir, "pulse", "meetings");
  yield* fileSystem.makeDirectory(summaryCwd, { recursive: true }).pipe(Effect.orDie);

  const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  yield* nowIso.pipe(
    Effect.flatMap((now) => repository.failPendingSummaries(INTERRUPTED_SUMMARY_ERROR, now)),
    Effect.ignoreCause({ log: true }),
  );

  // Starting from the clock keeps revisions increasing across server restarts.
  const initialRevision = yield* Clock.currentTimeMillis;
  const revision = yield* SubscriptionRef.make<MeetingRevision>({
    revision: initialRevision,
    meetingId: "" as MeetingId,
  });
  const publish = (meetingId: MeetingId) =>
    SubscriptionRef.update(revision, (current) => ({
      revision: current.revision + 1,
      meetingId,
    }));
  const inFlight = new Set<MeetingId>();

  const storageFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.tapCause((cause) => Effect.logError("Pulse meetings storage failed", cause)),
      Effect.mapError(
        () => new PulseMeetingsError({ message: "Meeting storage failed. Try again." }),
      ),
    );

  const requireRecord = (id: MeetingId) =>
    storageFailure(repository.get(id)).pipe(
      Effect.filterOrFail((record) => record !== null, notFound),
    );
  const requireRow = (id: MeetingId) =>
    requireRecord(id).pipe(Effect.map(MeetingRepository.toSummaryRow));

  const setSummaryState = (id: MeetingId, state: MeetingRepository.MeetingSummaryState) =>
    nowIso.pipe(Effect.flatMap((now) => repository.setSummaryState(id, state, now)));
  const failedOutcome = (summaryError: string): SummaryOutcome => ({
    state: { summaryStatus: "failed", summary: null, summaryError, summaryModel: null },
  });

  // Starting a summary and settling one both hold this lock, so a retry that sees a settled
  // status always starts a new job instead of coalescing into the one that just finished.
  const summaryLock = yield* Semaphore.make(1);

  const generateSummary = (id: MeetingId) =>
    Effect.gen(function* () {
      const record = yield* repository.get(id);
      if (record === null) return null;
      const transcript = formatMeetingTranscript(yield* repository.listSegments(id));
      if (transcript.length === 0) return failedOutcome(EMPTY_TRANSCRIPT_ERROR);
      const { textGenerationModelSelection: modelSelection } = yield* serverSettings.getSettings;
      const generated = yield* textGeneration.generateMeetingSummary({
        cwd: summaryCwd,
        transcript,
        title: record.titleIsDefault ? undefined : record.title,
        modelSelection,
      });
      if (generated.summary.length === 0) return failedOutcome(EMPTY_SUMMARY_ERROR);
      const ready: SummaryOutcome = {
        state: {
          summaryStatus: "ready",
          summary: generated.summary,
          summaryError: null,
          summaryModel: modelSelection.model,
        },
        title: generated.title,
      };
      return ready;
    }).pipe(
      // Every failure lands as a stored error so the status never sticks at pending.
      // Interrupts only happen on shutdown, which the next startup marks failed.
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        (cause) =>
          Effect.logWarning("Pulse meeting summary failed", cause).pipe(
            Effect.as(failedOutcome(summaryErrorMessage(cause))),
          ),
      ),
    );

  const runSummary = (id: MeetingId) =>
    generateSummary(id).pipe(
      Effect.flatMap((outcome) =>
        summaryLock.withPermit(
          Effect.gen(function* () {
            if (outcome === null) return;
            yield* setSummaryState(id, outcome.state);
            if (outcome.title !== undefined && outcome.title.length > 0) {
              yield* repository.applySuggestedTitle(id, outcome.title, yield* nowIso);
            }
          }).pipe(
            Effect.ignoreCause({ log: true }),
            Effect.ensuring(Effect.sync(() => inFlight.delete(id))),
          ),
        ),
      ),
      Effect.onInterrupt(() => Effect.sync(() => inFlight.delete(id))),
      Effect.ensuring(publish(id)),
    );

  const startSummary = (id: MeetingId) =>
    summaryLock.withPermit(
      Effect.gen(function* () {
        if (inFlight.has(id)) return;
        yield* storageFailure(
          setSummaryState(id, {
            summaryStatus: "pending",
            summary: null,
            summaryError: null,
            summaryModel: null,
          }),
        );
        inFlight.add(id);
        yield* publish(id);
        yield* runSummary(id).pipe(Effect.forkIn(scope));
      }),
    );

  return PulseMeetings.of({
    list: storageFailure(repository.list).pipe(
      Effect.map((records) => records.map(MeetingRepository.toSummaryRow)),
    ),
    get: (id) =>
      Effect.gen(function* () {
        const record = yield* requireRecord(id);
        const segments = yield* storageFailure(repository.listSegments(id));
        const { titleIsDefault: _titleIsDefault, ...detail } = record;
        return { ...detail, segments };
      }),
    create: ({ title, startedAt }) =>
      Effect.gen(function* () {
        const id = (yield* storageFailure(crypto.randomUUIDv4)) as MeetingId;
        yield* storageFailure(
          repository.create({
            id,
            title: title ?? DEFAULT_MEETING_TITLE,
            titleIsDefault: title === undefined,
            startedAt,
            now: yield* nowIso,
          }),
        );
        yield* publish(id);
        return yield* requireRow(id);
      }),
    appendSegments: (id, segments) =>
      Effect.gen(function* () {
        const record = yield* requireRecord(id);
        if (record.status !== "recording") {
          return yield* new PulseMeetingsError({
            message: "This meeting has finished and no longer accepts transcript segments.",
          });
        }
        if (segments.length === 0) return MeetingRepository.toSummaryRow(record);
        yield* storageFailure(repository.upsertSegments(id, segments, yield* nowIso));
        yield* publish(id);
        return yield* requireRow(id);
      }),
    finish: ({ id, endedAt, durationMs }) =>
      Effect.gen(function* () {
        const record = yield* requireRecord(id);
        if (record.status === "ready") return MeetingRepository.toSummaryRow(record);
        yield* storageFailure(repository.finish({ id, endedAt, durationMs, now: yield* nowIso }));
        yield* publish(id);
        yield* startSummary(id);
        return yield* requireRow(id);
      }),
    summarize: (id) =>
      Effect.gen(function* () {
        const record = yield* requireRecord(id);
        if (record.status !== "ready") {
          return yield* new PulseMeetingsError({
            message: "Finish the meeting before summarizing it.",
          });
        }
        yield* startSummary(id);
        return yield* requireRow(id);
      }),
    rename: (id, title) =>
      Effect.gen(function* () {
        yield* requireRecord(id);
        yield* storageFailure(repository.rename(id, title, yield* nowIso));
        yield* publish(id);
        return yield* requireRow(id);
      }),
    delete: (id) =>
      Effect.gen(function* () {
        yield* requireRecord(id);
        yield* storageFailure(repository.delete(id));
        yield* publish(id);
      }),
    revisions: SubscriptionRef.changes(revision).pipe(
      Stream.filter((value) => value.revision > initialRevision),
    ),
  });
});

function summaryErrorMessage(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  if (typeof error === "object" && error !== null && "_tag" in error) {
    if (error._tag === "TextGenerationError" && "detail" in error) {
      return `Summary failed: ${String(error.detail)}`;
    }
  }
  return "Summary failed. Regenerate to try again.";
}

export const layer = Layer.effect(PulseMeetings, make).pipe(Layer.provide(MeetingRepository.layer));
