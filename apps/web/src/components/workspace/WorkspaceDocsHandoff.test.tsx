// @vitest-environment happy-dom
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getAllByRole, getByRole } from "@testing-library/dom";
import { expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import { RegistryContext } from "@effect/atom-react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Option from "effect/Option";
import * as Latch from "effect/Latch";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import {
  EnvironmentId,
  ProjectId,
  WS_METHODS,
  WorkspaceNotesError,
  EnvironmentAuthorizationError,
  type CalendarOccurrenceSummary,
  type WorkspaceNote,
} from "@t3tools/contracts";
import type { WsRpcProtocolClient } from "@t3tools/client-runtime/rpc";
import { createWorkspaceNoteAtoms } from "@t3tools/client-runtime/state/workspaceNotes";
import { createWorkspaceLinkAtoms } from "@t3tools/client-runtime/state/workspace-links";
import { executeAtomQuery } from "@t3tools/client-runtime/state/runtime";
import { makeTestRuntime, TARGET, session } from "./calendar/calendarRuntime.testHelpers";
import { WorkspaceDocsPanel, type WorkspaceDocSelection } from "./WorkspaceDocsPanel";
import { CalendarNotesProvider, CalendarSpace } from "./calendar/CalendarSpace";
import { MeetingsSpace } from "./meetings/MeetingsSpace";
import {
  WorkspaceResourcesProvider,
  useWorkspaceResourceState,
  WorkspaceResourcesBodyContext,
} from "./workspaceResourceState";
import { WorkspaceNavigation } from "./WorkspaceNavigationView";
import { workspaceDestinationSearch, parseWorkspaceSearch } from "./workspaceNavigation";

const binding = vi.hoisted(() => ({
  calendar: null as unknown,
  notes: null as unknown,
  tools: null as unknown,
  operate: false,
  links: null as unknown,
  connected: true,
  wide: true,
  driveQuery: vi.fn(),
  driveRead: vi.fn(),
  driveBind: vi.fn(),
  listeners: new Set<() => void>(),
}));
vi.mock("../../state/drive", () => ({
  drive: {
    binding: binding.driveQuery,
    connections: binding.driveQuery,
    changes: binding.driveQuery,
    read: binding.driveRead,
    bind: binding.driveBind,
  },
}));
vi.mock("../../state/workspaceCalendar", () => ({
  workspaceCalendar: new Proxy(
    {},
    { get: (_, key) => Reflect.get(binding.calendar as object, key) },
  ),
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: new Proxy({}, { get: (_, key) => Reflect.get(binding.tools as object, key) }),
}));
vi.mock("../../state/workspaceNotes", () => ({
  workspaceNotes: new Proxy({}, { get: (_, key) => Reflect.get(binding.notes as object, key) }),
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: new Proxy({}, { get: (_, key) => Reflect.get(binding.links as object, key) }),
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (binding.connected ? [TARGET.environmentId] : []),
}));
vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: () =>
    useSyncExternalStore(
      (listener) => {
        binding.listeners.add(listener);
        return () => {
          binding.listeners.delete(listener);
        };
      },
      () => binding.wide,
    ),
}));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (
    _id: unknown,
    select: (settings: {
      workspaceDisplayTimeZone: string;
      workspaceOwnerProfile: null;
    }) => unknown,
  ) => select({ workspaceDisplayTimeZone: "Africa/Johannesburg", workspaceOwnerProfile: null }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: (id?: EnvironmentId) => ({
    environmentId: id ?? TARGET.environmentId,
    ready: true,
    workspaceLinks: true,
    workspaceNotes: true,
    workspaceTasksV2: true,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => binding.operate }));
