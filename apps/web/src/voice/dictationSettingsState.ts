import {
  getPulseDictationApiKeyStatus,
  pulseDictationRequestContext,
  removePulseDictationApiKey,
  setPulseDictationApiKey,
  transcribePulseDictation,
} from "@t3tools/client-runtime/voice-input";
import { createEnvironmentCommand, type AtomCommand } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  PulseDictationApiKeyStatus,
  PulseDictationTranscription,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "../connection/runtime";

type EnvironmentTarget<Input> = { readonly environmentId: EnvironmentId; readonly input: Input };

export const readGroqApiKeyStatus: AtomCommand<
  EnvironmentTarget<Record<string, never>>,
  PulseDictationApiKeyStatus,
  unknown
> = createEnvironmentCommand(connectionAtomRuntime, {
  label: "pulse-dictation:key-status",
  execute: () => Effect.flatMap(pulseDictationRequestContext, getPulseDictationApiKeyStatus),
});

export const saveGroqApiKey: AtomCommand<
  EnvironmentTarget<{ readonly apiKey: string }>,
  PulseDictationApiKeyStatus,
  unknown
> = createEnvironmentCommand(connectionAtomRuntime, {
  label: "pulse-dictation:key-save",
  execute: ({ apiKey }: { readonly apiKey: string }) =>
    Effect.flatMap(pulseDictationRequestContext, (context) =>
      setPulseDictationApiKey({ ...context, apiKey }),
    ),
});

export const deleteGroqApiKey: AtomCommand<
  EnvironmentTarget<Record<string, never>>,
  void,
  unknown
> = createEnvironmentCommand(connectionAtomRuntime, {
  label: "pulse-dictation:key-remove",
  execute: () => Effect.flatMap(pulseDictationRequestContext, removePulseDictationApiKey),
});

/** Composer-facing authenticated Groq adapter. The selected environment is fixed by the command input. */
export const transcribeGroqDictation: AtomCommand<
  EnvironmentTarget<{
    readonly audio: Blob;
    readonly fileName?: string;
    readonly signal: AbortSignal;
  }>,
  PulseDictationTranscription,
  unknown
> = createEnvironmentCommand(connectionAtomRuntime, {
  label: "pulse-dictation:transcribe",
  execute: ({ audio, fileName, signal }) => {
    const aborted = Effect.callback<never>((resume) => {
      const interrupt = () => resume(Effect.interrupt);
      if (signal.aborted) {
        interrupt();
        return;
      }
      signal.addEventListener("abort", interrupt, { once: true });
      return Effect.sync(() => signal.removeEventListener("abort", interrupt));
    });
    return Effect.raceFirst(
      Effect.flatMap(pulseDictationRequestContext, (context) =>
        transcribePulseDictation({
          ...context,
          audio,
          ...(fileName === undefined ? {} : { fileName }),
        }),
      ),
      aborted,
    );
  },
});
