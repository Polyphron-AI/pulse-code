import { ParakeetTranscriber } from "./parakeetTranscription";
import type { ParakeetSetupProgress } from "./parakeetWorkerProtocol";

let transcriber: ParakeetTranscriber | null = null;

export function getParakeetTranscriber(): ParakeetTranscriber {
  return (transcriber ??= new ParakeetTranscriber());
}

/** This is the only settings entry point that may download the local model. */
export function setupParakeet(
  signal: AbortSignal,
  onProgress?: (progress: ParakeetSetupProgress) => void,
): Promise<void> {
  return getParakeetTranscriber().setup(signal, onProgress);
}
