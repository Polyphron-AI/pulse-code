import type {
  DesktopVoiceEvent,
  EnvironmentId,
  MeetingId,
  MeetingSegment,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { MeetingRecorder } from "./meetingRecorder";

const MEETING = "meeting-1" as MeetingId;
const ENV = "env-1" as EnvironmentId;

function makeRecorder() {
  let emit: (event: DesktopVoiceEvent) => void = () => undefined;
  const saved: MeetingSegment[] = [];
  let appendFailures = 0;
  const deps = {
    desktop: {
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

  it("does not record when the server cannot create the meeting", async () => {
    const { recorder, deps } = makeRecorder();
    deps.server.create.mockRejectedValueOnce(new Error("Not signed in."));
    await recorder.start(ENV);
    expect(deps.desktop.start).not.toHaveBeenCalled();
    expect(recorder.getSnapshot()).toMatchObject({ phase: "error", message: "Not signed in." });
  });
});
