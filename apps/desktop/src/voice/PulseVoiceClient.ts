// @effect-diagnostics globalTimers:off -- Request timeouts run at child-process callback boundaries outside Effect fibers.
// @effect-diagnostics nodeBuiltinImport:off -- This desktop-only client owns the pulse-voice child process streams.

import * as NodeReadline from "node:readline";
import type * as NodeStream from "node:stream";

/** Version of `pulse-voice/PROTOCOL.md` this client speaks. */
export const PULSE_VOICE_PROTOCOL = 1;

export type PulseVoiceRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type PulseVoiceDevice = {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
};

export type PulseVoiceTranscript = {
  readonly text: string;
  readonly audioMs: number;
  readonly transcribeMs: number;
};

export type PulseVoiceHotkeyKey = string;

/** Request params and results, keyed by method. Mirrors PROTOCOL.md. */
export type PulseVoiceMethods = {
  hello: {
    params: undefined;
    result: { protocol: number; version: string; platform: string };
  };
  status: {
    params: undefined;
    result: {
      modelLoaded: boolean;
      modelDir: string | null;
      capture: null | "dictation" | "meeting";
    };
  };
  "model.load": { params: { modelDir: string }; result: { loadMs: number } };
  "devices.list": {
    params: undefined;
    result: { inputs: PulseVoiceDevice[]; outputs: PulseVoiceDevice[] };
  };
  transcribe: { params: { pcm16: string; sampleRate: number }; result: PulseVoiceTranscript };
  "dictation.start": { params: { inputDeviceId?: string }; result: Record<string, never> };
  "dictation.stop": { params: undefined; result: PulseVoiceTranscript };
  "dictation.cancel": { params: undefined; result: Record<string, never> };
  "meeting.start": {
    params: { inputDeviceId?: string; systemAudio: boolean; outputDeviceId?: string };
    result: { sessionId: string };
  };
  "meeting.stop": { params: undefined; result: { sessionId: string; durationMs: number } };
  "foreground.monitor": {
    params: undefined;
    result: {
      source: "foreground" | "cursor";
      bounds: PulseVoiceRect;
      workArea: PulseVoiceRect;
      dpi: number;
    };
  };
  "text.insert": {
    params: { text: string; restoreClipboard: boolean };
    result: Record<string, never>;
  };
  "hotkey.set": {
    params: { keys: PulseVoiceHotkeyKey[]; mode: "hold" | "toggle" } | null;
    result: Record<string, never>;
  };
  shutdown: { params: undefined; result: Record<string, never> };
};

export type PulseVoiceMethod = keyof PulseVoiceMethods;

export type PulseVoiceEvent =
  | { readonly event: "ready"; readonly data: Record<string, never> }
  | { readonly event: "hotkey"; readonly data: { readonly phase: "down" | "up" } }
  | {
      readonly event: "level";
      readonly data: { readonly capture: "dictation" | "meeting"; readonly rms: number };
    }
  | {
      readonly event: "meeting.segment";
      readonly data: {
        readonly sessionId: string;
        readonly index: number;
        readonly startMs: number;
        readonly endMs: number;
        readonly text: string;
      };
    }
  | {
      readonly event: "capture.error";
      readonly data: {
        readonly capture: "dictation" | "meeting";
        readonly code: string;
        readonly message: string;
      };
    }
  | {
      readonly event: "model.loaded";
      readonly data: { readonly modelDir: string; readonly loadMs: number };
    };

/** A protocol error code from the sidecar, or `exited`/`timeout` raised by this client. */
export class PulseVoiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PulseVoiceError";
    this.code = code;
  }
}

export type PulseVoiceStreams = {
  readonly stdin: NodeStream.Writable;
  readonly stdout: NodeStream.Readable;
  readonly stderr: NodeStream.Readable;
};

export type PulseVoiceClientHandlers = {
  readonly onEvent: (event: PulseVoiceEvent) => void;
  readonly onLog?: (line: string) => void;
};

type Pending = {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: PulseVoiceError) => void;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
};

const DEFAULT_TIMEOUT_MS = 30_000;
// Transcription and model loads scale with audio length and disk speed.
const SLOW_METHOD_TIMEOUT_MS: Partial<Record<PulseVoiceMethod, number>> = {
  "model.load": 180_000,
  transcribe: 120_000,
  "dictation.stop": 120_000,
  "meeting.stop": 120_000,
};

/**
 * JSON-lines request/response correlation over the sidecar's stdio. The caller
 * owns the process; call `dispose` when it exits so pending requests fail.
 */
export class PulseVoiceClient {
  private nextId = 1;
  private disposed = false;
  private readonly pending = new Map<number, Pending>();
  private readonly lines: NodeReadline.Interface;
  private readonly logs: NodeReadline.Interface;

  private readonly streams: PulseVoiceStreams;
  private readonly handlers: PulseVoiceClientHandlers;

  constructor(streams: PulseVoiceStreams, handlers: PulseVoiceClientHandlers) {
    this.streams = streams;
    this.handlers = handlers;
    this.lines = NodeReadline.createInterface({ input: streams.stdout, crlfDelay: Infinity });
    this.lines.on("line", (line) => this.handleLine(line));
    this.logs = NodeReadline.createInterface({ input: streams.stderr, crlfDelay: Infinity });
    this.logs.on("line", (line) => handlers.onLog?.(line));
    // A dead child closes stdin under us; requests fail through dispose instead.
    streams.stdin.on("error", () => undefined);
  }

  request<M extends PulseVoiceMethod>(
    method: M,
    ...[params]: PulseVoiceMethods[M]["params"] extends undefined
      ? []
      : [PulseVoiceMethods[M]["params"]]
  ): Promise<PulseVoiceMethods[M]["result"]> {
    if (this.disposed) {
      return Promise.reject(new PulseVoiceError("exited", "The voice engine is not running."));
    }
    const id = this.nextId++;
    const timeoutMs = SLOW_METHOD_TIMEOUT_MS[method] ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new PulseVoiceError("timeout", `The voice engine did not answer ${method}.`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.streams.stdin.write(
        `${JSON.stringify(params === undefined ? { id, method } : { id, method, params })}\n`,
      );
    });
  }

  /** Fail every pending request. Call once the process has exited. */
  dispose(reason = "The voice engine stopped."): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lines.close();
    this.logs.close();
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new PulseVoiceError("exited", reason));
    }
  }

  private handleLine(line: string): void {
    if (line.trim().length === 0) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.handlers.onLog?.(`unparseable stdout line: ${line.slice(0, 200)}`);
      return;
    }
    if (typeof message !== "object" || message === null) return;
    const record = message as Record<string, unknown>;
    if (typeof record.event === "string") {
      this.handlers.onEvent({ event: record.event, data: record.data ?? {} } as PulseVoiceEvent);
      return;
    }
    if (typeof record.id !== "number") return;
    const pending = this.pending.get(record.id);
    if (!pending) return;
    this.pending.delete(record.id);
    if (pending.timer) clearTimeout(pending.timer);
    const error = record.error as { code?: unknown; message?: unknown } | undefined;
    if (error && typeof error === "object") {
      pending.reject(
        new PulseVoiceError(
          typeof error.code === "string" ? error.code : "internal",
          typeof error.message === "string" ? error.message : `${pending.method} failed.`,
        ),
      );
      return;
    }
    pending.resolve(record.result ?? {});
  }
}
