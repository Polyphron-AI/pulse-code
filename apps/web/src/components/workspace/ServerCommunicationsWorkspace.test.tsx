// @vitest-environment happy-dom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RegistryContext } from "@effect/atom-react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  defaultStringifySearch,
} from "@tanstack/react-router";
import { fireEvent, getByRole, queryByRole, within } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  chatResourceId,
  EnvironmentId,
  WS_METHODS,
  CommunicationsError,
  type WorkspaceSavedItem,
  type CommunicationMessage,
  type ServerConfig,
} from "@t3tools/contracts";
import { Effect, Layer, Option, Stream, SubscriptionRef } from "effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import { createWorkspaceSavedItemAtoms } from "@t3tools/client-runtime/state/workspace-saved-items";
import { createCommunicationsAtoms } from "@t3tools/client-runtime/state/communications";
import {
  EnvironmentRegistry as Registry,
  EnvironmentSupervisor as Supervisor,
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import type { WsRpcProtocolClient, RpcSession } from "@t3tools/client-runtime/rpc";
import { Route } from "../../routes/_chat.workspace";
import { validateSettingsScopeSearch } from "../settings/settingsScope";
import { parseWorkspaceSearch } from "./workspaceNavigation";
import { WorkspaceResourcesContext, useWorkspaceResourceState } from "./workspaceResourceState";

const boundary = vi.hoisted(() => ({
  atoms: null as unknown,
  savedAtoms: null as unknown,
  config: null as unknown,
  connected: true,
  prepared: null as unknown,
  opened: [] as unknown[],
  timeZone: "UTC",
}));
vi.mock("../../state/communications", () => ({
  get communications() {
    return boundary.atoms;
  },
}));
vi.mock("../../state/workspaceSavedItems", () => ({
  get workspaceSavedItems() {
    return boundary.savedAtoms;
  },
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { configProjection: () => boundary.config },
}));
vi.mock("../../state/session", async () => {
  const { useAtomValue } = await import("@effect/atom-react");
  return {
    usePreparedConnection: () => Option.some(useAtomValue(boundary.prepared as Atom.Atom<object>)),
  };
});
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => EnvironmentId.make("local"),
  useEnvironment: (id: EnvironmentId | null) =>
    id === "remote"
      ? {
          label: "Remote source",
          connection: { phase: boundary.connected ? "connected" : "offline" },
        }
      : null,
  useConnectedEnvironmentIds: () => (boundary.connected ? [EnvironmentId.make("remote")] : []),
}));
vi.mock("../../state/entities", () => ({ useProjects: () => [], useThreadShells: () => [] }));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => boundary.timeZone }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: (id?: EnvironmentId) => ({
    environmentId: id ?? EnvironmentId.make("local"),
    ready: true,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => true }));
