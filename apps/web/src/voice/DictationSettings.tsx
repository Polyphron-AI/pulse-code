import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
} from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { resolveEnvironmentOptionLabel } from "../components/BranchToolbar.logic";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Radio, RadioGroup } from "../components/ui/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { useEnvironmentSessionState } from "../state/session";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import {
  readDictationPreferences,
  writeDictationPreferences,
  type DictationBackendPreference,
} from "./dictationPreferences";
import { deleteGroqApiKey, readGroqApiKeyStatus, saveGroqApiKey } from "./dictationSettingsState";
import { resetParakeet, setupParakeet } from "./parakeetSetup";

export function DictationSettings() {
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const initial = useRef(readDictationPreferences()).current;
  const [enabled, setEnabled] = useState(initial.enabled);
  const [backend, setBackend] = useState<DictationBackendPreference>(initial.backend);
  const [groqEnvironmentId, setGroqEnvironmentId] = useState<EnvironmentId | null>(
    initial.groqEnvironmentId,
  );
  const environmentId = environments.some(
    ({ environmentId }) => environmentId === groqEnvironmentId,
  )
    ? groqEnvironmentId
    : null;

  useEffect(() => {
    writeDictationPreferences({ enabled, backend, groqEnvironmentId });
    if (!enabled) resetParakeet();
  }, [enabled, backend, groqEnvironmentId]);

  if (!isReady) return <p className="text-sm text-muted-foreground">Checking environments…</p>;
  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3 text-sm font-medium">
        <Checkbox checked={enabled} onCheckedChange={setEnabled} />
        Enable dictation in the composer
      </label>
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          Dictation stays off until you enable it here.
        </p>
      ) : null}
      {enabled ? (
        <>
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Choose where recordings will be transcribed. Use the microphone in the composer to
              record, then review the inserted text before sending.
            </p>
            <RadioGroup
              value={backend}
              onValueChange={(value) => setBackend(value as DictationBackendPreference)}
            >
              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <Radio value="parakeet" />
                <span>
                  <span className="block text-sm font-medium">Parakeet on this device</span>
                  <span className="block text-xs text-muted-foreground">
                    Audio stays in this browser. The model downloads only when you choose setup.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <Radio value="groq" />
                <span>
                  <span className="block text-sm font-medium">Groq through an environment</span>
                  <span className="block text-xs text-muted-foreground">
                    The recording goes to the selected Pulse environment, then to Groq.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>
          {backend === "parakeet" ? (
            <ParakeetSetup />
          ) : (
            <GroqEnvironment
              environmentId={environmentId}
              environments={environments}
              primaryEnvironmentId={primaryEnvironmentId}
              onEnvironmentChange={setGroqEnvironmentId}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function ParakeetSetup() {
  const [state, setState] = useState<"idle" | "setting-up" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const setup = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setState("setting-up");
    setError(null);
    setProgress(null);
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
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={state === "setting-up" || state === "ready"}
        onClick={() => void setup()}
      >
        {state === "setting-up"
          ? progress === null
            ? "Setting up…"
            : `Downloading… ${String(progress)}%`
          : state === "ready"
            ? "Parakeet ready"
            : "Set up Parakeet"}
      </Button>
      {state === "error" ? (
        <p className="text-sm text-error-foreground">Parakeet setup failed: {error}</p>
      ) : null}
    </div>
  );
}

function GroqEnvironment({
  environmentId,
  environments,
  primaryEnvironmentId,
  onEnvironmentChange,
}: {
  readonly environmentId: EnvironmentId | null;
  readonly environments: ReturnType<typeof useEnvironments>["environments"];
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly onEnvironmentChange: (id: EnvironmentId) => void;
}) {
  const label = (candidate: (typeof environments)[number]) =>
    resolveEnvironmentOptionLabel({
      isPrimary: candidate.environmentId === primaryEnvironmentId,
      environmentId: candidate.environmentId,
      runtimeLabel: candidate.label,
    });
  const selected = environments.find((environment) => environment.environmentId === environmentId);
  return (
    <div className="space-y-3">
      <Select
        value={environmentId}
        onValueChange={(value) => value && onEnvironmentChange(value as EnvironmentId)}
      >
        <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Groq environment">
          <SelectValue>{selected ? label(selected) : "Choose an environment"}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {environments.map((environment) => (
            <SelectItem key={environment.environmentId} value={environment.environmentId}>
              {label(environment)}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {environmentId ? (
        <GroqEnvironmentConfiguration key={environmentId} environmentId={environmentId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose the environment that will send recordings to Groq.
        </p>
      )}
    </div>
  );
}

function GroqEnvironmentConfiguration({
  environmentId,
}: {
  readonly environmentId: EnvironmentId;
}) {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId, input: {} }),
  );
  const projection = Option.getOrNull(AsyncResult.value(configResult));
  const supported =
    projection?.source === "live" && projection.config.pulseCapabilities?.groqDictation === true;
  const session = useEnvironmentSessionState(environmentId);
  const fresh = !session.isPending && session.data?.authenticated === true;
  const canRead = fresh && session.data?.scopes?.includes(AuthOrchestrationReadScope) === true;
  const canOperate =
    fresh && session.data?.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const readStatus = useAtomCommand(readGroqApiKeyStatus, { reportFailure: false });
  const saveKey = useAtomCommand(saveGroqApiKey, { reportFailure: false });
  const removeKey = useAtomCommand(deleteGroqApiKey, { reportFailure: false });
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const accessKey = `${environmentId}:${projection?.source}:${supported}:${fresh}:${canRead}:${canOperate}`;
  useEffect(() => {
    setApiKey("");
    setConfigured(null);
    setError(null);
    setMutating(false);
    generation.current += 1;
    const current = generation.current;
    if (!supported || !canRead) return;
    void readStatus({ environmentId, input: {} }).then((result) => {
      if (current !== generation.current) return;
      if (result._tag === "Success") setConfigured(result.value.configured);
      else setError(String(squashAtomCommandFailure(result)));
    });
    return () => {
      generation.current += 1;
    };
  }, [accessKey]);
  const mutate = async (kind: "save" | "remove") => {
    if (mutating || !supported || !canOperate) return;
    const current = ++generation.current;
    setMutating(true);
    setError(null);
    const result =
      kind === "save"
        ? await saveKey({ environmentId, input: { apiKey } })
        : await removeKey({ environmentId, input: {} });
    setApiKey("");
    if (current !== generation.current) return;
    setMutating(false);
    if (result._tag === "Success") setConfigured(kind === "save");
    else setError(String(squashAtomCommandFailure(result)));
  };
  return projection?.source !== "live" ? (
    <p className="text-sm text-muted-foreground">
      Waiting for current dictation support from this environment.
    </p>
  ) : !supported ? (
    <p className="text-sm text-muted-foreground">
      Groq dictation is not supported by this environment.
    </p>
  ) : session.isPending ? (
    <p className="text-sm text-muted-foreground">Checking access…</p>
  ) : !canRead ? (
    <p className="text-sm text-muted-foreground">This session cannot view the Groq key status.</p>
  ) : (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {configured === null
          ? "Checking Groq API key…"
          : configured
            ? "A Groq API key is configured on this environment."
            : "No Groq API key is configured on this environment."}
      </p>
      {canOperate ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            nativeInput
            type="password"
            disabled={mutating}
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.currentTarget.value)}
            placeholder="Groq API key"
            aria-label="Groq API key"
          />
          <Button disabled={mutating || !apiKey.trim()} onClick={() => void mutate("save")}>
            Save key
          </Button>
          {configured ? (
            <Button
              disabled={mutating}
              variant="destructive-outline"
              onClick={() => void mutate("remove")}
            >
              Remove key
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This session cannot change the Groq API key.
        </p>
      )}
      {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
    </div>
  );
}
