import * as Schema from "effect/Schema";
import {
  TalkRecording,
  TalkDictation,
  TalkRequest,
  TalkResult,
  type TalkStatus,
  type TalkModelStatus,
} from "../../../../packages/contracts/src/talk.ts";

type TalkServiceOptions = {
  createWorker(): Worker;
  workerAvailable(): Promise<boolean>;
  readEnabled(): Promise<boolean>;
  writeEnabled(enabled: boolean): Promise<void>;
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
const decodeDictation = Schema.decodeUnknownSync(
  Schema.Union([TalkDictation, Schema.Struct({ cancelled: Schema.Literal(true) })]),
);

export class TalkService {
  private worker: Worker | undefined;
  private enabled = false;
  private initialized = false;
  private closing = false;
  private mutation: Promise<unknown> = Promise.resolve();
  private operationActive = false;
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
    const native = this.dictationActive
      ? this.nativeStatus
      : this.worker?.running
        ? decodeNativeStatus(await this.worker.request("status"))
        : null;
    this.nativeStatus = native;
    return {
      enabled: this.enabled,
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
      return decodeTalkResult(await action);
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
      this.enabled = await this.options.readEnabled();
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
    if (this.dictationActive)
      throw new Error("Release the dictation shortcut and wait for transcription to finish.");
    if (request.operation === "dictation.enable") {
      if (!request.enabled) this.disableDictation();
      else {
        const current = await this.status();
        if (!this.enabled || !current.modelLoaded || !current.capabilities.dictationDelivery)
          throw new Error("Enable Talk and load its model before enabling dictation.");
        if (!this.options.dictation) throw new Error("Dictation is unavailable in this build.");
        if (!this.dictationEnabled && !this.options.dictation.register(() => this.beginDictation()))
          throw new Error(
            "Ctrl+Shift+Space is already in use. Release that shortcut in the other app and try again.",
          );
        this.dictationEnabled = true;
        this.dictationError = null;
      }
      return { ok: true, status: await this.status() };
    }
    if (request.operation === "enable") {
      if (!request.enabled && this.worker?.running) {
        if ((await this.status()).recording)
          throw new Error("Stop and save the recording before disabling Talk.");
        this.disableDictation();
        await this.worker.close();
        this.worker = undefined;
      }
      if (!request.enabled) this.disableDictation();
      await this.options.writeEnabled(request.enabled);
      this.enabled = request.enabled;
      return { ok: true, status: await this.status() };
    }
    if (
      request.operation === "models.download" ||
      request.operation === "models.cancel" ||
      request.operation === "models.remove"
    ) {
      const models = this.options.models;
      if (!models) throw new Error("Model setup is unavailable in this build.");
      if (request.operation === "models.download")
        return { ok: true, model: await models.startDownload({ consent: request.consent }) };
      if (request.operation === "models.cancel") await models.cancel();
      if (request.operation === "models.remove") {
        const current = await this.status();
        if (current.recording || current.modelLoaded)
          throw new Error(
            "Disable Talk to unload the model before removing it, then enable Talk again.",
          );
        await models.remove();
      }
      return { ok: true, model: await models.status() };
    }
    if (!this.enabled) throw new Error("Enable Talk before using meetings or local transcription.");
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
      case "recordings.start":
        await this.worker.request(request.operation, {
          title: request.title.trim() || "Untitled meeting",
          microphone: request.microphone ?? true,
          systemAudio: request.systemAudio ?? false,
        });
        return { ok: true, status: await this.status() };
      case "recordings.stop":
      case "recordings.get":
      case "recordings.transcribe": {
        const recording = decodeTalkRecording(
          await this.worker.request(request.operation, "id" in request ? { id: request.id } : {}),
        );
        return { ok: true, recording, status: await this.status() };
      }
      case "recordings.delete":
        await this.worker.request(request.operation, { id: request.id });
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

  private disableDictation() {
    this.options.dictation?.unregister();
    this.dictationEnabled = false;
  }

  private beginDictation() {
    if (!this.dictationEnabled || this.dictationActive || this.closing) return;
    if (this.operationActive || !this.worker?.running || this.nativeStatus?.recording) {
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