vi.mock("./WorkspaceResourcesPanel", () => ({
  WorkspaceProjectResources: () => <p>Independent resources</p>,
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
  WorkspaceItemActions: () => null,
}));
vi.mock("./WorkspaceLinkedContext", () => ({ WorkspaceLinkedContext: () => null }));
vi.mock("./useWorkspaceItemOpener", () => ({
  useWorkspaceItemOpener: (environmentId: EnvironmentId) => (ref: unknown) => {
    boundary.opened.push({ environmentId, ref });
  },
}));
vi.mock("./calendar/CalendarSpace", () => ({
  CalendarSpace: () => null,
  CalendarNotesProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./meetings/MeetingsSpace", () => ({ MeetingsSpace: () => null }));
vi.mock("./mail/MailSpace", () => ({ MailSpace: () => null }));
vi.mock("./ProjectsSpace", () => ({ ProjectsSpace: () => null }));
vi.mock("./OfficeWorkspace", () => ({ OfficeWorkspace: () => null }));
vi.mock("./TasksSpace", () => ({ TasksSpace: () => null }));

const environmentId = EnvironmentId.make("remote");
const connection = {
  id: "slack_a",
  provider: "slack" as const,
  label: "Approved Slack",
  identity: "Maya",
  connected: true,
  generation: 1,
};
const channel = {
  id: "C1",
  connectionId: connection.id,
  workspaceId: "T1",
  title: "marketing",
  kind: "channel" as const,
  replyRead: true,
};
const dm = { ...channel, id: "D1", title: "Maya Chen", kind: "dm" as const };
const item = (conversationId = "C1", messageId?: string, replyRootId?: string) =>
  chatResourceId({
    version: 1,
    transport: "server",
    connectionId: connection.id,
    workspaceId: "T1",
    conversationId,
    ...(messageId ? { messageId } : {}),
    ...(replyRootId ? { replyRootId } : {}),
  });
const message = (
  text = "Selected server history",
  conversationId = "C1",
): CommunicationMessage => ({
  id: "1728810000.000001",
  accountId: connection.id,
  connectionId: connection.id,
  workspaceId: "T1",
  conversationId,
  author: "Maya Chen",
  date: "2026-10-13T09:12:00Z",
  text,
});
const page = (messages: CommunicationMessage[] = [message()]) => ({
  messages,
  observedAt: "2026-10-13T09:12:00Z",
  incomplete: false,
});
const config = (supported = true, saved = false) => ({
  source: "live" as const,
  config: {
    pulseCapabilities: supported
      ? { communicationsSlackRead: true, ...(saved ? { workspaceSavedItems: true } : {}) }
      : {},
  } as ServerConfig,
});
const originalBridge = Object.getOwnPropertyDescriptor(window, "desktopBridge");
let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
  boundary.connected = true;
  boundary.prepared = null;
  boundary.opened = [];
  boundary.timeZone = "UTC";
  if (originalBridge) Object.defineProperty(window, "desktopBridge", originalBridge);
  else Reflect.deleteProperty(window, "desktopBridge");
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  vi.unstubAllGlobals();
});

async function render(
  search: Record<string, unknown> = {},
  read?: (input: {
    conversationId: string;
    replyRootId?: string;
    cursor?: string;
  }) => Effect.Effect<ReturnType<typeof page>, CommunicationsError>,
  initialSavedItems?: readonly WorkspaceSavedItem[],
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const desktop = vi.fn(async () => ({ ok: true, accounts: [] }));
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: { communicationsInvoke: desktop },
  });
  const calls: Array<{ method: string; input: unknown }> = [];
  let connections = [connection];
  let savedItems: readonly WorkspaceSavedItem[] = initialSavedItems ?? [
    {
      key: "unsupported-key",
      ref: {
        type: "provider-resource" as const,
        provider: "future-provider",
        resourceId: "kept-reference",
      },
      savedAt: "2026-10-13T09:12:00Z",
    },
  ];
  const client = {
    [WS_METHODS.slackListConnections]: (input: unknown) =>
      Effect.sync(() => {
        calls.push({ method: "connections", input });
        return connections;
      }),
    [WS_METHODS.slackListConversations]: (input: unknown) =>
      Effect.sync(() => {
        calls.push({ method: "conversations", input });
        return {
          conversations: [channel, dm],
          observedAt: "2026-10-13T09:12:00Z",
          incomplete: false,
        };
      }),
    [WS_METHODS.slackListMessages]: (input: { conversationId: string }) =>
      Effect.suspend(() => {
        calls.push({ method: "messages", input });
        return read
          ? read(input)
          : Effect.succeed(page([message("Selected server history", input.conversationId)]));
      }),
    [WS_METHODS.workspaceSavedItemsSubscribeChanges]: () => Stream.empty,
    [WS_METHODS.workspaceSavedItemsList]: (input: unknown) =>
      Effect.sync(() => {
        calls.push({ method: "saved-list", input });
        return { items: savedItems };
      }),
    [WS_METHODS.workspaceSavedItemsRemove]: (input: { key: string }) =>
      Effect.sync(() => {
        calls.push({ method: "saved-remove", input });
        savedItems = savedItems.filter((item) => item.key !== input.key);
      }),
    [WS_METHODS.workspaceSavedItemsAdd]: (input: unknown) =>
      Effect.sync(() => {
        calls.push({ method: "saved-add", input });
      }),
    [WS_METHODS.slackConnect]: (input: unknown) =>
      Effect.sync(() => {
        calls.push({ method: "connect", input });
        return connection;
      }),
    [WS_METHODS.slackDisconnect]: (input: unknown) =>
      Effect.sync(() => {
        calls.push({ method: "disconnect", input });
        connections = [];
      }),
  } as unknown as WsRpcProtocolClient;
  const target = new PrimaryConnectionTarget({
    environmentId,
    label: "Remote source",
    httpBaseUrl: "https://remote.example.test",
    wsBaseUrl: "wss://remote.example.test",
  });
  const runtime = Atom.runtime(
    Layer.effect(
      Registry.EnvironmentRegistry,
      Effect.gen(function* () {
        const supervisor = Supervisor.EnvironmentSupervisor.of({
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
            Option.some({
              client,
              subscribeServerConfig: (input) => client.subscribeServerConfig(input),
              initialConfig: Effect.succeed(config(true, search.saved === true).config),
              ready: Effect.void,
              probe: Effect.void,
              closed: Effect.never,
            } as RpcSession),
          ),
          prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
          connect: Effect.void,
          disconnect: Effect.void,
          retryNow: Effect.void,
        });
        return Registry.EnvironmentRegistry.of({
          run: (id, effect) =>
            id === environmentId
              ? Effect.provideService(effect, Supervisor.EnvironmentSupervisor, supervisor)
              : Effect.fail(new Registry.EnvironmentNotRegisteredError({ environmentId: id })),
          runStream: (id, stream) =>
            id === environmentId
              ? Stream.provideService(stream, Supervisor.EnvironmentSupervisor, supervisor)
              : Stream.fail(new Registry.EnvironmentNotRegisteredError({ environmentId: id })),
          followStream: (id, stream) =>
            id === environmentId
              ? Stream.provideService(stream, Supervisor.EnvironmentSupervisor, supervisor)
              : Stream.fail(new Registry.EnvironmentNotRegisteredError({ environmentId: id })),
        } as Registry.EnvironmentRegistry["Service"]);
      }),
    ),
  );
  const registry = AtomRegistry.make();
  boundary.atoms = createCommunicationsAtoms(runtime);
  boundary.savedAtoms = createWorkspaceSavedItemAtoms(runtime);
  const preparedAtom = Atom.make<object>({});
  boundary.prepared = preparedAtom;
  const configAtom = Atom.make(
    AsyncResult.success(config(search.supported !== false, search.saved === true)),
  );
  boundary.config = configAtom;
  const rootRoute = createRootRoute();
  const chatRoute = createRoute({ getParentRoute: () => rootRoute, id: "_chat" });
  const workspace = createRoute({
    getParentRoute: () => chatRoute,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component: Route.options.component!,
  });
  const settings = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings/integrations",
    validateSearch: validateSettingsScopeSearch,
    component: () => <p>Selected environment settings</p>,
  });
  const history = createMemoryHistory({
    initialEntries: [
      "/workspace" +
        defaultStringifySearch({
          space: "communications",
          environment: environmentId,
          communicationProvider: "slack",
          account: connection.id,
          item: item(),
          ...search,
        }),
    ],
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([chatRoute.addChildren([workspace]), settings]),
    history,
    defaultPendingMinMs: 0,
  });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Resources() {
    const resources = useWorkspaceResourceState(environmentId, {
      storage: { getItem: () => null, setItem: () => {} },
      presentation: "sheet",
    });
    return (
      <WorkspaceResourcesContext value={resources}>
        <RouterProvider router={router} />
      </WorkspaceResourcesContext>
    );
  }
  const mount = (owners = 1) =>
    root.render(
      <RegistryContext.Provider value={registry}>
        {search.strict ? (
          <StrictMode>
            {Array.from({ length: owners }, (_, index) => (
              <Resources key={index} />
            ))}
          </StrictMode>
        ) : (
          Array.from({ length: owners }, (_, index) => <Resources key={index} />)
        )}
      </RegistryContext.Provider>,
    );
  await act(async () => mount());
  dispose = async () => {
    await act(async () => root.unmount());
    registry.dispose();
    node.remove();
  };
  return { node, router, history, calls, desktop, registry, configAtom, preparedAtom, mount };
}

