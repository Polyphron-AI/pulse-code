export type PulseDictationBackend = "parakeet" | "groq";

export type PulseDictationPhase = "idle" | "preparing" | "recording" | "transcribing" | "error";

export type PulseDictationState =
  | { phase: "idle" }
  | { phase: "preparing"; backend: PulseDictationBackend }
  | { phase: "recording"; backend: PulseDictationBackend }
  | { phase: "transcribing"; backend: PulseDictationBackend }
  | { phase: "error"; message: string };

export interface PulseDictationRecording<Audio> {
  stop(signal: AbortSignal): Promise<Audio>;
  cancel(): void;
}

export interface PulseDictationCapture<Audio> {
  prepare(signal: AbortSignal): Promise<void>;
  record(signal: AbortSignal): Promise<PulseDictationRecording<Audio>>;
}

export interface PulseDictationTranscriber<Audio> {
  transcribe(audio: Audio, signal: AbortSignal): Promise<string>;
}

export interface PulseDictationStart {
  backend: PulseDictationBackend;
  draftIdentity: string;
  /** Inserts into the originating draft synchronously. It must not start deferred delivery. */
  deliver(text: string): undefined;
}

export interface PulseDictationDependencies<Audio> {
  capture: PulseDictationCapture<Audio>;
  transcribers: Record<PulseDictationBackend, PulseDictationTranscriber<Audio>>;
}

type Listener = () => void;

/** Owns one device-side capture at a time and never chooses or falls back between backends. */
export class PulseDictationController<Audio> {
  readonly #dependencies: PulseDictationDependencies<Audio>;
  readonly #listeners = new Set<Listener>();
  #state: PulseDictationState = { phase: "idle" };
  #draftIdentity: string | null = null;
  #run = 0;
  #abortController: AbortController | null = null;
  #recording: PulseDictationRecording<Audio> | null = null;
  #request: PulseDictationStart | null = null;

  constructor(dependencies: PulseDictationDependencies<Audio>) {
    this.#dependencies = dependencies;
  }

  readonly getSnapshot = (): PulseDictationState => this.#state;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  setDraftIdentity(identity: string | null): void {
    if (identity === this.#draftIdentity) return;
    this.#draftIdentity = identity;
    if (this.#state.phase !== "idle") this.cancel();
  }

  async start(request: PulseDictationStart): Promise<void> {
    if (this.#state.phase !== "idle" && this.#state.phase !== "error") return;

    this.cancel();
    const origin: PulseDictationStart = {
      backend: request.backend,
      draftIdentity: request.draftIdentity,
      deliver: request.deliver,
    };
    this.#draftIdentity = origin.draftIdentity;
    const run = this.#run;
    const abortController = new AbortController();
    this.#abortController = abortController;
    this.#request = origin;
    this.#setState({ phase: "preparing", backend: origin.backend });

    try {
      if (!this.#isCurrent(run, origin.draftIdentity)) return;
      await this.#dependencies.capture.prepare(abortController.signal);
      if (!this.#isCurrent(run, origin.draftIdentity)) return;

      const recording = await this.#dependencies.capture.record(abortController.signal);
      if (!this.#isCurrent(run, origin.draftIdentity)) {
        recording.cancel();
        return;
      }

      this.#recording = recording;
      this.#setState({ phase: "recording", backend: origin.backend });
    } catch (error) {
      this.#failIfCurrent(run, error);
    }
  }

  async stop(): Promise<void> {
    const request = this.#request;
    if (
      !request ||
      this.#state.phase !== "recording" ||
      this.#state.backend !== request.backend ||
      this.#draftIdentity !== request.draftIdentity ||
      !this.#recording ||
      !this.#abortController
    ) {
      return;
    }

    const run = this.#run;
    const recording = this.#recording;
    const signal = this.#abortController.signal;
    this.#setState({ phase: "transcribing", backend: request.backend });

    try {
      if (!this.#isCurrent(run, request.draftIdentity)) return;
      const audio = await recording.stop(signal);
      if (!this.#isCurrent(run, request.draftIdentity)) return;
      this.#recording = null;
      const text = await this.#dependencies.transcribers[request.backend].transcribe(audio, signal);
      if (!this.#isCurrent(run, request.draftIdentity)) return;
      request.deliver(text);
      if (!this.#isCurrent(run, request.draftIdentity)) return;
      this.#finish(run);
    } catch (error) {
      this.#failIfCurrent(run, error);
    }
  }

  cancel(): void {
    this.#run += 1;
    const abortController = this.#abortController;
    const recording = this.#recording;
    this.#abortController = null;
    this.#recording = null;
    this.#request = null;
    abortController?.abort();
    this.#cancelRecording(recording);
    this.#setState({ phase: "idle" });
  }

  #isCurrent(run: number, draftIdentity: string): boolean {
    return run === this.#run && draftIdentity === this.#draftIdentity;
  }

  #finish(run: number): void {
    if (run !== this.#run) return;
    this.#abortController = null;
    this.#request = null;
    this.#setState({ phase: "idle" });
  }

  #failIfCurrent(run: number, error: unknown): void {
    if (run !== this.#run) return;
    const recording = this.#recording;
    this.#abortController = null;
    this.#recording = null;
    this.#request = null;
    this.#cancelRecording(recording);
    this.#setState({
      phase: "error",
      message: error instanceof Error ? error.message : "Dictation failed.",
    });
  }

  #setState(state: PulseDictationState): void {
    if (
      state.phase === this.#state.phase &&
      (state.phase !== "error" ||
        (this.#state.phase === "error" && state.message === this.#state.message))
    ) {
      return;
    }
    this.#state = state;
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // A view subscriber cannot own or interrupt the capture lifecycle.
      }
    }
  }

  #cancelRecording(recording: PulseDictationRecording<Audio> | null): void {
    try {
      recording?.cancel();
    } catch {
      // Cancellation is best effort; references are detached before adapter cleanup runs.
    }
  }
}
