import type {
  DesktopVoiceEvent,
  EnvironmentId,
  DesktopVoiceMeetingSegment,
  MeetingId,
  MeetingSegment,
} from "@t3tools/contracts";

export type MeetingRecorderState =
  | { readonly phase: "idle" }
  | { readonly phase: "starting" }
  | {
      readonly phase: "recording";
      readonly meetingId: MeetingId;
      readonly startedAt: string;
      readonly segmentCount: number;
      /** Set while segments are waiting on a failed save; they are retried. */
      readonly syncError: string | null;
    }
  | { readonly phase: "stopping"; readonly meetingId: MeetingId }
  | {
      readonly phase: "error";
      readonly message: string;
      readonly meetingId: MeetingId | null;
      /** The meeting still holds unsaved text; `retry()` saves it. */
      readonly unsaved: boolean;
    };

export type MeetingRecorderDeps = {
  readonly desktop: {
    readonly start: () => Promise<{ readonly sessionId: string }>;
    readonly stop: () => Promise<{ readonly sessionId: string; readonly durationMs: number }>;
    readonly onEvent: (listener: (event: DesktopVoiceEvent) => void) => () => void;
  };
  readonly server: {
    readonly create: (environmentId: EnvironmentId, startedAt: string) => Promise<MeetingId>;
    readonly append: (
      environmentId: EnvironmentId,
      id: MeetingId,
      segments: ReadonlyArray<MeetingSegment>,
    ) => Promise<void>;
    readonly finish: (
      environmentId: EnvironmentId,
      id: MeetingId,
      endedAt: string,
      durationMs: number,
    ) => Promise<void>;
    readonly remove: (environmentId: EnvironmentId, id: MeetingId) => Promise<void>;
  };
  readonly now: () => Date;
};

type Session = {
  readonly environmentId: EnvironmentId;
  readonly meetingId: MeetingId;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly pending: MeetingSegment[];
  segmentCount: number;
  lastEndMs: number;
  durationMs: number | null;
  flushing: Promise<void> | null;
  syncError: string | null;
};

// The server accepts at most this many segments per append.
const APPEND_BATCH = 500;

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function toMeetingSegment(segment: DesktopVoiceMeetingSegment): MeetingSegment {
  const startMs = Math.max(0, Math.round(segment.startMs));
  return {
    index: segment.index,
    startMs,
    endMs: Math.max(startMs, Math.round(segment.endMs)),
    text: segment.text,
  };
}

/**
 * Records one meeting at a time: the desktop voice engine captures and
 * transcribes, and every finalized segment is saved to the server meeting as it
 * arrives. Saves are retried, and appends are idempotent by segment index, so a
 * failed save never drops transcript text while the page stays open.
 */
export class MeetingRecorder {
  readonly #deps: MeetingRecorderDeps;
  readonly #listeners = new Set<() => void>();
  #state: MeetingRecorderState = { phase: "idle" };
  #session: Session | null = null;
  #unsubscribe: (() => void) | null = null;

  constructor(deps: MeetingRecorderDeps) {
    this.#deps = deps;
  }

