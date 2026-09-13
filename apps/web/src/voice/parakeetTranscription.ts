import type { PulseDictationTranscriber } from "./pulseDictation";
import {
  describeWorkerErrorEvent,
  parakeetFailureToError,
  type ParakeetSetupProgress,
  type ParakeetWorkerReply,
} from "./parakeetWorkerProtocol";

type Pending = {
  resolve(text: string): void;
  reject(error: Error): void;
  onProgress?: (progress: ParakeetSetupProgress) => void;
};

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

/** Lazy local transcription. setup() creates the worker and loads the model explicitly. */
export class ParakeetTranscriber implements PulseDictationTranscriber<Blob> {
  readonly #createWorker: () => Worker;
  readonly #decode: (audio: Blob) => Promise<Float32Array>;
  #worker: Worker | null = null;
  #generation = 0;
  #readyGeneration: number | null = null;
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

  async setup(
    signal: AbortSignal,
    onProgress?: (progress: ParakeetSetupProgress) => void,
  ): Promise<void> {
    const generation = this.#generation;
    await this.#request("setup", undefined, signal, onProgress);
    if (generation !== this.#generation) throw new Error("Parakeet setup was cancelled.");
    this.#readyGeneration = generation;
  }

  async transcribe(audio: Blob, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw signal.reason;
    const generation = this.#generation;
    if (this.#readyGeneration !== generation) {
      throw new Error("Set up the Parakeet model before using local dictation.");
    }
    const pcm = await this.#decode(audio);
    if (signal.aborted) throw signal.reason;
    if (generation !== this.#generation || this.#readyGeneration !== generation) {
      throw new Error("Parakeet setup is no longer available.");
    }
    return this.#request("transcribe", pcm, signal);
  }

  reset(): void {
    this.#generation += 1;
    this.#readyGeneration = null;
    this.#worker?.terminate();
    this.#worker = null;
    for (const item of this.#pending.values()) item.reject(new Error("Parakeet cancelled."));
    this.#pending.clear();
  }

  #getWorker(): Worker {
    if (this.#worker) return this.#worker;
    const worker = this.#createWorker();
    worker.addEventListener("message", (event: MessageEvent<ParakeetWorkerReply>) => {
      const item = this.#pending.get(event.data.id);
      if (!item) return;
      if (event.data.kind === "progress") {
        const { loaded, total, file } = event.data;
        item.onProgress?.({ loaded, total, file });
        return;
      }
      this.#pending.delete(event.data.id);
      if (event.data.kind === "failure") item.reject(parakeetFailureToError(event.data.failure));
      else item.resolve(event.data.text);
    });
    worker.addEventListener("error", (event) => {
      this.#generation += 1;
      this.#readyGeneration = null;
      for (const item of this.#pending.values()) {
        item.reject(parakeetFailureToError(describeWorkerErrorEvent(event)));
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
    onProgress?: (progress: ParakeetSetupProgress) => void,
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
        ...(onProgress ? { onProgress } : {}),
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