vi.mock("./useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: (_id: unknown, title: string) => ({ title }),
}));
vi.mock("./useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => () => {} }));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({}) }));
vi.mock("../../state/entities", () => ({
  useAllEnvironmentProjectSnapshotsReady: () => true,
  useThreadShell: () => null,
  useThreadShells: () => [],
  useProject: () => ({ title: "Project A" }),
  useProjects: () => [
    { environmentId: TARGET.environmentId, id: "project-a", title: "Project A" },
    { environmentId: TARGET.environmentId, id: "project-b", title: "Project B" },
  ],
}));
vi.mock("./WorkspaceToolsPanel", () => ({
  WorkspaceProjectFiles: () => <p>Files stay unopened</p>,
  WorkspaceProjectAgents: () => null,
}));
vi.mock("./WorkspaceBrowser", () => ({ WorkspaceBrowser: () => null }));

const config = Atom.make(
  AsyncResult.success({
    source: "live" as const,
    config: {
      pulseCapabilities: { workspaceCalendar: true, workspaceNotes: true, workspaceTools: true },
    },
  }),
);
vi.mock("../../state/server", () => ({ serverEnvironment: { configProjection: () => config } }));
// Keep lazy imports outside individual journey budgets on a cold worker.
await Promise.all([
  import("./WorkspaceToolsPanel"),
  import("./WorkspaceDocsPanel"),
  import("./WorkspaceBrowser"),
  import("./ProjectTasksResource"),
  import("./WorkspaceDocsNoteView"),
  import("../../state/workspaceNotes"),
]);
const event: CalendarOccurrenceSummary = {
  id: "wce_00000000-0000-0000-0000-000000000001",
  title: "Launch review",
  status: "confirmed",
  revision: 1,
  time: {
    kind: "timed",
    start: "2026-10-14T12:00:00Z",
    end: "2026-10-14T12:45:00Z",
    sourceTimeZone: "UTC",
  },
  sourceLabel: "Saved",
  attendees: [],
  attendeesTruncated: false,
  hasDescription: true,
  joinUrl: "https://meet.google.com/abc-defg-hij",
};
const note: WorkspaceNote = {
  id: "wsn_00000000-0000-0000-0000-000000000001",
  title: "Launch review · Meeting notes",
  body: "PRIVATE NOTE BODY",
  revision: 1,
  createdAt: "2026-10-14T12:00:00Z",
  updatedAt: "2026-10-14T12:00:00Z",
};
const range = { startOn: "2026-10-12", endBefore: "2026-10-19", timeZone: "Africa/Johannesburg" };
const storage = { getItem: () => null, setItem: () => {} };
function Shell() {
  const search = parseWorkspaceSearch(useSearch({ strict: false }));
  const navigate = useNavigate();
  const resources = useWorkspaceResourceState(TARGET.environmentId, { storage });
  return (
    <CalendarNotesProvider>
      <WorkspaceResourcesProvider value={resources}>
        <WorkspaceNavigation
          mode="workspace"
          environmentId={TARGET.environmentId}
          onModeChange={() => {}}
          onNavigate={(space) => {
            void navigate({
              to: "/workspace",
              search: workspaceDestinationSearch(space, TARGET.environmentId, search),
            });
          }}
        />
        {search.space === "meetings" ? (
          <MeetingsSpace />
        ) : search.space === "calendar" ? (
          <CalendarSpace />
        ) : (
          <p>Other destination</p>
        )}
      </WorkspaceResourcesProvider>
    </CalendarNotesProvider>
  );
}

const withinAct = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    let finish!: () => void;
    const response = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const render = act(() => response);
    return operation.pipe(
      Effect.ensuring(
        Effect.promise(async () => {
          finish();
          await render;
        }),
      ),
    );
  });

