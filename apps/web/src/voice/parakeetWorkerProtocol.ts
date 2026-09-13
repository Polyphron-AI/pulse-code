/**
 * Message shapes shared by the Parakeet worker and its main-thread client, plus the
 * helpers that keep a real failure readable once it crosses the worker boundary.
 *
 * Errors cannot be structured-cloned with their prototype, cause chain or stack, so
 * the worker flattens them here and the client rebuilds an Error from the result.
 */

export interface ParakeetWorkerRequest {
  readonly id: number;
  readonly action: "setup" | "transcribe";
  readonly pcm?: Float32Array;
}

/** A flattened error, including its cause chain, safe to post across a worker. */
export interface ParakeetFailure {
  readonly name: string;
  readonly message: string;
  readonly causes: readonly string[];
  readonly stack?: string;
}

export type ParakeetWorkerReply =
  | { readonly id: number; readonly kind: "result"; readonly text: string }
  | {
      readonly id: number;
      readonly kind: "progress";
      readonly loaded: number;
      readonly total: number;
      readonly file: string;
    }
  | { readonly id: number; readonly kind: "failure"; readonly failure: ParakeetFailure };

/** Progress for one model file. `total` is 0 when the server sends no length. */
export interface ParakeetSetupProgress {
  readonly loaded: number;
  readonly total: number;
  readonly file: string;
}

const MAX_CAUSE_DEPTH = 5;

export function describeParakeetFailure(error: unknown): ParakeetFailure {
  if (!(error instanceof Error)) {
    return { name: "Error", message: String(error), causes: [] };
  }
  const causes: string[] = [];
  let current: unknown = error.cause;
  while (current !== undefined && current !== null && causes.length < MAX_CAUSE_DEPTH) {
    causes.push(current instanceof Error ? `${current.name}: ${current.message}` : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return {
    name: error.name,
    message: error.message,
    causes,
    ...(error.stack ? { stack: error.stack } : {}),
  };
}

/** Rebuild a throwable Error whose text still names the underlying cause. */
export function parakeetFailureToError(failure: ParakeetFailure): Error {
  const error = new Error(formatParakeetFailure(failure));
  error.name = failure.name;
  if (failure.stack) error.stack = failure.stack;
  return error;
}

/** One line the user can act on or paste into a bug report. */
export function formatParakeetFailure(failure: ParakeetFailure): string {
  const head = failure.name && failure.name !== "Error" ? `${failure.name}: ` : "";
  const tail = failure.causes.length > 0 ? ` (caused by ${failure.causes.join(" <- ")})` : "";
  return `${head}${failure.message}${tail}`;
}

/**
 * Describe an ErrorEvent from a worker that failed before it could reply, which is
 * what a module-evaluation or asset-loading failure looks like from the main thread.
 */
export function describeWorkerErrorEvent(event: ErrorEvent): ParakeetFailure {
  if (event.error instanceof Error) return describeParakeetFailure(event.error);
  const where =
    event.filename && event.filename.length > 0
      ? ` at ${event.filename}:${event.lineno}:${event.colno}`
      : "";
  const message =
    event.message && event.message.length > 0
      ? `${event.message}${where}`
      : `The Parakeet worker failed to start${where || "."}`;
  return { name: "WorkerError", message, causes: [] };
}
