import { describe, expect, it, vi } from "vite-plus/test";

import { PULSE_DICTATION_MAX_CAPTURE_BYTES, MediaRecorderCapture } from "./mediaRecorderCapture";

class FakeRecorder extends EventTarget {
  readonly mimeType: string;
  state: RecordingState = "inactive";
  autoStop = true;
  constructor(mimeType: string) {
    super();
    this.mimeType = mimeType;
  }
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    if (this.autoStop) this.emitStop();
  });
  emitStop() {
    this.dispatchEvent(new Event("stop"));
  }
  emitError() {
    this.dispatchEvent(new Event("error"));
  }
  chunk(value: Blob) {
    this.dispatchEvent(new MessageEvent("dataavailable", { data: value }));
  }
}

function setup(supported = "audio/webm;codecs=opus") {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  let recorder: FakeRecorder | undefined;
  const platform = {
    getUserMedia: vi.fn(async () => stream),
    isTypeSupported: vi.fn((type: string) => type === supported),
    createRecorder: vi.fn((_stream: MediaStream, options?: MediaRecorderOptions) => {
      recorder = new FakeRecorder(options?.mimeType ?? "audio/browser-default");
      return recorder as unknown as MediaRecorder;
    }),
  };
  return {
    capture: new MediaRecorderCapture(() => platform),
    platform,
    stopTrack,
    get recorder() {
      return recorder!;
    },
  };
}

describe("MediaRecorderCapture", () => {
  it("requests speech-friendly audio and returns the browser recording", async () => {
    const test = setup();
    const abort = new AbortController();
    await test.capture.prepare(abort.signal);
    const recording = await test.capture.record(abort.signal);
    test.recorder.chunk(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }));
    const result = recording.stop(abort.signal);

    await expect(result).resolves.toMatchObject({ size: 3, type: "audio/webm;codecs=opus" });
    expect(test.platform.createRecorder).toHaveBeenCalledWith(expect.anything(), {
      mimeType: "audio/webm;codecs=opus",
    });
    expect(test.stopTrack).toHaveBeenCalledOnce();
  });

  it("uses the browser default when none of the preferred codecs is supported", async () => {
    const test = setup("none");
    const abort = new AbortController();
    await test.capture.prepare(abort.signal);
    const recording = await test.capture.record(abort.signal);
    const stopped = recording.stop(abort.signal);
    await stopped;
    expect(test.platform.createRecorder).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("releases a prepared stream when cancelled before recording", async () => {
    const test = setup();
    const abort = new AbortController();
    await test.capture.prepare(abort.signal);
    abort.abort();
    expect(test.stopTrack).toHaveBeenCalledOnce();
  });

  it("rejects cancelled recordings without returning audio", async () => {
    const test = setup();
    const abort = new AbortController();
    await test.capture.prepare(abort.signal);
    const recording = await test.capture.record(abort.signal);
    recording.cancel();
    await expect(recording.stop(abort.signal)).rejects.toThrow("Recording cancelled.");
    expect(test.stopTrack).toHaveBeenCalledOnce();
  });

  it("aborts while waiting for an asynchronous stop event", async () => {
    const test = setup();
    const recordingAbort = new AbortController();
    await test.capture.prepare(recordingAbort.signal);
    const recording = await test.capture.record(recordingAbort.signal);
    test.recorder.autoStop = false;
    const stopAbort = new AbortController();
    const stopped = recording.stop(stopAbort.signal);
    const reason = new Error("draft changed");
    stopAbort.abort(reason);

    await expect(stopped).rejects.toBe(reason);
    test.recorder.emitStop();
    expect(test.stopTrack).toHaveBeenCalledOnce();
  });

  it("settles and releases once when recorder error is not followed by stop", async () => {
    const test = setup();
    const abort = new AbortController();
    await test.capture.prepare(abort.signal);
    const recording = await test.capture.record(abort.signal);
    test.recorder.autoStop = false;
    const stopped = recording.stop(abort.signal);
    test.recorder.emitError();

    await expect(stopped).rejects.toThrow("Microphone recording failed");
    expect(test.stopTrack).toHaveBeenCalledOnce();
  });

  it("stops capture when accumulated chunks exceed the upload bound", async () => {
    const test = setup();
    const abort = new AbortController();
    await test.capture.prepare(abort.signal);
    const recording = await test.capture.record(abort.signal);
    test.recorder.autoStop = false;
    test.recorder.chunk(new Blob([new Uint8Array(PULSE_DICTATION_MAX_CAPTURE_BYTES)]));
    test.recorder.chunk(new Blob([new Uint8Array([1])]));

    await expect(recording.stop(abort.signal)).rejects.toThrow("25 MiB capture limit");
    test.recorder.emitStop();
    expect(test.stopTrack).toHaveBeenCalledOnce();
  });
});
