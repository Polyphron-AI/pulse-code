import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type PulseMcpConnection,
  type PulseMcpConnectionInput,
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
import { McpConnectionsPanel } from "./McpConnectionsPanel";
import { pulseMcpList, removePulseMcp, upsertPulseMcp } from "./mcpState";

export function resolveMcpEnvironmentId(
  environmentIds: ReadonlyArray<EnvironmentId>,
  selectedEnvironmentId: EnvironmentId | null,
  primaryEnvironmentId: EnvironmentId | null,
): EnvironmentId | null {
  if (selectedEnvironmentId && environmentIds.includes(selectedEnvironmentId))
    return selectedEnvironmentId;
  if (primaryEnvironmentId && environmentIds.includes(primaryEnvironmentId))
    return primaryEnvironmentId;
  return environmentIds[0] ?? null;
}

export function McpConnectionsSettings() {
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const environmentId = resolveMcpEnvironmentId(
    environments.map(({ environmentId }) => environmentId),
    selectedEnvironmentId,
    primaryEnvironmentId,
  );
  if (!isReady) return <p className="text-sm text-muted-foreground">Checking environments…</p>;
  if (!environmentId)
    return (
      <p className="text-sm text-muted-foreground">
        MCP connection management is not supported by the connected environments.
      </p>
    );
  return (
    <McpEnvironment
      key={environmentId}
      environmentId={environmentId}
      environments={environments}
      primaryEnvironmentId={primaryEnvironmentId}
      onEnvironmentChange={setSelectedEnvironmentId}
    />
  );
}

function McpEnvironment({
  environmentId,
  environments,
  primaryEnvironmentId,
  onEnvironmentChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly environments: ReturnType<typeof useEnvironments>["environments"];
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly onEnvironmentChange: (id: EnvironmentId) => void;
}) {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId, input: {} }),
  );
  const projection = Option.getOrNull(AsyncResult.value(configResult));
  const liveConfigReady = projection?.source === "live";
  const supported = liveConfigReady && projection.config.pulseCapabilities?.mcpManagement === true;
  const session = useEnvironmentSessionState(environmentId);
  const sessionFresh = !session.isPending && session.data?.authenticated === true;
  const scopes = sessionFresh ? session.data?.scopes : undefined;
  const canRead = scopes?.includes(AuthOrchestrationReadScope) === true;
  const canOperate = scopes?.includes(AuthOrchestrationOperateScope) === true;
  const list = useEnvironmentQuery(
    supported && canRead ? pulseMcpList({ environmentId, input: {} }) : null,
  );
  const upsertCommand = useAtomCommand(upsertPulseMcp, { reportFailure: false });
  const removeCommand = useAtomCommand(removePulseMcp, { reportFailure: false });
  const [connections, setConnections] = useState<ReadonlyArray<PulseMcpConnection>>([]);
  const accessGeneration = useRef(0);
  const accessKeyRef = useRef("");
  const accessKey = `${supported}:${sessionFresh}:${canRead}:${canOperate}`;
  if (accessKeyRef.current !== accessKey) {
    accessKeyRef.current = accessKey;
    accessGeneration.current += 1;
  }
  useEffect(() => {
    if (list.data) setConnections(list.data);
  }, [list.data]);

  const assertAccess = (capturedEnvironment: string, generation: number) => {
    if (
      capturedEnvironment !== environmentId ||
      generation !== accessGeneration.current ||
      !supported ||
      !canOperate
    )
      throw new Error("MCP connection access changed.");
  };
  const upsert = async (capturedEnvironment: string, input: PulseMcpConnectionInput) => {
    const generation = accessGeneration.current;
    assertAccess(capturedEnvironment, generation);
    const result = await upsertCommand({ environmentId, input });
    assertAccess(capturedEnvironment, generation);
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    setConnections((current) =>
      [...current.filter(({ id }) => id !== result.value.id), result.value].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  };
  const remove = async (capturedEnvironment: string, id: string) => {
    const generation = accessGeneration.current;
    assertAccess(capturedEnvironment, generation);
    const result = await removeCommand({ environmentId, input: { id } });
    assertAccess(capturedEnvironment, generation);
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    setConnections((current) => current.filter((connection) => connection.id !== id));
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
        <p className="text-[13px] text-muted-foreground">
          Manage connection records stored on one environment. Provider selection and session
          application are configured elsewhere.
        </p>
        <Select
          value={environmentId}
          onValueChange={(value) => value && onEnvironmentChange(value as EnvironmentId)}
        >
          <SelectTrigger size="sm" className="w-full sm:w-52" aria-label="MCP environment">
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
          Waiting for current MCP management support from this environment.
        </p>
      ) : !supported ? (
        <p className="text-sm text-muted-foreground">
          MCP connection management is not supported by this environment.
        </p>
      ) : session.isPending ? (
        <p className="text-sm text-muted-foreground">Checking access…</p>
      ) : !canRead ? (
        <p className="text-sm text-muted-foreground">
          This session cannot view MCP connections on this environment.
        </p>
      ) : list.error ? (
        <div className="space-y-2 text-sm">
          <p className="text-error-foreground">Could not load MCP connections. {list.error}</p>
          <button className="text-primary underline" type="button" onClick={list.refresh}>
            Try again
          </button>
        </div>
      ) : list.isPending && list.data === null ? (
        <p className="text-sm text-muted-foreground">Loading MCP connections…</p>
      ) : (
        <McpConnectionsPanel
          environmentKey={environmentId}
          connections={connections}
          disabled={!canOperate}
          upsert={upsert}
          remove={remove}
        />
      )}
    </div>
  );
}
