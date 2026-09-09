import * as Schema from "effect/Schema";

export const TalkPreferences = Schema.Struct({
  enabled: Schema.Boolean,
  everyMeeting: Schema.optionalKey(Schema.Boolean),
  pendingTranscriptions: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type TalkPreferences = typeof TalkPreferences.Type;

export const TalkRecording = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  startedAt: Schema.String,
  durationSeconds: Schema.Number,
  audioPath: Schema.String,
  transcript: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.Literals(["recorded", "transcribed", "recording", "failed", "interrupted"]),
  sources: Schema.optionalKey(
    Schema.Struct({ microphone: Schema.Boolean, systemAudio: Schema.Boolean }),
  ),
  error: Schema.optionalKey(
    Schema.NullOr(Schema.Struct({ code: Schema.String, message: Schema.String })),
  ),
  recovered: Schema.optionalKey(Schema.Boolean),
});
export type TalkRecording = typeof TalkRecording.Type;

export const TalkDictation = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  text: Schema.String,
  delivered: Schema.Boolean,
  error: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
export type TalkDictation = typeof TalkDictation.Type;

export const TalkStatus = Schema.Struct({
  everyMeeting: Schema.optionalKey(Schema.Boolean),
  pendingTranscriptions: Schema.optionalKey(Schema.Array(Schema.String)),
  transcribingId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  preparationError: Schema.optionalKey(Schema.NullOr(Schema.String)),
  transcriptionError: Schema.optionalKey(Schema.NullOr(Schema.String)),
  enabled: Schema.Boolean,
  running: Schema.Boolean,
  recording: Schema.Boolean,
  modelLoaded: Schema.Boolean,
  workerAvailable: Schema.Boolean,
  dictation: Schema.Struct({
    enabled: Schema.Boolean,
    active: Schema.Boolean,
    lastError: Schema.NullOr(Schema.String),
  }),
  capabilities: Schema.Struct({
    microphone: Schema.Boolean,
    systemAudio: Schema.Boolean,
    dictationDelivery: Schema.Boolean,
    parakeet: Schema.Boolean,
  }),
});
export type TalkStatus = typeof TalkStatus.Type;

export const TalkModelStatus = Schema.Struct({
  state: Schema.Literals(["not_installed", "downloading", "installed", "cancelled", "error"]),
  modelId: Schema.String,
  revision: Schema.String,
  license: Schema.String,
  sourceUrl: Schema.String,
  totalBytes: Schema.Number,
  downloadedBytes: Schema.Number,
  progress: Schema.Number,
  currentFile: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  memory: Schema.Struct({ totalBytes: Schema.Number, freeBytes: Schema.Number }),
  disk: Schema.Struct({ freeBytes: Schema.NullOr(Schema.Number) }),
});
export type TalkModelStatus = typeof TalkModelStatus.Type;

export const TalkRequest = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("status") }),
  Schema.Struct({ operation: Schema.Literal("enable"), enabled: Schema.Boolean }),
  Schema.Struct({ operation: Schema.Literal("recordings.list") }),
  Schema.Struct({ operation: Schema.Literal("recordings.get"), id: Schema.String }),
  Schema.Struct({ operation: Schema.Literal("dictation.enable"), enabled: Schema.Boolean }),
  Schema.Struct({ operation: Schema.Literal("meetings.configure"), everyMeeting: Schema.Boolean }),
  Schema.Struct({ operation: Schema.Literal("transcription.retry") }),
  Schema.Struct({ operation: Schema.Literal("transcription.cancel"), id: Schema.String }),
  Schema.Struct({ operation: Schema.Literal("dictation.history") }),
  Schema.Struct({
    operation: Schema.Literal("recordings.start"),
    title: Schema.String,
    microphone: Schema.optionalKey(Schema.Boolean),
    systemAudio: Schema.optionalKey(Schema.Boolean),
    transcribeWhenReady: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({ operation: Schema.Literal("recordings.stop") }),
  Schema.Struct({ operation: Schema.Literal("recordings.transcribe"), id: Schema.String }),
  Schema.Struct({ operation: Schema.Literal("recordings.delete"), id: Schema.String }),
  Schema.Struct({ operation: Schema.Literal("recordings.open"), id: Schema.String }),
  Schema.Struct({ operation: Schema.Literal("model.choose") }),
  Schema.Struct({ operation: Schema.Literal("models.status") }),
  Schema.Struct({ operation: Schema.Literal("models.download"), consent: Schema.Literal(true) }),
  Schema.Struct({ operation: Schema.Literal("models.cancel") }),
  Schema.Struct({ operation: Schema.Literal("models.remove") }),
  Schema.Struct({ operation: Schema.Literal("models.load") }),
]);
export type TalkRequest = typeof TalkRequest.Type;

export const TalkResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    status: Schema.optional(TalkStatus),
    recordings: Schema.optional(Schema.Array(TalkRecording)),
    recording: Schema.optional(TalkRecording),
    cancelled: Schema.optional(Schema.Boolean),
    model: Schema.optionalKey(TalkModelStatus),
    dictations: Schema.optionalKey(Schema.Array(TalkDictation)),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Struct({ code: Schema.String, message: Schema.String }),
  }),
]);
export type TalkResult = typeof TalkResult.Type;