it("opens the captured remote Slack channel through real atoms and loaded metadata search", async () => {
  const { node, calls, desktop, router } = await render();
  expect(node.textContent).toContain("Selected server history");
  expect(desktop).not.toHaveBeenCalled();
  expect(calls.map((call) => call.method)).toEqual(["connections", "conversations", "messages"]);
  expect(getByRole(node, "button", { name: "Open Maya Chen" })).toBeDefined();
  expect(node.textContent).toContain("Read-only on this client.");
  await act(async () =>
    fireEvent.change(getByRole(node, "textbox", { name: "Search loaded conversations" }), {
      target: { value: "Maya" },
    }),
  );
  expect(queryByRole(node, "button", { name: "Open marketing" })).toBeNull();
  expect(calls).toHaveLength(3);
  await act(async () => getByRole(node, "button", { name: "Open Maya Chen" }).click());
  expect(router.state.location.search.item).toBe(item("D1"));
  expect(calls.at(-1)?.input).toEqual({
    connectionId: connection.id,
    workspaceId: "T1",
    conversationId: "D1",
  });
});
it("makes zero Slack or desktop calls on an old server", async () => {
  const { node, calls, desktop } = await render({ supported: false });
  expect(calls).toEqual([]);
  expect(desktop).not.toHaveBeenCalled();
  expect(node.textContent).toContain("This server does not support Slack reading.");
});
it("preserves an exact reply root and browser Back without scanning channel history", async () => {
  const exact = item("C1", "1728810000.000002", "1728810000.000001");
  const { node, router, calls, history } = await render({ item: exact });
  expect(calls.filter((call) => call.method === "messages").map((call) => call.input)).toEqual([
    {
      connectionId: connection.id,
      workspaceId: "T1",
      conversationId: "C1",
      replyRootId: "1728810000.000001",
    },
  ]);
  expect(router.state.location.search.item).toBe(exact);
  await act(async () => getByRole(node, "button", { name: "Back to conversation" }).click());
  expect(router.state.location.search.item).toBe(item());
  await act(async () => history.back());
  expect(router.state.location.search.item).toBe(exact);
});
it("clears loaded content when capability is withdrawn", async () => {
  const { node, registry, configAtom, calls } = await render();
  expect(node.textContent).toContain("Selected server history");
  const count = calls.length;
  await act(async () => registry.set(configAtom, AsyncResult.success(config(false))));
  expect(node.textContent).not.toContain("Selected server history");
  expect(node.textContent).toContain("This server does not support Slack reading.");
  expect(calls).toHaveLength(count);
});

