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
    const current = readDictationPreferences();
    writeDictationPreferences({ ...current, enabled: true, backend: "parakeet" });
    const abort = new AbortController();
    abortRef.current = abort;
    setState("setting-up");
    setProgress(null);
    setError(null);
    try {
      await setupParakeet(abort.signal, ({ loaded, total }) => {
        if (!abort.signal.aborted && total > 0) setProgress(Math.round((loaded / total) * 100));
      });
      if (!abort.signal.aborted) setState("ready");
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
        {error ? <p className="text-sm text-error-foreground">Setup failed: {error}</p> : null}
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