function NativePanel({
  selection,
  environmentId = selection.environmentId,
  projectId = selection.projectId,
  hidden = false,
}: {
  selection: WorkspaceDocSelection;
  environmentId?: EnvironmentId;
  projectId?: ProjectId;
  hidden?: boolean;
}) {
  const resources = useWorkspaceResourceState(environmentId, { storage });
  return (
    <WorkspaceResourcesProvider value={resources}>
      <WorkspaceResourcesBodyContext value={{ hidden, restoreFocus: () => {} }}>
        <WorkspaceDocsPanel
          environmentId={environmentId}
          projectId={projectId}
          selected={selection}
          onSelect={() => {}}
          projectTitle="Project A"
        />
      </WorkspaceResourcesBodyContext>
    </WorkspaceResourcesProvider>
  );
}
const nativeSelection = (id = note.id): WorkspaceDocSelection => ({
  environmentId: TARGET.environmentId,
  projectId: ProjectId.make("project-a"),
  document: {
    title: note.title,
    ref: { type: "provider-resource", provider: "workspace-note", resourceId: id },
  },
});

it.effect(
  "dispatches a native selection directly through Docs with real note atoms and no Google dependency",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const read = vi.fn();
        const client = {
          [WS_METHODS.notesGet]: (input: { id: string }) =>
            Effect.sync(() => {
              read(input);
              return note;
            }),
          [WS_METHODS.notesSubscribeChanges]: () => Stream.never,
          [WS_METHODS.pulseLinksList]: () =>
            Effect.succeed({ linked: [], suggested: [], truncated: false }),
          [WS_METHODS.pulseLinksSubscribeChanges]: () => Stream.never,
        } as unknown as WsRpcProtocolClient;
        const env = yield* makeTestRuntime(client);
        const notes = createWorkspaceNoteAtoms(env.runtime);
        binding.notes = notes;
        binding.links = createWorkspaceLinkAtoms(env.runtime);
        binding.driveQuery.mockClear();
        binding.driveRead.mockClear();
        binding.driveBind.mockClear();
        function DirectPanel() {
          const resources = useWorkspaceResourceState(TARGET.environmentId, { storage });
          return (
            <WorkspaceResourcesProvider value={resources}>
              <WorkspaceDocsPanel
                environmentId={selection.environmentId}
                projectId={selection.projectId}
                selected={selection}
                onSelect={() => {}}
                projectTitle="Project A"
              />
            </WorkspaceResourcesProvider>
          );
        }
        const selection: WorkspaceDocSelection = {
          environmentId: TARGET.environmentId,
          projectId: ProjectId.make("project-a"),
          document: {
            title: note.title,
            ref: { type: "provider-resource", provider: "workspace-note", resourceId: note.id },
          },
        };
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const node = document.createElement("div");
        document.body.append(node);
        const root = createRoot(node);
        try {
          yield* Effect.promise(async () =>
            act(() =>
              root.render(
                <RegistryContext.Provider value={env.registry}>
                  <DirectPanel />
                </RegistryContext.Provider>,
              ),
            ),
          );
          yield* Effect.promise(async () =>
            act(async () => {
              await vi.dynamicImportSettled();
              await executeAtomQuery(
                env.registry,
                notes.get({ environmentId: TARGET.environmentId, input: { id: note.id } }),
              );
            }),
          );
          expect(getByRole(node, "heading", { level: 1, name: note.title })).toBeDefined();
          expect(node.textContent).toContain(note.body);
          expect(node.textContent).toContain("Project A · Environment access");
          yield* Effect.promise(async () =>
            act(() => fireEvent.click(getByRole(node, "button", { name: "Item actions" }))),
          );
          expect(
            (getByRole(document.body, "button", { name: "Link to project" }) as HTMLButtonElement)
              .disabled,
          ).toBe(true);
          expect(read).toHaveBeenCalledWith({ id: note.id });
          expect(binding.driveQuery).not.toHaveBeenCalled();
          expect(binding.driveRead).not.toHaveBeenCalled();
          expect(binding.driveBind).not.toHaveBeenCalled();
        } finally {
          yield* Effect.promise(async () => act(() => root.unmount()));
          node.remove();
          vi.unstubAllGlobals();
        }
      }),
    ),
);