function receipt<A>() {
  let resolve!: (value: A) => void;
  const promise = new Promise<A>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it("aborts and releases a closing reader during actual Refresh, then recovers on later Refresh", async () => {
  const entered = receipt<void>();
  const closed = receipt<void>();
  let calls = 0;
  const { node, mount } = await render({}, () => {
    calls++;
    if (calls !== 2)
      return Effect.succeed(page([message(calls === 1 ? "Initial history" : "Recovered history")]));
    return Effect.callback<ReturnType<typeof page>>(() => {
      entered.resolve();
      return Effect.sync(() => closed.resolve());
    });
  });
  expect(node.textContent).toContain("Initial history");
  await act(async () => {
    getByRole(node, "button", { name: "Refresh messages" }).click();
    await entered.promise;
  });
  expect(node.textContent).toContain("Loading messages...");
  await act(async () => mount(0));
  await act(async () => closed.promise);
  expect(node.textContent).not.toContain("Initial history");
  await act(async () => mount());
  await act(async () => getByRole(node, "button", { name: "Refresh messages" }).click());
  expect(node.textContent).toContain("Recovered history");
});
it("keeps a second mounted owner alive when the refreshing owner closes", async () => {
  const entered = receipt<void>();
  const stopped = receipt<void>();
  let release!: (effect: Effect.Effect<ReturnType<typeof page>>) => void;
  let calls = 0;
  let canceled = false;
  const { node, mount } = await render({}, () => {
    calls++;
    if (calls !== 2) return Effect.succeed(page());
    return Effect.callback<ReturnType<typeof page>>((resume) => {
      release = resume;
      entered.resolve();
      return Effect.sync(() => {
        canceled = true;
        stopped.resolve();
      });
    });
  });
  await act(async () => mount(2));
  expect(calls).toBe(1);
  const refreshes = [...node.querySelectorAll("button")].filter(
    (button) => button.textContent === "Refresh messages",
  );
  await act(async () => {
    refreshes[1]!.click();
    await entered.promise;
  });
  await act(async () => mount(1));
  expect(canceled).toBe(false);
  await act(async () => release(Effect.succeed(page([message("Shared refreshed history")]))));
  expect(node.textContent).toContain("Shared refreshed history");
  expect(calls).toBe(2);
});
it("suppresses a delayed channel result after selection changes", async () => {
  const entered = receipt<void>();
  const stopped = receipt<void>();
  let release!: (effect: Effect.Effect<ReturnType<typeof page>>) => void;
  const { node } = await render({}, (input) =>
    input.conversationId === "C1"
      ? Effect.callback<ReturnType<typeof page>>((resume) => {
          release = resume;
          entered.resolve();
          return Effect.sync(() => stopped.resolve());
        })
      : Effect.succeed(page([message("Selected DM", "D1")])),
  );
  await entered.promise;
  await act(async () => {
    getByRole(node, "button", { name: "Open Maya Chen" }).click();
    await stopped.promise;
  });
  await act(async () => release(Effect.succeed(page([message("Stale channel body")]))));
  expect(node.textContent).toContain("Selected DM");
  expect(node.textContent).not.toContain("Stale channel body");
});
it("uses explicit server setup, cancels a token, connects and disconnects in that environment", async () => {
  const { node, calls, router } = await render({
    item: undefined,
    account: undefined,
    communicationSource: "server",
  });
  expect(calls.map((call) => call.method)).toEqual(["connections"]);
  await act(async () =>
    getByRole(node, "button", { name: "Communications accounts and settings" }).click(),
  );
  await act(async () => getByRole(node, "button", { name: "Connect Slack" }).click());
  expect(document.body.textContent).toContain(
    "Credentials stay in the selected environment. Source: Remote source.",
  );
  expect(queryByRole(document.body, "option", { name: "Discord" })).toBeNull();
  let input = document.body.querySelector<HTMLInputElement>('input[type="password"]')!;
  await act(async () => fireEvent.change(input, { target: { value: "fake-private-token" } }));
  await act(async () => getByRole(document.body, "button", { name: "Cancel" }).click());
  expect(calls.every((call) => call.method !== "connect")).toBe(true);
  await act(async () => getByRole(node, "button", { name: "Connect Slack" }).click());
  input = document.body.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(input.value).toBe("");
  await act(async () => fireEvent.change(input, { target: { value: "fake-submitted-token" } }));
  await act(async () => fireEvent.submit(input.closest("form")!));
  expect(router.state.location.search).toMatchObject({
    environment: "remote",
    communicationSource: "server",
    account: connection.id,
  });
  expect(router.state.location.search.item).toBeUndefined();
  expect(calls.find((call) => call.method === "connect")?.input).toEqual({
    token: "fake-submitted-token",
  });
  expect(JSON.stringify(window.localStorage)).not.toContain("fake-submitted-token");
  await act(async () =>
    getByRole(node, "button", { name: "Communications accounts and settings" }).click(),
  );
  await act(async () => getByRole(node, "button", { name: "Disconnect Approved Slack" }).click());
  expect(router.state.location.search.account).toBeUndefined();
  expect(calls.find((call) => call.method === "disconnect")?.input).toEqual({
    connectionId: connection.id,
  });
});
it("keeps source identity authoritative over a conflicting desktop hint", async () => {
  const { node, desktop } = await render({ communicationSource: "desktop" });
  expect(node.textContent).toContain("Selected server history");
  expect(desktop).not.toHaveBeenCalled();
});
it("clears old content after authenticated binding replacement", async () => {
  let count = 0;
  const { node, registry, preparedAtom } = await render({}, () =>
    Effect.succeed(page([message(++count === 1 ? "Original binding" : "New binding")])),
  );
  expect(node.textContent).toContain("Original binding");
  await act(async () => registry.set(preparedAtom, {}));
  expect(node.textContent).not.toContain("Original binding");
  expect(node.textContent).toContain("New binding");
});
it("retains loaded messages on a scoped provider failure without echoing raw error payloads", async () => {
  let count = 0;
  const { node } = await render({}, () =>
    ++count === 1
      ? Effect.succeed(page())
      : Effect.fail(
          new CommunicationsError({ kind: "access-denied", message: "private-provider-payload" }),
        ),
  );
  await act(async () => getByRole(node, "button", { name: "Refresh messages" }).click());
  expect(node.textContent).toContain("Selected server history");
  expect(node.textContent).toContain("Refresh failed. Showing previously loaded messages.");
  expect(node.textContent).toContain("Check its scopes in Slack.");
  expect(node.textContent).not.toContain("private-provider-payload");
});

it("lists and removes unavailable saved references without an account or loaded provider history", async () => {
  const { node, calls } = await render({
    communicationSource: "server",
    account: undefined,
    item: undefined,
    view: "later",
    saved: true,
  });
  expect(node.textContent).toContain(
    "This source is unavailable here. Its reference has been kept.",
  );
  expect(
    getByRole(node, "button", {
      name: "Open saved reference: future-provider · kept-reference",
    }).hasAttribute("disabled"),
  ).toBe(true);
  expect(calls.some((call) => call.method === "messages" || call.method === "conversations")).toBe(
    false,
  );
  await act(async () =>
    getByRole(node, "button", {
      name: "Remove from Later: future-provider · kept-reference",
    }).click(),
  );
  expect(calls.find((call) => call.method === "saved-remove")?.input).toEqual({
    key: "unsupported-key",
  });
  expect(node.textContent).not.toContain("This source is unavailable here.");
});
it("saves the exact server message without linking, posting or loading sibling histories", async () => {
  const { node, calls } = await render({ saved: true });
  const before = calls.filter((call) => call.method === "messages").length;
  await act(async () => getByRole(node, "button", { name: "Save for Later" }).click());
  expect(calls.find((call) => call.method === "saved-add")?.input).toEqual({
    ref: {
      type: "provider-resource",
      provider: "slack",
      resourceId: item("C1", "1728810000.000001", "1728810000.000001"),
    },
  });
  expect(calls.filter((call) => call.method === "messages")).toHaveLength(before);
  expect(node.textContent).toContain("Saved for Later in this environment.");
});
it("keeps an exact server source in the server account list after phone Back", async () => {
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 390, height: 800 });
  const { node, router, calls, desktop } = await render();
  await act(async () => getByRole(node, "button", { name: "Back to list" }).click());
  expect(router.state.location.search.item).toBeUndefined();
  expect(router.state.location.search.communicationSource).toBe("server");
  expect(getByRole(node, "button", { name: "Open marketing" })).toBeDefined();
  expect(desktop).not.toHaveBeenCalled();
  expect(calls.filter((call) => call.method === "messages")).toHaveLength(1);
});

