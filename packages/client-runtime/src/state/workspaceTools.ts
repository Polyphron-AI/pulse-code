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
import * as Latch from "effect/Latch";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import {
  EnvironmentRpcUnavailableError,
  EnvironmentRpcSubscriptionObserver,
  type EnvironmentRpcStreamFailure,
  getInitialServerConfig,
  request,
} from "../rpc/client.ts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import * as SubscriptionRef from "effect/SubscriptionRef";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
  followStreamInEnvironment,
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
  const overviewConnection = Atom.family((environmentId: EnvironmentId) =>
    runtime
      .atom(
        followStreamInEnvironment(
          environmentId,
          Stream.unwrap(
            EnvironmentSupervisor.pipe(
              Effect.map((supervisor) =>
                SubscriptionRef.changes(supervisor.state).pipe(
                  Stream.zipLatest(SubscriptionRef.changes(supervisor.session)),
                  Stream.changesWith(
                    ([stateA, sessionA], [stateB, sessionB]) =>
                      stateA.phase === stateB.phase &&
                      stateA.generation === stateB.generation &&
                      stateA.lastFailure === stateB.lastFailure &&
                      Option.getOrNull(sessionA) === Option.getOrNull(sessionB),
                  ),
                ),
              ),
            ),
          ),
        ),
      )
      .pipe(Atom.setIdleTTL(0)),
  );
  // overviewChanges replaces ready per session before queries run. A stale open latch
  // only permits an early read: the unseeded replay queues a fresh read afterward.
  const overviewCounterState = Atom.family((_environmentId: EnvironmentId) =>
    Atom.make(() => ({
      revision: 0,
      ready: Latch.makeUnsafe(),
    })).pipe(Atom.setIdleTTL(0)),
  );
  const overviewChanges = Atom.family((environmentId: EnvironmentId) =>
    runtime
      .atom((get) => {
        const connection = get(overviewConnection(environmentId));
        if (
          !AsyncResult.isSuccess(connection) ||
          connection.value[0].phase !== "connected" ||
          Option.isNone(connection.value[1])
        )
          return Stream.never;
        const state = get(overviewCounterState(environmentId));
        const session = connection.value[1].value;
        const ready = Latch.makeUnsafe();
        state.ready = ready;
        return followStreamInEnvironment(
          environmentId,
          Stream.callback<
            number,
            EnvironmentRpcStreamFailure<typeof WS_METHODS.workspaceSubscribeChanges>
          >(
            Effect.fnUntraced(function* (queue) {
              const config = yield* session.initialConfig.pipe(Effect.catch(() => Effect.never));
              if (!hasOverview(config)) return yield* Effect.never;
              const observer = yield* EnvironmentRpcSubscriptionObserver;
              for (const tag of [
                WS_METHODS.workspaceSubscribeChanges,
                WS_METHODS.pulseLinksSubscribeChanges,
                WS_METHODS.driveSubscribeChanges,
              ] as const) {
                const complete = yield* observer.observe({ environmentId, method: tag, input: {} });
                // The read snapshots revisions after registration. Servers filter the zero baseline and
                // replay their current counter later, so an unseeded value must refresh; that replay can
                // cost one extra read per mount or reconnect until servers emit on subscribe.
                yield* session.client[tag]({}).pipe(
                  Stream.changes,
                  Stream.runForEach(() => Queue.offer(queue, ++state.revision)),
                  Effect.catchCause((cause) => Queue.failCause(queue, cause)),
                  Effect.ensuring(complete),
                  Effect.forkScoped({ startImmediately: true }),
                );
              }
              ready.openUnsafe();
              return yield* Effect.never;
            }),
            { bufferSize: 1, strategy: "sliding" },
          ),
        );
      })
      .pipe(
        Atom.setIdleTTL(0),
        Atom.withLabel(`workspace-tools:overview-changes:${environmentId}`),
      ),
  );
  const overviewProjects = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => get(projects(environmentId))).pipe(
      Atom.withEquality<readonly { readonly id: ProjectId; readonly title: string }[]>(
        (a, b) =>
          a.length === b.length &&
          a.every(
            (project, index) => project.id === b[index]!.id && project.title === b[index]!.title,
          ),
      ),
      Atom.setIdleTTL(0),
    ),
  );
  const overviewQueries = Atom.family((key: string) => {
    const { environmentId, input, pages } = JSON.parse(key) as {
      environmentId: EnvironmentId;
      input: WorkspaceProjectOverviewQuery;
      pages: number;
    };
    // The cell belongs to one registry, even when multiple clients share the atom family.
    const lifecycle = Atom.make(() => ({ started: false, revision: 0 }));
    const signal = overviewChanges(environmentId);
    const query = runtime
      .atom<WorkspaceProjectOverviewPage, Error>((get) => {
        const state = get(lifecycle);
        const counters = get(overviewCounterState(environmentId));
        state.started = false;
        const connection = get(overviewConnection(environmentId));
        if (!AsyncResult.isSuccess(connection)) return Effect.never;
        const [connectionState, session] = connection.value;
        switch (connectionState.phase) {
          case "connected":
            if (Option.isNone(session)) return Effect.never;
            break;
          case "connecting":
          case "backoff":
            return Effect.never;
          case "available":
          case "offline":
          case "blocked":
            return Effect.fail(
              connectionState.lastFailure ??
                new EnvironmentRpcUnavailableError({
                  environmentId,
                  message: `Environment ${environmentId} is ${
                    connectionState.phase === "available" ? "not connected" : connectionState.phase
                  }.`,
                }),
            );
        }
        return EnvironmentRegistry.pipe(
          Effect.flatMap((registry) =>
            registry.run(
              environmentId,
              Effect.gen(function* () {
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
                yield* counters.ready.await;
                state.revision = counters.revision;
                state.started = true;
                const rows: WorkspaceProjectOverviewPage["projects"][number][] = [];
                let cursor = input.cursor;
                let incomplete = false;
                // Appended pages always use this refresh's preceding cursor, never an old boundary.
                for (let page = 0; page < pages; page++) {
                  const result = yield* request(WS_METHODS.workspaceListProjectOverview, {
                    ...input,
                    cursor,
                  });
                  rows.push(...result.projects);
                  incomplete ||= result.incomplete;
                  cursor = result.nextCursor;
                  if (!cursor) break;
                }
                return {
                  projects: rows,
                  incomplete,
                  ...(cursor ? { nextCursor: cursor } : {}),
                } satisfies WorkspaceProjectOverviewPage;
              }),
            ),
          ),
        );
      })
      .pipe(Atom.setIdleTTL(0));
    return Atom.readable(
      (get) => {
        let queued = false;
        get.once(signal);
        const projectSignal = overviewProjects(environmentId);
        get.once(projectSignal);
        const current = (
          result: Atom.Type<typeof query>,
        ): AsyncResult.AsyncResult<WorkspaceProjectOverviewPage, E | Error> => {
          const change = get.once(signal);
          const connection = get.once(overviewConnection(environmentId));
          return AsyncResult.isSuccess(connection) &&
            connection.value[0].phase === "connected" &&
            AsyncResult.isFailure(change) &&
            !change.waiting
            ? AsyncResult.failure(change.cause)
            : result;
        };
        const refresh = () => {
          if (!get.once(lifecycle).started) return;
          if (get.once(query).waiting) {
            queued = true;
          } else {
            get.refresh(query);
          }
        };
        get.subscribe(signal, (change) => {
          if (AsyncResult.isFailure(change)) {
            get.setSelf(current(get.once(query)));
          } else if (AsyncResult.isSuccess(change) && change.value > get.once(lifecycle).revision) {
            refresh();
          }
        });
        get.subscribe(projectSignal, refresh);
        get.subscribe(query, (result) => {
          if (result.waiting && !get.once(lifecycle).started) queued = false;
          get.setSelf(current(result));
          if (!result.waiting && queued) {
            queued = false;
            get.refresh(query);
          }
        });
        return current(get.once(query));
      },
      (refresh) => {
        refresh(signal);
        refresh(query);
      },
    ).pipe(Atom.setIdleTTL(0), Atom.withLabel(`workspace-tools:overview:${key}`));
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
  const unavailableOverview = Atom.make(AsyncResult.fail(unsupported));
  const overviewResults = Atom.family((key: string) => {
    const { environmentId, input, pages, metadataAvailable } = JSON.parse(key) as {
      environmentId: EnvironmentId;
      input: WorkspaceProjectOverviewQuery;
      pages: number;
      metadataAvailable?: boolean;
    };
    const query = metadataAvailable === false ? unavailableOverview : overviewQueries(key);
    return Atom.transform(query, (get) => {
      const result = get(query);
      if (!AsyncResult.isFailure(result) || Cause.squash(result.cause) !== unsupported)
        return result;
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
        .slice(0, input.limit * pages + 1);
      const visible = selected.slice(0, input.limit * pages),
        last = visible.at(-1);
      const nextCursor =
        selected.length > input.limit * pages && last
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
    }).pipe(Atom.setIdleTTL(0));
  });
  const overview = ({
    environmentId,
    input,
    pages = 1,
    metadataAvailable,
  }: {
    environmentId: EnvironmentId;
    input: typeof WorkspaceProjectOverviewQuery.Encoded;
    readonly pages?: number;
    readonly metadataAvailable?: boolean;
  }) => {
    const decoded = decodeOverview(input);
    if (Option.isNone(decoded) || !Number.isSafeInteger(pages) || pages < 1)
      return invalidOverviewAtom;
    return overviewResults(
      JSON.stringify({
        environmentId,
        pages,
        ...(metadataAvailable === undefined ? {} : { metadataAvailable }),
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