it.effect(
  "shares the real Calendar/Meetings range, opens the exact note once and releases hidden readers through navigation and reconnect",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const requested = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const noteRequested = yield* Deferred.make<void>();
        const noteRelease = yield* Deferred.make<void>();
        const rangeStopped = yield* Deferred.make<void>();
        const noteStopped = yield* Deferred.make<void>();
        let revision = 1,
          reads = 0,
          subscriptions = 0,
          active = 0,
          maxActive = 0,
          noteReads = 0,
          noteActive = 0,
          refreshes = 0,
          details = 0;
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () =>
            Stream.unwrap(
              Effect.sync(() => {
                subscriptions++;
                active++;
                maxActive = Math.max(maxActive, active);
                return Stream.never;
              }),
            ).pipe(
              Stream.ensuring(
                Effect.sync(() => {
                  active--;
                }).pipe(Effect.andThen(Deferred.succeed(rangeStopped, undefined))),
              ),
            ),
          [WS_METHODS.calendarListRange]: () =>
            Effect.gen(function* () {
              reads++;
              yield* Deferred.succeed(requested, undefined);
              if (reads === 1) yield* Deferred.await(release);
              return {
                events: [
                  {
                    ...event,
                    revision,
                    title: revision === 1 ? event.title : "Reconnected review",
                  },
                ],
                sourceStates: [],
                incomplete: false,
                dueTasks: [],
                dueIncomplete: false,
              };
            }),
          [WS_METHODS.calendarGet]: () =>
            Effect.sync(() => {
              details++;
              return event;
            }),
          [WS_METHODS.calendarRefresh]: () =>
            Effect.sync(() => {
              refreshes++;
            }),
          [WS_METHODS.pulseLinksList]: () =>
            Effect.succeed({
              linked: [
                {
                  status: "confirmed",
                  item: {
                    ref: {
                      type: "provider-resource",
                      provider: "workspace-note",
                      resourceId: note.id,
                    },
                    title: note.title,
                  },
                },
              ],
              suggested: [],
              truncated: false,
            }),
          [WS_METHODS.pulseLinksSubscribeChanges]: () => Stream.never,
          [WS_METHODS.notesGet]: () =>
            Effect.gen(function* () {
              noteReads++;
              yield* Deferred.succeed(noteRequested, undefined);
              yield* Deferred.await(noteRelease);
              return note;
            }),
          [WS_METHODS.notesSubscribeChanges]: () =>
            Stream.unwrap(
              Effect.sync(() => {
                noteActive++;
                return Stream.never;
              }),
            ).pipe(
              Stream.ensuring(
                Effect.sync(() => {
                  noteActive--;
                }).pipe(Effect.andThen(Deferred.succeed(noteStopped, undefined))),
              ),
            ),
        } as unknown as WsRpcProtocolClient;
        const env = yield* makeTestRuntime(client);
        binding.calendar = env.atoms;
        binding.notes = createWorkspaceNoteAtoms(env.runtime);
        binding.links = createWorkspaceLinkAtoms(env.runtime);
        binding.operate = false;
        binding.connected = true;
        binding.wide = true;
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const rootRoute = createRootRoute();
        const workspace = createRoute({
          getParentRoute: () => rootRoute,
          path: "workspace",
          validateSearch: parseWorkspaceSearch,
          component: Shell,
        });
        const router = createRouter({
          routeTree: rootRoute.addChildren([workspace]),
          history: createMemoryHistory({
            initialEntries: ["/workspace?space=calendar&day=2026-10-13&project=project-a"],
          }),
          defaultPendingMs: 0,
          defaultPendingMinMs: 0,
        });
        const node = document.createElement("div");
        document.body.append(node);
        const root = createRoot(node);
        const render = () =>
          root.render(
            <RegistryContext.Provider value={env.registry}>
              <RouterProvider router={router} />
            </RegistryContext.Provider>,
          );
        const selected = env.atoms.range({ environmentId: TARGET.environmentId, input: range });
        const notes = binding.notes as ReturnType<typeof createWorkspaceNoteAtoms>;
        const noteQuery = notes.get({
          environmentId: TARGET.environmentId,
          input: { id: note.id },
        });
        const links = binding.links as ReturnType<typeof createWorkspaceLinkAtoms>;
        const linkQuery = links.list({
          environmentId: TARGET.environmentId,
          input: {
            item: {
              type: "provider-resource",
              provider: "workspace-calendar",
              resourceId: event.id,
            },
          },
        });
        try {
          yield* Effect.promise(() => router.load());
          yield* Effect.promise(async () => act(render));
          yield* Deferred.await(requested);
          expect(node.textContent).not.toContain(event.title);
          yield* withinAct(
            Deferred.succeed(release, undefined).pipe(
              Effect.andThen(Effect.promise(() => executeAtomQuery(env.registry, selected))),
            ),
          );
          expect(reads).toBe(1);
          expect(subscriptions).toBe(1);
          expect(noteReads).toBe(0);
          expect(details).toBe(0);
          yield* Effect.promise(async () =>
            act(() =>
              fireEvent.click(getByRole(node, "button", { name: "Wednesday, 14 October 2026" })),
            ),
          );
          expect(getByRole(node, "button", { name: event.title })).toBeDefined();
          expect(reads).toBe(1);
          yield* Effect.promise(async () =>
            act(() => fireEvent.click(getByRole(node, "combobox", { name: "Choose project" }))),
          );
          yield* Effect.promise(async () =>
            act(() => fireEvent.click(getByRole(document.body, "option", { name: "Project A" }))),
          );
          yield* Effect.promise(async () =>
            act(async () => {
              fireEvent.click(getByRole(node, "button", { name: "Notes & agenda" }));
              await executeAtomQuery(env.registry, linkQuery);
              await vi.dynamicImportSettled();
            }),
          );
          yield* Deferred.await(noteRequested);
          yield* withinAct(
            Deferred.succeed(noteRelease, undefined).pipe(
              Effect.andThen(Effect.promise(() => executeAtomQuery(env.registry, noteQuery))),
            ),
          );
          expect(node.textContent).toContain(note.body);
          expect(noteReads).toBe(1);
          expect(noteActive).toBe(1);
          expect(
            (getByRole(node, "button", { name: "Edit note" }) as HTMLButtonElement).disabled,
          ).toBe(true);
          expect(getByRole(node, "tab", { name: "Docs" }).getAttribute("aria-selected")).toBe(
            "true",
          );
          yield* Effect.promise(async () =>
            act(() => fireEvent.click(getByRole(node, "button", { name: "Close resources" }))),
          );
          yield* Deferred.await(noteStopped);
          expect(noteActive).toBe(0);
          yield* Effect.promise(async () =>
            act(() => fireEvent.click(getByRole(node, "button", { name: "Resources" }))),
          );
          yield* Effect.promise(async () =>
            act(async () => {
              await executeAtomQuery(env.registry, noteQuery);
            }),
          );
          expect(node.textContent).toContain(note.body);
          expect(noteActive).toBe(1);
          yield* Effect.promise(async () =>
            act(() => fireEvent.click(getByRole(node, "link", { name: "Meetings" }))),
          );
          yield* Effect.promise(async () =>
            act(async () => {
              await executeAtomQuery(env.registry, selected);
            }),
          );
          expect(router.state.location.search.space).toBe("meetings");
          expect(router.state.location.search.day).toBe("2026-10-14");
          expect(getByRole(node, "button", { name: event.title })).toBeDefined();
          const meetingLocation = router.state.location.search;
          expect(getByRole(node, "region", { name: "Upcoming meetings" })).toBeDefined();
          yield* Effect.promise(async () =>
            act(() => fireEvent.click(getByRole(node, "button", { name: "Back to documents" }))),
          );
          expect(router.state.location.search).toEqual(meetingLocation);
          expect(getByRole(node, "region", { name: "Upcoming meetings" })).toBeDefined();
          expect(getByRole(node, "button", { name: event.title })).toBeDefined();
          expect(node.textContent).not.toContain(note.body);
          yield* Effect.promise(async () =>
            act(async () => {
              fireEvent.click(getByRole(node, "button", { name: "Notes & agenda" }));
              await executeAtomQuery(env.registry, linkQuery);
              await executeAtomQuery(env.registry, noteQuery);
            }),
          );
          expect(getByRole(node, "heading", { level: 1, name: note.title })).toBeDefined();
          expect(router.state.location.search).toEqual(meetingLocation);
          expect(maxActive).toBe(1);
          expect(details).toBe(0);
          expect(refreshes).toBe(0);
          const before = reads;
          yield* Effect.promise(async () =>
            act(() => {
              binding.wide = false;
              for (const listener of binding.listeners) listener();
            }),
          );
          expect(document.querySelectorAll("[data-workspace-resource-body]")).toHaveLength(1);
          expect(noteActive).toBe(1);
          yield* Effect.promise(async () =>
            act(() => {
              binding.wide = true;
              for (const listener of binding.listeners) listener();
            }),
          );
          expect(reads).toBe(before);
          expect(maxActive).toBe(1);
          const readsBeforeReconnect = reads;
          yield* withinAct(SubscriptionRef.set(env.supervisor.session, Option.none()));
          yield* Deferred.await(rangeStopped);
          revision = 2;
          const changed = Latch.makeUnsafe();
          const stop = env.registry.subscribe(selected, (r) => {
            if (AsyncResult.isSuccess(r) && !r.waiting && r.value.events[0]?.revision === 2)
              changed.openUnsafe();
          });
          try {
            yield* withinAct(
              SubscriptionRef.set(env.supervisor.session, Option.some(session(client))).pipe(
                Effect.andThen(changed.await),
              ),
            );
          } finally {
            stop();
          }
          expect(getByRole(node, "button", { name: "Reconnected review" })).toBeDefined();
          expect(subscriptions).toBe(2);
          expect(reads).toBe(readsBeforeReconnect + 1);
          expect(maxActive).toBe(1);
          expect(refreshes).toBe(0);
          expect(getAllByRole(node, "tab", { name: "Docs" })).toHaveLength(1);
        } finally {
          yield* Effect.promise(async () => act(() => root.unmount()));
          node.remove();
          router.history.destroy();
          vi.unstubAllGlobals();
        }
      }),
    ),
);

