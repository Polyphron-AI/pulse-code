import { useSyncExternalStore } from "react";
import { VoiceController } from "./VoiceController";

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<
  number,
  { resolve: (text: string) => void; reject: (error: Error) => void }
>();
function reset() {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) request.reject(new Error("Voice capture cancelled."));
  pending.clear();
}
function request(pcm?: Float32Array): Promise<string> {
  if (!worker) {
    worker = new Worker(new URL("./parakeet.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener(
      "message",
      (event: MessageEvent<{ id: number; text?: string; error?: string }>) => {
        const item = pending.get(event.data.id);
        pending.delete(event.data.id);
        if (event.data.error) item?.reject(new Error(event.data.error));
        else item?.resolve(event.data.text ?? "");
      },
    );
    worker.addEventListener("error", () => {
      for (const item of pending.values())
        item.reject(
          new Error(
            "Parakeet could not start. Check your connection and available memory, then try again.",
          ),
        );
      reset();
    });
  }
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, pcm }, pcm ? [pcm.buffer] : []);
  });
}
export const voiceCapture = new VoiceController({
  prepare: async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
      throw new Error("Microphone capture requires HTTPS, localhost, or the desktop app.");
    await request();
  },
  record: async (onLimit) => (await import("./recordAudio")).recordAudio(onLimit),
  transcribe: request,
  reset,
});
export function useVoiceCapture() {
  return useSyncExternalStore(voiceCapture.subscribe, voiceCapture.getSnapshot);
}
export const VOICE_TOGGLE_EVENT = "pulse:voice-toggle";
export function toggleComposerVoice() {
  if (voiceCapture.getSnapshot().phase === "recording") {
    void voiceCapture.stop();
    return;
  }
  if (!window.dispatchEvent(new Event(VOICE_TOGGLE_EVENT, { cancelable: true }))) return;
  voiceCapture.reportError("Open an available chat draft to use voice capture.");
}
