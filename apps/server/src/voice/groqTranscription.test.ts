import { describe, expect, it, vi } from "vite-plus/test";

import {
  GROQ_TRANSCRIPTION_ENDPOINT,
  GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES,
  createGroqTranscriber,
} from "./groqTranscription.ts";

const audio = { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/webm;codecs=opus" };

function setup(response: Response = Response.json({ text: " dictated text " })) {
  const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response);
  const getApiKey = vi.fn(async () => "secret-key");
  return { transcriber: createGroqTranscriber({ fetch, getApiKey }), fetch, getApiKey };
}

describe("createGroqTranscriber", () => {
  it("uploads supported audio as multipart and returns trimmed text", async () => {
    const test = setup();
    await expect(test.transcriber.transcribe(audio, new AbortController().signal)).resolves.toBe(
      "dictated text",
    );
    const [url, init] = test.fetch.mock.calls[0]!;
    expect(init).toBeDefined();
    expect(url).toBe(GROQ_TRANSCRIPTION_ENDPOINT);
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(init!.headers).toEqual({ Authorization: "Bearer secret-key" });
    const body = init!.body as FormData;
    expect(body.get("model")).toBe("whisper-large-v3-turbo");
    expect(body.get("response_format")).toBe("json");
    expect(body.get("file")).toMatchObject({ name: "dictation.webm", size: 3, type: "audio/webm" });
  });

  it("rejects audio over 25 MiB before reading credentials or calling Groq", async () => {
    const test = setup();
    await expect(
      test.transcriber.transcribe(
        { bytes: new Uint8Array(GROQ_TRANSCRIPTION_MAX_AUDIO_BYTES + 1), mimeType: "audio/webm" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("25 MiB");
    expect(test.getApiKey).not.toHaveBeenCalled();
    expect(test.fetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported codecs before upload", async () => {
    const test = setup();
    await expect(
      test.transcriber.transcribe(
        { bytes: new Uint8Array([1]), mimeType: "audio/aac" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("not supported");
    expect(test.fetch).not.toHaveBeenCalled();
  });

  it("redacts provider response bodies and credentials from errors", async () => {
    const test = setup(new Response("secret-key: upstream detail", { status: 401 }));
    const error = await test.transcriber
      .transcribe(audio, new AbortController().signal)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ message: "Groq transcription failed (401). Check the API key." });
    expect(String(error)).not.toContain("secret-key");
    expect(String(error)).not.toContain("upstream detail");
  });

  it("passes cancellation to fetch and preserves the abort reason", async () => {
    const reason = new Error("cancelled by user");
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });
    const transcriber = createGroqTranscriber({ fetch, getApiKey: async () => "key" });
    const abort = new AbortController();
    const pending = transcriber.transcribe(audio, abort.signal);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledOnce();
    abort.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });
});
