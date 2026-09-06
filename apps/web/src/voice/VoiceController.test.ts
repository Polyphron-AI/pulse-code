import { describe, expect, it, vi } from "vite-plus/test";
import { VoiceController, type AudioCapture, type VoiceDependencies } from "./VoiceController";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const capture = { finish: vi.fn(async () => new Float32Array([0.1])), cancel: vi.fn() };
  const dependencies = {
    prepare: vi.fn(async () => {}),
    record: vi.fn<VoiceDependencies["record"]>(async () => capture),
    transcribe: vi.fn(async () => " hello world "),
    reset: vi.fn(),
  };
  return { capture, dependencies, controller: new VoiceController(dependencies) };
}
describe("voice capture", () => {
  it("clears composer ownership before a later desktop recording", async () => {
    const { controller } = fixture();
    const owner = Symbol();
    await controller.start(vi.fn(), owner);
    expect(controller.isOwnedBy(owner)).toBe(true);
    controller.cancel();
    await controller.start(vi.fn());
    expect(controller.isOwnedBy(owner)).toBe(false);
    controller.cancel();
  });
  it("delivers trimmed speech once, only after stopping", async () => {
    const { controller, dependencies } = fixture();
    const deliver = vi.fn();
    await controller.start(deliver);
    expect(controller.getSnapshot().phase).toBe("recording");
    expect(deliver).not.toHaveBeenCalled();
    await Promise.all([controller.stop(), controller.stop()]);
    expect(dependencies.transcribe).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledExactlyOnceWith("hello world");
    expect(controller.getSnapshot().phase).toBe("idle");
  });
  it("cancels a microphone grant that arrives after navigation", async () => {
    const { dependencies, capture, controller } = fixture();
    const granted = deferred<AudioCapture>();
    const requested = deferred<void>();
    dependencies.record.mockImplementation(() => {
      requested.resolve(undefined);
      return granted.promise;
    });
    const started = controller.start(vi.fn());
    await requested.promise;
    controller.cancel();
    granted.resolve(capture);
    await started;
    expect(capture.cancel).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe("idle");
  });
  it("does not deliver a cancelled transcription into a new draft", async () => {
    const { dependencies, controller } = fixture();
    const transcribed = deferred<string>();
    const requested = deferred<void>();
    dependencies.transcribe.mockImplementation(() => {
      requested.resolve(undefined);
      return transcribed.promise;
    });
    const deliver = vi.fn();
    await controller.start(deliver);
    const stopped = controller.stop();
    await requested.promise;
    controller.cancel();
    transcribed.resolve("old draft words");
    await stopped;
    expect(deliver).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
  });
  it("retains the transcript when the original text target rejects delivery", async () => {
    const { controller } = fixture();
    await controller.start(() => {
      throw new Error("Focus changed");
    });
    await controller.stop();
    expect(controller.getSnapshot()).toEqual({
      phase: "error",
      message: "Focus changed",
      transcript: "hello world",
    });
  });
  it("reports silence without inserting empty text", async () => {
    const { controller, dependencies } = fixture();
    dependencies.transcribe.mockResolvedValue(" ");
    const deliver = vi.fn();
    await controller.start(deliver);
    await controller.stop();
    expect(deliver).not.toHaveBeenCalled();
    expect(controller.getSnapshot().message).toContain("No speech");
  });
  it("does not open the microphone after cancelling a model download", async () => {
    const { controller, dependencies } = fixture();
    const ready = deferred<void>();
    dependencies.prepare.mockReturnValue(ready.promise);
    const started = controller.start(vi.fn());
    controller.cancel();
    ready.resolve(undefined);
    await started;
    expect(dependencies.record).not.toHaveBeenCalled();
  });
});