it("removes a capability while a real read is pending and suppresses its late completion", async () => {
  const entered = receipt<void>();
  const stopped = receipt<void>();
  let release!: (effect: Effect.Effect<ReturnType<typeof page>>) => void;
  const { node, registry, configAtom } = await render({}, () =>
    Effect.callback<ReturnType<typeof page>>((resume) => {
      release = resume;
      entered.resolve();
      return Effect.sync(() => stopped.resolve());
    }),
  );
  await entered.promise;
  await act(async () => registry.set(configAtom, AsyncResult.success(config(false))));
  await act(async () => stopped.promise);
  await act(async () => release(Effect.succeed(page([message("Withdrawn capability body")]))));
  expect(node.textContent).not.toContain("Withdrawn capability body");
  expect(node.textContent).toContain("This server does not support Slack reading.");
});
it("uses a live Refresh signal after React replays mounted effects", async () => {
  let calls = 0;
  const { node } = await render({ strict: true }, () =>
    Effect.succeed(page([message(`History ${++calls}`)])),
  );
  const before = calls;
  await act(async () => getByRole(node, "button", { name: "Refresh messages" }).click());
  expect(calls).toBe(before + 1);
  expect(node.textContent).toContain(`History ${calls}`);
});

it("opens scoped Communications settings from the source menu and restores the exact source on Back", async () => {
  const exact = item("C1", "1728810000.000002", "1728810000.000001");
  const { node, router, history, desktop } = await render({ item: exact });
  await act(async () =>
    getByRole(node, "button", { name: "Communications accounts and settings" }).click(),
  );
  await act(async () => getByRole(node, "link", { name: "Communications settings" }).click());
  expect(router.state.location.pathname).toBe("/settings/integrations");
  expect(router.state.location.search).toEqual({ machine: "remote" });
  expect(router.state.location.hash).toBe("communications");
  await act(async () => history.back());
  expect(router.state.location.search.item).toBe(exact);
  expect(router.state.location.search.environment).toBe("remote");
  expect(desktop).not.toHaveBeenCalled();
});

