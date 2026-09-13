import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
} from "@t3tools/contracts";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { useEnvironments } from "../state/environments";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSession } from "../state/session";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { resolveDictationBackend } from "./dictationPreferences";
import { dictationFileName } from "./composerDictationLogic";
import { transcribeGroqDictation } from "./dictationSettingsState";
import { MediaRecorderCapture } from "./mediaRecorderCapture";
import { getParakeetTranscriber } from "./parakeetSetup";
import { PulseDictationController, type PulseDictationState } from "./pulseDictation";

function groqStartError(environmentId: EnvironmentId): string | null {
  const projection = Option.getOrNull(
    AsyncResult.value(
      appAtomRegistry.get(serverEnvironment.configProjection({ environmentId, input: {} })),
    ),
  );
  if (projection?.source !== "live") {
    return "Waiting for current dictation support from the selected environment.";
  }
  if (projection.config.pulseCapabilities?.groqDictation !== true) {
    return "Update the selected environment before using Groq dictation.";
  }
  const sessionResult = appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId));
  const session = Option.getOrNull(AsyncResult.value(sessionResult));
  if (sessionResult.waiting || session?.authenticated !== true) {
    return "Sign in to the selected environment before using Groq dictation.";
  }
  const scopes = session.scopes;
  return scopes?.includes(AuthOrchestrationReadScope) === true &&
    scopes.includes(AuthOrchestrationOperateScope)
    ? null
    : "This session cannot use Groq dictation on the selected environment.";
}

export function useComposerDictation(input: {
  readonly draftIdentity: string;
  readonly deliver: (text: string) => void;
}): {
  readonly state: PulseDictationState;
  readonly disabledReason: string | null;
  readonly blockedReason: string | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly cancel: () => void;
} {
  const transcribeGroq = useAtomCommand(transcribeGroqDictation, { reportFailure: false });
  const { environments } = useEnvironments();
  const environmentIds = environments.map((environment) => environment.environmentId);
  const capturedGroqEnvironmentIdRef = useRef<EnvironmentId | null>(null);
  const deliverRef = useRef(input.deliver);
  deliverRef.current = input.deliver;
  const [gateError, setGateError] = useState<string | null>(null);
  const controller = useMemo(
    () =>
      new PulseDictationController<Blob>({
        capture: new MediaRecorderCapture(),
        transcribers: {
          parakeet: getParakeetTranscriber(),
          groq: {
            transcribe: async (audio, signal) => {
              const environmentId = capturedGroqEnvironmentIdRef.current;
              if (!environmentId)
                throw new Error("Choose a Groq dictation environment in Settings.");
              const result = await transcribeGroq({
                environmentId,
                input: { audio, fileName: dictationFileName(audio), signal },
              });
              if (result._tag === "Failure") throw squashAtomCommandFailure(result);
              return result.value.text;
            },
          },
        },
      }),
    [transcribeGroq],
  );
  const controllerState = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const state: PulseDictationState = gateError
    ? { phase: "error", message: gateError }
    : controllerState;
  const resolved = resolveDictationBackend(environmentIds);
  const disabledReason =
    resolved.backend === "unavailable"
      ? resolved.reason === "dictation-disabled"
        ? "Turn on dictation in Settings before using it."
        : "Choose a connected Groq environment in Settings before using dictation."
      : null;
  const active =
    controllerState.phase === "preparing" ||
    controllerState.phase === "recording" ||
    controllerState.phase === "transcribing";

  useLayoutEffect(() => {
    controller.setDraftIdentity(input.draftIdentity);
    return () => controller.cancel();
  }, [controller, input.draftIdentity]);

  const start = useCallback(() => {
    setGateError(null);
    const captured = resolveDictationBackend(environmentIds);
    if (captured.backend === "unavailable") {
      setGateError(
        captured.reason === "dictation-disabled"
          ? "Turn on dictation in Settings before using it."
          : "Choose a connected Groq environment in Settings before using dictation.",
      );
      return;
    }
    if (captured.backend === "groq") {
      const error = groqStartError(captured.environmentId);
      if (error) {
        setGateError(error);
        return;
      }
      capturedGroqEnvironmentIdRef.current = captured.environmentId;
    } else {
      capturedGroqEnvironmentIdRef.current = null;
    }
    void controller.start({
      backend: captured.backend,
      draftIdentity: input.draftIdentity,
      deliver: (text) => {
        deliverRef.current(text);
        return undefined;
      },
    });
  }, [controller, environmentIds, input.draftIdentity]);

  const cancel = useCallback(() => {
    setGateError(null);
    controller.cancel();
  }, [controller]);

  return {
    state,
    disabledReason,
    blockedReason: active ? "Finish or cancel dictation before sending." : null,
    start,
    stop: () => void controller.stop(),
    cancel,
  };
}
