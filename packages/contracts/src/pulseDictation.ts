import * as Schema from "effect/Schema";

export const PULSE_DICTATION_TRANSCRIPTIONS_PATH = "/api/pulse/dictation/transcriptions";
export const PULSE_DICTATION_GROQ_API_KEY_PATH = "/api/pulse/dictation/groq-api-key";
export const PULSE_DICTATION_GROQ_API_KEY_SET_PATH = "/api/pulse/dictation/groq-api-key/set";
export const PULSE_DICTATION_GROQ_API_KEY_REMOVE_PATH = "/api/pulse/dictation/groq-api-key/remove";

export const PulseDictationApiKeyInput = Schema.Struct({
  apiKey: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8_192)),
});

export const PulseDictationApiKeyStatus = Schema.Struct({ configured: Schema.Boolean });
export const PulseDictationTranscription = Schema.Struct({ text: Schema.String });
export const PulseDictationHttpError = Schema.Struct({ error: Schema.String });

export type PulseDictationApiKeyInput = typeof PulseDictationApiKeyInput.Type;
export type PulseDictationApiKeyStatus = typeof PulseDictationApiKeyStatus.Type;
export type PulseDictationTranscription = typeof PulseDictationTranscription.Type;
export type PulseDictationHttpError = typeof PulseDictationHttpError.Type;
