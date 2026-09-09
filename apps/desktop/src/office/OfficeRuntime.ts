// @effect-diagnostics nodeBuiltinImport:off -- Electron callback adapter owns native filesystem and process resource paths.
import { app, dialog, globalShortcut, ipcMain, safeStorage, shell } from "electron";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as Schema from "effect/Schema";
import { OfficeRequest, OfficeResult } from "../../../../packages/contracts/src/office.ts";
import {
  TalkRequest,
  TalkResult,
  TalkPreferences,
} from "../../../../packages/contracts/src/talk.ts";
import { OfficeService } from "./OfficeService.ts";
import { encryptedOfficeStorage } from "./EncryptedOfficeStorage.ts";
import { TalkWorkerClient } from "../talk/TalkWorkerClient.ts";
import { TalkService } from "../talk/TalkService.ts";
import { TalkModelStore } from "../talk/TalkModelStore.ts";
import { readDictationHistory } from "../talk/TalkDictationHistory.ts";
import { createDictationIndicator } from "../talk/TalkDictationIndicator.ts";
import { loadOfficeOAuthConfiguration } from "./OfficeOAuthConfig.ts";
import { recordingAudioPath } from "../talk/TalkAudioPath.ts";

const decodeOfficeRequest = Schema.decodeUnknownSync(OfficeRequest);

const decodeOfficeResult = Schema.decodeUnknownSync(OfficeResult);

const decodeTalkRequest = Schema.decodeUnknownSync(TalkRequest);

const decodeTalkResult = Schema.decodeUnknownSync(TalkResult);

const decodePreferences = Schema.decodeUnknownSync(TalkPreferences);

export function isTrustedOfficeFrame(url: string, mainFrame: boolean, scheme: string) {
  if (!mainFrame) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${scheme}:` && parsed.hostname === "app";
  } catch {
    return false;
  }
}

export async function installOfficeRuntime(options: {
  stateDir: string;
  scheme: string;
  platform: string;
}) {
  let oauthError: string | undefined;
  const oauth = await loadOfficeOAuthConfiguration({
    resourcesDirectory: process.resourcesPath,
  }).catch((error: unknown) => {
    oauthError =
      error instanceof Error
        ? error.message
        : "Office OAuth registration configuration could not be read.";
    return {};
  });
  const office = new OfficeService({
    storage: encryptedOfficeStorage(NodePath.join(options.stateDir, "office", "accounts.bin"), {
      available: () =>
        safeStorage.isEncryptionAvailable() &&
        (options.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(Buffer.from(value)),
    }),
    openExternal: (url) => shell.openExternal(url),
    oauth,
  });
  const dataDir = NodePath.join(options.stateDir, "talk");
  const workerPath =
    !app.isPackaged && process.env.PULSE_TALK_WORKER
      ? NodePath.resolve(process.env.PULSE_TALK_WORKER)
      : NodePath.join(
          process.resourcesPath,
          "talk",
          options.platform === "win32" ? "pulse-talk-worker.exe" : "pulse-talk-worker",
        );
  const preferencesPath = NodePath.join(dataDir, "preferences.json");
  const talk = new TalkService({
    dictation: {
      register: (callback) => globalShortcut.register("Control+Shift+Space", callback),
      unregister: () => globalShortcut.unregister("Control+Shift+Space"),
      showActive: createDictationIndicator(),
      history: () => readDictationHistory(dataDir),
    },
    models: new TalkModelStore({ directory: NodePath.join(dataDir, "models") }),
    createWorker: () => new TalkWorkerClient({ executable: workerPath, dataDir }),
    workerAvailable: () =>
      NodeFSP.access(workerPath).then(
        () => true,
        () => false,
      ),
    readEnabled: async () => false,
    writeEnabled: async () => undefined,
    readPreferences: async () => {
      try {
        return decodePreferences(JSON.parse(await NodeFSP.readFile(preferencesPath, "utf8")));
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT")
          return { enabled: false };
        // oxlint-disable-next-line preserve-caught-error -- Only the sanitized settings failure crosses IPC.
        throw new Error("Talk settings could not be read.");
      }
    },
    writePreferences: async (preferences) => {
      await NodeFSP.mkdir(dataDir, { recursive: true });
      await NodeFSP.writeFile(`${preferencesPath}.tmp`, JSON.stringify(preferences), {
        mode: 0o600,
      });
      await NodeFSP.rename(`${preferencesPath}.tmp`, preferencesPath);
    },
    chooseModel: async () => {
      const selected = await dialog.showOpenDialog({
        title: "Choose an installed Parakeet model folder",
        properties: ["openDirectory"],
      });
      return selected.canceled ? null : (selected.filePaths[0] ?? null);
    },
    openAudio: async (audioPath) => {
      const error = await shell.openPath(recordingAudioPath(dataDir, audioPath, options.platform));
      if (error) throw new Error("The saved recording could not be opened.");
    },
  });
  const denied = {
    ok: false,
    error: { code: "invalid_request", message: "This request is not available from this window." },
  } as const;
  ipcMain.handle("pulse:office", async (event, raw: unknown) => {
    if (
      !isTrustedOfficeFrame(
        event.senderFrame?.url ?? "",
        event.senderFrame === event.sender.mainFrame,
        options.scheme,
      )
    )
      return denied;
    let request: OfficeRequest;
    try {
      request = decodeOfficeRequest(raw);
    } catch {
      return denied;
    }
    if (oauthError && request.operation === "accounts.connectOAuth")
      return { ok: false, error: { code: "setup_required", message: oauthError } };
    return decodeOfficeResult(await office.invoke(request));
  });
  ipcMain.handle("pulse:talk", async (event, raw: unknown) => {
    if (
      !isTrustedOfficeFrame(
        event.senderFrame?.url ?? "",
        event.senderFrame === event.sender.mainFrame,
        options.scheme,
      )
    )
      return denied;
    let request: TalkRequest;
    try {
      request = decodeTalkRequest(raw);
    } catch {
      return denied;
    }
    return decodeTalkResult(await talk.invoke(request));
  });
  // Restore opted-in dictation and queued transcripts without starting capture.
  await talk.invoke({ operation: "status" });
  return {
    async close() {
      ipcMain.removeHandler("pulse:office");
      ipcMain.removeHandler("pulse:talk");
      await Promise.allSettled([talk.close(), office.close()]);
    },
  };
}
