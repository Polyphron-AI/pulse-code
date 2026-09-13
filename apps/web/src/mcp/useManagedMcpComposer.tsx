import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderSessionStartInput,
  type ThreadId,
} from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { useAtomCommand } from "../state/use-atom-command";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentSessionState } from "../state/session";
import { serverEnvironment } from "../state/server";
import type { ManagedMcpEntry } from "./managedMcpPickerLogic";
import { McpSendPause, type FailedMcpConnection } from "./McpSendPause";
import type { McpSubmissionPreparation, PrepareComposerMcp } from "./prepareMcpSubmission";
import {
  preparePulseMcpTurn,
  pulseMcpList,
  pulseMcpProviderDefault,
  pulseMcpThreadOverride,
  resetPulseMcpThreadOverride,
  setPulseMcpThreadOverride,
} from "./mcpState";

interface PendingPreparation {
  readonly providerSession: ProviderSessionStartInput;
  readonly failed: ReadonlyArray<FailedMcpConnection>;
  readonly resolve: (outcome: McpSubmissionPreparation) => void;
}

export function useManagedMcpComposer(input: {
  readonly environmentId: EnvironmentId;
  readonly provider: ProviderDriverKind;
  readonly providerInstanceId: ProviderInstanceId;
  readonly threadId: ThreadId | null;
  readonly draftConnectionIds: ReadonlyArray<string> | null;
  readonly onDraftConnectionIdsChange: (ids: ReadonlyArray<string> | null) => void;
  readonly onManage: () => void;
}) {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId: input.environmentId, input: {} }),
  );
  const projection = Option.getOrNull(AsyncResult.value(configResult));
  const capabilityReady = projection?.source === "live";
  const supported = projection?.config.pulseCapabilities?.codexManagedMcp === true;
  const session = useEnvironmentSessionState(input.environmentId);
  const scopes =
    !session.isPending && session.data?.authenticated ? session.data.scopes : undefined;
  const canRead = scopes?.includes(AuthOrchestrationReadScope) === true;
  const canOperate = scopes?.includes(AuthOrchestrationOperateScope) === true;
  const enabled = input.provider === "codex" && supported && canRead && canOperate;
  const list = useEnvironmentQuery(
    enabled ? pulseMcpList({ environmentId: input.environmentId, input: {} }) : null,
  );
  const providerDefault = useEnvironmentQuery(
    enabled
      ? pulseMcpProviderDefault({
          environmentId: input.environmentId,
          input: { providerInstanceId: input.providerInstanceId },
        })
      : null,
  );
  const threadOverride = useEnvironmentQuery(
    enabled && input.threadId
      ? pulseMcpThreadOverride({
          environmentId: input.environmentId,
          input: { threadId: input.threadId },
        })
      : null,
  );
  const setOverride = useAtomCommand(setPulseMcpThreadOverride, { reportFailure: false });
  const resetOverride = useAtomCommand(resetPulseMcpThreadOverride, { reportFailure: false });
  const prepareTurn = useAtomCommand(preparePulseMcpTurn, { reportFailure: false });
  const serverOverride = threadOverride.data?.connectionIds;
  const selectionMode: "override" | "defaults" =
    input.draftConnectionIds !== null || serverOverride !== undefined ? "override" : "defaults";
  const selectedIds =
    input.draftConnectionIds ?? serverOverride ?? providerDefault.data?.connectionIds ?? [];
  const loading =
    enabled &&
    (list.data === null ||
      providerDefault.data === null ||
      (input.threadId !== null && threadOverride.data === null));
  const entries = useMemo<ReadonlyArray<ManagedMcpEntry>>(
    () =>
      (list.data ?? []).map((connection) => ({
        id: connection.id,
        name: connection.name,
        description:
          connection.config.transport === "http" ? connection.config.url : "Local command",
        source: "pulse",
        status: "unknown",
      })),
    [list.data],
  );
  const blockedReason = !capabilityReady
    ? "Waiting for MCP support from this environment."
    : input.provider !== "codex"
      ? null
      : !supported
        ? "Managed MCPs are not supported by this environment."
        : !canRead || !canOperate
          ? "This session cannot use managed MCP connections."
          : loading
            ? "MCP selection is still loading."
            : list.error || providerDefault.error || threadOverride.error
              ? "MCP selection could not be loaded."
              : null;

  const accessKey = `${input.environmentId}:${input.threadId ?? "draft"}:${input.providerInstanceId}:${selectedIds.join(",")}`;
  const accessKeyRef = useRef(accessKey);
  const [pending, setPending] = useState<PendingPreparation | null>(null);
  const pendingRef = useRef<PendingPreparation | null>(null);
  pendingRef.current = pending;
  useEffect(() => {
    if (accessKeyRef.current === accessKey) return;
    accessKeyRef.current = accessKey;
    setPending((current) => {
      current?.resolve({ status: "cancelled" });
      return null;
    });
  }, [accessKey]);
  useEffect(
    () => () => {
      pendingRef.current?.resolve({ status: "cancelled" });
    },
    [],
  );

  const runPreparation = useCallback(
    async (
      providerSession: ProviderSessionStartInput,
      resolve: (outcome: McpSubmissionPreparation) => void,
      options?: {
        readonly excludedConnectionIds?: ReadonlyArray<string>;
        readonly retry?: boolean;
      },
    ) => {
      const result = await prepareTurn({
        environmentId: input.environmentId,
        input: {
          threadId: providerSession.threadId,
          providerSession,
          ...(selectionMode === "override" ? { connectionIds: [...selectedIds] } : {}),
          ...(options?.excludedConnectionIds
            ? { excludedConnectionIds: [...options.excludedConnectionIds] }
            : {}),
          ...(options?.retry ? { retry: true } : {}),
        },
      });
      if (accessKeyRef.current !== accessKey || result._tag === "Failure") {
        resolve({ status: "cancelled" });
        setPending(null);
        return;
      }
      if (result.value.status === "ready") {
        resolve({ status: "ready", preparationId: result.value.preparationId });
        setPending(null);
        return;
      }
      if (result.value.status === "failed") {
        setPending({
          providerSession,
          resolve,
          failed: result.value.connections.flatMap((connection) =>
            connection.status === "failed"
              ? [
                  {
                    connectionId: connection.connectionId,
                    name: connection.name,
                    message: connection.message,
                  },
                ]
              : [],
          ),
        });
        return;
      }
      resolve({ status: "cancelled" });
      setPending(null);
    },
    [accessKey, input.environmentId, prepareTurn, selectedIds, selectionMode],
  );

  const prepare = useCallback<PrepareComposerMcp>(
    (providerSession, options): Promise<McpSubmissionPreparation> => {
      if (input.provider !== "codex" || !supported) return Promise.resolve({ status: "ready" });
      if (blockedReason) return Promise.resolve({ status: "cancelled" });
      if (options?.creatingWorktree && selectedIds.length > 0) {
        return Promise.resolve({ status: "cancelled" });
      }
      return new Promise((resolve) => void runPreparation(providerSession, resolve));
    },
    [blockedReason, input.provider, runPreparation, selectedIds.length, supported],
  );

  const changeSelection = useCallback(
    async (ids: ReadonlyArray<string>) => {
      input.onDraftConnectionIdsChange(ids);
      if (!input.threadId) return;
      const result = await setOverride({
        environmentId: input.environmentId,
        input: { threadId: input.threadId, connectionIds: [...ids] },
      });
      if (result._tag === "Success") threadOverride.refresh();
    },
    [input, setOverride, threadOverride],
  );
  const useDefaults = useCallback(async () => {
    input.onDraftConnectionIdsChange(null);
    if (!input.threadId) return;
    const result = await resetOverride({
      environmentId: input.environmentId,
      input: { threadId: input.threadId },
    });
    if (result._tag === "Success") threadOverride.refresh();
  }, [input, resetOverride, threadOverride]);

  const pause = pending ? (
    <McpSendPause
      open
      failed={pending.failed}
      onOpenChange={(open) => {
        if (!open) {
          pending.resolve({ status: "cancelled" });
          setPending(null);
        }
      }}
      onRetry={() => void runPreparation(pending.providerSession, pending.resolve, { retry: true })}
      onContinueWithout={(excludedConnectionIds) =>
        void runPreparation(pending.providerSession, pending.resolve, { excludedConnectionIds })
      }
      onManage={input.onManage}
    />
  ) : null;

  return {
    picker: {
      entries,
      selectedIds,
      selectionMode,
      nativeDiscovery: "unavailable" as const,
      disabled: !enabled,
      loading,
      error: list.error ? "Could not load MCPs." : null,
      onChange: changeSelection,
      onUseDefaults: useDefaults,
      onManage: input.onManage,
      onRetry: list.refresh,
    },
    blockedReason,
    selectedCount: selectedIds.length,
    prepare,
    pause,
  };
}
