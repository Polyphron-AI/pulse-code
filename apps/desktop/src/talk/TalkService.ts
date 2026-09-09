// @effect-diagnostics globalTimers:off - Main-process microphone safety timeout; cleared on stop and shutdown.
import * as Schema from "effect/Schema";
import {
  TalkRecording,
  TalkDictation,
  TalkRequest,
  TalkResult,
  type TalkStatus,
  type TalkModelStatus,
  type TalkPreferences,
} from "../../../../packages/contracts/src/talk.ts";

type TalkServiceOptions = {
  createWorker(): Worker;
  workerAvailable(): Promise<boolean>;
  readEnabled(): Promise<boolean>;
  writeEnabled(enabled: boolean): Promise<void>;
  readPreferences?(): Promise<TalkPreferences>;
  writePreferences?(preferences: TalkPreferences): Promise<void>;
  chooseModel(): Promise<string | null>;
  openAudio(path: string): Promise<void>;
  dictation?: {
    register(callback: () => void): boolean;
    unregister(): void;
    showActive(active: boolean): void;
    history(): Promise<readonly TalkDictation[]>;
  };
  models?: {
    status(): Promise<TalkModelStatus>;
    startDownload(input: { consent: true }): Promise<TalkModelStatus>;
    cancel(): Promise<void>;
    remove(): Promise<void>;
    installedPath(): Promise<string | null>;
    close(): Promise<void>;
    waitForIdle?(): Promise<void>;
  };
};

type Worker = {
  running: boolean;
  request(op: string, args?: object): Promise<unknown>;
  close(): Promise<void>;
};
const NativeStatus = Schema.Struct({
  recording: Schema.Boolean,
  modelLoaded: Schema.Boolean,
  capabilities: Schema.Struct({
    microphone: Schema.Boolean,
    systemAudio: Schema.Boolean,
    dictationDelivery: Schema.Boolean,
    parakeet: Schema.Boolean,
  }),
});
const RecordedList = Schema.Struct({ recordings: Schema.Array(TalkRecording) });

const decodeNativeStatus = Schema.decodeUnknownSync(NativeStatus);

const decodeTalkRequest = Schema.decodeUnknownSync(TalkRequest);

const decodeTalkResult = Schema.decodeUnknownSync(TalkResult);

const decodeRecordedList = Schema.decodeUnknownSync(RecordedList);

const decodeTalkRecording = Schema.decodeUnknownSync(TalkRecording);

const decodeAudioPath = Schema.decodeUnknownSync(Schema.Struct({ path: Schema.String }));
const decodeRecordingId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }));
const decodeDictation = Schema.decodeUnknownSync(
  Schema.Union([TalkDictation, Schema.Struct({ cancelled: Schema.Literal(true) })]),
);

export class TalkService {
  private worker: Worker | undefined;
  private everyMeeting = false;
  private pendingTranscriptions: string[] = [];
  private transcribingId: string | null = null;
  private preparationError: string | null = null;
  private transcriptionError: string | null = null;
  private background: Promise<void> | undefined;
  private downloadCompletion: Promise<void> | undefined;
  private shortcutRegistered = false;
  private enabled = false;
  private initialized = false;
  private closing = false;
  private mutation: Promise<unknown> = Promise.resolve();
  private operationActive = false;
  private draftDictation:
    | { sessionId: string; recordingId: string; timer: ReturnType<typeof setTimeout> }
    | undefined;
  private dictationEnabled = false;
  private dictationActive = false;
  private dictationError: string | null = null;
  private dictationTask: Promise<void> | undefined;
  private nativeStatus: typeof NativeStatus.Type | null = null;

  private readonly options: TalkServiceOptions;
  constructor(options: TalkServiceOptions) {
    this.options = options;
  }

  private async status(): Promise<TalkStatus> {
    const native =
      this.dictationActive || this.background
        ? this.nativeStatus
        : this.worker?.running
          ? decodeNativeStatus(await this.worker.request("status"))
          : null;
    this.nativeStatus = native;
    return {
      enabled: this.enabled,
      everyMeeting: this.everyMeeting,
      pendingTranscriptions: [...this.pendingTranscriptions],
      transcribingId: this.transcribingId,
      preparationError: this.preparationError,
      transcriptionError: this.transcriptionError,
      running: this.worker?.running ?? false,
      workerAvailable: await this.options.workerAvailable(),
      dictation: {
        enabled: this.dictationEnabled,
        active: this.dictationActive,
        lastError: this.dictationError,
      },
      recording: native?.recording ?? false,
      modelLoaded: native?.modelLoaded ?? false,
      capabilities: native?.capabilities ?? {
        microphone: false,
        systemAudio: false,
        dictationDelivery: false,
        parakeet: false,
      },
    };
  }

