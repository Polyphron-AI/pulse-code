import { describe, expect, it } from "vite-plus/test";
import type { TalkPreferences, TalkModelStatus } from "../../../../packages/contracts/src/talk.ts";
import { TalkService } from "./TalkService.ts";

function fixture(initial: TalkPreferences = { enabled: false }) {
  let preferences = initial;
  let modelState: TalkModelStatus["state"] = "not_installed";
  let loaded = false;
  let recording = false;
  let running = false;
  let transcribed = false;
  let fail = false;
  let finishDownload = () => {};
  let download = Promise.resolve();
  const calls: string[] = [];
  const item = () => ({
    id: "meeting-1",
    title: "Review",
    startedAt: "2026-09-09T12:00:00Z",
    durationSeconds: 12,
    audioPath: "meeting-1.wav",
    transcript: null,
    status: recording
      ? ("recording" as const)
      : transcribed
        ? ("transcribed" as const)
        : ("recorded" as const),
  });
  const model = (): TalkModelStatus => ({
    state: modelState,
    modelId: "fixture",
    revision: "fixture",
    license: "fixture",
    sourceUrl: "https://example.test/model",
    totalBytes: 10,
    downloadedBytes: modelState === "installed" ? 10 : 0,
    progress: 0,
    currentFile: null,
    error: null,
    memory: { totalBytes: 100, freeBytes: 100 },
    disk: { freeBytes: 100 },
  });
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
          modelLoaded: loaded,
          capabilities: {
            microphone: true,
            systemAudio: true,
            dictationDelivery: true,
            parakeet: true,
          },
        };
      if (op === "model.load") {
        loaded = true;
        return {};
      }
      if (op === "recordings.start") {
        recording = true;
        return { id: "meeting-1" };
      }
      if (op === "recordings.stop") {
        recording = false;
        return item();
      }
      if (op === "recordings.get") return item();
      if (op === "recordings.list") return { recordings: [item()] };
      if (op === "recordings.transcribe") {
        if (fail) throw new Error("Fixture transcription failed");
        transcribed = true;
        return { ...item(), transcript: "Saved meeting transcript" };
      }
      return {};
    },
    async close() {
      running = false;
      loaded = false;
    },
  };
  const makeService = () =>
    new TalkService({
      createWorker: () => worker,
      workerAvailable: async () => true,
      readEnabled: async () => preferences.enabled,
      writeEnabled: async () => {},
      readPreferences: async () => preferences,
      writePreferences: async (value) => {
        preferences = value;
      },
      chooseModel: async () => null,
      openAudio: async () => {},
      dictation: {
        register: () => {
          calls.push("shortcut.register");
          return true;
        },
        unregister: () => {},
        showActive: () => {},
        history: async () => [],
      },
      models: {
        status: async () => model(),
        installedPath: async () => (modelState === "installed" ? "/fixture/model" : null),
        startDownload: async () => {
          modelState = "downloading";
          download = new Promise((resolve) => {
            finishDownload = resolve;
          });
          return model();
        },
        waitForIdle: () => download,
        cancel: async () => {
          modelState = "cancelled";
          finishDownload();
        },
        remove: async () => {
          modelState = "not_installed";
        },
        close: async () => {},
      },
    });
  return {
    service: makeService(),
    makeService,
    calls,
    preferences: () => preferences,
    completeDownload: () => {
      modelState = "installed";
      finishDownload();
    },
    setFail: (value: boolean) => {
      fail = value;
    },
  };
}

describe("meeting capture while transcription is unavailable", () => {
  it("can cancel queued transcription without deleting the saved recording", async () => {
    const f = fixture({ enabled: false, pendingTranscriptions: ["meeting-1"] });
    await f.service.invoke({ operation: "transcription.cancel", id: "meeting-1" });
    await f.service.waitForIdle();
    expect(f.preferences().pendingTranscriptions).toEqual([]);
    expect(f.calls).not.toContain("recordings.delete");
    await f.service.close();
  });
  it("persists enabled dictation before download without recording or registering a shortcut", async () => {
    const f = fixture();
    expect(await f.service.invoke({ operation: "enable", enabled: true })).toMatchObject({
      ok: true,
      status: { enabled: true, modelLoaded: false, dictation: { enabled: true } },
    });
    await f.service.waitForIdle();
    expect(f.preferences().enabled).toBe(true);
    expect(f.calls).toEqual([]);
    await f.service.invoke({ operation: "models.download", consent: true });
    f.completeDownload();
    await f.service.waitForIdle();
    expect(f.calls).toContain("model.load");
    expect(f.calls).toContain("shortcut.register");
    expect(f.calls).not.toContain("recordings.start");
    await f.service.close();
  });

  it("records without a model or notes provider and transcribes saved audio after download", async () => {
    const f = fixture();
    expect(
      await f.service.invoke({
        operation: "recordings.start",
        title: "Review",
        transcribeWhenReady: true,
      }),
    ).toMatchObject({ ok: true, status: { recording: true } });
    expect(f.preferences().pendingTranscriptions).toEqual(["meeting-1"]);
    await f.service.invoke({ operation: "models.download", consent: true });
    f.completeDownload();
    await f.service.waitForIdle();
    expect(f.calls).not.toContain("model.load");
    await f.service.invoke({ operation: "recordings.stop" });
    await f.service.waitForIdle();
    expect(f.calls.filter((op) => op === "recordings.transcribe")).toHaveLength(1);
    expect(f.preferences().pendingTranscriptions).toEqual([]);
    expect(f.preferences().enabled).toBe(false);
    await f.service.close();
  });

  it("restores queued audio after restart and preserves the every-meeting preference", async () => {
    const f = fixture();
    await f.service.invoke({ operation: "meetings.configure", everyMeeting: true });
    await f.service.invoke({
      operation: "recordings.start",
      title: "Review",
      transcribeWhenReady: true,
    });
    await f.service.invoke({ operation: "recordings.stop" });
    await f.service.waitForIdle();
    await f.service.close();
    f.completeDownload();
    const restored = f.makeService();
    expect(await restored.invoke({ operation: "status" })).toMatchObject({
      ok: true,
      status: { everyMeeting: true, pendingTranscriptions: ["meeting-1"] },
    });
    await restored.waitForIdle();
    expect(f.calls).toContain("recordings.transcribe");
    expect(f.calls.filter((op) => op === "recordings.start")).toHaveLength(1);
    await restored.close();
  });

  it("retains queued audio on download cancellation and retries after a failed transcription", async () => {
    const f = fixture({ enabled: true, pendingTranscriptions: ["meeting-1"] });
    await f.service.invoke({ operation: "models.download", consent: true });
    await f.service.invoke({ operation: "models.cancel" });
    await f.service.waitForIdle();
    expect(f.preferences().pendingTranscriptions).toEqual(["meeting-1"]);
    expect(f.calls).not.toContain("recordings.transcribe");
    f.setFail(true);
    await f.service.invoke({ operation: "models.download", consent: true });
    f.completeDownload();
    await f.service.waitForIdle();
    expect(await f.service.invoke({ operation: "status" })).toMatchObject({
      ok: true,
      status: { transcriptionError: "Fixture transcription failed" },
    });
    await f.service.waitForIdle();
    expect(f.calls.filter((op) => op === "recordings.transcribe")).toHaveLength(1);
    f.setFail(false);
    await f.service.invoke({ operation: "transcription.retry" });
    await f.service.waitForIdle();
    expect(f.preferences().pendingTranscriptions).toEqual([]);
    expect(f.calls).not.toContain("recordings.delete");
    await f.service.close();
  });
});
