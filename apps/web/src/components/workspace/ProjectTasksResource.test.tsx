// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { create, type ReactTestRenderer, type ReactTestRendererJSON } from "react-test-renderer";
import { afterEach, expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import { RegistryContext } from "@effect/atom-react";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Latch from "effect/Latch";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Option from "effect/Option";
import {
  EnvironmentId,
  ProjectId,
  WS_METHODS,
  WorkspaceToolsError,
  type WorkspaceTaskSummary,
  type WorkspaceTaskPage,
} from "@t3tools/contracts";
import {
  EnvironmentRegistry,
  EnvironmentSupervisor,
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type SupervisorConnectionState,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import type { WsRpcProtocolClient, RpcSession } from "@t3tools/client-runtime/rpc";
import { createWorkspaceToolsAtoms } from "@t3tools/client-runtime/state/workspaceTools";
import { executeAtomQuery } from "@t3tools/client-runtime/state/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { ProjectTasksResource } from "./ProjectTasksResource";
import { ProjectTasksResourceView } from "./ProjectTasksResourceView";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";

const boundary = vi.hoisted(() => ({
  tools: null as unknown,
  available: true,
  operate: true,
  connected: true,
  legacy: false,
  ready: true,
  projects: true,
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: new Proxy({}, { get: (_, name) => Reflect.get(boundary.tools as object, name) }),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () =>
    boundary.projects ? [{ environmentId: "remote", id: "p", title: "SynKEK" }] : [],
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (boundary.connected ? ["remote"] : []),
}));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => null }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    ...(boundary.available ? { workspaceTasksV2: true } : {}),
    workspaceTools: boundary.legacy,
    ready: boundary.ready,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => boundary.operate }));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({ children }: { children: React.ReactNode }) => children,
}));
const environmentId = EnvironmentId.make("remote"),
  projectId = ProjectId.make("p");
let renderer: ReactTestRenderer;
function visibleText(
  node: ReactTestRendererJSON | readonly ReactTestRendererJSON[] | string | null,
): string {
  if (typeof node === "string") return node;
  if (node === null) return "";
  if (Array.isArray(node)) return node.map(visibleText).join("");
  return ((node as ReactTestRendererJSON).children ?? []).map(visibleText).join("");
}
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  boundary.available = boundary.operate = boundary.connected = true;
  boundary.ready = boundary.projects = true;
  boundary.legacy = false;
  vi.unstubAllGlobals();
});

