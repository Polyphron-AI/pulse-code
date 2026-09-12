import type { PulseDictationTranscriber } from "./pulseDictation";

interface WorkerReply {
  readonly id: number;
  readonly text?: string;
  readonly error?: string;
}

type Pending = { resolve(text: string): void; reject(error: Error): void };

async function decodeToMono16Khz(audio: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: 16_000 });
  try {
    const decoded = await context.decodeAudioData(await audio.arrayBuffer());
    const pcm = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let index = 0; index < samples.length; index++) {
        pcm[index] = pcm[index]! + samples[index]! / decoded.numberOfChannels;
      }
    }
    return pcm;
  } finally {
    await context.close();
  }
}

/** Lazy local transcription. Only setup() or transcribe() creates the worker and loads the model. */
export class ParakeetTranscriber implements PulseDictationTranscriber<Blob> {
  readonly #createWorker: () => Worker;
  readonly #decode: (audio: Blob) => Promise<Float32Array>;
  #worker: Worker | null = null;
  #nextId = 0;
  readonly #pending = new Map<number, Pending>();

  constructor(
    createWorker = () =>
      new Worker(new URL("./parakeet.worker.ts", import.meta.url), { type: "module" }),
    decode = decodeToMono16Khz,
  ) {
    this.#createWorker = createWorker;
    this.#decode = decode;
  }

  async setup(signal: AbortSignal): Promise<void> {
    await this.#request("setup", undefined, signal);
  }

  async transcribe(audio: Blob, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw signal.reason;
    const pcm = await this.#decode(audio);
    if (signal.aborted) throw signal.reason;
    return this.#request("transcribe", pcm, signal);
  }

  reset(): void {
    this.#worker?.terminate();
    this.#worker = null;
    for (const item of this.#pending.values()) item.reject(new Error("Parakeet cancelled."));
    this.#pending.clear();
  }

  #getWorker(): Worker {
    if (this.#worker) return this.#worker;
    const worker = this.#createWorker();
    worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
      const item = this.#pending.get(event.data.id);
      if (!item) return;
      this.#pending.delete(event.data.id);
      if (event.data.error) item.reject(new Error(event.data.error));
      else item.resolve(event.data.text ?? "");
    });
    worker.addEventListener("error", () => {
      for (const item of this.#pending.values()) {
        item.reject(
          new Error("Parakeet could not start. Check the connection and available memory."),
        );
      }
      this.#pending.clear();
      worker.terminate();
      if (this.#worker === worker) this.#worker = null;
    });
    this.#worker = worker;
    return worker;
  }

  #request(
    action: "setup" | "transcribe",
    pcm: Float32Array | undefined,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) return Promise.reject(signal.reason);
    const worker = this.#getWorker();
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (!this.#pending.delete(id)) return;
        this.reset();
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      this.#pending.set(id, {
        resolve: (text) => {
          signal.removeEventListener("abort", abort);
          resolve(text);
        },
        reject: (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      });
      worker.postMessage({ id, action, pcm }, pcm ? [pcm.buffer] : []);
    });
  }
}
