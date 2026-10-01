import type {
  DesktopVoiceEvent,
  EnvironmentId,
  MeetingId,
  MeetingSegment,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { MeetingRecorder, type SavedMeetingSession } from "./meetingRecorder";

const MEETING = "meeting-1" as MeetingId;
const ENV = "env-1" as EnvironmentId;

function makeRecorder(
  options: {
    readonly stored?: SavedMeetingSession | null;
    readonly activeSessionId?: string | null;
  } = {},
) {
  let emit: (event: DesktopVoiceEvent) => void = () => undefined;
  const saved: MeetingSegment[] = [];
  let appendFailures = 0;
  const store = { current: options.stored ?? null };
  const deps = {
    desktop: {
      activeSessionId: vi.fn(async () => options.activeSessionId ?? null),
      start: vi.fn(async () => ({ sessionId: "s1" })),
      stop: vi.fn(async () => ({ sessionId: "s1", durationMs: 9_000 })),
      onEvent: vi.fn((listener: (event: DesktopVoiceEvent) => void) => {
        emit = listener;
        return () => {
          emit = () => undefined;
        };
      }),
    },
    server: {
      create: vi.fn(async (_environmentId: EnvironmentId, _startedAt: string) => MEETING),
      append: vi.fn(
        async (
          _environmentId: EnvironmentId,
          _id: MeetingId,
          segments: ReadonlyArray<MeetingSegment>,
        ) => {
          if (appendFailures > 0) {
            appendFailures -= 1;
            throw new Error("offline");
          }
          saved.push(...segments);
        },
      ),
      finish: vi.fn(
        async (
          _environmentId: EnvironmentId,
          _id: MeetingId,
          _endedAt: string,
          _durationMs: number,
        ) => undefined,
      ),
      remove: vi.fn(async (_environmentId: EnvironmentId, _id: MeetingId) => undefined),
    },
    store: {
      load: () => store.current,
      save: (session: SavedMeetingSession | null) => {
        store.current = session;
      },
    },
    now: () => new Date("2026-10-01T10:00:00.000Z"),
  };
  const segment = (index: number, text = `segment ${index}`, sessionId = "s1") =>
    emit({
      type: "meeting-segment",
      segment: { sessionId, index, startMs: index * 1_000, endMs: index * 1_000 + 900.4, text },
    });
  return {
    recorder: new MeetingRecorder(deps),
    deps,
    saved,
    store,
    segment,
    emit: (event: DesktopVoiceEvent) => emit(event),
    failAppends: (count: number) => {
      appendFailures = count;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("MeetingRecorder", () => {
  it("creates the meeting, saves segments as they arrive and finishes on stop", async () => {
    const { recorder, deps, saved, segment } = makeRecorder();
    await recorder.start(ENV);
    expect(deps.server.create).toHaveBeenCalledWith(ENV, "2026-10-01T10:00:00.000Z");
    segment(0);
    segment(1);
    await settle();
    expect(recorder.getSnapshot()).toMatchObject({ phase: "recording", segmentCount: 2 });
    await recorder.stop();
    expect(saved).toEqual([
      { index: 0, startMs: 0, endMs: 900, text: "segment 0" },
      { index: 1, startMs: 1_000, endMs: 1_900, text: "segment 1" },
    ]);
    expect(deps.server.finish).toHaveBeenCalledWith(
      ENV,
      MEETING,
      "2026-10-01T10:00:00.000Z",
      9_000,
    );
    expect(recorder.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("ignores segments from another session", async () => {
    const { recorder, saved, segment } = makeRecorder();
    await recorder.start(ENV);
    segment(0, "other", "s2");
    await recorder.stop();
    expect(saved).toEqual([]);
  });

  it("keeps segments through a failed save and sends them on the next one", async () => {
    const { recorder, saved, segment, failAppends } = makeRecorder();
    await recorder.start(ENV);
    failAppends(1);
    segment(0);
    await settle();
    expect(recorder.getSnapshot()).toMatchObject({ phase: "recording", syncError: "offline" });
    segment(1);
    await settle();
    expect(saved.map((item) => item.index)).toEqual([0, 1]);
    expect(recorder.getSnapshot()).toMatchObject({ syncError: null });
  });

  it("reports a failed final save and finishes on retry without losing text", async () => {
    const { recorder, deps, saved, segment, failAppends } = makeRecorder();
    await recorder.start(ENV);
    failAppends(2);
    segment(0);
    await settle();
    await recorder.stop();
    expect(recorder.getSnapshot()).toMatchObject({
      phase: "error",
      meetingId: MEETING,
      unsaved: true,
    });
    expect(deps.server.finish).not.toHaveBeenCalled();
    // A new recording cannot replace the unsaved one.
    await recorder.start(ENV);
    expect(deps.server.create).toHaveBeenCalledOnce();
    await recorder.retry();
    expect(saved.map((item) => item.index)).toEqual([0]);
    expect(deps.server.finish).toHaveBeenCalledWith(ENV, MEETING, expect.any(String), 9_000);
    expect(recorder.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("saves what it has when capture ends on its own", async () => {
    const { recorder, deps, saved, segment, emit } = makeRecorder();
    await recorder.start(ENV);
    segment(0);
    emit({ type: "meeting-error", sessionId: "s1", message: "Microphone removed." });
    await settle();
    expect(saved.map((item) => item.index)).toEqual([0]);
    expect(deps.server.finish).toHaveBeenCalledWith(ENV, MEETING, expect.any(String), 900);
    expect(recorder.getSnapshot()).toEqual({
      phase: "error",
      message: "Microphone removed.",
      meetingId: MEETING,
      unsaved: false,
    });
  });

  it("removes the empty meeting when the microphone cannot start", async () => {
    const { recorder, deps } = makeRecorder();
    deps.desktop.start.mockRejectedValueOnce(new Error("No microphone found."));
    await recorder.start(ENV);
    expect(deps.server.remove).toHaveBeenCalledWith(ENV, MEETING);
    expect(recorder.getSnapshot()).toEqual({
      phase: "error",
      message: "No microphone found.",
      meetingId: null,
      unsaved: false,
    });
  });

  it("keeps saving the desktop's meeting after a page reload", async () => {
    const { recorder: first, store } = makeRecorder();
    await first.start(ENV);
    const reloaded = makeRecorder({ stored: store.current, activeSessionId: "s1" });
    await reloaded.recorder.resume();
    reloaded.segment(4);
    await settle();
    expect(reloaded.saved.map((item) => item.index)).toEqual([4]);
    await reloaded.recorder.stop();
    expect(reloaded.deps.server.finish).toHaveBeenCalledWith(
      ENV,
      MEETING,
      expect.any(String),
      9_000,
    );
    expect(reloaded.store.current).toBeNull();
  });

  it("finishes a meeting whose capture ended during a reload", async () => {
    const stored = {
      environmentId: ENV,
      meetingId: MEETING,
      sessionId: "s1",
      startedAt: "2026-10-01T09:59:00.000Z",
    };
    const { recorder, deps, store } = makeRecorder({ stored, activeSessionId: null });
    await recorder.resume();
    expect(deps.desktop.stop).not.toHaveBeenCalled();
    expect(deps.server.finish).toHaveBeenCalledWith(ENV, MEETING, expect.any(String), 60_000);
    expect(recorder.getSnapshot()).toEqual({ phase: "idle" });
    expect(store.current).toBeNull();
  });

  it("stops desktop capture that has no meeting to save to", async () => {
    const { recorder, deps } = makeRecorder({ stored: null, activeSessionId: "orphan" });
    await recorder.resume();
    expect(deps.desktop.stop).toHaveBeenCalledOnce();
    expect(recorder.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("discards a meeting that can no longer be saved", async () => {
    const { recorder, deps, segment, failAppends } = makeRecorder();
    await recorder.start(ENV);
    failAppends(10);
    segment(0);
    await recorder.stop();
    expect(recorder.getSnapshot()).toMatchObject({ phase: "error", unsaved: true });
    recorder.discard();
    expect(recorder.getSnapshot()).toEqual({ phase: "idle" });
    await recorder.start(ENV);
    expect(deps.server.create).toHaveBeenCalledTimes(2);
  });

  it("does not record when the server cannot create the meeting", async () => {
    const { recorder, deps } = makeRecorder();
    deps.server.create.mockRejectedValueOnce(new Error("Not signed in."));
    await recorder.start(ENV);
    expect(deps.desktop.start).not.toHaveBeenCalled();
    expect(recorder.getSnapshot()).toMatchObject({ phase: "error", message: "Not signed in." });
  });
});
