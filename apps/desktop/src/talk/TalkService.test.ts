import { describe, expect, it } from "vite-plus/test";
import { TalkService } from "./TalkService.ts";

function fixture(options: { modelLoaded?: boolean; shortcutAvailable?: boolean } = {}) {
  let enabled = false;
  let recording = false;
  let running = false;
  const calls: string[] = [];
  let shortcut: (() => void) | undefined;
  let finishDictation: ((value: unknown) => void) | undefined;
  const item = {
    id: "meeting",
    title: "Review",
    startedAt: "2026-09-08T10:00:00Z",
    durationSeconds: 12,
    audioPath: "/isolated/meeting.wav",
    status: "recorded" as const,
  };
  const worker = {
    get running() {
      return running;
    },
    async request(op: string) {
      calls.push(op);
      running = true;
      if (op === "status")
        return {
          recording,
          modelLoaded: options.modelLoaded ?? false,
          capabilities: {
            microphone: true,
            systemAudio: false,
            dictationDelivery: true,
            parakeet: true,
          },
        };
      if (op === "recordings.start") {
        recording = true;
        return { id: item.id };
      }
      if (op === "recordings.stop") {
        recording = false;
        return item;
      }
      if (op === "recordings.list") return { recordings: [item] };
      if (op === "recordings.get") return { ...item, transcript: "Saved transcript" };
      if (op === "dictation.hold")
        return new Promise((resolve) => {
          finishDictation = resolve;
        });
      return {};
    },
    async close() {
      calls.push("close");
      running = false;
    },
  };
  const service = new TalkService({
    dictation: {
      register(callback) {
        shortcut = callback;
        calls.push("register");
        return options.shortcutAvailable ?? true;
      },
      unregister() {
        shortcut = undefined;
        calls.push("unregister");
      },
      showActive(active) {
        calls.push(`indicator:${active}`);
      },
      history: async () => [],
    },
    createWorker: () => worker,
    workerAvailable: async () => true,
    readEnabled: async () => enabled,
    writeEnabled: async (value) => {
      enabled = value;
    },
    chooseModel: async () => null,
    openAudio: async () => undefined,
  });
  return {
    service,
    calls,
    press: () => shortcut?.(),
    finish: (value: unknown) => finishDictation?.(value),
  };
}

describe("Talk consent and lifecycle", () => {
  it("never starts a worker when shutdown overtakes an availability check", async () => {
    let resolveAvailability!: (value: boolean) => void;
    let signalChecking!: () => void;
    const checking = new Promise<void>((resolve) => {
      signalChecking = resolve;
    });
    let created = false;
    const service = new TalkService({
      createWorker() {
        created = true;
        throw new Error("Must not start during shutdown");
      },
      workerAvailable() {
        signalChecking();
        return new Promise((resolve) => {
          resolveAvailability = resolve;
        });
      },
      readEnabled: async () => true,
      writeEnabled: async () => undefined,
      chooseModel: async () => null,
      openAudio: async () => undefined,
    });
    const start = service.invoke({ operation: "recordings.start", title: "Shutdown race" });
    await checking;
    const closed = service.close();
    resolveAvailability(true);
    expect(await start).toMatchObject({ ok: false, error: { message: "Talk is shutting down." } });
    await closed;
    expect(created).toBe(false);
  });
  it("does no native work on status or activation and refuses capture while disabled", async () => {
    const { service, calls } = fixture();
    expect((await service.invoke({ operation: "status" })).ok).toBe(true);
    expect((await service.invoke({ operation: "recordings.start", title: "Review" })).ok).toBe(
      false,
    );
    await service.invoke({ operation: "enable", enabled: true });
    expect(calls).toEqual([]);
    await service.close();
  });
  it("requires saving before disabling and never transcribes on recording stop", async () => {
    const { service, calls } = fixture();
    await service.invoke({ operation: "enable", enabled: true });
    await service.invoke({ operation: "recordings.start", title: "Review" });
    expect(await service.invoke({ operation: "enable", enabled: false })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Stop and save") },
    });
    expect(await service.invoke({ operation: "recordings.stop" })).toMatchObject({
      ok: true,
      recording: { id: "meeting", status: "recorded" },
    });
    await service.invoke({ operation: "enable", enabled: false });
    expect(calls).not.toContain("recordings.transcribe");
    expect(calls).toContain("close");
  });
  it("model-picker cancellation never starts model loading", async () => {
    const { service, calls } = fixture();
    await service.invoke({ operation: "enable", enabled: true });
    expect(await service.invoke({ operation: "model.choose" })).toEqual({
      ok: true,
      cancelled: true,
    });
    expect(calls).toEqual([]);
    await service.close();
  });
  it("requires a loaded model and handles an occupied shortcut without capturing", async () => {
    const { service, calls } = fixture({ shortcutAvailable: false });
    expect((await service.invoke({ operation: "dictation.enable", enabled: true })).ok).toBe(false);
    await service.invoke({ operation: "enable", enabled: true });
    await service.invoke({ operation: "recordings.list" });
    expect((await service.invoke({ operation: "dictation.enable", enabled: true })).ok).toBe(false);
    expect(calls).not.toContain("dictation.hold");
    await service.close();
    const occupied = fixture({ modelLoaded: true, shortcutAvailable: false });
    await occupied.service.invoke({ operation: "enable", enabled: true });
    await occupied.service.invoke({ operation: "recordings.list" });
    expect(
      await occupied.service.invoke({ operation: "dictation.enable", enabled: true }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining("already in use") } });
    expect(occupied.calls).not.toContain("dictation.hold");
    await occupied.service.close();
  });
  it("captures only on opted-in shortcut, rejects overlap, and exposes delivery failure", async () => {
    const { service, calls, press, finish } = fixture({ modelLoaded: true });
    await service.invoke({ operation: "enable", enabled: true });
    await service.invoke({ operation: "recordings.list" });
    await service.invoke({ operation: "dictation.enable", enabled: true });
    expect(calls).not.toContain("dictation.hold");
    press();
    press();
    expect(calls.filter((call) => call === "dictation.hold")).toHaveLength(1);
    expect(await service.invoke({ operation: "status" })).toMatchObject({
      ok: true,
      status: { dictation: { active: true } },
    });
    expect((await service.invoke({ operation: "recordings.start", title: "Overlap" })).ok).toBe(
      false,
    );
    finish({
      id: "dictation",
      createdAt: "2026-09-08T12:00:00Z",
      text: "Saved",
      delivered: false,
      error: "Target changed",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(await service.invoke({ operation: "status" })).toMatchObject({
      ok: true,
      status: { dictation: { active: false, lastError: "Target changed" } },
    });
    await service.invoke({ operation: "enable", enabled: false });
    press();
    expect(calls.filter((call) => call === "dictation.hold")).toHaveLength(1);
    await service.close();
  });
  it("reads history while disabled without starting a worker, and fetches individual transcripts", async () => {
    const { service, calls } = fixture();
    expect(await service.invoke({ operation: "dictation.history" })).toMatchObject({
      ok: true,
      dictations: [],
    });
    expect(calls).toEqual([]);
    await service.invoke({ operation: "enable", enabled: true });
    expect(await service.invoke({ operation: "recordings.get", id: "meeting" })).toMatchObject({
      ok: true,
      recording: { transcript: "Saved transcript" },
    });
    await service.close();
  });
});