it.effect.each([
  new WorkspaceNotesError({
    kind: "not-found",
    message: "This note was deleted. Its link has been kept.",
  }),
  new EnvironmentAuthorizationError({
    requiredScope: "orchestration:read",
    message: "Read access is unavailable. Its link has been kept.",
  }),
])("keeps the exact native reference unavailable for %s", (failure) =>
  Effect.scoped(
    Effect.gen(function* () {
      const read = vi.fn();
      const client = {
        [WS_METHODS.notesGet]: (input: { id: string }) =>
          Effect.sync(() => read(input)).pipe(Effect.andThen(Effect.fail(failure))),
        [WS_METHODS.notesSubscribeChanges]: () => Stream.never,
        [WS_METHODS.pulseLinksList]: () =>
          Effect.succeed({ linked: [], suggested: [], truncated: false }),
        [WS_METHODS.pulseLinksSubscribeChanges]: () => Stream.never,
      } as unknown as WsRpcProtocolClient;
      const env = yield* makeTestRuntime(client);
      const notes = createWorkspaceNoteAtoms(env.runtime);
      binding.notes = notes;
      binding.links = createWorkspaceLinkAtoms(env.runtime);
      const selection = nativeSelection();
      const query = notes.get({ environmentId: TARGET.environmentId, input: { id: note.id } });
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const node = document.createElement("div");
      const root = createRoot(node);
      try {
        yield* Effect.promise(async () =>
          act(() =>
            root.render(
              <RegistryContext.Provider value={env.registry}>
                <NativePanel selection={selection} />
              </RegistryContext.Provider>,
            ),
          ),
        );
        yield* Effect.promise(async () =>
          act(async () => {
            await executeAtomQuery(env.registry, query).catch(() => {});
          }),
        );
        expect(getByRole(node, "alert").textContent).toBe(failure.message);
        expect(node.textContent).toContain("Their links have been kept");
        expect(node.querySelector("article")).toBeNull();
        expect(getByRole(node, "button", { name: "Back to documents" })).toBeDefined();
        expect(read).toHaveBeenCalledWith({ id: note.id });
      } finally {
        yield* Effect.promise(async () => act(() => root.unmount()));
        vi.unstubAllGlobals();
      }
    }),
  ),
);

