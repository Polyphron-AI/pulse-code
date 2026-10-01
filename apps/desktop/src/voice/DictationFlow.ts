// @effect-diagnostics globalTimers:off -- The error pill timeout runs at a native hotkey callback boundary outside Effect fibers.
// @effect-diagnostics globalDate:off -- Hold duration is measured in native hotkey callbacks; tests inject `now`.

import type { PulseVoiceRect, PulseVoiceTranscript } from "./PulseVoiceClient.ts";
import type { VoicePillState } from "./VoicePill.ts";

export type DictationPhase = "idle" | "recording" | "transcribing";

export type DictationFlowDeps = {
  readonly mode: () => "hold" | "toggle";
  readonly workArea: () => Promise<PulseVoiceRect>;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<PulseVoiceTranscript>;
  readonly cancel: () => Promise<void>;
  readonly insert: (text: string) => Promise<void>;
  readonly pill: {
    readonly show: (workArea: PulseVoiceRect, state: VoicePillState) => Promise<void>;
    readonly update: (state: VoicePillState) => void;
    readonly hide: () => void;
  };
  readonly onPhase: (phase: DictationPhase) => void;
  readonly onError?: (message: string) => void;
  readonly now?: () => number;
};

// A hold shorter than this is an accidental tap, not an utterance.
export const MIN_HOLD_MS = 250;
const ERROR_VISIBLE_MS = 2_500;

/**
 * Global dictation driven by hotkey edges from the sidecar. Hold mode records
 * between down and up; toggle mode records between two downs. Presses during
 * transcription are ignored, and only one capture runs at a time.
 */
export class DictationFlow {
  private phase: DictationPhase = "idle";
  private startedAt = 0;
  private starting: Promise<boolean> | undefined;
  private stopRequested = false;
  private generation = 0;
  private errorTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly deps: DictationFlowDeps;

  constructor(deps: DictationFlowDeps) {
    this.deps = deps;
  }

  get currentPhase(): DictationPhase {
    return this.phase;
  }

  hotkeyDown(): void {
    if (this.phase === "transcribing") return;
    if (this.phase === "recording") {
      if (this.deps.mode() === "toggle") void this.finish();
      return;
    }
    void this.begin();
  }

  hotkeyUp(): void {
    if (this.phase !== "recording" || this.deps.mode() !== "hold") return;
    if (this.now() - this.startedAt < MIN_HOLD_MS) {
      void this.cancel();
      return;
    }
    void this.finish();
  }

  level(rms: number): void {
    if (this.phase === "recording") this.deps.pill.update({ kind: "recording", level: rms });
  }

  /** Escape, a disabled setting, or a sidecar restart. Discards audio. */
  async cancel(): Promise<void> {
    if (this.phase === "idle") return;
    this.generation += 1;
    this.stopRequested = false;
    this.setPhase("idle");
    this.deps.pill.hide();
    await this.deps.cancel().catch(() => undefined);
  }

  /** Capture ended on its own (device removed). */
  captureFailed(message: string): void {
    if (this.phase === "idle") return;
    this.generation += 1;
    this.fail(message);
  }

  private async begin(): Promise<void> {
    const generation = ++this.generation;
    this.clearErrorTimer();
    this.stopRequested = false;
    this.startedAt = this.now();
    this.setPhase("recording");
    const starting = this.startCapture(generation);
    this.starting = starting;
    await starting;
    if (this.starting === starting) this.starting = undefined;
  }

  private async startCapture(generation: number): Promise<boolean> {
    try {
      // The pill appears before the microphone opens so feedback is immediate.
      const workArea = await this.deps.workArea();
      if (generation !== this.generation) return false;
      await this.deps.pill.show(workArea, { kind: "recording", level: 0 });
      if (generation !== this.generation) return false;
      await this.deps.start();
    } catch (error) {
      if (generation === this.generation) this.fail(errorMessage(error));
      return false;
    }
    if (generation !== this.generation) {
      // Cancelled while the microphone was opening.
      await this.deps.cancel().catch(() => undefined);
      return false;
    }
    return true;
  }

  private async finish(): Promise<void> {
    if (this.phase !== "recording") return;
    if (this.starting) {
      // Released before the microphone finished opening; stop once it has.
      if (this.stopRequested) return;
      this.stopRequested = true;
      const started = await this.starting;
      if (!started || !this.stopRequested) return;
    }
    this.stopRequested = false;
    const generation = this.generation;
    this.setPhase("transcribing");
    this.deps.pill.update({ kind: "transcribing" });
    try {
      const transcript = await this.deps.stop();
      if (generation !== this.generation) return;
      const text = transcript.text.trim();
      if (text.length > 0) await this.deps.insert(text);
      if (generation !== this.generation) return;
      this.setPhase("idle");
      this.deps.pill.hide();
    } catch (error) {
      if (generation === this.generation) this.fail(errorMessage(error));
    }
  }

  private fail(message: string): void {
    this.setPhase("idle");
    this.deps.onError?.(message);
    this.deps.pill.update({ kind: "error", message });
    this.clearErrorTimer();
    this.errorTimer = setTimeout(() => {
      this.errorTimer = undefined;
      if (this.phase === "idle") this.deps.pill.hide();
    }, ERROR_VISIBLE_MS);
    this.errorTimer.unref?.();
  }

  private clearErrorTimer(): void {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = undefined;
  }

  private setPhase(phase: DictationPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.deps.onPhase(phase);
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Dictation failed.";
}
