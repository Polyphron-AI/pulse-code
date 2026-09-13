import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type PulseSkillMutation,
  type PulseSkillRecord,
} from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { resolveEnvironmentOptionLabel } from "../components/BranchToolbar.logic";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentSessionState } from "../state/session";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { ManagedSkillsPanel } from "./ManagedSkillsPanel";
import { managedSkillsList, mutateManagedSkill } from "./managedSkillsState";

export function resolveManagedSkillsEnvironmentId(
  environmentIds: ReadonlyArray<EnvironmentId>,
  selectedEnvironmentId: EnvironmentId | null,
  primaryEnvironmentId: EnvironmentId | null,
): EnvironmentId | null {
  if (selectedEnvironmentId && environmentIds.includes(selectedEnvironmentId)) {
    return selectedEnvironmentId;
  }
  if (primaryEnvironmentId && environmentIds.includes(primaryEnvironmentId)) {
    return primaryEnvironmentId;
  }
  return environmentIds[0] ?? null;
}

export function ManagedSkillsSettings() {
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const environmentId = resolveManagedSkillsEnvironmentId(
    environments.map((environment) => environment.environmentId),
    selectedEnvironmentId,
    primaryEnvironmentId,
  );

  if (!isReady) return <p className="text-sm text-muted-foreground">Checking environments…</p>;
  if (environmentId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Managed skills are not supported by the connected environments.
      </p>
    );
  }

  return (
    <ManagedSkillsEnvironment
      key={environmentId}
      environmentId={environmentId}
      environments={environments}
      primaryEnvironmentId={primaryEnvironmentId}
      onEnvironmentChange={setSelectedEnvironmentId}
    />
  );
}

function ManagedSkillsEnvironment({
  environmentId,
  environments,
  primaryEnvironmentId,
  onEnvironmentChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly environments: ReturnType<typeof useEnvironments>["environments"];
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly onEnvironmentChange: (environmentId: EnvironmentId) => void;
}) {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId, input: {} }),
  );
  const configProjection = Option.getOrNull(AsyncResult.value(configResult));
  const liveConfigReady = configProjection?.source === "live";
  const liveSupportsManagedSkills =
    liveConfigReady && configProjection.config.pulseCapabilities?.managedSkills === true;
  const session = useEnvironmentSessionState(environmentId);
  const sessionFresh = !session.isPending && session.data?.authenticated === true;
  const scopes = sessionFresh && session.data ? session.data.scopes : undefined;
  const canRead = scopes?.includes(AuthOrchestrationReadScope) === true;
  const canOperate = scopes?.includes(AuthOrchestrationOperateScope) === true;
  const list = useEnvironmentQuery(
    liveSupportsManagedSkills && canRead ? managedSkillsList({ environmentId, input: {} }) : null,
  );
  const mutate = useAtomCommand(mutateManagedSkill, { reportFailure: false });
  const [skills, setSkills] = useState<ReadonlyArray<PulseSkillRecord>>([]);
  const accessGenerationRef = useRef(0);
  const accessKeyRef = useRef("");
  const accessKey = `${liveSupportsManagedSkills}:${sessionFresh}:${canRead}:${canOperate}`;
  if (accessKeyRef.current !== accessKey) {
    accessKeyRef.current = accessKey;
    accessGenerationRef.current += 1;
  }

  useEffect(() => {
    if (list.data) setSkills(list.data);
  }, [list.data]);

  const runMutation = async (
    capturedEnvironmentId: string,
    mutation: PulseSkillMutation,
  ): Promise<ReadonlyArray<PulseSkillRecord>> => {
    if (capturedEnvironmentId !== environmentId || !liveSupportsManagedSkills || !canOperate) {
      throw new Error("Managed skills access changed.");
    }
    const accessGeneration = accessGenerationRef.current;
    const result = await mutate({ environmentId, input: mutation });
    if (accessGeneration !== accessGenerationRef.current) {
      throw new Error("Managed skills access changed before the operation finished.");
    }
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    setSkills(result.value);
    return result.value;
  };

  const selected = environments.find((environment) => environment.environmentId === environmentId)!;
  const label = (candidate: (typeof environments)[number]) =>
    resolveEnvironmentOptionLabel({
      isPrimary: candidate.environmentId === primaryEnvironmentId,
      environmentId: candidate.environmentId,
      runtimeLabel: candidate.label,
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] text-muted-foreground">
            Manage skill files stored on one environment. Select managed skills in the Codex
            composer on environments that support skill invocation.
          </p>
        </div>
        <Select
          value={environmentId}
          onValueChange={(value) => value && onEnvironmentChange(value as EnvironmentId)}
        >
          <SelectTrigger size="sm" className="w-full sm:w-52" aria-label="Skills environment">
            <SelectValue>{label(selected)}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {environments.map((environment) => (
              <SelectItem key={environment.environmentId} value={environment.environmentId}>
                {label(environment)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {!liveConfigReady ? (
        <p className="text-sm text-muted-foreground">
          Waiting for current managed skills support from this environment.
        </p>
      ) : !liveSupportsManagedSkills ? (
        <p className="text-sm text-muted-foreground">
          Managed skills are not supported by this environment.
        </p>
      ) : session.isPending ? (
        <p className="text-sm text-muted-foreground">Checking access…</p>
      ) : !canRead ? (
        <p className="text-sm text-muted-foreground">
          This session cannot view managed skills on this environment.
        </p>
      ) : list.error ? (
        <div className="space-y-2 text-sm">
          <p className="text-error-foreground">Could not load managed skills. {list.error}</p>
          <button className="text-primary underline" type="button" onClick={list.refresh}>
            Try again
          </button>
        </div>
      ) : list.isPending && list.data === null ? (
        <p className="text-sm text-muted-foreground">Loading managed skills…</p>
      ) : (
        <ManagedSkillsPanel
          environmentKey={environmentId}
          skills={skills}
          mutate={runMutation}
          disabled={!canOperate}
        />
      )}
    </div>
  );
}