it.effect.each(["environment", "project", "note", "hidden"] as const)(
  "suppresses a native read completed after its %s changes",
  (change) =>
    Effect.scoped(
      Effect.gen(function* () {
        const requested = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const completed = yield* Deferred.make<void>();
        const nextId = "wsn_00000000-0000-0000-0000-000000000002";
        const client = {
          [WS_METHODS.notesGet]: (input: { id: string }) =>
            input.id === nextId
              ? Effect.succeed({
                  ...note,
                  id: nextId,
                  title: "Second native note",
                  body: "Current content",
                })
              : Effect.gen(function* () {
                  yield* Deferred.succeed(requested, undefined);
                  yield* Deferred.await(release);
                  return { ...note, body: "LATE PRIVATE CONTENT" };
                }).pipe(Effect.ensuring(Deferred.succeed(completed, undefined))),
          [WS_METHODS.notesSubscribeChanges]: () => Stream.never,
          [WS_METHODS.pulseLinksList]: () =>
            Effect.succeed({ linked: [], suggested: [], truncated: false }),
          [WS_METHODS.pulseLinksSubscribeChanges]: () => Stream.never,
        } as unknown as WsRpcProtocolClient;
        const env = yield* makeTestRuntime(client);
        const notes = createWorkspaceNoteAtoms(env.runtime);
        binding.notes = notes;
        binding.links = createWorkspaceLinkAtoms(env.runtime);
        const selection = nativeSelection();
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const node = document.createElement("div");
        const root = createRoot(node);
        const render = (next: boolean) =>
          root.render(
            <RegistryContext.Provider value={env.registry}>
              <NativePanel
                selection={next && change === "note" ? nativeSelection(nextId) : selection}
                environmentId={
                  next && change === "environment"
                    ? EnvironmentId.make("other")
                    : TARGET.environmentId
                }
                projectId={
                  next && change === "project" ? ProjectId.make("project-b") : selection.projectId
                }
                hidden={next && change === "hidden"}
              />
            </RegistryContext.Provider>,
          );
        try {
          yield* Effect.promise(async () => act(() => render(false)));
          yield* Deferred.await(requested);
          expect(node.textContent).toContain("Loading note");
          yield* Effect.promise(async () => act(() => render(true)));
          if (change === "note") {
            yield* Effect.promise(async () =>
              act(async () => {
                await executeAtomQuery(
                  env.registry,
                  notes.get({ environmentId: TARGET.environmentId, input: { id: nextId } }),
                );
              }),
            );
            expect(node.textContent).toContain("Current content");
          }
          yield* withinAct(
            Deferred.succeed(release, undefined).pipe(Effect.andThen(Deferred.await(completed))),
          );
          expect(node.textContent).not.toContain("LATE PRIVATE CONTENT");
          if (change === "note")
            expect(
              getByRole(node, "heading", { level: 1, name: "Second native note" }),
            ).toBeDefined();
        } finally {
          yield* Effect.promise(async () => act(() => root.unmount()));
          vi.unstubAllGlobals();
        }
      }),
    ),
);
