import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type PulseMcpConnection,
  type PulseMcpConnectionInput,
  type PulseMcpDiscoveryCandidate,
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
import { McpWardenCard } from "./McpWardenCard";
import {
  discoverPulseMcp,
  importDiscoveredPulseMcp,
  pulseMcpList,
  pulseMcpWardenCredentials,
  removePulseMcp,
  setPulseMcpDiscoveryFollow,
  upsertPulseMcp,
} from "./mcpState";

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
  const canCreate = projection?.config.pulseCapabilities?.mcpCreateOnly === true;
  const canDiscover = projection?.config.pulseCapabilities?.mcpDiscovery === true;
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
  const discovered = useEnvironmentQuery(
    canDiscover && canRead ? discoverPulseMcp({ environmentId, input: {} }) : null,
  );
  const wardenEnabled = projection?.config.pulseCapabilities?.wardenCredentials === true;
  const wardenCredentials = useEnvironmentQuery(
    wardenEnabled && canRead ? pulseMcpWardenCredentials({ environmentId, input: {} }) : null,
  );
  const importDiscovered = useAtomCommand(importDiscoveredPulseMcp, { reportFailure: false });
  const setDiscoveryFollow = useAtomCommand(setPulseMcpDiscoveryFollow, { reportFailure: false });
  const [connections, setConnections] = useState<ReadonlyArray<PulseMcpConnection>>([]);
  const accessGeneration = useRef(0);
  const accessKeyRef = useRef("");
  const accessKey = `${supported}:${canCreate}:${sessionFresh}:${canRead}:${canOperate}`;
  if (accessKeyRef.current !== accessKey) {
    accessKeyRef.current = accessKey;
    accessGeneration.current += 1;
  }
  useEffect(() => {
    if (list.data) setConnections(list.data);
  }, [list.data]);

  const assertAccess = (capturedEnvironment: string, generation: number, createOnly = false) => {
    if (
      capturedEnvironment !== environmentId ||
      generation !== accessGeneration.current ||
      !supported ||
      !canOperate ||
      (createOnly && !canCreate)
    )
      throw new Error("MCP connection access changed.");
  };
  const upsert = async (capturedEnvironment: string, input: PulseMcpConnectionInput) => {
    const generation = accessGeneration.current;
    assertAccess(capturedEnvironment, generation, input.createOnly === true);
    const result = await upsertCommand({ environmentId, input });
    assertAccess(capturedEnvironment, generation, input.createOnly === true);
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
          Manage connection records stored on one environment. Composer selection and provider
          connection are not available yet.
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
        <>
          {wardenEnabled ? (
            <McpWardenCard
              environmentId={environmentId}
              disabled={!canOperate}
              onSaved={wardenCredentials.refresh}
            />
          ) : null}
          {canDiscover ? (
            <McpDiscoveryReview
              candidates={discovered.data ?? []}
              managedIds={connections.map(({ id }) => id)}
              disabled={!canOperate}
              loading={discovered.isPending && discovered.data === null}
              onRefresh={discovered.refresh}
              onImport={async (candidate) => {
                const result = await importDiscovered({
                  environmentId,
                  input: { source: candidate.source, name: candidate.name },
                });
                if (result._tag === "Failure") throw squashAtomCommandFailure(result);
                setConnections((current) =>
                  [...current, result.value].sort((a, b) => a.name.localeCompare(b.name)),
                );
                discovered.refresh();
              }}
              onFollow={async (source, followNew) => {
                const result = await setDiscoveryFollow({
                  environmentId,
                  input: { source, followNew },
                });
                if (result._tag === "Failure") throw squashAtomCommandFailure(result);
                discovered.refresh();
              }}
            />
          ) : null}
          <McpConnectionsPanel
            environmentKey={environmentId}
            connections={connections}
            disabled={!canOperate}
            canCreate={canCreate}
            wardenCredentials={wardenEnabled ? (wardenCredentials.data ?? []) : null}
            upsert={upsert}
            remove={remove}
          />
        </>
      )}
    </div>
  );
}

function McpDiscoveryReview(props: {
  readonly candidates: ReadonlyArray<PulseMcpDiscoveryCandidate>;
  readonly managedIds: readonly string[];
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly onImport: (candidate: PulseMcpDiscoveryCandidate) => Promise<void>;
  readonly onFollow: (
    source: PulseMcpDiscoveryCandidate["source"],
    followNew: boolean,
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <section
      className="mb-4 rounded-lg border border-border p-3"
      aria-label="Provider MCP discovery"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Detected user-level MCP servers</p>
          <p className="text-xs text-muted-foreground">
            Review before importing. Imports do not enable a server in chats.
          </p>
        </div>
        <button type="button" className="text-sm text-primary underline" onClick={props.onRefresh}>
          Scan again
        </button>
      </div>
      {props.loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Scanning provider configs…</p>
      ) : null}
      {["claude", "codex", "opencode"].map((source) => {
        const candidates = props.candidates.filter((candidate) => candidate.source === source);
        if (candidates.length === 0) return null;
        const following = candidates.some((candidate) => candidate.following);
        return (
          <label
            key={source}
            className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <input
              type="checkbox"
              checked={following}
              disabled={props.disabled}
              onChange={(event) =>
                void props.onFollow(
                  source as PulseMcpDiscoveryCandidate["source"],
                  event.currentTarget.checked,
                )
              }
            />
            Follow new {source} servers after this reviewed baseline
          </label>
        );
      })}
      {props.candidates.map((candidate) => {
        const managed = props.managedIds.includes(candidate.id);
        return (
          <div
            key={`${candidate.source}:${candidate.name}`}
            className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate">
                {candidate.name}{" "}
                <span className="text-xs text-muted-foreground">{candidate.source}</span>
              </p>
              {candidate.reason ? (
                <p className="text-xs text-muted-foreground">{candidate.reason}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="shrink-0 text-primary underline disabled:text-muted-foreground disabled:no-underline"
              disabled={props.disabled || !candidate.importable || managed || busy !== null}
              onClick={() => {
                setBusy(candidate.id);
                void props.onImport(candidate).finally(() => setBusy(null));
              }}
            >
              {managed ? "Already managed" : busy === candidate.id ? "Importing…" : "Import"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
