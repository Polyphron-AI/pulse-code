export const GROQ_DICTATION_API_KEY_SECRET = "pulse-dictation-groq-api-key";
export const GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const GROQ_TRANSCRIPTION_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
export const GROQ_TRANSCRIPTION_MAX_RESPONSE_BYTES = 1024 * 1024;
export const GROQ_TRANSCRIPTION_TIMEOUT_MS = 60_000;

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
  readonly timeoutMs?: number;
}

const systemTimers = {
  set: globalThis.setTimeout.bind(globalThis),
  clear: globalThis.clearTimeout.bind(globalThis),
};

export class GroqTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqTranscriptionError";
  }
}

function baseMimeType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const item = await withAbort(reader.read(), signal);
      if (item.done) return text + decoder.decode();
      bytes += item.value.byteLength;
      if (bytes > GROQ_TRANSCRIPTION_MAX_RESPONSE_BYTES) {
        throw new GroqTranscriptionError("Groq returned an oversized transcription response.");
      }
      text += decoder.decode(item.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Sends one bounded in-memory recording to Groq without retaining it or exposing provider errors. */
export function createGroqTranscriber(
  dependencies: GroqTranscriptionDependencies,
  timers = systemTimers,
) {
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
      const requestAbort = new AbortController();
      const abortFromCaller = () => requestAbort.abort(signal.reason);
      signal.addEventListener("abort", abortFromCaller, { once: true });
      const timeout = timers.set(
        () => requestAbort.abort(new GroqTranscriptionError("Groq transcription timed out.")),
        dependencies.timeoutMs ?? GROQ_TRANSCRIPTION_TIMEOUT_MS,
      );
      const requestSignal = requestAbort.signal;

      try {
        const apiKey = (await withAbort(dependencies.getApiKey(), requestSignal))?.trim();
        if (requestSignal.aborted) throw requestSignal.reason;
        if (!apiKey) {
          throw new GroqTranscriptionError("Groq dictation needs an API key in this environment.");
        }

        const body = new FormData();
        body.set("file", new Blob([audio.bytes], { type: mimeType }), `dictation.${extension}`);
        body.set("model", "whisper-large-v3-turbo");
        body.set("response_format", "json");

        let response: Response;
        try {
          response = await withAbort(
            dependencies.fetch(GROQ_TRANSCRIPTION_ENDPOINT, {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}` },
              body,
              signal: requestSignal,
            }),
            requestSignal,
          );
        } catch (error) {
          if (requestSignal.aborted) throw requestSignal.reason;
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
          result = JSON.parse(await readBoundedResponse(response, requestSignal));
        } catch (error) {
          if (error instanceof GroqTranscriptionError) throw error;
          if (requestSignal.aborted) throw requestSignal.reason;
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
      } finally {
        timers.clear(timeout);
        signal.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
