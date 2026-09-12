export const GROQ_DICTATION_API_KEY_SECRET = "pulse-dictation-groq-api-key";
export const GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const GROQ_TRANSCRIPTION_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

const supportedAudio = new Map([
  ["audio/flac", "flac"],
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "mp4"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/webm", "webm"],
]);

export interface GroqTranscriptionAudio {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface GroqTranscriptionDependencies {
  readonly fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly getApiKey: () => Promise<string | null>;
}

export class GroqTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqTranscriptionError";
  }
}

function baseMimeType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

/** Sends one bounded in-memory recording to Groq without retaining it or exposing provider errors. */
export function createGroqTranscriber(dependencies: GroqTranscriptionDependencies) {
  return {
    async transcribe(audio: GroqTranscriptionAudio, signal: AbortSignal): Promise<string> {
      if (signal.aborted) throw signal.reason;
      if (audio.bytes.byteLength === 0) {
        throw new GroqTranscriptionError("The recording is empty.");
      }
      if (audio.bytes.byteLength > GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES) {
        throw new GroqTranscriptionError("The recording exceeds the 25 MiB upload limit.");
      }
      const mimeType = baseMimeType(audio.mimeType);
      const extension = supportedAudio.get(mimeType);
      if (!extension) {
        throw new GroqTranscriptionError(
          "This recording format is not supported for Groq dictation.",
        );
      }
      const apiKey = (await dependencies.getApiKey())?.trim();
      if (!apiKey) {
        throw new GroqTranscriptionError("Groq dictation needs an API key in this environment.");
      }

      const body = new FormData();
      body.set("file", new Blob([audio.bytes], { type: mimeType }), `dictation.${extension}`);
      body.set("model", "whisper-large-v3-turbo");
      body.set("response_format", "json");

      let response: Response;
      try {
        response = await dependencies.fetch(GROQ_TRANSCRIPTION_ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body,
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        throw new GroqTranscriptionError("Groq transcription could not be reached.");
      }
      if (!response.ok) {
        const suffix =
          response.status === 401 || response.status === 403 ? " Check the API key." : "";
        throw new GroqTranscriptionError(
          `Groq transcription failed (${response.status}).${suffix}`,
        );
      }
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new GroqTranscriptionError("Groq returned an invalid transcription response.");
      }
      const text =
        typeof result === "object" && result !== null && "text" in result
          ? (result as { readonly text?: unknown }).text
          : undefined;
      if (typeof text !== "string") {
        throw new GroqTranscriptionError("Groq returned an invalid transcription response.");
      }
      return text.trim();
    },
  };
}
