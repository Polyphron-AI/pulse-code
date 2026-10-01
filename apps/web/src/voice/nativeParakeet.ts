import type { DesktopBridge, DesktopVoiceState } from "@t3tools/contracts";

import { decodeToMono16Khz } from "./parakeetTranscription";
import type { PulseDictationTranscriber } from "./pulseDictation";

type NativeVoiceBridge = Required<
  Pick<DesktopBridge, "getVoiceState" | "transcribeVoice" | "onVoiceEvent">
>;

/** `unknown` until the desktop answers; `unavailable` off desktop or when the engine is broken. */
export type NativeParakeetStatus = "unknown" | "available" | "unavailable";

const SAMPLE_RATE = 16_000;

/** Little-endian signed 16-bit samples, the sidecar's `transcribe` input. */
export function floatToPcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

function statusFromState(state: DesktopVoiceState): NativeParakeetStatus {
  // `stopped` means the sidecar starts on first use, so it still counts.
  return state.status === "unsupported" || state.status === "unavailable"
    ? "unavailable"
    : "available";
}

/**
 * Tracks whether the desktop's native Parakeet engine can take composer audio.
 * The composer prefers it over the in-browser worker, which then never loads.
 */
export class NativeParakeet {
  readonly #bridge: NativeVoiceBridge | null;
  readonly #decode: (audio: Blob) => Promise<Float32Array>;
  readonly #listeners = new Set<() => void>();
  #status: NativeParakeetStatus;
  #watching = false;

  constructor(bridge: NativeVoiceBridge | null, decode = decodeToMono16Khz) {
    this.#bridge = bridge;
    this.#decode = decode;
    this.#status = bridge ? "unknown" : "unavailable";
  }

  readonly getStatus = (): NativeParakeetStatus => this.#status;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    this.#watch();
    return () => this.#listeners.delete(listener);
  };

  readonly transcriber: PulseDictationTranscriber<Blob> = {
    transcribe: async (audio, signal) => {
      if (!this.#bridge) throw new Error("The native voice engine is only in the desktop app.");
      const pcm = await this.#decode(audio);
      if (signal.aborted) throw signal.reason;
      const { text } = await this.#bridge.transcribeVoice({
        pcm16: floatToPcm16(pcm),
        sampleRate: SAMPLE_RATE,
      });
      if (signal.aborted) throw signal.reason;
      return text;
    },
  };

  #watch(): void {
    const bridge = this.#bridge;
    if (!bridge || this.#watching) return;
    this.#watching = true;
    // The subscription lives as long as the page, like the desktop bridge itself.
    bridge.onVoiceEvent((event) => {
      if (event.type === "state") this.#setStatus(statusFromState(event.state));
    });
    void bridge.getVoiceState().then(
      (state) => {
        if (this.#status === "unknown") this.#setStatus(statusFromState(state));
      },
      () => this.#setStatus("unavailable"),
    );
  }

  #setStatus(status: NativeParakeetStatus): void {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}

/**
 * The composer's Parakeet backend: the native engine when the desktop has one,
 * otherwise the in-browser model. A failing native engine falls back to the
 * in-browser model only when the user has already set that model up.
 */
export function nativeFirstTranscriber(
  native: Pick<NativeParakeet, "getStatus" | "transcriber">,
  fallback: {
    readonly configured: () => boolean;
    readonly ensureReady: (signal: AbortSignal) => Promise<void>;
    readonly transcriber: PulseDictationTranscriber<Blob>;
  },
): PulseDictationTranscriber<Blob> {
  return {
    transcribe: async (audio, signal) => {
      if (native.getStatus() === "available") {
        try {
          return await native.transcriber.transcribe(audio, signal);
        } catch (error) {
          if (signal.aborted || !fallback.configured()) throw error;
        }
        await fallback.ensureReady(signal);
      }
      return fallback.transcriber.transcribe(audio, signal);
    },
  };
}

function desktopVoiceBridge(): NativeVoiceBridge | null {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (!bridge?.getVoiceState || !bridge.transcribeVoice || !bridge.onVoiceEvent) return null;
  return {
    getVoiceState: bridge.getVoiceState,
    transcribeVoice: bridge.transcribeVoice,
    onVoiceEvent: bridge.onVoiceEvent,
  };
}

let nativeParakeet: NativeParakeet | null = null;

export function getNativeParakeet(): NativeParakeet {
  return (nativeParakeet ??= new NativeParakeet(desktopVoiceBridge()));
}