  async invoke(raw: TalkRequest): Promise<TalkResult> {
    const request = decodeTalkRequest(raw);
    // Status remains readable while native inference occupies the worker.
    if (this.initialized && request.operation === "status" && this.background)
      return { ok: true, status: await this.status() };
    // Mutations serialize so disable cannot race start or inference and lose a recording.
    const action = this.mutation
      .catch(() => undefined)
      .then(async () => {
        this.operationActive = true;
        try {
          return await this.handle(request);
        } finally {
          this.operationActive = false;
        }
      });
    this.mutation = action;
    try {
      const result = decodeTalkResult(await action);
      this.scheduleProcessing();
      return result;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "talk_failed",
          message:
            error instanceof Error ? error.message : "Talk could not complete this operation.",
        },
      };
    }
  }

  private async handle(request: TalkRequest): Promise<TalkResult> {
    if (!this.initialized) {
      const preferences = await this.options.readPreferences?.();
      this.enabled = preferences?.enabled ?? (await this.options.readEnabled());
      this.dictationEnabled = this.enabled;
      this.everyMeeting = preferences?.everyMeeting ?? false;
      this.pendingTranscriptions = [...(preferences?.pendingTranscriptions ?? [])];
      this.initialized = true;
    }
    if (this.closing) throw new Error("Talk is shutting down.");
    if (request.operation === "status") return { ok: true, status: await this.status() };
    if (request.operation === "dictation.history") {
      return { ok: true, dictations: (await this.options.dictation?.history()) ?? [] };
    }
    if (request.operation === "models.status") {
      if (!this.options.models) throw new Error("Model setup is unavailable in this build.");
      return { ok: true, model: await this.options.models.status() };
    }
    if (
      request.operation === "draftDictation.stop" ||
      request.operation === "draftDictation.cancel"
    ) {
      const draft = this.draftDictation;
      if (!draft || draft.sessionId !== request.sessionId)
        throw new Error("This draft does not own the active microphone recording.");
      clearTimeout(draft.timer);
      const recording = decodeTalkRecording(await this.worker!.request("recordings.stop"));
      this.draftDictation = undefined;
      if (recording.id !== draft.recordingId)
        throw new Error("Recording changed. Recover your transcript from Talk history.");
      if (request.operation === "draftDictation.cancel") return { ok: true, cancelled: true };
      const transcribed = decodeTalkRecording(
        await this.worker!.request("recordings.transcribe", { id: draft.recordingId }),
      );
      return { ok: true, recording: transcribed };
    }
    if (this.draftDictation)
      throw new Error(
        "Finish dictation in the thread before changing Talk settings or recordings.",
      );
    if (request.operation === "draftDictation.start") {
      const status = await this.status();
      if (!this.enabled || !status.modelLoaded || !status.capabilities.microphone)
        throw new Error("Enable dictation and load Parakeet in Settings > Dictation first.");
      if (status.recording || this.dictationActive || this.background)
        throw new Error("Talk is busy. Finish the current recording or transcription first.");
      if (!(await this.options.workerAvailable()))
        throw new Error("The Talk worker is unavailable.");
      if (this.closing) throw new Error("Talk is shutting down.");
      this.worker ??= this.options.createWorker();
      const recording = decodeRecordingId(
        await this.worker.request("recordings.start", {
          title: "Thread dictation",
          microphone: true,
          systemAudio: false,
        }),
      );
      const timer = setTimeout(() => {
        void this.invoke({ operation: "draftDictation.cancel", sessionId: request.sessionId });
      }, 120_000);
      timer.unref?.();
      this.draftDictation = { sessionId: request.sessionId, recordingId: recording.id, timer };
      return { ok: true };
    }
    if (this.dictationActive)
      throw new Error("Release the dictation shortcut and wait for transcription to finish.");
    if (request.operation === "dictation.enable" || request.operation === "enable") {
      this.enabled = request.enabled;
      this.dictationEnabled = request.enabled;
      this.preparationError = null;
      this.dictationError = null;
      if (!request.enabled) {
        this.disableDictation();
        if (!(await this.status()).recording && this.pendingTranscriptions.length === 0) {
          await this.worker?.close();
          this.worker = undefined;
          this.nativeStatus = null;
        }
      }
      await this.savePreferences();
      return { ok: true, status: await this.status() };
    }
    if (request.operation === "meetings.configure") {
      this.everyMeeting = request.everyMeeting;
      await this.savePreferences();
      return { ok: true, status: await this.status() };
    }
    if (request.operation === "transcription.retry") {
      this.preparationError = null;
      this.transcriptionError = null;
      return { ok: true, status: await this.status() };
    }
    if (request.operation === "transcription.cancel") {
      this.pendingTranscriptions = this.pendingTranscriptions.filter((id) => id !== request.id);
      if (this.pendingTranscriptions.length === 0) this.transcriptionError = null;
      await this.savePreferences();
      return { ok: true, status: await this.status() };
    }
    if (
      request.operation === "models.download" ||
      request.operation === "models.cancel" ||
      request.operation === "models.remove"
    ) {
      const models = this.options.models;
      if (!models) throw new Error("Model setup is unavailable in this build.");
      if (request.operation === "models.download") {
        this.preparationError = null;
        const model = await models.startDownload({ consent: request.consent });
        this.downloadCompletion = models.waitForIdle?.().then(async () => {
          await this.background;
          this.scheduleProcessing();
        });
        return { ok: true, model };
      }
      if (request.operation === "models.cancel") await models.cancel();
      if (request.operation === "models.remove") {
        const current = await this.status();
        if (current.recording)
          throw new Error("Stop and save the recording before removing Parakeet.");
        this.disableDictation();
        this.dictationEnabled = this.enabled;
        await this.worker?.close();
        this.worker = undefined;
        this.nativeStatus = null;
        await models.remove();
      }
      return { ok: true, model: await models.status() };
    }
    if (!(await this.options.workerAvailable()))
      throw new Error("The Talk native worker is missing from this installation.");
    if (this.closing) throw new Error("Talk is shutting down.");
    this.worker ??= this.options.createWorker();
    switch (request.operation) {
      case "recordings.list":
        return {
          ok: true,
          recordings: decodeRecordedList(await this.worker.request(request.operation)).recordings,
          status: await this.status(),
        };
      case "recordings.start": {
        if (!this.enabled && !request.transcribeWhenReady)
          throw new Error("Turn on capture for this meeting before recording.");
        const started = await this.worker.request(request.operation, {
          title: request.title.trim() || "Untitled meeting",
          microphone: request.microphone ?? true,
          systemAudio: request.systemAudio ?? false,
        });
        if (request.transcribeWhenReady ?? this.everyMeeting) {
          const { id } = decodeRecordingId(started);
          if (!this.pendingTranscriptions.includes(id)) this.pendingTranscriptions.push(id);
          await this.savePreferences();
        }
        return { ok: true, status: await this.status() };
      }
      case "recordings.stop":
      case "recordings.get":
      case "recordings.transcribe": {
        if (request.operation === "recordings.transcribe" && !(await this.status()).modelLoaded)
          throw new Error(
            "Transcription is waiting for Parakeet. Download it in Settings > Dictation.",
          );
        const recording = decodeTalkRecording(
          await this.worker.request(request.operation, "id" in request ? { id: request.id } : {}),
        );
        if (request.operation === "recordings.transcribe") {
          this.pendingTranscriptions = this.pendingTranscriptions.filter((id) => id !== request.id);
          await this.savePreferences();
        }
        return { ok: true, recording, status: await this.status() };
      }
      case "recordings.delete":
        await this.worker.request(request.operation, { id: request.id });
        this.pendingTranscriptions = this.pendingTranscriptions.filter((id) => id !== request.id);
        if (this.pendingTranscriptions.length === 0) this.transcriptionError = null;
        await this.savePreferences();
        return { ok: true };
      case "recordings.open": {
        const { path } = decodeAudioPath(
          await this.worker.request(request.operation, { id: request.id }),
        );
        await this.options.openAudio(path);
        return { ok: true };
      }
      case "model.choose": {
        const path = await this.options.chooseModel();
        if (!path) return { ok: true, cancelled: true };
        if (this.closing) throw new Error("Talk is shutting down.");
        await this.worker.request("model.load", { path, quantized: true });
        return { ok: true, status: await this.status() };
      }
      case "models.load": {
        const path = await this.options.models?.installedPath();
        if (!path) throw new Error("Download and verify the model before loading it.");
        if (this.closing) throw new Error("Talk is shutting down.");
        await this.worker.request("model.load", { path, quantized: true });
        return { ok: true, status: await this.status() };
      }
    }
  }

  private async savePreferences() {
    if (this.options.writePreferences)
      await this.options.writePreferences({
        enabled: this.enabled,
        everyMeeting: this.everyMeeting,
        pendingTranscriptions: [...this.pendingTranscriptions],
      });
    else await this.options.writeEnabled(this.enabled);
  }

  private scheduleProcessing() {
    if (
      this.closing ||
      this.background ||
      this.dictationActive ||
      this.draftDictation ||
      this.nativeStatus?.recording ||
      this.preparationError ||
      (!this.enabled && this.pendingTranscriptions.length === 0)
    )
      return;
    const task = this.mutation
      .catch(() => undefined)
      .then(async () => {
        if (
          this.closing ||
          this.dictationActive ||
          this.draftDictation ||
          this.nativeStatus?.recording
        )
          return;
        if (!this.nativeStatus?.modelLoaded) {
          if ((await this.options.models?.status())?.state !== "installed") return;
          const path = await this.options.models?.installedPath();
          if (!path || this.closing) return;
          if (!(await this.options.workerAvailable()) || this.closing) return;
          this.worker ??= this.options.createWorker();
          await this.worker.request("model.load", { path, quantized: true });
          this.nativeStatus = decodeNativeStatus(await this.worker.request("status"));
        }
        if (
          this.enabled &&
          this.nativeStatus?.capabilities.dictationDelivery &&
          !this.shortcutRegistered
        ) {
          this.shortcutRegistered =
            this.options.dictation?.register(() => this.beginDictation()) ?? false;
          this.dictationError = this.shortcutRegistered
            ? null
            : "Ctrl+Shift+Space is unavailable. Release it in the other app, then turn dictation off and on.";
        }
        if (this.transcriptionError || !this.worker || !this.nativeStatus?.modelLoaded) return;
        while (this.pendingTranscriptions.length > 0 && !this.closing) {
          const id = this.pendingTranscriptions[0]!;
          this.transcribingId = id;
          try {
            const recording = decodeTalkRecording(
              await this.worker.request("recordings.get", { id }),
            );
            if (recording.status === "recording") return;
            // A crash after native save must not transcribe the same recording twice.
            if (recording.status !== "transcribed")
              decodeTalkRecording(await this.worker.request("recordings.transcribe", { id }));
            this.pendingTranscriptions = this.pendingTranscriptions.filter(
              (pending) => pending !== id,
            );
            await this.savePreferences();
          } catch (error) {
            this.transcriptionError =
              error instanceof Error ? error.message : "Transcription failed. Retry when ready.";
            break;
          } finally {
            this.transcribingId = null;
          }
        }
      })
      .catch((error: unknown) => {
        this.preparationError =
          error instanceof Error
            ? error.message
            : "Parakeet could not be prepared. Retry in Settings > Dictation.";
      })
      .finally(() => {
        this.background = undefined;
      });
    this.background = task;
    this.mutation = task;
  }

  /** Wait for owned jobs in tests and shutdown without timers or polling. */
  async waitForIdle() {
    await this.downloadCompletion;
    await this.background;
    await this.mutation;
  }

  private disableDictation() {
    this.options.dictation?.unregister();
    this.dictationEnabled = false;
    this.shortcutRegistered = false;
  }

  private beginDictation() {
    if (!this.dictationEnabled || this.dictationActive || this.draftDictation || this.closing)
      return;
    if (
      this.operationActive ||
      this.background ||
      !this.worker?.running ||
      this.nativeStatus?.recording
    ) {
      this.dictationError =
        "Talk is busy or stopped. Finish the current operation, then hold the shortcut again.";
      return;
    }
    this.dictationActive = true;
    this.dictationError = null;
    // Send before showing the non-focusing indicator so the worker captures the original target.
    const result = this.worker.request("dictation.hold");
    this.options.dictation?.showActive(true);
    this.dictationTask = (async () => {
      try {
        const record = decodeDictation(await result);
        if ("delivered" in record)
          this.dictationError =
            record.error ??
            (record.delivered
              ? null
              : "Text was saved in dictation history, but could not be pasted.");
      } catch (error) {
        this.dictationError =
          error instanceof Error ? error.message : "Dictation failed. Check saved history.";
      } finally {
        this.dictationActive = false;
        this.options.dictation?.showActive(false);
      }
    })();
  }

  async close() {
    if (this.draftDictation) {
      clearTimeout(this.draftDictation.timer);
      await this.invoke({
        operation: "draftDictation.cancel",
        sessionId: this.draftDictation.sessionId,
      });
    }
    this.closing = true;
    this.disableDictation();
    this.options.dictation?.showActive(false);
    await this.options.models?.close();
    await this.worker?.close();
    await this.dictationTask;
    await this.mutation.catch(() => undefined);
    await this.worker?.close();
    this.worker = undefined;
  }
}
