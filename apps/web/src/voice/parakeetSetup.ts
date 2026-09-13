import { ParakeetTranscriber } from "./parakeetTranscription";

let transcriber: ParakeetTranscriber | null = null;

export function getParakeetTranscriber(): ParakeetTranscriber {
  return (transcriber ??= new ParakeetTranscriber());
}

/** This is the only settings entry point that may download the local model. */
export function setupParakeet(signal: AbortSignal): Promise<void> {
  return getParakeetTranscriber().setup(signal);
}
