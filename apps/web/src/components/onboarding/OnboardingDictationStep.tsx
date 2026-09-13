import { ArrowRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { resetParakeet, setupParakeet } from "../../voice/parakeetSetup";
import {
  readDictationPreferences,
  writeDictationPreferences,
} from "../../voice/dictationPreferences";
import { Button } from "../ui/button";

export function OnboardingDictationStep({ onContinue }: { readonly onContinue: () => void }) {
  const [state, setState] = useState<"idle" | "setting-up" | "ready" | "error">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retainModelRef = useRef(false);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (!retainModelRef.current) resetParakeet();
    },
    [],
  );

  const chooseParakeet = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setState("setting-up");
    setProgress(null);
    setError(null);
    try {
      await setupParakeet(abort.signal, ({ loaded, total }) => {
        if (!abort.signal.aborted && total > 0) setProgress(Math.round((loaded / total) * 100));
      });
      if (!abort.signal.aborted) {
        const current = readDictationPreferences();
        writeDictationPreferences({ ...current, enabled: true, backend: "parakeet" });
        setState("ready");
      }
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setState("error");
      }
    }
  };

  const decline = () => {
    const current = readDictationPreferences();
    writeDictationPreferences({ ...current, enabled: false });
    resetParakeet();
    retainModelRef.current = true;
    onContinue();
  };

  const continueWithParakeet = () => {
    retainModelRef.current = true;
    onContinue();
  };

  const cancelSetup = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    resetParakeet();
    retainModelRef.current = true;
    setState("idle");
    setProgress(null);
    setError(null);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Voice dictation</h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        Dictate prompts with a local Parakeet model. Audio stays in this browser, and the model
        downloads only if you set it up.
      </p>
      <div className="mt-6 space-y-3">
        <Button
          autoFocus
          className="w-full"
          disabled={state === "setting-up" || state === "ready"}
          onClick={() => void chooseParakeet()}
        >
          {state === "setting-up"
            ? progress === null
              ? "Setting up Parakeet…"
              : `Downloading Parakeet… ${String(progress)}%`
            : state === "ready"
              ? "Parakeet is ready"
              : state === "error"
                ? "Try Parakeet setup again"
                : "Set up local dictation"}
        </Button>
        {state === "setting-up" ? (
          <div className="space-y-1" aria-live="polite">
            <p className="text-sm text-muted-foreground">
              This is a one-time download. You can cancel and finish setup later from Settings.
            </p>
            {progress !== null ? (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Parakeet download progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}
            <Button variant="ghost" onClick={cancelSetup}>
              Cancel download
            </Button>
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-error-foreground" role="alert">
            Parakeet couldn’t start. Try again, or choose Not now and enable it later in Settings.
            <span className="mt-1 block text-xs opacity-80">{error}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-6 flex justify-between gap-3">
        <Button variant="ghost" disabled={state === "setting-up"} onClick={decline}>
          Not now
        </Button>
        {state === "ready" ? (
          <Button onClick={continueWithParakeet}>
            Continue
            <ArrowRightIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </>
  );
}
