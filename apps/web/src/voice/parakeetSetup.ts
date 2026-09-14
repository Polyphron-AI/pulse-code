import { ParakeetTranscriber } from "./parakeetTranscription";
import type { ParakeetSetupProgress } from "./parakeetWorkerProtocol";

let transcriber: ParakeetTranscriber | null = null;
const CONFIGURED_KEY = "pulse:parakeet-configured:v1";
const listeners = new Set<() => void>();

export function isParakeetConfigured(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CONFIGURED_KEY) === "true";
  } catch {
    return false;
  }
}

export function subscribeParakeetSetup(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setParakeetConfigured(configured: boolean): void {
  try {
    if (configured) window.localStorage.setItem(CONFIGURED_KEY, "true");
    else window.localStorage.removeItem(CONFIGURED_KEY);
  } catch {
    // The loaded worker remains usable when browser privacy settings block storage.
  }
  for (const listener of listeners) listener();
}

export function getParakeetTranscriber(): ParakeetTranscriber {
  return (transcriber ??= new ParakeetTranscriber());
}

/** This is the only settings entry point that may download the local model. */
export function setupParakeet(
  signal: AbortSignal,
  onProgress?: (progress: ParakeetSetupProgress) => void,
): Promise<void> {
  return getParakeetTranscriber()
    .setup(signal, onProgress)
    .then(
      () => setParakeetConfigured(true),
      (error) => {
        if (!signal.aborted) setParakeetConfigured(false);
        throw error;
      },
    );
}

export function isParakeetReady(): boolean {
  return transcriber?.isReady() === true;
}

/** Release the device-local model when the user disables or abandons setup. */
export function resetParakeet(): void {
  transcriber?.reset();
}