const fixture = Effect.fn("fixture")(function* () {
  const config = {
    projectId,
    taskColumns: ["To do", "Done"],
    completedColumn: "Done",
    revision: 0,
    browserThreadId: null,
  };
  let tasks: WorkspaceTaskSummary[] = [
    "Approve homepage copy",
    "Review October keyword plan",
    "Prepare product launch assets",
    "Publish campaign landing page",
    "Share weekly performance report",
  ].map((title, index) => ({
    id: `wskt_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    projectId,
    projectTitle: "SynKEK",
    title,
    column: index === 4 ? "Done" : "To do",
    done: index === 4,
    revision: 0,
    dueOn: "2026-10-16",
    areaLabel: "Marketing",
    owner: "environment-owner",
  }));
  const counter = yield* SubscriptionRef.make(0);
  const requests: string[] = [];
  const patchTask = vi.fn(() =>
    Effect.fail(new WorkspaceToolsError({ kind: "unavailable", message: "Unexpected patch" })),
  );
  let fail = false;
  const client = {
    [WS_METHODS.workspaceSubscribeChanges]: () =>
      SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0)),
    [WS_METHODS.workspaceQueryTasks]: () =>
      Effect.sync(() => {
        requests.push("query");
        return {
          tasks: tasks.slice(),
          total: tasks.length,
          openTotal: tasks.filter((task) => !task.done).length,
          projects: [config],
          laneTotals: [],
          nextCursor: null,
        };
      }),
    [WS_METHODS.workspaceGetTask]: ({ id }: { id: string }) =>
      Effect.suspend(() => {
        const task = tasks.find((task) => task.id === id);
        return task
          ? Effect.succeed(task)
          : Effect.fail(new WorkspaceToolsError({ kind: "not-found", message: "Task deleted" }));
      }),
    [WS_METHODS.workspaceGetProjectConfig]: () => Effect.succeed(config),
    [WS_METHODS.workspaceListTasks]: () => Effect.succeed({ tasks: tasks.slice() }),
    [WS_METHODS.workspacePatchTask]: patchTask,
    [WS_METHODS.workspaceTransitionTask]: ({
      id,
      expectedRevision,
      change,
    }: {
      id: string;
      expectedRevision: number;
      change: { completed: boolean };
    }) =>
      Effect.gen(function* () {
        requests.push("transitionTask");
        if (fail)
          return yield* new WorkspaceToolsError({ kind: "unavailable", message: "Save rejected" });
        const task = tasks.find((task) => task.id === id)!;
        if (task.revision !== expectedRevision)
          return yield* new WorkspaceToolsError({ kind: "conflict", message: "Changed" });
        const next = {
          ...task,
          column: change.completed ? "Done" : "To do",
          done: change.completed,
          revision: task.revision + 1,
        };
        tasks = tasks.map((task) => (task.id === id ? next : task));
        yield* SubscriptionRef.update(counter, (n) => n + 1);
        return next;
      }),
  } as unknown as WsRpcProtocolClient;
  const target = new PrimaryConnectionTarget({
    environmentId,
    label: "Test",
    httpBaseUrl: "https://example.invalid",
    wsBaseUrl: "wss://example.invalid",
  });
  const supervisor = yield* Effect.gen(function* () {
    return EnvironmentSupervisor.EnvironmentSupervisor.of({
      target,
      state: yield* SubscriptionRef.make<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        desired: true,
        network: "online",
        phase: "connected",
        attempt: 1,
        generation: 1,
      }),
      session: yield* SubscriptionRef.make(
        Option.some<RpcSession>({
          client,
          initialConfig: Effect.never,
          subscribeServerConfig: (input) => client.subscribeServerConfig(input),
          ready: Effect.void,
          probe: Effect.void,
          closed: Effect.never,
        }),
      ),
      prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
      connect: Effect.void,
      disconnect: Effect.void,
      retryNow: Effect.void,
    });
  });
  const service = EnvironmentRegistry.EnvironmentRegistry.of({
    run: (_, effect) =>
      Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    runStream: (_, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    followStream: (_, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
  } as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const tools = createWorkspaceToolsAtoms(
    Atom.runtime(Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, service)),
  );
  boundary.tools = tools;
  const registry = AtomRegistry.make(),
    other = AtomRegistry.make();
  return {
    registry,
    other,
    tools,
    requests,
    patchTask,
    reject: () => {
      fail = true;
    },
    deleteFirst: () =>
      Effect.sync(() => {
        tasks = tasks.slice(1);
      }).pipe(Effect.andThen(SubscriptionRef.update(counter, (n) => n + 1))),
    dispose: () => {
      registry.dispose();
      other.dispose();
    },
  };
});

it.effect("keeps the legacy resource list on tools-only servers without V2 calls", () =>
  Effect.gen(function* () {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const f = yield* fixture();
    boundary.available = false;
    boundary.legacy = true;
    const queryTasks = vi.fn(f.tools.queryTasks);
    boundary.tools = { ...f.tools, queryTasks };
    const open = vi.fn();
    try {
      yield* Effect.promise(async () =>
        act(async () => {
          renderer = create(
            <RegistryContext.Provider value={f.registry}>
              <ProjectTasksResource
                environmentId={environmentId}
                projectId={projectId}
                selectedItem={null}
                request={null}
                onOpen={open}
              />
            </RegistryContext.Provider>,
          );
          await executeAtomQuery(
            f.registry,
            f.tools.tasks({ environmentId, input: { projectId } }),
          );
          await executeAtomQuery(
            f.registry,
            f.tools.config({ environmentId, input: { projectId } }),
          );
        }),
      );
      expect(visibleText(renderer.toJSON())).toContain("Approve homepage copy");
      expect(visibleText(renderer.toJSON())).not.toContain("Tasks need a newer server.");
      yield* Effect.promise(async () =>
        act(() =>
          renderer.root
            .findAllByType("button")
            .find((button) =>
              button
                .findAllByType("span")
                .some((span) => span.children.join("") === "Approve homepage copy"),
            )!
            .props.onClick(),
        ),
      );
      expect(open).toHaveBeenCalledWith({
        type: "task",
        taskId: "wskt_00000000-0000-4000-8000-000000000001",
      });
      expect(queryTasks).not.toHaveBeenCalled();
      expect(f.patchTask).not.toHaveBeenCalled();
      expect(f.requests.filter((method) => method === "transitionTask")).toHaveLength(0);
    } finally {
      yield* Effect.promise(async () => act(() => renderer.unmount()));
      f.dispose();
    }
  }),
);

it.effect("replaces resource rows with the editor and restores row focus on Back", () =>
  Effect.gen(function* () {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const f = yield* fixture();
    const node = document.createElement("div");
    node.dataset.workspaceResourceBody = "";
    document.body.append(node);
    const root = createRoot(node);
    try {
      yield* Effect.promise(async () =>
        act(() =>
          root.render(
            <RegistryContext.Provider value={f.registry}>
              <ProjectTasksResource
                environmentId={environmentId}
                projectId={projectId}
                selectedItem={null}
                request={null}
                onOpen={() => {}}
              />
            </RegistryContext.Provider>,
          ),
        ),
      );
      yield* Effect.promise(async () =>
        act(async () => {
          await executeAtomQuery(
            f.registry,
            f.tools.queryTasks({ environmentId, input: { projectId, state: "all", limit: 50 } }),
          );
        }),
      );
      const trigger = getByRole(node, "button", { name: "Open Approve homepage copy" });
      node.scrollTop = 900;
      trigger.focus();
      yield* Effect.promise(async () => act(() => trigger.click()));
      yield* Effect.promise(async () =>
        act(async () => {
          await executeAtomQuery(
            f.registry,
            f.tools.task({
              environmentId,
              input: { id: "wskt_00000000-0000-4000-8000-000000000001" },
            }),
          );
          await executeAtomQuery(
            f.registry,
            f.tools.config({ environmentId, input: { projectId } }),
          );
        }),
      );
      expect(getByRole(node, "textbox", { name: "Task title" })).toBeDefined();
      expect(queryByRole(node, "button", { name: "Open Review October keyword plan" })).toBeNull();
      expect(node.scrollTop).toBe(0);
      yield* Effect.promise(async () =>
        act(() => getByRole(node, "button", { name: "Back to project tasks" }).click()),
      );
      expect(queryByRole(node, "textbox", { name: "Task title" })).toBeNull();
      expect(document.activeElement).toBe(
        getByRole(node, "button", { name: "Open Approve homepage copy" }),
      );
      expect(node.scrollTop).toBe(900);
    } finally {
      yield* Effect.promise(async () => act(() => root.unmount()));
      node.remove();
      f.dispose();
    }
  }),
);

it.effect("waits for capability and project names without showing unavailable copy", () =>
  Effect.gen(function* () {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const f = yield* fixture();
    boundary.ready = boundary.projects = false;
    boundary.available = false;
    try {
      const resource = () => (
        <RegistryContext.Provider value={f.registry}>
          <ProjectTasksResource
            environmentId={environmentId}
            projectId={projectId}
            selectedItem={null}
            request={null}
            onOpen={() => {}}
          />
        </RegistryContext.Provider>
      );
      yield* Effect.promise(async () =>
        act(() => {
          renderer = create(resource());
        }),
      );
      expect(visibleText(renderer.toJSON())).toContain("Loading tasks...");
      expect(visibleText(renderer.toJSON())).not.toContain("Tasks need a newer server.");
      expect(f.requests).toHaveLength(0);
      boundary.available = boundary.ready = true;
      yield* Effect.promise(async () =>
        act(async () => {
          renderer.update(resource());
          await executeAtomQuery(
            f.registry,
            f.tools.queryTasks({ environmentId, input: { projectId, state: "all", limit: 50 } }),
          );
        }),
      );
      expect(visibleText(renderer.toJSON())).toContain("4 open");
      expect(visibleText(renderer.toJSON())).not.toContain("Unavailable project");
    } finally {
      yield* Effect.promise(async () => act(() => renderer.unmount()));
      f.dispose();
    }
  }),
);

it.effect(
  "completes and reopens five real rows across two subscribed list registries while Calendar stays selected",
  () =>
    Effect.gen(function* () {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const f = yield* fixture();
      const query = f.tools.queryTasks({
        environmentId,
        input: { projectId, state: "all", limit: 50 },
      });
      const unmount = f.other.mount(query);
      function OtherList() {
        const page = useEnvironmentQuery(query);
        return page.data ? (
          <ProjectTasksResourceView
            environmentId={environmentId}
            projectId={projectId}
            projectTitle="SynKEK"
            page={page.data}
            status="ready"
            error={null}
            now={null!}
            timeZone="UTC"
            ownerProfile={null}
            canOperate={false}
            workspaceTasksV2
            onOpen={() => {}}
            onTransition={async () => AsyncResult.fail(new Error("Read only"))}
            onLoadMore={() => {}}
            onRetry={() => {}}
            settingsReady={false}
          />
        ) : null;
      }
      const open = vi.fn();
      try {
        yield* Effect.promise(async () => executeAtomQuery(f.other, query));
        yield* Effect.promise(async () =>
          act(async () => {
            renderer = create(
              <>
                <p>Calendar 2026-10-13</p>
                <RegistryContext.Provider value={f.registry}>
                  <ProjectTasksResource
                    environmentId={environmentId}
                    projectId={projectId}
                    selectedItem={null}
                    request={null}
                    onOpen={open}
                  />
                </RegistryContext.Provider>
                <RegistryContext.Provider value={f.other}>
                  <OtherList />
                </RegistryContext.Provider>
              </>,
            );
            await executeAtomQuery(f.registry, query);
          }),
        );
        expect(visibleText(renderer.toJSON()).match(/4 open/g)).toHaveLength(2);
        for (const completed of [true, false]) {
          const delivered = Latch.makeUnsafe();
          const stop = f.other.subscribe(query, (result) => {
            if (AsyncResult.isSuccess(result) && result.value.openTotal === (completed ? 3 : 4))
              delivered.openUnsafe();
          });
          yield* Effect.promise(async () =>
            act(async () => {
              await renderer.root
                .findAllByProps({
                  "aria-label": `${completed ? "Complete" : "Reopen"} Approve homepage copy`,
                })[0]!
                .props.onChange({ target: { checked: completed } });
            }),
          );
          yield* delivered.await;
          stop();
          expect(
            visibleText(renderer.toJSON()).match(new RegExp(`${completed ? 3 : 4} open`, "g")),
          ).toHaveLength(2);
          expect(
            renderer.root
              .findAllByProps({
                "aria-label": `${completed ? "Reopen" : "Complete"} Approve homepage copy`,
              })
              .map((row) => row.props.checked),
          ).toEqual([completed, completed]);
        }
        yield* Effect.promise(async () =>
          act(() =>
            renderer.root
              .findAllByProps({ "aria-label": "Open Approve homepage copy" })[0]!
              .props.onClick(),
          ),
        );
        yield* Effect.promise(async () =>
          act(async () => {
            await executeAtomQuery(
              f.registry,
              f.tools.task({
                environmentId,
                input: { id: "wskt_00000000-0000-4000-8000-000000000001" },
              }),
            );
            await executeAtomQuery(
              f.registry,
              f.tools.config({ environmentId, input: { projectId } }),
            );
          }),
        );
        expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
          "Approve homepage copy",
        );
        yield* Effect.promise(async () =>
          act(() =>
            renderer.root
              .findAllByType("button")
              .find((button) => button.children.join("") === "Back to project tasks")!
              .props.onClick(),
          ),
        );
        expect(renderer.root.findAllByProps({ "aria-label": "Task title" })).toHaveLength(0);
        expect(open).not.toHaveBeenCalled();
        expect(visibleText(renderer.toJSON())).toContain("Calendar 2026-10-13");
        f.reject();
        yield* Effect.promise(async () =>
          act(async () =>
            renderer.root
              .findAllByProps({ "aria-label": "Complete Approve homepage copy" })[0]!
              .props.onChange({ target: { checked: true } }),
          ),
        );
        expect(visibleText(renderer.toJSON()).match(/4 open/g)).toHaveLength(2);
        expect(visibleText(renderer.toJSON())).toContain("Save rejected");
      } finally {
        yield* Effect.promise(async () => act(() => renderer.unmount()));
        unmount();
        f.dispose();
      }
    }),
);

it.effect("keeps a deleted task draft available and guards local task switches", () =>
  Effect.gen(function* () {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const f = yield* fixture();
    const firstId = "wskt_00000000-0000-4000-8000-000000000001";
    try {
      yield* Effect.promise(async () =>
        act(async () => {
          renderer = create(
            <RegistryContext.Provider value={f.registry}>
              <ProjectTasksResource
                environmentId={environmentId}
                projectId={projectId}
                selectedItem={null}
                request={{ type: "task", taskId: firstId }}
                onOpen={() => {}}
              />
            </RegistryContext.Provider>,
          );
          await executeAtomQuery(
            f.registry,
            f.tools.task({ environmentId, input: { id: firstId } }),
          );
          await executeAtomQuery(
            f.registry,
            f.tools.config({ environmentId, input: { projectId } }),
          );
          await executeAtomQuery(
            f.registry,
            f.tools.queryTasks({ environmentId, input: { projectId, state: "all", limit: 50 } }),
          );
        }),
      );
      yield* Effect.promise(async () =>
        act(() =>
          renderer.root
            .findByProps({ "aria-label": "Task title" })
            .props.onChange({ target: { value: "Keep this draft" } }),
        ),
      );
      yield* Effect.promise(async () =>
        act(() =>
          renderer.update(
            <RegistryContext.Provider value={f.registry}>
              <ProjectTasksResource
                environmentId={environmentId}
                projectId={projectId}
                selectedItem={null}
                request={{ type: "task", taskId: "wskt_00000000-0000-4000-8000-000000000002" }}
                onOpen={() => {}}
              />
            </RegistryContext.Provider>,
          ),
        ),
      );
      expect(renderer.root.findByProps({ role: "alertdialog" })).toBeDefined();
      yield* Effect.promise(async () =>
        act(() =>
          renderer.root
            .findAllByType("button")
            .find((button) => button.children.join("") === "Keep editing")!
            .props.onClick(),
        ),
      );
      expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
        "Keep this draft",
      );
      const missing = Latch.makeUnsafe();
      const stop = f.registry.subscribe(
        f.tools.task({ environmentId, input: { id: firstId } }),
        (result) => {
          if (AsyncResult.isFailure(result)) missing.openUnsafe();
        },
      );
      yield* f.deleteFirst();
      yield* missing.await;
      yield* Effect.promise(async () => act(() => {}));
      stop();
      expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
        "Keep this draft",
      );
      expect(visibleText(renderer.toJSON())).toContain("Copy draft");
      expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.disabled).toBe(true);
    } finally {
      yield* Effect.promise(async () => act(() => renderer.unmount()));
      f.dispose();
    }
  }),
);

it.effect(
  "shows no invented zero on failure, skips missing projects, and ignores late previous-environment results",
  () =>
    Effect.gen(function* () {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const f = yield* fixture();
      const old = Atom.make<AsyncResult.AsyncResult<WorkspaceTaskPage, unknown>>(
        AsyncResult.initial(true),
      );
      const empty: WorkspaceTaskPage = {
        tasks: [],
        total: 0,
        openTotal: 0,
        nextCursor: null,
        projects: [],
        laneTotals: [],
      };
      const next = Atom.make(AsyncResult.success(empty));
      const query = vi.fn(({ environmentId: target }: { environmentId: string }) =>
        target === "other" ? next : old,
      );
      boundary.tools = { ...f.tools, queryTasks: query };
      const view = (target: EnvironmentId, project: ProjectId | null) => (
        <RegistryContext.Provider value={f.registry}>
          <ProjectTasksResource
            environmentId={target}
            projectId={project!}
            selectedItem={null}
            request={null}
            onOpen={() => {}}
          />
        </RegistryContext.Provider>
      );
      try {
        yield* Effect.promise(async () =>
          act(() => {
            renderer = create(view(environmentId, null));
          }),
        );
        expect(query).not.toHaveBeenCalled();
        expect(visibleText(renderer.toJSON())).toContain("Choose a project");
        yield* Effect.promise(async () =>
          act(() => renderer.update(view(environmentId, projectId))),
        );
        expect(visibleText(renderer.toJSON())).not.toContain("0 open");
        yield* Effect.promise(async () =>
          act(() =>
            f.registry.set(
              old,
              AsyncResult.fail(
                new WorkspaceToolsError({ kind: "not-found", message: "Project deleted" }),
              ),
            ),
          ),
        );
        expect(visibleText(renderer.toJSON())).toContain("Project deleted");
        expect(visibleText(renderer.toJSON())).not.toContain("0 open");
        yield* Effect.promise(async () =>
          act(() => renderer.update(view(EnvironmentId.make("other"), projectId))),
        );
        yield* Effect.promise(async () =>
          act(() => f.registry.set(old, AsyncResult.success({ ...empty, openTotal: 99 }))),
        );
        expect(visibleText(renderer.toJSON())).toContain("0 open");
        expect(visibleText(renderer.toJSON())).not.toContain("99 open");
      } finally {
        yield* Effect.promise(async () => act(() => renderer.unmount()));
        f.dispose();
      }
    }),
);

it.effect(
  "mounts no query on old servers and suspends the resource clock while hidden or disconnected",
  () =>
    Effect.gen(function* () {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const f = yield* fixture();
      const bodyContexts = {
        shown: { hidden: false, restoreFocus: () => {} },
        hidden: { hidden: true, restoreFocus: () => {} },
      };
      const render = (hidden: boolean) => (
        <RegistryContext.Provider value={f.registry}>
          <WorkspaceResourcesBodyContext.Provider
            value={hidden ? bodyContexts.hidden : bodyContexts.shown}
          >
            <ProjectTasksResource
              environmentId={environmentId}
              projectId={projectId}
              selectedItem={null}
              request={null}
              onOpen={() => {}}
            />
          </WorkspaceResourcesBodyContext.Provider>
        </RegistryContext.Provider>
      );
      try {
        boundary.available = false;
        yield* Effect.promise(async () =>
          act(() => {
            renderer = create(render(true));
          }),
        );
        expect(f.requests).toHaveLength(0);
        expect(visibleText(renderer.toJSON())).toContain("Tasks need a newer server.");
        const listeners = vi.spyOn(window, "addEventListener");
        boundary.available = true;
        yield* Effect.promise(async () =>
          act(async () => {
            renderer.update(render(true));
            await executeAtomQuery(
              f.registry,
              f.tools.queryTasks({ environmentId, input: { projectId, state: "all", limit: 50 } }),
            );
          }),
        );
        expect(listeners.mock.calls.filter(([type]) => type === "focus")).toHaveLength(0);
        boundary.operate = false;
        yield* Effect.promise(async () => act(() => renderer.update(render(false))));
        expect(
          renderer.root.findByProps({ "aria-label": "Complete Approve homepage copy" }).props
            .disabled,
        ).toBe(true);
        boundary.connected = false;
        yield* Effect.promise(async () => act(() => renderer.update(render(false))));
        expect(visibleText(renderer.toJSON())).toContain("4 open");
        expect(visibleText(renderer.toJSON())).toContain("last confirmed tasks");
        listeners.mockRestore();
      } finally {
        yield* Effect.promise(async () => act(() => renderer.unmount()));
        f.dispose();
      }
    }),
);
