// @effect-diagnostics nodeBuiltinImport:off -- Native integration fixture owns disposable files and a captured child process.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { TalkService } from "./TalkService.ts";
import { TalkWorkerClient } from "./TalkWorkerClient.ts";

it.skipIf(!process.env.PULSE_TALK_TEST_WORKER)(
  "reads real native audio-only recordings without a model or dictation opt-in",
  async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-capture-test-"));
    const id = "60000000-0000-4000-8000-000000000001";
    const folder = NodePath.join(root, "recordings", id);
    await NodeFSP.mkdir(folder, { recursive: true });
    const audioPath = NodePath.join(folder, "audio.wav");
    await NodeFSP.writeFile(audioPath, Buffer.alloc(44));
    await NodeFSP.writeFile(
      NodePath.join(folder, "recording.json"),
      JSON.stringify({
        id,
        title: "Synthetic saved audio",
        startedAt: "2026-09-09T12:00:00Z",
        durationSeconds: 0,
        audioPath,
        transcript: null,
        status: "recorded",
        sources: { microphone: true, systemAudio: true },
      }),
    );
    const service = new TalkService({
      createWorker: () =>
        new TalkWorkerClient({ executable: process.env.PULSE_TALK_TEST_WORKER!, dataDir: root }),
      workerAvailable: async () => true,
      readEnabled: async () => false,
      writeEnabled: async () => {},
      chooseModel: async () => null,
      openAudio: async () => {},
    });
    try {
      expect(await service.invoke({ operation: "recordings.list" })).toMatchObject({
        ok: true,
        recordings: [{ id, status: "recorded", transcript: null }],
        status: { enabled: false, recording: false, modelLoaded: false },
      });
      expect(await service.invoke({ operation: "recordings.get", id })).toMatchObject({
        ok: true,
        recording: { id, transcript: null },
      });
    } finally {
      await service.close();
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  },
);
