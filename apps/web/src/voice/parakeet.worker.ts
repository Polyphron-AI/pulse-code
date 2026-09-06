/* oxlint-disable unicorn/require-post-message-target-origin -- Dedicated worker messages have no targetOrigin. */
import { fromHub } from "parakeet.js";
import { env } from "onnxruntime-web";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import wasmModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };

let model: ReturnType<typeof fromHub> | null = null;
globalThis.addEventListener(
  "message",
  async (event: MessageEvent<{ id: number; pcm?: Float32Array }>) => {
    const { id, pcm } = event.data;
    try {
      model ??= fromHub("parakeet-tdt-0.6b-v3", {
        backend: "wasm",
        encoderQuant: "int8",
        decoderQuant: "int8",
        cpuThreads: 1,
      }).catch((error: unknown) => {
        model = null;
        throw error;
      });
      const loaded = await model;
      const text = pcm ? (await loaded.transcribe(pcm, 16000)).utterance_text : "";
      globalThis.postMessage({ id, text });
    } catch (error) {
      globalThis.postMessage({
        id,
        error: error instanceof Error ? error.message : "Parakeet failed to transcribe audio.",
      });
    }
  },
);
