/* oxlint-disable unicorn/require-post-message-target-origin -- Dedicated workers have no target origin. */
import { fromHub } from "parakeet.js";
import { env } from "onnxruntime-web";
// The bare "onnxruntime-web" import resolves to dist/ort.bundle.min.mjs, which is the
// JSEP build. It only ever loads the ".jsep" WASM artifacts, so these overrides must
// name the JSEP files too. Pointing them at the plain ort-wasm-simd-threaded pair
// loads a glue module the runtime cannot drive, and initialisation throws. Any
// override also disables ORT's embedded glue, so the pair here is what actually runs.
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import wasmModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";

import {
  describeParakeetFailure,
  type ParakeetWorkerRequest,
  type ParakeetWorkerReply,
} from "./parakeetWorkerProtocol";

env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };

let model: ReturnType<typeof fromHub> | null = null;
let operationTail: Promise<void> = Promise.resolve();

function reply(message: ParakeetWorkerReply): void {
  globalThis.postMessage(message);
}

async function handleRequest({ id, action, pcm }: ParakeetWorkerRequest): Promise<void> {
  try {
    model ??= fromHub("parakeet-tdt-0.6b-v3", {
      backend: "wasm",
      encoderQuant: "int8",
      decoderQuant: "int8",
      cpuThreads: 1,
      // The model is hundreds of megabytes, so the caller renders real progress
      // rather than an open-ended spinner.
      progress: ({ loaded, total, file }) => {
        reply({ id, kind: "progress", loaded, total, file });
      },
    }).catch((error: unknown) => {
      model = null;
      throw error;
    });
    const loaded = await model;
    const text =
      action === "transcribe" && pcm ? (await loaded.transcribe(pcm, 16_000)).utterance_text : "";
    reply({ id, kind: "result", text });
  } catch (error) {
    // Report the real failure. The previous code collapsed every cause into one
    // fixed sentence, which is why this never being able to start was invisible.
    console.error(`[parakeet] ${action} failed`, error);
    reply({ id, kind: "failure", failure: describeParakeetFailure(error) });
  }
}

globalThis.addEventListener("message", (event: MessageEvent<ParakeetWorkerRequest>) => {
  operationTail = operationTail.then(() => handleRequest(event.data));
});