it("keeps a wrong-environment URL unavailable without reading the primary or another server", async () => {
  const { node, calls, desktop, router } = await render({ environment: "missing-remote" });
  expect(router.state.location.search.environment).toBe("missing-remote");
  expect(router.state.location.search.item).toBe(item());
  expect(calls).toEqual([]);
  expect(desktop).not.toHaveBeenCalled();
  expect(node.textContent).not.toContain("Selected server history");
  expect(node.textContent).toContain(
    "The selected environment is unavailable. Reconnect it to read this source.",
  );
});

it("keeps an explicit server Discord setup unavailable without substituting Slack or desktop", async () => {
  const { node, calls, desktop } = await render({
    communicationSource: "server",
    communicationProvider: "discord",
    account: "discord_a",
    item: undefined,
  });
  expect(calls).toEqual([]);
  expect(desktop).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Server Discord reading is not available.");
});

it("retains Telegram's existing destination when a server source hint is present", async () => {
  const { node, calls, desktop } = await render({
    communicationProvider: "telegram",
    communicationSource: "server",
    item: undefined,
    account: undefined,
  });
  expect(calls).toEqual([]);
  expect(desktop).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Telegram bots need a newer server.");
});

const laterReferences: readonly WorkspaceSavedItem[] = [
  {
    key: "saved-slack-a",
    ref: {
      type: "provider-resource",
      provider: "slack",
      resourceId: chatResourceId({
        version: 1,
        transport: "server",
        connectionId: "slack_a",
        workspaceId: "T1",
        conversationId: "C1",
        messageId: "1728810000.000001",
        replyRootId: "1728810000.000001",
      }),
    },
    savedAt: "2026-10-13T00:30:00Z",
  },
  {
    key: "saved-slack-b",
    ref: {
      type: "provider-resource",
      provider: "slack",
      resourceId: chatResourceId({
        version: 1,
        transport: "server",
        connectionId: "slack_b",
        workspaceId: "T2",
        conversationId: "C2",
        messageId: "1728810000.000002",
        replyRootId: "1728810000.000001",
      }),
    },
    savedAt: "2026-10-14T09:12:00Z",
  },
  {
    key: "saved-unsupported",
    ref: { type: "provider-resource", provider: "future-provider", resourceId: "kept-reference" },
    savedAt: "2026-10-15T10:00:00Z",
  },
];
const laterLabelA =
  "Slack · server · Account slack_a · Workspace T1 · Conversation C1 · Message 1728810000.000001 · Reply root 1728810000.000001";
