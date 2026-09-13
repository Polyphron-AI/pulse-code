import { describe, expect, it, vi } from "vite-plus/test";

import { ParakeetTranscriber } from "./parakeetTranscription";

class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  reply(data: object) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  fail(event: Event = new Event("error")) {
    this.dispatchEvent(event);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ParakeetTranscriber", () => {
  it("does not create a worker until explicit setup", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const transcriber = new ParakeetTranscriber(createWorker, vi.fn());
    expect(createWorker).not.toHaveBeenCalled();

    const setup = transcriber.setup(new AbortController().signal);
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, action: "setup", pcm: undefined }, []);
    worker.reply({ id: 1, kind: "result", text: "" });
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
    worker.reply({ id: 1, kind: "result", text: "" });
    await setup;
    const audio = new Blob([new Uint8Array([1])], { type: "audio/webm" });
    const pending = transcriber.transcribe(audio, new AbortController().signal);
    expect(decode).toHaveBeenCalledWith(audio);
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 2, action: "transcribe", pcm }, [
      pcm.buffer,
    ]);
    worker.reply({ id: 2, kind: "result", text: "local text" });
    await expect(pending).resolves.toBe("local text");
  });

  it("cancels one inference without terminating the shared worker", async () => {
    const worker = new FakeWorker();
    const transcriber = new ParakeetTranscriber(
      () => worker as unknown as Worker,
      async () => new Float32Array([1]),
    );
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, kind: "result", text: "" });
    await setup;
    const abort = new AbortController();
    const pending = transcriber.transcribe(new Blob([new Uint8Array([1])]), abort.signal);
    await Promise.resolve();
    const reason = new Error("cancelled");
    abort.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("reset clears readiness without reloading implicitly", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const decode = vi.fn(async () => new Float32Array([1]));
    const transcriber = new ParakeetTranscriber(createWorker, decode);
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, kind: "result", text: "" });
    await setup;
    transcriber.reset();

    await expect(
      transcriber.transcribe(new Blob([new Uint8Array([1])]), new AbortController().signal),
    ).rejects.toThrow("Set up the Parakeet model");
    expect(createWorker).toHaveBeenCalledOnce();
    expect(decode).not.toHaveBeenCalled();
  });

  it("does not create a new worker when reset happens during audio decoding", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const decoded = deferred<Float32Array>();
    const transcriber = new ParakeetTranscriber(createWorker, () => decoded.promise);
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, kind: "result", text: "" });
    await setup;

    const pending = transcriber.transcribe(
      new Blob([new Uint8Array([1])]),
      new AbortController().signal,
    );
    transcriber.reset();
    decoded.resolve(new Float32Array([1]));

    await expect(pending).rejects.toThrow("no longer available");
    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it("clears readiness when the prepared worker fails", async () => {
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const createWorker = vi
      .fn<() => Worker>()
      .mockReturnValueOnce(firstWorker as unknown as Worker)
      .mockReturnValueOnce(secondWorker as unknown as Worker);
    const decode = vi.fn(async () => new Float32Array([1]));
    const transcriber = new ParakeetTranscriber(createWorker, decode);
    const setup = transcriber.setup(new AbortController().signal);
    firstWorker.reply({ id: 1, kind: "result", text: "" });
    await setup;
    firstWorker.fail();

    await expect(
      transcriber.transcribe(new Blob([new Uint8Array([1])]), new AbortController().signal),
    ).rejects.toThrow("Set up the Parakeet model");
    expect(createWorker).toHaveBeenCalledOnce();
    expect(decode).not.toHaveBeenCalled();
  });

  it("does not restore readiness from a setup completion invalidated by reset", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const decode = vi.fn(async () => new Float32Array([1]));
    const transcriber = new ParakeetTranscriber(createWorker, decode);
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, kind: "result", text: "" });
    transcriber.reset();

    await expect(setup).rejects.toThrow("setup was cancelled");
    await expect(
      transcriber.transcribe(new Blob([new Uint8Array([1])]), new AbortController().signal),
    ).rejects.toThrow("Set up the Parakeet model");
    expect(createWorker).toHaveBeenCalledOnce();
    expect(decode).not.toHaveBeenCalled();
  });

  it("keeps setup pending through progress and reports it to the caller", async () => {
    const worker = new FakeWorker();
    const progress = vi.fn();
    const transcriber = new ParakeetTranscriber(() => worker as unknown as Worker, vi.fn());
    let settled = false;
    const setup = transcriber.setup(new AbortController().signal, progress).finally(() => {
      settled = true;
    });
    worker.reply({ id: 1, kind: "progress", loaded: 25, total: 100, file: "encoder.onnx" });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(progress).toHaveBeenCalledWith({ loaded: 25, total: 100, file: "encoder.onnx" });
    worker.reply({ id: 1, kind: "result", text: "" });
    await setup;
  });

  it("preserves a worker-reported error and cause", async () => {
    const worker = new FakeWorker();
    const transcriber = new ParakeetTranscriber(() => worker as unknown as Worker, vi.fn());
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({
      id: 1,
      kind: "failure",
      failure: {
        name: "TypeError",
        message: "Glue module mismatch",
        causes: ["CompileError: bad wasm"],
      },
    });
    await expect(setup).rejects.toThrow(
      "TypeError: Glue module mismatch (caused by CompileError: bad wasm)",
    );
  });

  it("retries successfully on the same transcriber after a worker-reported failure", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const transcriber = new ParakeetTranscriber(createWorker, vi.fn());
    const failedSetup = transcriber.setup(new AbortController().signal);
    worker.reply({
      id: 1,
      kind: "failure",
      failure: { name: "CompileError", message: "bad wasm", causes: [] },
    });
    await expect(failedSetup).rejects.toThrow("CompileError: bad wasm");

    const retry = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 2, kind: "result", text: "" });
    await expect(retry).resolves.toBeUndefined();
    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("preserves module worker startup error details", async () => {
    const worker = new FakeWorker();
    const transcriber = new ParakeetTranscriber(() => worker as unknown as Worker, vi.fn());
    const setup = transcriber.setup(new AbortController().signal);
    worker.fail(
      Object.assign(new Event("error"), {
        message: "Failed to load module script",
        filename: "parakeet.worker.js",
        lineno: 12,
        colno: 4,
        error: undefined,
      }) as ErrorEvent,
    );
    await expect(setup).rejects.toThrow("Failed to load module script at parakeet.worker.js:12:4");
  });

  it("serializes concurrent inference and lets the next request survive cancellation", async () => {
    const worker = new FakeWorker();
    const transcriber = new ParakeetTranscriber(
      () => worker as unknown as Worker,
      async (audio) => new Float32Array([audio.size]),
    );
    const setup = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 1, kind: "result", text: "" });
    await setup;

    const firstAbort = new AbortController();
    const first = transcriber.transcribe(new Blob(["a"]), firstAbort.signal);
    const second = transcriber.transcribe(new Blob(["bb"]), new AbortController().signal);
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);

    const reason = new Error("cancel first only");
    firstAbort.abort(reason);
    await expect(first).rejects.toBe(reason);
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledTimes(3);
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.reply({ id: 3, kind: "result", text: "second transcript" });
    await expect(second).resolves.toBe("second transcript");
  });

  it("retries setup cleanly after its caller aborts", async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const transcriber = new ParakeetTranscriber(createWorker, vi.fn());
    const firstAbort = new AbortController();
    const first = transcriber.setup(firstAbort.signal);
    const reason = new Error("left setup");
    firstAbort.abort(reason);
    await expect(first).rejects.toBe(reason);

    const retry = transcriber.setup(new AbortController().signal);
    worker.reply({ id: 2, kind: "result", text: "" });
    await expect(retry).resolves.toBeUndefined();
    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.terminate).not.toHaveBeenCalled();
  });
});
