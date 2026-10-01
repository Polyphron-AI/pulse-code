// @effect-diagnostics nodeBuiltinImport:off -- The desktop shell owns the pulse-voice child process.

import * as NodeChildProcess from "node:child_process";

import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type DesktopVoiceDevices,
  type DesktopVoiceEvent,
  type DesktopVoiceMeetingStarted,
  type DesktopVoiceMeetingStopped,
  type DesktopVoiceState,
  type DesktopVoiceTranscribeInput,
  type DesktopVoiceTranscript,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Electron from "electron";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as IpcChannels from "../ipc/channels.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import { DictationFlow, type DictationPhase } from "./DictationFlow.ts";
import type { PulseVoiceClient, PulseVoiceEvent } from "./PulseVoiceClient.ts";
import {
  PulseVoiceSupervisor,
  type PulseVoiceChild,
  type PulseVoiceSupervisorStatus,
} from "./PulseVoiceSupervisor.ts";
import { VoicePill } from "./VoicePill.ts";

export class DesktopVoiceError extends Schema.TaggedError<DesktopVoiceError>()(
  "DesktopVoiceError",
  { operation: Schema.String, reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

export class DesktopVoice extends Context.Service<
  DesktopVoice,
  {
    readonly initialize: Effect.Effect<void>;
    readonly configure: (settings: ClientSettings) => Effect.Effect<void>;
    readonly state: Effect.Effect<DesktopVoiceState>;
    readonly listDevices: Effect.Effect<DesktopVoiceDevices, DesktopVoiceError>;
    /** Transcribe renderer-recorded audio with the native Parakeet engine. */
    readonly transcribe: (
      input: DesktopVoiceTranscribeInput,
    ) => Effect.Effect<DesktopVoiceTranscript, DesktopVoiceError>;
    readonly startMeeting: Effect.Effect<DesktopVoiceMeetingStarted, DesktopVoiceError>;
    readonly stopMeeting: Effect.Effect<DesktopVoiceMeetingStopped, DesktopVoiceError>;
  }
>()("@t3tools/desktop/voice/DesktopVoice") {}

const ESCAPE_ACCELERATOR = "Escape";

function errorReason(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The voice engine failed.";
}

function voiceStatus(
  status: PulseVoiceSupervisorStatus,
): Pick<DesktopVoiceState, "status" | "message"> {
  switch (status.kind) {
    case "stopped":
    case "starting":
      return { status: status.kind, message: null };
    case "ready":
      return { status: "ready", message: null };
    default:
      return { status: "unavailable", message: status.message };
  }
}

const unsupported = (operation: string) =>
  new DesktopVoiceError({ operation, reason: "Voice is only available on Windows." });

const makeUnsupported = DesktopVoice.of({
  initialize: Effect.void,
  configure: () => Effect.void,
  state: Effect.succeed({
    status: "unsupported",
    message: null,
    dictation: "idle",
    meetingSessionId: null,
  }),
  listDevices: Effect.fail(unsupported("list-devices")),
  transcribe: () => Effect.fail(unsupported("transcribe")),
  startMeeting: Effect.fail(unsupported("start-meeting")),
  stopMeeting: Effect.fail(unsupported("stop-meeting")),
});

const optionalEnv = (name: string) =>
  Effect.gen(function* () {
    return yield* Config.string(name).pipe(Config.option);
  }).pipe(
    Effect.map(Option.filter((value) => value.trim().length > 0)),
    Effect.orElseSucceed(() => Option.none<string>()),
  );

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  if (environment.platform !== "win32") return makeUnsupported;

  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const path = yield* Path.Path;
  const runFork = Effect.runForkWith(yield* Effect.context<ElectronWindow.ElectronWindow>());

  // The sidecar must read the model from disk, so packaged builds unpack it
  // from server.asar (see build-desktop-artifact.ts).
  const binaryPath = environment.isPackaged
    ? path.join(environment.resourcesPath, "pulse-voice", "pulse-voice.exe")
    : Option.getOrElse(yield* optionalEnv("PULSE_VOICE_BIN"), () =>
        path.join(environment.appRoot, "apps/desktop/.pulse-voice/pulse-voice.exe"),
      );
  const modelDir = environment.isPackaged
    ? path.join(
        `${environment.serverRoot}.unpacked`,
        path.relative(environment.serverRoot, environment.clientAssetsDir),
        "parakeet-model",
      )
    : Option.getOrElse(yield* optionalEnv("PULSE_VOICE_MODEL_DIR"), () =>
        path.join(environment.clientAssetsDir, "parakeet-model"),
      );

  let settings: ClientSettings = DEFAULT_CLIENT_SETTINGS;
  let dictation: DictationPhase = "idle";
  let meetingSessionId: string | null = null;
  let escapeRegistered = false;

  const currentState = (): DesktopVoiceState => ({
    ...voiceStatus(supervisor.status),
    dictation,
    meetingSessionId,
  });
  const emit = (event: DesktopVoiceEvent) => {
    runFork(electronWindow.sendAll(IpcChannels.VOICE_EVENT_CHANNEL, event));
  };
  const publishState = () => emit({ type: "state", state: currentState() });
  const log = (line: string) => {
    runFork(Effect.logDebug(`pulse-voice: ${line}`));
  };

  const pill = new VoicePill(environment.platform);

  const applyHotkey = (client: PulseVoiceClient) =>
    client.request(
      "hotkey.set",
      settings.voiceGlobalDictationEnabled
        ? { keys: [...settings.voiceDictationShortcut], mode: settings.voiceDictationMode }
        : null,
    );

  const setEscape = (active: boolean) => {
    if (active === escapeRegistered) return;
    if (active) {
      escapeRegistered = Electron.globalShortcut.register(ESCAPE_ACCELERATOR, () => {
        void flow.cancel();
      });
    } else {
      Electron.globalShortcut.unregister(ESCAPE_ACCELERATOR);
      escapeRegistered = false;
    }
  };

  const endMeeting = (message: string) => {
    if (meetingSessionId === null) return;
    const sessionId = meetingSessionId;
    meetingSessionId = null;
    emit({ type: "meeting-error", sessionId, message });
  };

  const handleEvent = (event: PulseVoiceEvent) => {
    switch (event.event) {
      case "hotkey":
        if (!settings.voiceGlobalDictationEnabled) return;
        if (event.data.phase === "down") flow.hotkeyDown();
        else flow.hotkeyUp();
        return;
      case "level":
        if (event.data.capture === "dictation") flow.level(event.data.rms);
        return;
      case "meeting.segment":
        emit({ type: "meeting-segment", segment: event.data });
        return;
      case "capture.error":
        if (event.data.capture === "dictation") flow.captureFailed(event.data.message);
        else {
          endMeeting(event.data.message);
          publishState();
        }
        return;
      default:
        return;
    }
  };

  const supervisor: PulseVoiceSupervisor = new PulseVoiceSupervisor({
    spawn: () =>
      NodeChildProcess.spawn(binaryPath, [], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }) as PulseVoiceChild,
    onStatus: (status) => {
      if (status.kind !== "ready" && status.kind !== "starting") {
        endMeeting("The voice engine stopped during the meeting.");
      }
      publishState();
    },
    onEvent: handleEvent,
    onStarted: async (client) => {
      await client.request("model.load", { modelDir });
      await applyHotkey(client);
    },
    onLog: log,
  });

  const client = () => supervisor.ensure();

  const flow: DictationFlow = new DictationFlow({
    mode: () => settings.voiceDictationMode,
    workArea: async () => (await (await client()).request("foreground.monitor")).workArea,
    start: async () => {
      await (
        await client()
      ).request(
        "dictation.start",
        settings.voiceInputDeviceId ? { inputDeviceId: settings.voiceInputDeviceId } : {},
      );
    },
    stop: async () => (await client()).request("dictation.stop"),
    cancel: async () => {
      await supervisor.running?.request("dictation.cancel");
    },
    insert: async (text) => {
      await (await client()).request("text.insert", { text, restoreClipboard: true });
    },
    pill: {
      show: (workArea, state) =>
        settings.voicePillEnabled ? pill.show(workArea, state) : Promise.resolve(),
      update: (state) => pill.update(state),
      hide: () => pill.hide(),
    },
    onPhase: (phase) => {
      dictation = phase;
      setEscape(phase !== "idle");
      publishState();
    },
    onError: (message) => log(`dictation failed: ${message}`),
  });

  const request = <A>(operation: string, run: (client: PulseVoiceClient) => Promise<A>) =>
    Effect.tryPromise({
      try: async () => run(await client()),
      catch: (error) => new DesktopVoiceError({ operation, reason: errorReason(error) }),
    });

  const configure = Effect.fn("desktop.voice.configure")(function* (next: ClientSettings) {
    const wasEnabled = settings.voiceGlobalDictationEnabled;
    settings = next;
    const enabled = next.voiceGlobalDictationEnabled;
    if (!enabled && dictation !== "idle") yield* Effect.promise(() => flow.cancel());
    if (enabled && !wasEnabled) {
      // Turning dictation on is the explicit retry after repeated crashes.
      supervisor.resetCrashes();
      if (next.voicePillEnabled) void pill.prepare();
    }
    supervisor.setKeepAlive(enabled);
    if (enabled && supervisor.status.kind === "failed") void client().catch(() => undefined);
    const running = supervisor.running;
    if (running) yield* Effect.promise(() => applyHotkey(running).catch(() => undefined));
    // The model holds about 700 MB; release it when nothing needs it.
    if (!enabled && wasEnabled && meetingSessionId === null) {
      yield* Effect.promise(() => supervisor.stop());
    }
  });

  yield* Effect.addFinalizer(() =>
    Effect.promise(async () => {
      setEscape(false);
      await flow.cancel();
      await supervisor.stop();
      pill.dispose();
    }),
  );

  return DesktopVoice.of({
    initialize: clientSettings.get.pipe(
      Effect.map(Option.getOrElse(() => DEFAULT_CLIENT_SETTINGS)),
      Effect.orElseSucceed(() => DEFAULT_CLIENT_SETTINGS),
      Effect.flatMap(configure),
    ),
    configure,
    state: Effect.sync(currentState),
    listDevices: request("list-devices", (client) => client.request("devices.list")),
    transcribe: (input) =>
      request("transcribe", async (client) => {
        const transcript = await client.request("transcribe", {
          pcm16: Encoding.encodeBase64(input.pcm16),
          sampleRate: input.sampleRate,
        });
        return { text: transcript.text };
      }),
    startMeeting: Effect.suspend(() =>
      meetingSessionId !== null
        ? Effect.fail(
            new DesktopVoiceError({
              operation: "start-meeting",
              reason: "A meeting is already recording.",
            }),
          )
        : request("start-meeting", async (client) => {
            const started = await client.request("meeting.start", {
              ...(settings.voiceInputDeviceId
                ? { inputDeviceId: settings.voiceInputDeviceId }
                : {}),
              systemAudio: settings.voiceMeetingSystemAudio,
            });
            meetingSessionId = started.sessionId;
            publishState();
            return started;
          }),
    ),
    stopMeeting: Effect.suspend(() =>
      meetingSessionId === null
        ? Effect.fail(
            new DesktopVoiceError({
              operation: "stop-meeting",
              reason: "No meeting is recording.",
            }),
          )
        : request("stop-meeting", async (client) => {
            const stopped = await client.request("meeting.stop");
            meetingSessionId = null;
            publishState();
            return stopped;
          }),
    ),
  });
});

export const layer = Layer.effect(DesktopVoice, make);
