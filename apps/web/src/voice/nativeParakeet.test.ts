import type { DesktopVoiceEvent, DesktopVoiceState } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { NativeParakeet, floatToPcm16, nativeFirstTranscriber } from "./nativeParakeet";

const state = (status: DesktopVoiceState["status"]): DesktopVoiceState => ({
  status,
  message: null,
  dictation: "idle",
  meetingSessionId: null,
});

function makeBridge(initial: DesktopVoiceState["status"]) {
  let emit: (event: DesktopVoiceEvent) => void = () => undefined;
  const bridge = {
    getVoiceState: vi.fn(async () => state(initial)),
    transcribeVoice: vi.fn(async (_input: { pcm16: Uint8Array; sampleRate: number }) => ({
      text: "native text",
    })),
    onVoiceEvent: vi.fn((listener: (event: DesktopVoiceEvent) => void) => {
      emit = listener;
      return () => undefined;
    }),
  };
  return { bridge, emit: (event: DesktopVoiceEvent) => emit(event) };
}

const audio = new Blob(["x"]);
const signal = () => new AbortController().signal;

describe("floatToPcm16", () => {
  it("writes clamped little-endian 16-bit samples", () => {
    const bytes = floatToPcm16(new Float32Array([0, 1, -1, 2, 0.5]));
    const view = new DataView(bytes.buffer);
    expect([0, 1, 2, 3, 4].map((index) => view.getInt16(index * 2, true))).toEqual([
      0, 32767, -32768, 32767, 16383,
    ]);
  });
});

describe("NativeParakeet", () => {
  it("is unavailable without a desktop voice bridge", () => {
    expect(new NativeParakeet(null).getStatus()).toBe("unavailable");
  });

  it("resolves the engine status and follows state events", async () => {
    const { bridge, emit } = makeBridge("stopped");
    const native = new NativeParakeet(bridge, async () => new Float32Array(0));
    const listener = vi.fn();
    native.subscribe(listener);
    expect(native.getStatus()).toBe("unknown");
    await vi.waitFor(() => expect(native.getStatus()).toBe("available"));
    emit({ type: "state", state: state("unavailable") });
    expect(native.getStatus()).toBe("unavailable");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("sends decoded 16 kHz audio to the engine", async () => {
    const { bridge } = makeBridge("ready");
    const native = new NativeParakeet(bridge, async () => new Float32Array([0, 1]));
    await expect(native.transcriber.transcribe(audio, signal())).resolves.toBe("native text");
    expect(bridge.transcribeVoice).toHaveBeenCalledWith({
      pcm16: new Uint8Array([0, 0, 0xff, 0x7f]),
      sampleRate: 16_000,
    });
  });
});

describe("nativeFirstTranscriber", () => {
  const makeFallback = (configured: boolean) => ({
    configured: () => configured,
    ensureReady: vi.fn(async () => undefined),
    transcriber: { transcribe: vi.fn(async () => "browser text") },
  });

  it("uses the native engine when it is available", async () => {
    const fallback = makeFallback(true);
    const transcriber = nativeFirstTranscriber(
      { getStatus: () => "available", transcriber: { transcribe: async () => "native text" } },
      fallback,
    );
    await expect(transcriber.transcribe(audio, signal())).resolves.toBe("native text");
    expect(fallback.transcriber.transcribe).not.toHaveBeenCalled();
  });

  it("uses the browser model when there is no native engine", async () => {
    const fallback = makeFallback(true);
    const transcriber = nativeFirstTranscriber(
      { getStatus: () => "unavailable", transcriber: { transcribe: vi.fn() } },
      fallback,
    );
    await expect(transcriber.transcribe(audio, signal())).resolves.toBe("browser text");
    expect(fallback.ensureReady).not.toHaveBeenCalled();
  });

  it("falls back to a set-up browser model when the native engine fails", async () => {
    const fallback = makeFallback(true);
    const transcriber = nativeFirstTranscriber(
      {
        getStatus: () => "available",
        transcriber: { transcribe: async () => Promise.reject(new Error("engine crashed")) },
      },
      fallback,
    );
    await expect(transcriber.transcribe(audio, signal())).resolves.toBe("browser text");
    expect(fallback.ensureReady).toHaveBeenCalledOnce();
  });

  it("reports the native failure when the browser model was never set up", async () => {
    const fallback = makeFallback(false);
    const transcriber = nativeFirstTranscriber(
      {
        getStatus: () => "available",
        transcriber: { transcribe: async () => Promise.reject(new Error("engine crashed")) },
      },
      fallback,
    );
    await expect(transcriber.transcribe(audio, signal())).rejects.toThrow("engine crashed");
    expect(fallback.transcriber.transcribe).not.toHaveBeenCalled();
  });
});
