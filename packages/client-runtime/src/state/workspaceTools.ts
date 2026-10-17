import { WS_METHODS, WorkspaceTaskQuery, type EnvironmentId } from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import * as Schema from "effect/Schema";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";
export function createWorkspaceToolsAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const changes = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "workspace-tools:changes",
    tag: WS_METHODS.workspaceSubscribeChanges,
  });
  const refreshTrigger = ({
    environmentId,
  }: {
    environmentId: import("@t3tools/contracts").EnvironmentId;
  }) => changes({ environmentId, input: {} });
  const summaries = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "workspace-tools:queryTasks",
    tag: WS_METHODS.workspaceQueryTasks,
    refreshTrigger,
    staleTimeMs: 30000,
  });
  // A cursor belongs to one dataset generation. Never expose an old page during refresh.
  type SummaryResult = Atom.Type<ReturnType<typeof summaries>>;
  const summaryPages = Atom.family((atom: ReturnType<typeof summaries>) =>
    Atom.map(atom, (result): SummaryResult => {
      if (result.waiting) return AsyncResult.initial(true);
      if (AsyncResult.isFailure(result)) return AsyncResult.failure(result.cause);
      return result;
    }),
  );
  const decodeQuery = Schema.decodeUnknownSync(WorkspaceTaskQuery);
  const queryTasks = ({
    environmentId,
    input,
  }: {
    environmentId: EnvironmentId;
    input: typeof WorkspaceTaskQuery.Encoded;
  }) => {
    const query = decodeQuery(input);
    return summaryPages(
      summaries({
        environmentId,
        input: {
          ...(query.projectId ? { projectId: query.projectId } : {}),
          state: query.state,
          ...(query.text ? { text: query.text } : {}),
          ...(query.dueFrom ? { dueFrom: query.dueFrom } : {}),
          ...(query.dueTo ? { dueTo: query.dueTo } : {}),
          owner: query.owner,
          limit: query.limit,
          ...(query.cursor ? { cursor: query.cursor } : {}),
        },
      }),
    );
  };
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial",
    key: ({ environmentId }: { environmentId: string }) => environmentId,
  } as const;
  return {
    changes,
    queryTasks,
    config: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "workspace-tools:config",
      tag: WS_METHODS.workspaceGetProjectConfig,
      refreshTrigger,
      staleTimeMs: 30000,
    }),
    tasks: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "workspace-tools:tasks",
      tag: WS_METHODS.workspaceListTasks,
      refreshTrigger,
      staleTimeMs: 30000,
    }),
    task: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "workspace-tools:task",
      tag: WS_METHODS.workspaceGetTask,
      refreshTrigger,
      staleTimeMs: 30000,
    }),
    saveConfig: createEnvironmentRpcCommand(runtime, {
      label: "workspace-tools:saveConfig",
      tag: WS_METHODS.workspaceSaveProjectConfig,
      scheduler,
      concurrency,
    }),
    upsertTask: createEnvironmentRpcCommand(runtime, {
      label: "workspace-tools:upsertTask",
      tag: WS_METHODS.workspaceUpsertTask,
      scheduler,
      concurrency,
    }),
    patchTask: createEnvironmentRpcCommand(runtime, {
      label: "workspace-tools:patchTask",
      tag: WS_METHODS.workspacePatchTask,
      scheduler,
      concurrency,
    }),
    transitionTask: createEnvironmentRpcCommand(runtime, {
      label: "workspace-tools:transitionTask",
      tag: WS_METHODS.workspaceTransitionTask,
      scheduler,
      concurrency,
    }),
    deleteTask: createEnvironmentRpcCommand(runtime, {
      label: "workspace-tools:deleteTask",
      tag: WS_METHODS.workspaceDeleteTask,
      scheduler,
      concurrency,
    }),
    saveAutomation: createEnvironmentRpcCommand(runtime, {
      label: "workspace-tools:saveAutomation",
      tag: WS_METHODS.workspaceSaveAutomation,
      scheduler,
      concurrency,
    }),
  };
}
