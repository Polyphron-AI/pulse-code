export type VoicePhase = "idle" | "loading" | "recording" | "transcribing" | "error";
export type VoiceSnapshot = { phase: VoicePhase; message: string; transcript: string };
export type AudioCapture = { finish: () => Promise<Float32Array>; cancel: () => void };
export type VoiceDependencies = {
  prepare: () => Promise<void>;
  record: (onLimit: () => void) => Promise<AudioCapture>;
  transcribe: (pcm: Float32Array) => Promise<string>;
  reset: () => void;
};

/** Owns one recording and its delivery callback, even while the user navigates. */
export class VoiceController {
  private snapshot: VoiceSnapshot = { phase: "idle", message: "", transcript: "" };
  private listeners = new Set<() => void>();
  private generation = 0;
  private owner: symbol | null = null;
  isOwnedBy(owner: symbol) {
    return this.owner === owner;
  }
  private capture: AudioCapture | null = null;
  private deliver: ((text: string) => void | Promise<void>) | null = null;
  constructor(private readonly dependencies: VoiceDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(phase: VoicePhase, message = "", transcript = "") {
    this.snapshot = { phase, message, transcript };
    for (const listener of this.listeners) listener();
  }
  async start(deliver: (text: string) => void | Promise<void>, owner: symbol | null = null) {
    if (!["idle", "error"].includes(this.snapshot.phase)) return;
    const generation = ++this.generation;
    this.owner = owner;
    this.deliver = deliver;
    this.publish("loading", "Loading Parakeet. The first use downloads the speech model.");
    try {
      await this.dependencies.prepare();
      if (generation !== this.generation) return;
      const capture = await this.dependencies.record(() => {
        void this.stop();
      });
      if (generation !== this.generation) {
        capture.cancel();
        return;
      }
      this.capture = capture;
      this.publish("recording", "Listening…");
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }
  async stop() {
    if (this.snapshot.phase !== "recording" || !this.capture) return;
    const generation = this.generation;
    const capture = this.capture;
    const deliver = this.deliver;
    this.capture = null;
    this.publish("transcribing", "Transcribing…");
    let transcript = "";
    try {
      const pcm = await capture.finish();
      if (generation !== this.generation) return;
      transcript = (await this.dependencies.transcribe(pcm)).trim();
      if (generation !== this.generation) return;
      if (!transcript) throw new Error("No speech detected. Try recording again.");
      await deliver?.(transcript);
      if (generation === this.generation) {
        this.owner = null;
        this.publish("idle");
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error, transcript);
    }
  }
  cancel = () => {
    this.owner = null;
    ++this.generation;
    this.capture?.cancel();
    this.capture = null;
    this.deliver = null;
    this.dependencies.reset();
    this.publish("idle");
  };
  reportError(message: string) {
    const transcript = this.snapshot.transcript;
    this.cancel();
    this.publish("error", message, transcript);
  }
  private fail(error: unknown, transcript = "") {
    this.owner = null;
    this.capture?.cancel();
    this.capture = null;
    this.deliver = null;
    this.publish(
      "error",
      error instanceof Error ? error.message : "Voice capture failed. Please try again.",
      transcript,
    );
  }
}
