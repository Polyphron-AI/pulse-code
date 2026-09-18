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
import { useNavigate } from "@tanstack/react-router";

import { useEnvironments } from "../state/environments";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSession } from "../state/session";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { resolveDictationBackend } from "./dictationPreferences";
import { dictationFileName } from "./composerDictationLogic";
import { transcribeGroqDictation } from "./dictationSettingsState";
import { MediaRecorderCapture } from "./mediaRecorderCapture";
import {
  getParakeetTranscriber,
  isParakeetConfigured,
  isParakeetReady,
  setupParakeet,
  subscribeParakeetSetup,
} from "./parakeetSetup";
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
  readonly parakeetConfigured: boolean;
} {
  const navigate = useNavigate();
  const transcribeGroq = useAtomCommand(transcribeGroqDictation, { reportFailure: false });
  const { environments } = useEnvironments();
  const environmentIds = environments.map((environment) => environment.environmentId);
  const capturedGroqEnvironmentIdRef = useRef<EnvironmentId | null>(null);
  const deliverRef = useRef(input.deliver);
  deliverRef.current = input.deliver;
  const [gateError, setGateError] = useState<string | null>(null);
  const [warmingParakeet, setWarmingParakeet] = useState(false);
  const warmupAbortRef = useRef<AbortController | null>(null);
  const parakeetWarmupRef = useRef<Promise<void> | null>(null);
  const parakeetConfigured = useSyncExternalStore(
    subscribeParakeetSetup,
    isParakeetConfigured,
    () => false,
  );
  useLayoutEffect(() => {
    if (!parakeetConfigured || isParakeetReady()) return;
    const abort = new AbortController();
    const warmup = setupParakeet(abort.signal);
    parakeetWarmupRef.current = warmup;
    void warmup
      .catch(() => undefined)
      .finally(() => {
        if (parakeetWarmupRef.current === warmup) parakeetWarmupRef.current = null;
      });
    return () => abort.abort();
  }, [parakeetConfigured]);
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
    : warmingParakeet
      ? { phase: "preparing", backend: "parakeet" }
      : controllerState;
  // Setup gaps are actionable from the microphone itself. ChatComposer may still supply an
  // external disabled reason for connection, approval, or project-selection gates.
  const disabledReason = null;
  const active =
    warmingParakeet ||
    controllerState.phase === "preparing" ||
    controllerState.phase === "recording" ||
    controllerState.phase === "transcribing";

  useLayoutEffect(() => {
    controller.setDraftIdentity(input.draftIdentity);
    return () => {
      warmupAbortRef.current?.abort();
      controller.cancel();
    };
  }, [controller, input.draftIdentity]);

  const start = useCallback(() => {
    setGateError(null);
    const captured = resolveDictationBackend(environmentIds);
    if (captured.backend === "unavailable") {
      void navigate({ to: "/settings/integrations", hash: "dictation" });
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
      if (!isParakeetReady() && !isParakeetConfigured()) {
        void navigate({ to: "/settings/integrations", hash: "dictation" });
        return;
      }
      capturedGroqEnvironmentIdRef.current = null;
    }
    const run = async () => {
      if (captured.backend === "parakeet" && !isParakeetReady()) {
        const abort = new AbortController();
        warmupAbortRef.current = abort;
        setWarmingParakeet(true);
        try {
          await (parakeetWarmupRef.current ?? setupParakeet(abort.signal));
        } catch (error) {
          if (!abort.signal.aborted)
            setGateError(error instanceof Error ? error.message : "Parakeet could not start.");
          return;
        } finally {
          if (warmupAbortRef.current === abort) warmupAbortRef.current = null;
          setWarmingParakeet(false);
        }
        if (abort.signal.aborted) return;
      }
      await controller.start({
        backend: captured.backend,
        draftIdentity: input.draftIdentity,
        deliver: (text) => {
          deliverRef.current(text);
          return undefined;
        },
      });
    };
    void run();
  }, [controller, environmentIds, input.draftIdentity, navigate]);

  const cancel = useCallback(() => {
    setGateError(null);
    warmupAbortRef.current?.abort();
    warmupAbortRef.current = null;
    setWarmingParakeet(false);
    controller.cancel();
  }, [controller]);

  return {
    state,
    disabledReason,
    blockedReason: active ? "Finish or cancel dictation before sending." : null,
    start,
    stop: () => void controller.stop(),
    cancel,
    parakeetConfigured,
  };
}
