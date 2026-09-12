import type { PulseDictationCapture, PulseDictationRecording } from "./pulseDictation";

export const PULSE_DICTATION_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
] as const;

export type PulseRecordedAudio = Blob;
export const PULSE_DICTATION_MAX_CAPTURE_BYTES = 25 * 1024 * 1024;

interface MediaRecorderCapturePlatform {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createRecorder(stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(mimeType: string): boolean;
}

const defaultPlatform = (): MediaRecorderCapturePlatform => {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Microphone capture requires HTTPS, localhost, or the desktop app.");
  }
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createRecorder: (stream, options) => new MediaRecorder(stream, options),
    isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
  };
};

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** Captures one recording and releases its microphone stream on every terminal path. */
export class MediaRecorderCapture implements PulseDictationCapture<PulseRecordedAudio> {
  readonly #platform: () => MediaRecorderCapturePlatform;
  #prepared: MediaStream | null = null;

  constructor(platform: () => MediaRecorderCapturePlatform = defaultPlatform) {
    this.#platform = platform;
  }

  async prepare(signal: AbortSignal): Promise<void> {
    this.#releasePrepared();
    if (signal.aborted) throw signal.reason;
    const stream = await this.#platform().getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    if (signal.aborted) {
      stopTracks(stream);
      throw signal.reason;
    }
    this.#prepared = stream;
    signal.addEventListener("abort", () => this.#releasePrepared(stream), { once: true });
  }

  async record(signal: AbortSignal): Promise<PulseDictationRecording<PulseRecordedAudio>> {
    const platform = this.#platform();
    const stream = this.#prepared;
    this.#prepared = null;
    if (!stream || signal.aborted) {
      if (stream) stopTracks(stream);
      throw signal.reason ?? new Error("Microphone capture was not prepared.");
    }

    const mimeType = PULSE_DICTATION_MIME_TYPES.find((type) => platform.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = platform.createRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (error) {
      stopTracks(stream);
      throw error;
    }

    const chunks: Blob[] = [];
    let capturedBytes = 0;
    let cancelled = false;
    let settled = false;
    let released = false;
    let resolveStopped!: (audio: Blob) => void;
    let rejectStopped!: (error: Error) => void;
    const stopped = new Promise<Blob>((resolve, reject) => {
      resolveStopped = resolve;
      rejectStopped = reject;
    });
    void stopped.catch(() => undefined);
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", abortRecording);
      stopTracks(stream);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      release();
      rejectStopped(error);
    };
    const abortRecording = (reason: unknown = signal.reason) => {
      cancelled = true;
      fail(reason instanceof Error ? reason : new Error("Recording cancelled."));
      if (recorder.state !== "inactive") recorder.stop();
    };
    recorder.addEventListener("dataavailable", (event) => {
      if (settled || event.data.size === 0) return;
      capturedBytes += event.data.size;
      if (capturedBytes > PULSE_DICTATION_MAX_CAPTURE_BYTES) {
        fail(new Error("The recording exceeds the 25 MiB capture limit."));
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      fail(new Error("Microphone recording failed."));
      if (recorder.state !== "inactive") recorder.stop();
    });
    recorder.addEventListener("stop", () => {
      if (settled) return;
      settled = true;
      release();
      if (cancelled) rejectStopped(new Error("Recording cancelled."));
      else {
        const type = recorder.mimeType || mimeType;
        resolveStopped(new Blob(chunks, type ? { type } : undefined));
      }
    });

    try {
      recorder.start(1_000);
      signal.addEventListener("abort", abortRecording, { once: true });
      if (signal.aborted) abortRecording();
    } catch (error) {
      release();
      throw error;
    }

    return {
      stop: async (stopSignal) => {
        if (stopSignal.aborted) {
          abortRecording();
          throw stopSignal.reason;
        }
        const abortStop = () => abortRecording(stopSignal.reason);
        stopSignal.addEventListener("abort", abortStop, { once: true });
        if (recorder.state !== "inactive") recorder.stop();
        try {
          return await stopped;
        } finally {
          stopSignal.removeEventListener("abort", abortStop);
        }
      },
      cancel: () => {
        abortRecording();
      },
    };
  }

  #releasePrepared(expected?: MediaStream): void {
    if (!this.#prepared || (expected && expected !== this.#prepared)) return;
    const stream = this.#prepared;
    this.#prepared = null;
    stopTracks(stream);
  }
}