  readonly getSnapshot = (): MeetingRecorderState => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Records into a new meeting on `environmentId`; the session keeps saving there until it ends. */
  async start(environmentId: EnvironmentId): Promise<void> {
    // An unsaved meeting must be retried, not replaced.
    if (this.#session || (this.#state.phase !== "idle" && this.#state.phase !== "error")) return;
    this.#setState({ phase: "starting" });
    const startedAt = this.#deps.now().toISOString();
    let meetingId: MeetingId;
    try {
      meetingId = await this.#deps.server.create(environmentId, startedAt);
    } catch (error) {
      this.#setState({
        phase: "error",
        message: message(error, "Could not create the meeting."),
        meetingId: null,
        unsaved: false,
      });
      return;
    }
    // Segments can arrive as soon as capture starts, before start() resolves.
    const early: DesktopVoiceMeetingSegment[] = [];
    this.#unsubscribe = this.#deps.desktop.onEvent((event) => this.#onEvent(event, early));
    try {
      const { sessionId } = await this.#deps.desktop.start();
      this.#session = {
        environmentId,
        meetingId,
        sessionId,
        startedAt,
        pending: [],
        segmentCount: 0,
        lastEndMs: 0,
        durationMs: null,
        flushing: null,
        syncError: null,
      };
      this.#publishRecording();
      for (const segment of early) this.#onEvent({ type: "meeting-segment", segment }, []);
    } catch (error) {
      this.#detach();
      await this.#deps.server.remove(environmentId, meetingId).catch(() => undefined);
      this.#setState({
        phase: "error",
        message: message(error, "Could not start recording."),
        meetingId: null,
        unsaved: false,
      });
    }
  }

  /** Stops capture, saves every remaining segment, then marks the meeting ready. */
  async stop(): Promise<void> {
    const session = this.#session;
    if (!session || this.#state.phase !== "recording") return;
    this.#setState({ phase: "stopping", meetingId: session.meetingId });
    try {
      session.durationMs = (await this.#deps.desktop.stop()).durationMs;
    } catch (error) {
      // Capture may already be gone; keep what was transcribed.
      if (this.#session !== session) return;
      session.syncError = message(error, "Recording stopped unexpectedly.");
    }
    await this.#finish(session);
  }

  /** Retries saving after a failed stop. */
  async retry(): Promise<void> {
    const session = this.#session;
    if (!session || this.#state.phase !== "error") return;
    this.#setState({ phase: "stopping", meetingId: session.meetingId });
    await this.#finish(session);
  }

  dispose(): void {
    this.#detach();
    this.#listeners.clear();
  }

  #onEvent(event: DesktopVoiceEvent, early: DesktopVoiceMeetingSegment[]): void {
    const session = this.#session;
    if (event.type === "meeting-segment") {
      if (!session) {
        early.push(event.segment);
        return;
      }
      if (event.segment.sessionId !== session.sessionId) return;
      const segment = toMeetingSegment(event.segment);
      session.pending.push(segment);
      session.segmentCount += 1;
      session.lastEndMs = Math.max(session.lastEndMs, segment.endMs);
      this.#publishRecording();
      void this.#flush(session).catch(() => undefined);
      return;
    }
    if (
      event.type === "meeting-error" &&
      session &&
      this.#state.phase === "recording" &&
      (event.sessionId === null || event.sessionId === session.sessionId)
    ) {
      // Capture ended on its own; save what we have.
      session.syncError = event.message;
      this.#setState({ phase: "stopping", meetingId: session.meetingId });
      void this.#finish(session, event.message);
    }
  }

  async #finish(session: Session, captureError?: string): Promise<void> {
    try {
      await this.#flush(session);
      if (session.pending.length > 0) throw new Error(session.syncError ?? "Saving failed.");
      await this.#deps.server.finish(
        session.environmentId,
        session.meetingId,
        this.#deps.now().toISOString(),
        Math.max(0, Math.round(session.durationMs ?? session.lastEndMs)),
      );
    } catch (error) {
      if (this.#session !== session) return;
      this.#setState({
        phase: "error",
        message: message(error, "Could not save the meeting."),
        meetingId: session.meetingId,
        unsaved: true,
      });
      return;
    }
    if (this.#session !== session) return;
    this.#detach();
    this.#setState(
      captureError
        ? { phase: "error", message: captureError, meetingId: session.meetingId, unsaved: false }
        : { phase: "idle" },
    );
  }

  /** Sends pending segments one batch at a time. Resolves once nothing is pending or a save fails. */
  #flush(session: Session): Promise<void> {
    if (session.flushing) return session.flushing;
    const run = async () => {
      try {
        while (session.pending.length > 0) {
          const batch = session.pending.slice(0, APPEND_BATCH);
          try {
            await this.#deps.server.append(session.environmentId, session.meetingId, batch);
          } catch (error) {
            session.syncError = message(error, "Saving failed.");
            this.#publishRecording();
            return;
          }
          session.pending.splice(0, batch.length);
          if (session.syncError !== null) {
            session.syncError = null;
            this.#publishRecording();
          }
        }
      } finally {
        session.flushing = null;
      }
    };
    session.flushing = run();
    return session.flushing;
  }

  #publishRecording(): void {
    const session = this.#session;
    if (!session || (this.#state.phase !== "recording" && this.#state.phase !== "starting")) return;
    this.#setState({
      phase: "recording",
      meetingId: session.meetingId,
      startedAt: session.startedAt,
      segmentCount: session.segmentCount,
      syncError: session.syncError,
    });
  }

  #detach(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#session = null;
  }

  #setState(state: MeetingRecorderState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
