// @effect-diagnostics globalTimers:off -- Tests yield to the macrotask queue between hotkey edges.
import { describe, expect, it, vi } from "vite-plus/test";

import { DictationFlow, MIN_HOLD_MS, type DictationPhase } from "./DictationFlow.ts";
import type { PulseVoiceTranscript } from "./PulseVoiceClient.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const WORK_AREA = { x: 1920, y: 0, width: 2560, height: 1400 };

function makeFlow(mode: "hold" | "toggle" = "hold") {
  let now = 0;
  const phases: DictationPhase[] = [];
  const log: string[] = [];
  let startGate: Promise<void> = Promise.resolve();
  let stopResult: () => Promise<PulseVoiceTranscript> = async () => ({
    text: " hello world ",
    audioMs: 1_000,
    transcribeMs: 120,
  });
  const deps = {
    mode: () => mode,
    workArea: vi.fn(async () => WORK_AREA),
    start: vi.fn(async () => {
      log.push("start");
      await startGate;
    }),
    stop: vi.fn(async () => {
      log.push("stop");
      return stopResult();
    }),
    cancel: vi.fn(async () => {
      log.push("cancel");
    }),
    insert: vi.fn(async (text: string) => {
      log.push(`insert:${text}`);
    }),
    pill: {
      show: vi.fn(async () => {
        log.push("show");
      }),
      update: vi.fn(),
      hide: vi.fn(() => {
        log.push("hide");
      }),
    },
    onPhase: (phase: DictationPhase) => phases.push(phase),
    now: () => now,
  };
  const flow = new DictationFlow(deps);
  return {
    flow,
    deps,
    phases,
    log,
    advance: (ms: number) => {
      now += ms;
    },
    gateStart: () => {
      const gate = deferred<void>();
      startGate = gate.promise;
      return gate;
    },
    setStop: (fn: () => Promise<PulseVoiceTranscript>) => {
      stopResult = fn;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("DictationFlow", () => {
  it("hold: shows the pill on the foreground work area, then pastes the trimmed transcript", async () => {
    const { flow, deps, log, phases, advance } = makeFlow("hold");
    flow.hotkeyDown();
    await settle();
    expect(deps.pill.show).toHaveBeenCalledWith(WORK_AREA, { kind: "recording", level: 0 });
    advance(MIN_HOLD_MS + 1);
    flow.hotkeyUp();
    await settle();
    expect(log).toEqual(["show", "start", "stop", "insert:hello world", "hide"]);
    expect(phases).toEqual(["recording", "transcribing", "idle"]);
  });

  it("hold: an accidental tap cancels without transcribing", async () => {
    const { flow, log, phases, advance } = makeFlow("hold");
    flow.hotkeyDown();
    await settle();
    advance(MIN_HOLD_MS - 1);
    flow.hotkeyUp();
    await settle();
    expect(log).toEqual(["show", "start", "hide", "cancel"]);
    expect(phases).toEqual(["recording", "idle"]);
  });

  it("hold: a release while the microphone is opening stops once it is open", async () => {
    const { flow, log, advance, gateStart } = makeFlow("hold");
    const gate = gateStart();
    flow.hotkeyDown();
    await settle();
    advance(MIN_HOLD_MS + 1);
    flow.hotkeyUp();
    flow.hotkeyUp();
    await settle();
    expect(log).toEqual(["show", "start"]);
    gate.resolve();
    await settle();
    expect(log).toEqual(["show", "start", "stop", "insert:hello world", "hide"]);
  });

  it("toggle: records between two presses and ignores the release", async () => {
    const { flow, log } = makeFlow("toggle");
    flow.hotkeyDown();
    await settle();
    flow.hotkeyUp();
    await settle();
    expect(log).toEqual(["show", "start"]);
    flow.hotkeyDown();
    await settle();
    expect(log).toEqual(["show", "start", "stop", "insert:hello world", "hide"]);
  });

  it("ignores presses while transcribing", async () => {
    const { flow, deps, log, setStop } = makeFlow("toggle");
    const transcript = deferred<PulseVoiceTranscript>();
    setStop(() => transcript.promise);
    flow.hotkeyDown();
    await settle();
    flow.hotkeyDown();
    await settle();
    expect(flow.currentPhase).toBe("transcribing");
    flow.hotkeyDown();
    flow.hotkeyDown();
    await settle();
    expect(deps.start).toHaveBeenCalledOnce();
    transcript.resolve({ text: "done", audioMs: 1, transcribeMs: 1 });
    await settle();
    expect(log.filter((entry) => entry.startsWith("insert"))).toEqual(["insert:done"]);
  });

  it("does not paste an empty transcript", async () => {
    const { flow, deps, setStop } = makeFlow("toggle");
    setStop(async () => ({ text: "   ", audioMs: 500, transcribeMs: 50 }));
    flow.hotkeyDown();
    await settle();
    flow.hotkeyDown();
    await settle();
    expect(deps.insert).not.toHaveBeenCalled();
    expect(deps.pill.hide).toHaveBeenCalled();
    expect(flow.currentPhase).toBe("idle");
  });

  it("cancel during transcription drops the result", async () => {
    const { flow, deps, setStop } = makeFlow("toggle");
    const transcript = deferred<PulseVoiceTranscript>();
    setStop(() => transcript.promise);
    flow.hotkeyDown();
    await settle();
    flow.hotkeyDown();
    await settle();
    await flow.cancel();
    transcript.resolve({ text: "too late", audioMs: 1, transcribeMs: 1 });
    await settle();
    expect(deps.insert).not.toHaveBeenCalled();
    expect(flow.currentPhase).toBe("idle");
  });

  it("shows the failure in the pill and recovers on the next press", async () => {
    const { flow, deps } = makeFlow("toggle");
    deps.start.mockRejectedValueOnce(new Error("No microphone found."));
    flow.hotkeyDown();
    await settle();
    expect(deps.pill.update).toHaveBeenCalledWith({
      kind: "error",
      message: "No microphone found.",
    });
    expect(flow.currentPhase).toBe("idle");
    flow.hotkeyDown();
    await settle();
    expect(flow.currentPhase).toBe("recording");
    expect(deps.start).toHaveBeenCalledTimes(2);
  });
});
