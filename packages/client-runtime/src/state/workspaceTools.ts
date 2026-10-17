import {
  WS_METHODS,
  WorkspaceTaskQuery,
  WorkspaceToolsError,
  type EnvironmentId,
} from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";
const isToolsError = Schema.is(WorkspaceToolsError);
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
  // Cursor pages belong to one generation. The first page keeps its rows during refresh.
  type SummaryResult = Atom.Type<ReturnType<typeof summaries>>;
  const summaryPages = Atom.family((first: ReturnType<typeof summaries>) =>
    Atom.family((atom: ReturnType<typeof summaries>) =>
      Atom.transform(atom, (get): SummaryResult => {
        const result = get(atom);
        if (result.waiting) return AsyncResult.initial(true);
        if (AsyncResult.isFailure(result)) {
          const error = Cause.squash(result.cause);
          if (isToolsError(error) && error.kind === "invalid-input") get.refresh(first);
          return AsyncResult.failure(result.cause);
        }
        return result;
      }),
    ),
  );
  const decodeQuery = Schema.decodeUnknownOption(WorkspaceTaskQuery);
  const invalidQuery = Atom.make((): SummaryResult =>
    AsyncResult.fail(
      new WorkspaceToolsError({
        kind: "invalid-input",
        message: "Choose valid task filters and a page size from 1 to 100.",
      }),
    ),
  );
  const queryTasks = ({
    environmentId,
    input,
  }: {
    environmentId: EnvironmentId;
    input: typeof WorkspaceTaskQuery.Encoded;
  }) => {
    const decoded = decodeQuery(input);
    if (Option.isNone(decoded)) return invalidQuery;
    const query = decoded.value;
    const target = {
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
    };
    const atom = summaries(target);
    if (query.cursor === undefined) return atom;
    const { cursor: _, ...firstInput } = target.input;
    return summaryPages(summaries({ environmentId, input: firstInput }))(atom);
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
