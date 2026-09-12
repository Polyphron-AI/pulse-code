import { describe, expect, it, vi } from "vite-plus/test";

import { ParakeetTranscriber } from "./parakeetTranscription";

class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  reply(data: object) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

describe("ParakeetTranscriber", () => {
  it("does not create a worker until explicit setup", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const transcriber = new ParakeetTranscriber(createWorker, vi.fn());
    expect(createWorker).not.toHaveBeenCalled();

    const setup = transcriber.setup(new AbortController().signal);
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, action: "setup", pcm: undefined }, []);
    worker.reply({ id: 1, text: "" });
    await setup;
  });

  it("rejects transcription before setup without decoding or creating a worker", async () => {
    const createWorker = vi.fn();
    const decode = vi.fn();
    const transcriber = new ParakeetTranscriber(createWorker, decode);
    await expect(
      transcriber.transcribe(new Blob([new Uint8Array([1])]), new AbortController().signal),
    ).rejects.toThrow("Set up the Parakeet model");
    expect(createWorker).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });

  it("decodes audio and transfers PCM to the worker", async () => {
    const worker = new FakeWorker();
    const pcm = new Float32Array([0.25, -0.25]);
    const decode = vi.fn(async () => pcm);
    const transcriber = new ParakeetTranscriber(() => worker as unknown as Worker, decode);
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, text: "" });
    await setup;
    const audio = new Blob([new Uint8Array([1])], { type: "audio/webm" });
    const pending = transcriber.transcribe(audio, new AbortController().signal);
    expect(decode).toHaveBeenCalledWith(audio);
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 2, action: "transcribe", pcm }, [
      pcm.buffer,
    ]);
    worker.reply({ id: 2, text: "local text" });
    await expect(pending).resolves.toBe("local text");
  });

  it("terminates local inference and rejects delivery on cancellation", async () => {
    const worker = new FakeWorker();
    const transcriber = new ParakeetTranscriber(
      () => worker as unknown as Worker,
      async () => new Float32Array([1]),
    );
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, text: "" });
    await setup;
    const abort = new AbortController();
    const pending = transcriber.transcribe(new Blob([new Uint8Array([1])]), abort.signal);
    await Promise.resolve();
    const reason = new Error("cancelled");
    abort.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("reset clears readiness without reloading implicitly", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const decode = vi.fn(async () => new Float32Array([1]));
    const transcriber = new ParakeetTranscriber(createWorker, decode);
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, text: "" });
    await setup;
    transcriber.reset();

    await expect(
      transcriber.transcribe(new Blob([new Uint8Array([1])]), new AbortController().signal),
    ).rejects.toThrow("Set up the Parakeet model");
    expect(createWorker).toHaveBeenCalledOnce();
    expect(decode).not.toHaveBeenCalled();
  });
});
