import { describe, expect, it, vi } from "vite-plus/test";

import {
  PulseDictationController,
  type PulseDictationBackend,
  type PulseDictationCapture,
  type PulseDictationRecording,
  type PulseDictationStart,
} from "./pulseDictation";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const audioFixture = new Uint8Array([82, 73, 70, 70]);

const asyncDeliveryIsRejected: PulseDictationStart = {
  backend: "parakeet",
  draftIdentity: "compile-only",
  // @ts-expect-error Draft insertion must complete synchronously.
  deliver: async () => {},
};
void asyncDeliveryIsRejected;

function setup() {
  const prepared = deferred<void>();
  const recorded = deferred<PulseDictationRecording<Uint8Array>>();
  const stopped = deferred<Uint8Array>();
  const transcriptions = {
    parakeet: deferred<string>(),
    groq: deferred<string>(),
  } satisfies Record<PulseDictationBackend, Deferred<string>>;
  const cancelRecording = vi.fn();
  const recording = {
    stop: vi.fn(() => stopped.promise),
    cancel: cancelRecording,
  } satisfies PulseDictationRecording<Uint8Array>;
  const capture = {
    prepare: vi.fn((_signal: AbortSignal) => prepared.promise),
    record: vi.fn((_signal: AbortSignal) => recorded.promise),
  } satisfies PulseDictationCapture<Uint8Array>;
  const transcribe = {
    parakeet: vi.fn(() => transcriptions.parakeet.promise),
    groq: vi.fn(() => transcriptions.groq.promise),
  };
  const controller = new PulseDictationController({
    capture,
    transcribers: {
      parakeet: { transcribe: transcribe.parakeet },
      groq: { transcribe: transcribe.groq },
    },
  });
  return {
    controller,
    capture,
    prepared,
    recorded,
    stopped,
    recording,
    cancelRecording,
    transcriptions,
    transcribe,
  };
}

async function beginRecording(test: ReturnType<typeof setup>, backend: PulseDictationBackend) {
  const deliver = vi.fn();
  const request = { backend, draftIdentity: "environment-a/thread-a/draft-a", deliver };
  const started = test.controller.start(request);
  test.prepared.resolve();
  await Promise.resolve();
  test.recorded.resolve(test.recording);
  await started;
  return { request, deliver };
}