const laterLabelB =
  "Slack · server · Account slack_b · Workspace T2 · Conversation C2 · Message 1728810000.000002 · Reply root 1728810000.000001";
it("identifies each Later original and removes the named reference without fetching histories", async () => {
  const { node, calls, desktop } = await render(
    {
      communicationSource: "server",
      account: undefined,
      item: undefined,
      view: "later",
      saved: true,
    },
    undefined,
    laterReferences,
  );
  const first = getByRole(node, "article", { name: laterLabelA });
  const second = getByRole(node, "article", { name: laterLabelB });
  const unsupported = getByRole(node, "article", { name: "future-provider · kept-reference" });
  expect(first.textContent).toContain(laterLabelA);
  expect(second.textContent).toContain(laterLabelB);
  expect(first.textContent).toContain("Saved 13 Oct 2026 · 00:30 UTC");
  expect(second.textContent).toContain("Saved 14 Oct 2026 · 09:12 UTC");
  expect(unsupported.textContent).toContain("Saved 15 Oct 2026 · 10:00 UTC");
  for (const row of [first, second, unsupported]) {
    for (const action of within(row).getAllByRole("button")) {
      const visibleText = action.textContent!.replace(/\s+/g, " ").trim();
      expect(
        within(row).getByRole("button", {
          name: (name, element) => element === action && name.startsWith(visibleText),
        }),
      ).toBe(action);
    }
  }
  expect(
    within(unsupported)
      .getByRole("button", { name: "Open saved reference: future-provider · kept-reference" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await act(async () =>
    within(first)
      .getByRole("button", { name: `Open saved message: ${laterLabelA}` })
      .click(),
  );
  expect(boundary.opened).toEqual([{ environmentId: "remote", ref: laterReferences[0]!.ref }]);
  await act(async () =>
    within(second)
      .getByRole("button", { name: `Remove from Later: ${laterLabelB}` })
      .click(),
  );
  expect(calls.filter((call) => call.method === "saved-remove")).toEqual([
    { method: "saved-remove", input: { key: "saved-slack-b" } },
  ]);
  expect(queryByRole(node, "article", { name: laterLabelB })).toBeNull();
  expect(getByRole(node, "article", { name: laterLabelA })).toBeDefined();
  expect(getByRole(node, "article", { name: "future-provider · kept-reference" })).toBeDefined();
  expect(
    calls.every((call) => ["connections", "saved-list", "saved-remove"].includes(call.method)),
  ).toBe(true);
  expect(desktop).not.toHaveBeenCalled();
});
it("bounds hostile Later identity as inert text and formats saved dates in the environment zone", async () => {
  boundary.timeZone = "America/Los_Angeles";
  const hostile = '<img src=x onerror="run()">' + "x".repeat(450);
  const saved = {
    key: "hostile-reference",
    ref: { type: "provider-resource" as const, provider: "future-provider", resourceId: hostile },
    savedAt: "2026-10-13T00:30:00Z",
  };
  const { node, calls } = await render(
    {
      communicationSource: "server",
      account: undefined,
      item: undefined,
      view: "later",
      saved: true,
    },
    undefined,
    [laterReferences[0]!, laterReferences[1]!, saved],
  );
  const row = getByRole(node, "article", { name: /future-provider/ });
  expect(row.querySelector("img")).toBeNull();
  expect(row.textContent).toContain('<img src=x onerror="run()">');
  expect(row.querySelector("p")!.textContent!.length).toBeLessThanOrEqual(320);
  expect(row.textContent).toContain("Saved 12 Oct 2026 · 17:30 America/Los_Angeles");
  const remove = within(row).getByRole("button", { name: /^Remove from Later: future-provider/ });
  expect(remove.getAttribute("aria-label")!.length).toBeLessThanOrEqual(340);
  await act(async () => remove.click());
  expect(calls.find((call) => call.method === "saved-remove")?.input).toEqual({
    key: "hostile-reference",
  });
  expect(
    calls.every((call) => ["connections", "saved-list", "saved-remove"].includes(call.method)),
  ).toBe(true);
  expect(saved.ref.resourceId).toBe(hostile);
});
