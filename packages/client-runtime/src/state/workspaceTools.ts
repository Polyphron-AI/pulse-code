import {
  WS_METHODS,
  WorkspaceTaskQuery,
  WorkspaceProjectOverviewQuery,
  WorkspaceProjectOverviewCursor,
  normalizeWorkspaceProjectOverviewFilter,
  type WorkspaceProjectOverviewPage,
  type ProjectId,
  WorkspaceToolsError,
  type EnvironmentId,
} from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import { getInitialServerConfig, request, subscribeDynamic } from "../rpc/client.ts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
  createEnvironmentSubscriptionAtomFamily,
} from "./runtime.ts";
const isToolsError = Schema.is(WorkspaceToolsError);
export function createWorkspaceToolsAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
  options: {
    readonly projects?: (
      environmentId: EnvironmentId,
    ) => Atom.Atom<readonly { readonly id: ProjectId; readonly title: string }[]>;
  } = {},
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
  const emptyProjects = Atom.make<readonly { readonly id: ProjectId; readonly title: string }[]>(
    [],
  );
  const projects = options.projects ?? (() => emptyProjects);
  const hasOverview = Schema.is(
    Schema.Struct({
      pulseCapabilities: Schema.Struct({ workspaceProjectOverview: Schema.Literal(true) }),
    }),
  );
  const unsupported = new WorkspaceToolsError({
    kind: "unavailable",
    message: "Project overview metadata is unavailable on this server.",
  });
  const overviewChanges = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "workspace-tools:overview-changes",
    subscribe: (_input: Record<string, never>) => {
      const events = (
        tag:
          | typeof WS_METHODS.workspaceSubscribeChanges
          | typeof WS_METHODS.pulseLinksSubscribeChanges
          | typeof WS_METHODS.driveSubscribeChanges,
      ) =>
        subscribeDynamic(
          tag,
          Effect.fnUntraced(function* (session) {
            const config = yield* session.initialConfig.pipe(Effect.catch(() => Effect.never));
            return hasOverview(config) ? {} : yield* Effect.never;
          }),
        ).pipe(Stream.drop(1));
      return Stream.merge(
        Stream.merge(
          events(WS_METHODS.workspaceSubscribeChanges),
          events(WS_METHODS.pulseLinksSubscribeChanges),
        ),
        events(WS_METHODS.driveSubscribeChanges),
      );
    },
  });
  const overviewTrigger = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => [
      get(overviewChanges({ environmentId, input: {} })),
      get(projects(environmentId)),
    ]),
  );
  const overviewQueries = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "workspace-tools:overview",
    tag: WS_METHODS.workspaceListProjectOverview,
    refreshTrigger: ({ environmentId }) => overviewTrigger(environmentId),
    execute: Effect.fnUntraced(function* (input) {
      if (
        !hasOverview(
          yield* getInitialServerConfig().pipe(
            Effect.mapError(
              () =>
                new WorkspaceToolsError({
                  kind: "unavailable",
                  message: "Project overview server configuration is unavailable.",
                }),
            ),
          ),
        )
      )
        return yield* unsupported;
      return yield* request(WS_METHODS.workspaceListProjectOverview, input);
    }),
  });
  const decodeOverview = Schema.decodeUnknownOption(WorkspaceProjectOverviewQuery);
  const cursorJson = Schema.fromJsonString(WorkspaceProjectOverviewCursor);
  const decodeOverviewCursor = Schema.decodeUnknownOption(cursorJson);
  const encodeOverviewCursor = Schema.encodeSync(cursorJson);
  const invalidOverview = () =>
    AsyncResult.fail(
      new WorkspaceToolsError({
        kind: "invalid-input",
        message: "Choose valid project filters and a cursor from the same environment.",
      }),
    );
  const invalidOverviewAtom = Atom.make(invalidOverview);
  const overviewResults = Atom.family((key: string) => {
    const { environmentId, input } = JSON.parse(key) as {
      environmentId: EnvironmentId;
      input: WorkspaceProjectOverviewQuery;
    };
    const query = overviewQueries({ environmentId, input });
    return Atom.transform(query, (get) => {
      const result = get(query);
      if (!AsyncResult.isFailure(result) || Cause.squash(result.cause) !== unsupported)
        return input.cursor && result.waiting
          ? AsyncResult.initial<WorkspaceProjectOverviewPage, Error>(true)
          : result;
      const rows = get(projects(environmentId));
      const encoded = input.cursor ? Encoding.decodeBase64UrlString(input.cursor) : undefined;
      const cursor =
        encoded && Result.isSuccess(encoded)
          ? decodeOverviewCursor(encoded.success)
          : Option.none();
      if (
        input.cursor &&
        (Option.isNone(cursor) ||
          cursor.value.environmentId !== environmentId ||
          cursor.value.filter !== input.filter ||
          cursor.value.drive !== input.drive ||
          cursor.value.order !== input.order)
      )
        return invalidOverview();
      const after = Option.getOrUndefined(cursor);
      const selected = (input.drive === "all" ? rows : [])
        .map((project) => ({
          ...project,
          sortTitle: project.title.replace(/[A-Z]/g, (letter) => letter.toLowerCase()),
        }))
        .filter(
          (project) =>
            project.sortTitle.includes(input.filter) &&
            (!after ||
              project.sortTitle > after.sortTitle ||
              (project.sortTitle === after.sortTitle && project.id > after.projectId)),
        )
        .sort((a, b) =>
          a.sortTitle < b.sortTitle
            ? -1
            : a.sortTitle > b.sortTitle
              ? 1
              : a.id < b.id
                ? -1
                : a.id > b.id
                  ? 1
                  : 0,
        )
        .slice(0, input.limit + 1);
      const visible = selected.slice(0, input.limit),
        last = visible.at(-1);
      const nextCursor =
        selected.length > input.limit && last
          ? Encoding.encodeBase64Url(
              encodeOverviewCursor({
                version: 1,
                environmentId,
                filter: input.filter,
                drive: input.drive,
                order: input.order,
                sortTitle: last.sortTitle,
                projectId: last.id,
              }),
            )
          : undefined;
      if (nextCursor && nextCursor.length > 2048) return invalidOverview();
      return AsyncResult.success<WorkspaceProjectOverviewPage>({
        projects: visible.map((project) => ({
          projectId: project.id,
          title: project.title,
          description: null,
          driveRoot: "unavailable",
          channels: { count: null, complete: false, providers: [] },
        })),
        ...(nextCursor ? { nextCursor } : {}),
        incomplete: true,
      });
    });
  });
  const overview = ({
    environmentId,
    input,
  }: {
    environmentId: EnvironmentId;
    input: typeof WorkspaceProjectOverviewQuery.Encoded;
  }) => {
    const decoded = decodeOverview(input);
    if (Option.isNone(decoded)) return invalidOverviewAtom;
    return overviewResults(
      JSON.stringify({
        environmentId,
        input: {
          limit: decoded.value.limit,
          filter: normalizeWorkspaceProjectOverviewFilter(decoded.value.filter),
          drive: decoded.value.drive,
          order: decoded.value.order,
          ...(decoded.value.cursor ? { cursor: decoded.value.cursor } : {}),
        },
      }),
    );
  };
  const summaries = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "workspace-tools:queryTasks",
    tag: WS_METHODS.workspaceQueryTasks,
    refreshTrigger,
    staleTimeMs: 30000,
  });
  // Cursor pages belong to one generation. The first page keeps its rows during refresh.
  type SummaryResult = Atom.Type<ReturnType<typeof summaries>>;
  const summaryPages = Atom.family((first: ReturnType<typeof summaries>) =>
    Atom.family((atom: ReturnType<typeof summaries>) => {
      let firstValue: import("@t3tools/contracts").WorkspaceTaskPage | undefined;
      let observed = false;
      return Atom.transform(atom, (get): SummaryResult => {
        const result = get(atom);
        const currentFirst = get.once(first);
        const currentValue = Option.getOrUndefined(AsyncResult.value(currentFirst));
        if (!observed || result.waiting) {
          firstValue = currentValue;
          observed = true;
        }
        if (result.waiting) return AsyncResult.initial(true);
        if (AsyncResult.isFailure(result)) {
          const error = Cause.squash(result.cause);
          if (
            isToolsError(error) &&
            error.kind === "invalid-input" &&
            !currentFirst.waiting &&
            currentValue === firstValue
          )
            get.refresh(first);
          return AsyncResult.failure(result.cause);
        }
        return result;
      });
    }),
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
    overview,
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