describe("PulseDictationController", () => {
  it("is inert until start and exposes preparing then recording", async () => {
    const test = setup();
    expect(test.controller.getSnapshot()).toEqual({ phase: "idle" });
    expect(test.capture.prepare).not.toHaveBeenCalled();

    const { request } = await beginRecording(test, "parakeet");
    expect(test.controller.getSnapshot()).toEqual({ phase: "recording", backend: "parakeet" });
    expect(test.recording.stop).not.toHaveBeenCalled();
    expect(request.backend).toBe("parakeet");
  });

  it("stops, transcribes only with the explicit backend, and inserts without sending", async () => {
    const test = setup();
    const { deliver } = await beginRecording(test, "groq");

    const stopped = test.controller.stop();
    expect(test.controller.getSnapshot()).toEqual({ phase: "transcribing", backend: "groq" });
    test.stopped.resolve(audioFixture);
    await Promise.resolve();
    expect(test.transcribe.groq).toHaveBeenCalledWith(audioFixture, expect.any(AbortSignal));
    expect(test.transcribe.parakeet).not.toHaveBeenCalled();
    test.transcriptions.groq.resolve("A dictated draft");
    await stopped;

    expect(deliver).toHaveBeenCalledWith("A dictated draft");
    expect(test.controller.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("cancel aborts recording and ignores a late stop result", async () => {
    const test = setup();
    const { deliver } = await beginRecording(test, "parakeet");
    const stopped = test.controller.stop();

    test.controller.cancel();
    expect(test.cancelRecording).toHaveBeenCalledOnce();
    test.stopped.resolve(audioFixture);
    await stopped;

    expect(test.transcribe.parakeet).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("cleans up the recording and reports a stop failure", async () => {
    const test = setup();
    await beginRecording(test, "parakeet");
    const stopped = test.controller.stop();

    test.cancelRecording.mockImplementation(() => {
      throw new Error("Cleanup also failed");
    });
    test.stopped.reject(new Error("Recorder failed to finish"));
    await stopped;

    expect(test.cancelRecording).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot()).toEqual({
      phase: "error",
      message: "Recorder failed to finish",
    });
  });

  it("isolates listener failures and notifies a stable listener snapshot", async () => {
    const test = setup();
    const notified = vi.fn();
    const lateListener = vi.fn();
    test.controller.subscribe(() => {
      test.controller.subscribe(lateListener);
      throw new Error("Broken view subscriber");
    });
    test.controller.subscribe(notified);

    const started = test.controller.start({
      backend: "parakeet",
      draftIdentity: "draft-a",
      deliver: vi.fn(),
    });

    expect(notified).toHaveBeenCalledOnce();
    expect(lateListener).not.toHaveBeenCalled();
    expect(test.capture.prepare).toHaveBeenCalledOnce();
    test.prepared.reject(new Error("Microphone denied"));
    await started;
    expect(test.controller.getSnapshot()).toEqual({
      phase: "error",
      message: "Microphone denied",
    });
  });

  it("does not prepare capture after a preparing listener cancels reentrantly", async () => {
    const test = setup();
    test.controller.subscribe(() => {
      if (test.controller.getSnapshot().phase === "preparing") test.controller.cancel();
    });

    await test.controller.start({
      backend: "parakeet",
      draftIdentity: "draft-a",
      deliver: vi.fn(),
    });

    expect(test.capture.prepare).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("does not stop capture after a transcribing listener cancels reentrantly", async () => {
    const test = setup();
    await beginRecording(test, "parakeet");
    test.controller.subscribe(() => {
      if (test.controller.getSnapshot().phase === "transcribing") test.controller.cancel();
    });

    await test.controller.stop();

    expect(test.recording.stop).not.toHaveBeenCalled();
    expect(test.cancelRecording).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("reaches idle even when recording cleanup throws during cancel", async () => {
    const test = setup();
    await beginRecording(test, "parakeet");
    test.cancelRecording.mockImplementation(() => {
      throw new Error("Adapter cleanup failed");
    });

    expect(() => test.controller.cancel()).not.toThrow();
    expect(test.controller.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("snapshots backend, draft identity, and delivery when starting", async () => {
    const test = setup();
    const originalDelivery = vi.fn();
    const replacementDelivery = vi.fn();
    const request = {
      backend: "parakeet" as PulseDictationBackend,
      draftIdentity: "draft-a",
      deliver: originalDelivery,
    };
    const started = test.controller.start(request);
    request.backend = "groq";
    request.draftIdentity = "draft-b";
    request.deliver = replacementDelivery;
    test.prepared.resolve();
    await Promise.resolve();
    test.recorded.resolve(test.recording);
    await started;

    const stopped = test.controller.stop();
    test.stopped.resolve(audioFixture);
    await Promise.resolve();
    test.transcriptions.parakeet.resolve("immutable origin");
    await stopped;

    expect(test.transcribe.groq).not.toHaveBeenCalled();
    expect(originalDelivery).toHaveBeenCalledWith("immutable origin");
    expect(replacementDelivery).not.toHaveBeenCalled();
  });

  it("cancels preparing work when the draft identity changes", async () => {
    const test = setup();
    const deliver = vi.fn();
    const started = test.controller.start({
      backend: "parakeet",
      draftIdentity: "environment-a/thread-a/draft-a",
      deliver,
    });
    const signal = test.capture.prepare.mock.calls[0]?.[0];
    test.controller.setDraftIdentity("environment-b/thread-a/draft-a");
    test.prepared.resolve();
    await started;

    expect(signal?.aborted).toBe(true);
    expect(test.capture.record).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot()).toEqual({ phase: "idle" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("prevents an earlier run from delivering after cancel and restart", async () => {
    const test = setup();
    const firstRun = await beginRecording(test, "groq");
    const firstStop = test.controller.stop();
    test.controller.cancel();
    const secondRun = {
      backend: "parakeet" as const,
      draftIdentity: "environment-a/thread-a/draft-b",
      deliver: vi.fn(),
    };
    const secondStart = test.controller.start(secondRun);

    test.stopped.resolve(audioFixture);
    await firstStop;
    expect(firstRun.deliver).not.toHaveBeenCalled();
    await secondStart;
    const secondStop = test.controller.stop();
    await Promise.resolve();
    test.transcriptions.parakeet.resolve("new run");
    await secondStop;
    expect(secondRun.deliver).toHaveBeenCalledWith("new run");
  });

  it("reports current failures but ignores failures from cancelled work", async () => {
    const current = setup();
    const started = current.controller.start({
      backend: "parakeet",
      draftIdentity: "draft-a",
      deliver: vi.fn(),
    });
    current.prepared.reject(new Error("Microphone denied"));
    await started;
    expect(current.controller.getSnapshot()).toEqual({
      phase: "error",
      message: "Microphone denied",
    });

    const cancelled = setup();
    const cancelledStart = cancelled.controller.start({
      backend: "parakeet",
      draftIdentity: "draft-a",
      deliver: vi.fn(),
    });
    cancelled.controller.cancel();
    cancelled.prepared.reject(new Error("late error"));
    await cancelledStart;
    expect(cancelled.controller.getSnapshot()).toEqual({ phase: "idle" });
  });
});
