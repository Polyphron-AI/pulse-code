// @vitest-environment happy-dom
import * as Cause from "effect/Cause";
import "../meetings/WorkspaceNoteView";
import { act, useEffect, useMemo as ReactUseMemo, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  defaultStringifySearch,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, type CalendarOccurrenceSummary } from "@t3tools/contracts";
import { CalendarAgenda } from "./CalendarAgenda";
import { Route, parseWorkspaceSearch } from "../../../routes/_chat.workspace";
import { WorkspaceResourcesProvider, useWorkspaceResourceState } from "../workspaceResourceState";
import { WorkspaceNavigation } from "../WorkspaceNavigationView";
import { WorkspaceViewRail, workspaceRailItems } from "../WorkspaceViewRail";
import { workspaceDestinationSearch, rememberWorkspaceLocation } from "../workspaceNavigation";
const rpc = vi.hoisted(() => ({
  version: 0,
  listeners: new Set<() => void>(),
  noteReads: 0,
  noteReceipt: undefined as (() => void) | undefined,
  noteRequests: [] as unknown[],
  rangeMode: "ready",
  rangeUpdatedAt: 1,
  more: false,
  timeZone: "Africa/Johannesburg" as string | null,
  connected: true,
  active: 0,
  max: 0,
  notes: 1,
  detail: false,
  detailTime: undefined as CalendarOccurrenceSummary["time"] | undefined,
  error: null as string | null,
  commands: vi.fn(),
  range: vi.fn(),
  rangeStarts: [] as string[],
  environment: "fixture-environment",
}));
const event = {
  id: "wce_00000000-0000-0000-0000-000000000001",
  title: "Launch review",
  status: "confirmed",
  revision: 1,
  time: {
    kind: "timed",
    start: "2026-10-13T12:00:00Z",
    end: "2026-10-13T12:45:00Z",
    sourceTimeZone: "UTC",
  },
  sourceLabel: "Saved",
  attendees: [],
  attendeesTruncated: false,
  hasDescription: true,
  descriptionPreview: "Campaign readiness",
  joinUrl: "https://meet.google.com/abc-defg-hij",
} satisfies CalendarOccurrenceSummary;
const noteId = "wsn_00000000-0000-0000-0000-000000000001";
vi.mock("../../../state/workspaceCalendar", () => ({
  workspaceCalendar: {
    range: (input: unknown) => {
      rpc.range(input);
      return { kind: "range", input };
    },
    detail: (input: unknown) => ({ kind: "detail", input }),
    loadMore: "more",
  },
}));
vi.mock("../../../state/workspaceLinks", () => ({
  workspaceLinks: { list: (input: unknown) => ({ kind: "links", input }), link: "link" },
}));
vi.mock("../../../state/workspaceNotes", () => ({
  workspaceNotes: {
    get: (input: unknown) => ({ kind: "note", input }),
    create: "create",
    update: "update",
    delete: "delete",
    restore: "restore",
  },
}));
vi.mock("../../../state/server", () => ({
  serverEnvironment: { configProjection: () => ({ kind: "config" }) },
}));
vi.mock("../../../state/use-atom-command", () => ({
  useAtomCommand: (name: string) => (value: unknown) => rpc.commands(name, value),
}));
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: (
    query: { kind: string; input?: { environmentId: string; input: { id?: string } } } | null,
  ) => {
    const rangeKey = query?.kind === "range" ? JSON.stringify(query.input) : null;
    useEffect(() => {
      if (rangeKey) rpc.rangeStarts.push(rangeKey);
    }, [rangeKey]);
    useSyncExternalStore(
      (listener) => {
        rpc.listeners.add(listener);
        return () => {
          rpc.listeners.delete(listener);
        };
      },
      () => rpc.version,
    );
    useEffect(() => {
      if (query?.kind !== "note") return;
      rpc.noteReads++;
      rpc.noteReceipt?.();
      rpc.noteRequests.push(query.input);
      rpc.active++;
      rpc.max = Math.max(rpc.max, rpc.active);
      return () => {
        rpc.active--;
      };
    }, [query?.kind, query?.input?.input.id]);
    const links = Array.from({ length: rpc.notes }, (_, i) => ({
      status: "confirmed",
      item: {
        ref: {
          type: "provider-resource",
          provider: "workspace-note",
          resourceId: i === 0 ? noteId : "wsn_00000000-0000-0000-0000-000000000002",
        },
        title: i === 0 ? "Launch review · Meeting notes" : "Second note",
      },
    }));
    let data =
      query?.kind === "range"
        ? {
            events: [event],
            dueTasks: [],
            sourceStates: [],
            incomplete: false,
            dueIncomplete: false,
          }
        : query?.kind === "detail" && rpc.detail
          ? {
              ...event,
              time: rpc.detailTime ?? {
                kind: "all-day",
                startOn: "2026-12-02",
                endBefore: "2026-12-03",
              },
              description: "Resolved body",
            }
          : query?.kind === "links"
            ? { linked: links, suggested: [], truncated: false }
            : query?.kind === "note"
              ? {
                  id: query.input?.input.id,
                  title: "Launch review · Meeting notes",
                  body: "Exact native note body",
                  revision: 1,
                  createdAt: "2026-10-13T00:00:00Z",
                  updatedAt: "2026-10-13T00:00:00Z",
                }
              : query?.kind === "config"
                ? { source: "live", config: { pulseCapabilities: { workspaceNotes: true } } }
                : null;
    if (query?.kind === "range") {
      if (rpc.rangeMode === "loading") data = null;
      else
        data = {
          events:
            rpc.rangeMode === "empty" || rpc.rangeMode === "unavailable"
              ? []
              : [rpc.rangeMode === "no-url" ? { ...event, joinUrl: undefined } : event],
          dueTasks: [],
          sourceStates: [],
          incomplete: rpc.rangeMode === "partial",
          dueIncomplete: false,
          ...(rpc.more ? { nextCursor: "more", nextDueCursor: "more-due" } : {}),
          ...(rpc.rangeMode === "unavailable"
            ? { unavailableReason: "Calendar is unavailable on this server." }
            : {}),
        } as typeof data;
    }
    return {
      data,
      error:
        query?.kind === "detail"
          ? rpc.error
          : query?.kind === "range" && rpc.rangeMode === "partial"
            ? "Source failed"
            : null,
      isPending:
        (query?.kind === "detail" && !rpc.detail) ||
        (query?.kind === "range" && rpc.rangeMode === "loading"),
      dataUpdatedAt: rpc.rangeUpdatedAt,
      refresh: () => {},
    };
  },
}));
vi.mock("../../../hooks/useSettings", () => ({
  useEnvironmentSettings: () => rpc.timeZone,
}));
vi.mock("../../../hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));
vi.mock("../../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (rpc.connected ? ["fixture-environment"] : []),
  useEnvironment: () => ({ label: "Fixture" }),
}));
vi.mock("../../../state/entities", () => ({
  useProjects: () => [
    { id: "fixture-synkek", environmentId: "fixture-environment", title: "SynKEK" },
    { id: "chosen", environmentId: "fixture-environment", title: "Chosen project" },
  ],
  useAllEnvironmentProjectSnapshotsReady: () => true,
  useThreadShell: () => null,
  useThreadShells: () => [],
}));
vi.mock("../mail/useMailCapabilities", () => ({
  useMailCapabilities: (id?: EnvironmentId) => ({
    environmentId: id ?? "fixture-environment",
    workspaceLinks: true,
    workspaceTools: true,
  }),
}));
vi.mock("../useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => true }));
vi.mock("../useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => () => {} }));
vi.mock("../WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  WorkspaceItemActions: () => null,
}));
vi.mock("../WorkspaceLinkedContext", () => ({ WorkspaceLinkedContext: () => null }));
vi.mock("../WorkspaceToolsPanel", () => ({
  WorkspaceProjectFiles: () => <p>Files body</p>,
  WorkspaceBrowser: () => null,
  WorkspaceProjectAgents: () => null,
}));
vi.mock("../ProjectsSpace", () => ({ ProjectsSpace: () => <p>Projects destination</p> }));
function Shell() {
  const raw = useSearch({ strict: false });
  const search = ReactUseMemo(() => parseWorkspaceSearch(raw), [raw]);
  const navigate = useNavigate();
  const id = EnvironmentId.make(search.environment ?? "fixture-environment");
  const resources = useWorkspaceResourceState(id, {
    storage: { getItem: () => null, setItem: () => {} },
  });
  useEffect(() => {
    rememberWorkspaceLocation(id, search);
  }, [id, search]);
  return (
    <WorkspaceResourcesProvider value={resources}>
      <WorkspaceNavigation
        mode="workspace"
        environmentId={id}
        onModeChange={() => {}}
        onNavigate={(destination) => {
          void navigate({
            to: "/workspace",
            search: workspaceDestinationSearch(destination, id, search),
          });
        }}
      />
      {search.space === "calendar" ? (
        <WorkspaceViewRail
          items={workspaceRailItems.calendar}
          selected={search.view ?? "agenda"}
          onSelect={(view) => {
            void navigate({ to: "/workspace", search: { ...search, view } });
          }}
        />
      ) : null}
      <Outlet />
    </WorkspaceResourcesProvider>
  );
}
async function mount(
  item?: string,
  space = item ? "calendar" : "meetings",
  timeZone: string | null = "Africa/Johannesburg",
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  rpc.notes = 1;
  rpc.rangeMode = "ready";
  rpc.more = false;
  rpc.rangeUpdatedAt = 1;
  rpc.timeZone = timeZone;
  rpc.connected = true;
  rpc.detail = false;
  rpc.detailTime = undefined;
  rpc.error = null;
  rpc.range.mockClear();
  rpc.rangeStarts.length = 0;
  rpc.commands.mockReset();
  rpc.noteReads = 0;
  rpc.noteRequests = [];
  rpc.max = 0;
  rpc.active = 0;
  const rootRoute = createRootRoute({ component: Shell });
  const chat = createRoute({ getParentRoute: () => rootRoute, id: "_chat" });
  const workspace = createRoute({
    getParentRoute: () => chat,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component: Route.options.component!,
  });
  const search = defaultStringifySearch({
    space,
    view: space === "calendar" ? "agenda" : "upcoming",
    day: "2026-10-14",
    environment: "fixture-environment",
    project: "fixture-synkek",
    ...(item ? { item } : {}),
  });
  const router = createRouter({
    defaultPendingMinMs: 0,
    defaultPendingMs: 0,
    routeTree: rootRoute.addChildren([chat.addChildren([workspace])]),
    history: createMemoryHistory({ initialEntries: [`/workspace${search}`] }),
  });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  await act(() => root.render(<RouterProvider router={router} />));
  return {
    node,
    router,
    dispose: async () => {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    },
  };
}
const click = async (node: HTMLElement, role: string, name: string) =>
  act(() => fireEvent.click(getByRole(node, role, { name })));
const notify = async () =>
  act(() => {
    rpc.version++;
    for (const l of rpc.listeners) l();
  });

it("switches Agenda and Week, keeps the date and resource project, and returns from exact event detail to Week", async () => {
  const { node, router, dispose } = await mount(undefined, "calendar");
  try {
    await click(node, "button", "Tuesday, 13 October 2026");
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "Chosen project");
    const originalRange = rpc.range.mock.calls.at(-1)?.[0];
    await click(node, "button", "Week");
    await act(() => router.load());
    expect(rpc.rangeStarts).toHaveLength(1);
    await act(async () => {
      router.history.back();
      await router.load();
    });
    expect(getByRole(node, "region", { name: "Calendar agenda" })).toBeDefined();
    await act(async () => {
      router.history.forward();
      await router.load();
    });
    expect(getByRole(node, "region", { name: "Week schedule" })).toBeDefined();
    expect(router.state.location.search).toMatchObject({
      space: "calendar",
      view: "week",
      day: "2026-10-13",
    });
    expect(rpc.range.mock.calls.at(-1)?.[0]).toEqual(originalRange);
    await click(node, "button", "Wednesday, 14 October 2026");
    expect(router.state.location.search.view).toBe("week");
    await click(node, "button", "Agenda");
    await act(() => router.load());
    expect(getByRole(node, "region", { name: "Calendar agenda" })).toBeDefined();
    expect(router.state.location.search.day).toBe("2026-10-14");
    await click(node, "button", "Week");
    await act(() => router.load());
    expect(rpc.rangeStarts).toHaveLength(1);
    await act(() =>
      fireEvent.keyDown(getByRole(node, "button", { name: /^Launch review,/ }), { key: "Enter" }),
    );
    await act(() => router.load());
    expect(router.state.location.search.view).toBe("week");
    expect(router.state.location.search.item).toContain(event.id);
    await click(node, "button", "Close event");
    await act(() => router.load());
    expect(getByRole(node, "region", { name: "Week schedule" })).toBeDefined();
    expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
    expect(rpc.commands).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

it("moves the route and seven chips to a picked date outside the pictured week", async () => {
  const { node, router, dispose } = await mount(undefined, "calendar");
  try {
    await click(node, "button", "Choose date");
    await act(() => vi.dynamicImportSettled());
    await click(document.body, "button", "Go to the Next Month");
    await act(() =>
      getByRole(document.body, "button", { name: /Monday, 2 November 2026/ }).click(),
    );
    await act(() => router.load());
    expect(router.state.location.search).toMatchObject({
      space: "calendar",
      view: "agenda",
      day: "2026-11-02",
    });
    expect(
      getByRole(node, "button", { name: "Monday, 2 November 2026" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(rpc.range.mock.calls.at(-1)?.[0]).toMatchObject({
      input: { startOn: "2026-11-02", endBefore: "2026-11-09" },
    });
  } finally {
    await dispose();
  }
});

it("announces complete actual instants and both offsets in fold event detail", async () => {
  const { node, dispose } = await mount(
    JSON.stringify({
      type: "provider-resource",
      provider: "workspace-calendar",
      resourceId: event.id,
    }),
    "calendar",
    "America/New_York",
  );
  try {
    rpc.detailTime = {
      kind: "timed",
      start: "2026-11-01T05:30:00Z",
      end: "2026-11-01T06:30:00Z",
      sourceTimeZone: "UTC",
    };
    rpc.detail = true;
    await notify();
    expect(getByRole(node, "region", { name: "Calendar event" }).textContent).toContain(
      "1 November 2026, 01:30 GMT-4 to 1 November 2026, 01:30 GMT-5 (America/New_York)",
    );
  } finally {
    await dispose();
  }
});

it.each(["reopen", "while open"])(
  "links the project shown at confirmation after a project switch %s",
  async (when) => {
    const { node, dispose } = await mount();
    try {
      rpc.notes = 0;
      rpc.commands.mockImplementation(async (name: string) =>
        name === "create"
          ? { _tag: "Success", value: { id: noteId, title: "Saved note" } }
          : { _tag: "Success", value: {} },
      );
      await click(node, "button", "Tuesday, 13 October 2026");
      await click(node, "combobox", "Choose project");
      await click(document.body, "option", "SynKEK");
      await click(node, "button", "Notes & agenda");
      if (when === "reopen") await click(node, "button", "Close notes chooser");
      await click(node, "combobox", "Choose project");
      await click(document.body, "option", "Chosen project");
      if (when === "reopen") await click(node, "button", "Notes & agenda");
      await act(() => fireEvent.click(getByRole(node, "checkbox").closest("label")!));
      expect(getByRole(node, "checkbox", { checked: true })).toBeDefined();
      await click(node, "button", "Create meeting note");
      expect(
        rpc.commands.mock.calls
          .filter((call) => call[0] === "link")
          .map((call) => call[1].input.a.ref),
      ).toEqual([
        { type: "provider-resource", provider: "workspace-calendar", resourceId: event.id },
        { type: "project", projectId: "chosen" },
      ]);
      expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
    } finally {
      await dispose();
    }
  },
);

it("opens an existing note using the current manual resource project after reopening", async () => {
  const { node, dispose } = await mount();
  try {
    rpc.notes = 0;
    await click(node, "button", "Tuesday, 13 October 2026");
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "SynKEK");
    await click(node, "button", "Notes & agenda");
    await click(node, "button", "Close notes chooser");
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "Chosen project");
    rpc.notes = 1;
    await notify();
    await click(node, "button", "Notes & agenda");
    await act(() => vi.dynamicImportSettled());
    expect(getByRole(node, "tabpanel").textContent).toContain("Exact native note body");
    expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
  } finally {
    await dispose();
  }
});

it("uses a project selected after the first projectless chooser open", async () => {
  const { node, router, dispose } = await mount();
  try {
    rpc.notes = 0;
    rpc.commands.mockImplementation(async (name: string) =>
      name === "create"
        ? { _tag: "Success", value: { id: noteId, title: "Saved note" } }
        : { _tag: "Success", value: {} },
    );
    await act(() =>
      router.navigate({
        to: "/workspace",
        search: {
          space: "meetings",
          view: "upcoming",
          day: "2026-10-13",
          environment: "fixture-environment",
        },
      }),
    );
    await click(node, "button", "Notes & agenda");
    expect(queryByRole(node, "checkbox")).toBeNull();
    await click(node, "button", "Close notes chooser");
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "Chosen project");
    await click(node, "button", "Notes & agenda");
    await act(() => fireEvent.click(getByRole(node, "checkbox").closest("label")!));
    await click(node, "button", "Create meeting note");
    expect(rpc.commands).toHaveBeenCalledWith(
      "link",
      expect.objectContaining({
        input: expect.objectContaining({ a: { ref: { type: "project", projectId: "chosen" } } }),
      }),
    );
    expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
  } finally {
    await dispose();
  }
});

it("names the frozen repair project while preserving a newer manual destination", async () => {
  const { node, dispose } = await mount();
  try {
    rpc.notes = 0;
    let failLink = true;
    rpc.commands.mockImplementation(async (name: string) =>
      name === "create"
        ? { _tag: "Success", value: { id: noteId, title: "Saved note" } }
        : failLink
          ? { _tag: "Failure", cause: Cause.fail(new Error("Link failed")) }
          : { _tag: "Success", value: {} },
    );
    await click(node, "button", "Tuesday, 13 October 2026");
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "SynKEK");
    await click(node, "button", "Notes & agenda");
    await act(() => fireEvent.click(getByRole(node, "checkbox").closest("label")!));
    await click(node, "button", "Create meeting note");
    await click(node, "button", "Close notes chooser");
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "Chosen project");
    await click(node, "button", "Notes & agenda");
    expect(
      getByRole(node, "checkbox", {
        name: "Also link this note to SynKEK",
        checked: true,
      }).getAttribute("aria-disabled"),
    ).toBe("true");
    failLink = false;
    await click(node, "button", "Retry linking");
    expect(rpc.commands).toHaveBeenCalledWith(
      "link",
      expect.objectContaining({
        input: expect.objectContaining({
          a: { ref: { type: "project", projectId: "fixture-synkek" } },
        }),
      }),
    );
    expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
  } finally {
    await dispose();
  }
});

it("clears successful creation repair so unlinking offers a fresh note and request", async () => {
  const { node, dispose } = await mount();
  try {
    rpc.notes = 0;
    rpc.commands.mockImplementation(async (name: string) =>
      name === "create"
        ? { _tag: "Success", value: { id: noteId, title: "Saved note" } }
        : { _tag: "Success", value: {} },
    );
    await click(node, "button", "Tuesday, 13 October 2026");
    await click(node, "button", "Notes & agenda");
    await click(node, "button", "Create meeting note");
    await act(() => vi.dynamicImportSettled());
    rpc.notes = 1;
    await notify();
    // The links boundary now reports the note unlinked in this same route lifetime.
    rpc.notes = 0;
    await notify();
    await click(node, "button", "Notes & agenda");
    expect(queryByRole(node, "button", { name: "Retry linking" })).toBeNull();
    expect(queryByRole(node, "button", { name: "Open saved note" })).toBeNull();
    await click(node, "button", "Create meeting note");
    const requests = rpc.commands.mock.calls
      .filter((call) => call[0] === "create")
      .map((call) => call[1].input.requestId);
    expect(requests).toHaveLength(2);
    expect(requests[1]).not.toBe(requests[0]);
  } finally {
    await dispose();
  }
});

it.each(["create", "link", "retry"])(
  "gates disconnected %s without consuming a new attempt",
  async (action) => {
    const { node, dispose } = await mount();
    try {
      rpc.notes = 0;
      rpc.commands.mockImplementation(async (name: string) =>
        name === "create"
          ? { _tag: "Success", value: { id: noteId, title: "Saved note" } }
          : { _tag: "Failure", cause: Cause.fail(new Error("Link failed")) },
      );
      await click(node, "button", "Tuesday, 13 October 2026");
      await click(node, "button", "Notes & agenda");
      if (action === "retry") await click(node, "button", "Create meeting note");
      rpc.connected = false;
      await notify();
      const name =
        action === "create"
          ? "Create meeting note"
          : action === "link"
            ? "Link existing note"
            : "Retry linking";
      const button = getByRole(node, "button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      const count = rpc.commands.mock.calls.length;
      await act(() => fireEvent.click(button));
      expect(rpc.commands).toHaveBeenCalledTimes(count);
      rpc.connected = true;
      await notify();
      expect(button.disabled).toBe(false);
      if (action !== "retry")
        expect(getByRole(node, "checkbox").getAttribute("aria-disabled")).not.toBe("true");
    } finally {
      await dispose();
    }
  },
);

it("keeps Meetings selection and Close event in Upcoming", async () => {
  const { node, router, dispose } = await mount();
  try {
    await click(node, "button", "Tuesday, 13 October 2026");
    await click(node, "button", "Launch review");
    await act(() => router.load());
    expect(router.state.location.search).toMatchObject({ space: "meetings", view: "upcoming" });
    expect(node.textContent).toContain("Loading event...");
    await click(node, "button", "Close event");
    await act(() => router.load());
    expect(router.state.location.search).toMatchObject({
      space: "meetings",
      view: "upcoming",
      day: "2026-10-13",
    });
    expect(getByRole(node, "region", { name: "Upcoming meetings" })).toBeDefined();
  } finally {
    await dispose();
  }
});

it("honors a Meetings URL carrying a calendar item", async () => {
  const item = JSON.stringify({
    type: "provider-resource",
    provider: "workspace-calendar",
    resourceId: event.id,
  });
  const { node, router, dispose } = await mount(item, "meetings");
  try {
    expect(node.textContent).toContain("Loading event...");
    rpc.detail = true;
    await notify();
    await act(() => router.load());
    expect(node.textContent).toContain("Resolved body");
    await click(node, "button", "Close event");
    await act(() => router.load());
    expect(router.state.location.search).toMatchObject({
      space: "meetings",
      view: "upcoming",
      day: "2026-12-02",
    });
  } finally {
    await dispose();
  }
});

it("focuses the chooser on open and restores the triggering card button on close", async () => {
  const { node, dispose } = await mount();
  try {
    rpc.notes = 0;
    await click(node, "button", "Tuesday, 13 October 2026");
    const trigger = getByRole(node, "button", { name: "Notes & agenda" });
    await act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(getByRole(node, "heading", { name: "Notes & agenda" }));
    await click(node, "button", "Close notes chooser");
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await dispose();
  }
});

it.each(["range change", "refresh recovery"])(
  "clears a Load more error after %s",
  async (recovery) => {
    const { node, router, dispose } = await mount();
    try {
      rpc.more = true;
      rpc.commands.mockResolvedValue({
        _tag: "Failure",
        cause: Cause.fail(new Error("Page read failed")),
      });
      await notify();
      await click(node, "button", "Load more events");
      expect(getByRole(node, "alert").textContent).toContain("Page read failed");
      expect(rpc.commands).toHaveBeenCalledWith(
        "more",
        expect.objectContaining({ input: expect.objectContaining({ kind: "events" }) }),
      );
      if (recovery === "range change") {
        await act(() =>
          router.navigate({
            to: "/workspace",
            search: { ...router.state.location.search, day: "2026-10-20" },
          }),
        );
      } else {
        rpc.rangeUpdatedAt = 2;
        await notify();
      }
      expect(queryByRole(node, "alert")).toBeNull();
      rpc.commands.mockResolvedValue({ _tag: "Success", value: undefined });
      await click(node, "button", "Load more due tasks");
      expect(rpc.commands).toHaveBeenLastCalledWith(
        "more",
        expect.objectContaining({ input: expect.objectContaining({ kind: "dueTasks" }) }),
      );
      expect(queryByRole(node, "alert")).toBeNull();
    } finally {
      await dispose();
    }
  },
);

it("derives the default day again when the environment timezone arrives", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T23:30:00Z"));
  const { node, router, dispose } = await mount(undefined, "meetings", null);
  try {
    await act(() =>
      router.navigate({
        to: "/workspace",
        search: { space: "meetings", view: "upcoming", environment: "fixture-environment" },
      }),
    );
    expect(getByRole(node, "heading", { name: "Monday, 12 October" })).toBeDefined();
    rpc.timeZone = "Africa/Johannesburg";
    await notify();
    expect(getByRole(node, "heading", { name: "Tuesday, 13 October" })).toBeDefined();
    expect(
      getByRole(node, "button", { name: "Tuesday, 13 October 2026" }).getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await dispose();
    vi.useRealTimers();
  }
});

it("places cross-midnight events on both days, keeps all-day and date-only due rows in the untimed band, and excludes exclusive ends", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const openTask = vi.fn();
  const overnight = {
    ...event,
    title: "Overnight",
    time: { ...event.time, start: "2026-10-12T21:00:00Z", end: "2026-10-12T23:30:00Z" },
  };
  const midnight = {
    ...overnight,
    id: "midnight",
    title: "Ends at midnight",
    time: { ...overnight.time, end: "2026-10-12T22:00:00Z" },
  };
  const allDay = {
    ...event,
    id: "all-day",
    title: "All-day planning",
    time: { kind: "all-day" as const, startOn: "2026-10-12", endBefore: "2026-10-14" },
  };
  const due = {
    ref: { type: "task" as const, taskId: "wskt_00000000-0000-0000-0000-000000000001" },
    title: "Due follow-up",
    projectId: ProjectId.make("chosen"),
    dueOn: "2026-10-13",
    done: false,
    revision: 1,
  };
  const render = (day: string, done = false) =>
    act(() =>
      root.render(
        <CalendarAgenda
          day={day}
          timeZone="Africa/Johannesburg"
          space="calendar"
          events={[overnight, allDay, midnight]}
          dueTasks={[{ ...due, done }]}
          status="ready"
          onSelectDay={() => {}}
          onSelect={() => {}}
          onNotes={() => {}}
          onOpenTask={openTask}
        />,
      ),
    );
  try {
    for (const day of ["2026-10-12", "2026-10-13"]) {
      await render(day);
      expect(getByRole(node, "button", { name: "Overnight" })).toBeDefined();
      expect(Boolean(queryByRole(node, "button", { name: "Ends at midnight" }))).toBe(
        day === "2026-10-12",
      );
      expect(getByRole(node, "group", { name: "All day and due tasks" }).textContent).toContain(
        "All-day planning",
      );
    }
    const band = getByRole(node, "group", { name: "All day and due tasks" });
    expect(band.textContent).toContain("Due follow-up");
    expect(band.textContent).not.toContain("minutes");
    await click(node, "button", "Due follow-up");
    expect(openTask).toHaveBeenCalledWith(due);
    await render("2026-10-13", true);
    expect(getByRole(node, "button", { name: "Due follow-up · Completed" })).toBeDefined();
    await render("2026-10-14");
    expect(queryByRole(node, "button", { name: "Overnight" })).toBeNull();
    expect(queryByRole(node, "button", { name: "All-day planning" })).toBeNull();
    expect(queryByRole(node, "group", { name: "All day and due tasks" })).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
it("persists day through real destinations, route unmount and browser history, then opens exact note in the one resource body", async () => {
  const { node, router, dispose } = await mount();
  try {
    await click(node, "button", "Tuesday, 13 October 2026");
    await act(() => router.load());
    expect(router.state.location.search.day).toBe("2026-10-13");
    await click(node, "link", "Calendar");
    await act(() => router.load());
    expect(router.state.location.search).toMatchObject({
      space: "calendar",
      view: "agenda",
      day: "2026-10-13",
    });
    await click(node, "link", "Projects");
    await act(() => router.load());
    expect(node.textContent).toContain("Projects destination");
    await act(async () => {
      router.history.back();
      await router.load();
    });
    expect(
      getByRole(node, "button", { name: "Tuesday, 13 October 2026" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(router.state.location.search.space).toBe("calendar");
    await act(async () => {
      router.history.back();
      await router.load();
    });
    expect(router.state.location.search).toMatchObject({
      space: "meetings",
      view: "upcoming",
      day: "2026-10-13",
    });
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "Chosen project");
    const before = router.state.location.search;
    const readReceipt = new Promise<void>((resolve) => {
      rpc.noteReceipt = resolve;
    });
    await click(node, "button", "Notes & agenda");
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await act(async () => {
      await readReceipt;
    });
    expect(getByRole(node, "tabpanel").textContent).toContain("Exact native note body");
    expect(node.textContent).toContain("Launch review · Meeting notes");
    expect(router.state.location.search).toEqual(before);
    expect(rpc.active).toBe(1);
    expect(rpc.max).toBe(1);
    expect(rpc.noteRequests).toContainEqual({
      environmentId: "fixture-environment",
      input: { id: noteId },
    });
    expect(node.querySelectorAll("[data-workspace-resource-body]")).toHaveLength(1);
    expect(rpc.commands).not.toHaveBeenCalled();
    await click(node, "button", "Wednesday, 14 October 2026");
    expect(getByRole(node, "tabpanel").textContent).toContain("Exact native note body");
    expect(rpc.active).toBe(1);
    expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
    await click(node, "button", "Tuesday, 13 October 2026");
    await click(node, "button", "Close resources");
    expect(document.activeElement).toBe(getByRole(node, "button", { name: "Resources" }));
    expect(rpc.active).toBe(0);
    await click(node, "button", "Resources");
    expect(getByRole(node, "tabpanel").textContent).toContain("Exact native note body");
    expect(rpc.active).toBe(1);
  } finally {
    await dispose();
  }
});
it("keeps the actual resource project while an off-range exact read is pending, resolving and closing", async () => {
  const item = JSON.stringify({
    type: "provider-resource",
    provider: "workspace-calendar",
    resourceId: event.id,
  });
  const { node, router, dispose } = await mount(item);
  try {
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "Chosen project");
    expect(router.state.location.search.day).toBe("2026-10-14");
    rpc.detail = true;
    await notify();
    await act(() => router.load());
    expect(router.state.location.search.day).toBe("2026-12-02");
    expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
    await click(node, "button", "Close event");
    await act(() => router.load());
    expect(router.state.location.search).toMatchObject({
      day: "2026-12-02",
      project: "fixture-synkek",
    });
    expect(router.state.location.search.item).toBeUndefined();
    expect(getByRole(node, "combobox").textContent).toContain("Chosen project");
  } finally {
    await dispose();
  }
});
it.each([0, 2])(
  "offers explicit choices for %i linked notes without title matching or implicit project grants",
  async (count) => {
    const { node, dispose } = await mount();
    try {
      rpc.notes = count;
      await notify();
      await click(node, "button", "Tuesday, 13 October 2026");
      await click(node, "button", "Notes & agenda");
      if (count === 0) {
        expect(getByRole(node, "button", { name: "Create meeting note" })).toBeDefined();
        expect(getByRole(node, "button", { name: "Link existing note" })).toBeDefined();
        expect(getByRole(node, "checkbox", { checked: false })).toBeDefined();
        expect(rpc.commands).not.toHaveBeenCalled();
      } else {
        expect(getByRole(node, "button", { name: "Second note" })).toBeDefined();
        expect(rpc.noteReads).toBe(0);
        await click(node, "button", "Second note");
        expect(getByRole(node, "tabpanel").textContent).toContain("Exact native note body");
      }
    } finally {
      await dispose();
    }
  },
);

it("retains a saved note and retry identity after a failed link and chooser close without granting project context", async () => {
  const { node, router, dispose } = await mount();
  try {
    rpc.notes = 0;
    let failLink = true;
    rpc.commands.mockImplementation(async (name: string) =>
      name === "create"
        ? { _tag: "Success", value: { id: noteId, title: "Saved note" } }
        : failLink
          ? { _tag: "Failure", cause: Cause.fail(new Error("Link failed")) }
          : { _tag: "Success", value: {} },
    );
    await click(node, "button", "Tuesday, 13 October 2026");
    await click(node, "combobox", "Choose project");
    await click(document.body, "option", "Chosen project");
    await click(node, "button", "Notes & agenda");
    await click(node, "button", "Create meeting note");
    expect(node.textContent).toContain("Note saved. Linking did not finish.");
    expect(getByRole(node, "button", { name: "Open saved note" })).toBeDefined();
    const original = rpc.commands.mock.calls.find((c) => c[0] === "create")![1];
    await click(node, "button", "Close notes chooser");
    await click(node, "link", "Projects");
    await act(() => router.load());
    expect(router.state.location.search.space).toBe("projects");
    expect(node.textContent).toContain("Projects destination");
    expect(queryByRole(node, "region", { name: "Upcoming meetings" })).toBeNull();
    await click(node, "link", "Calendar");
    await act(() => router.load());
    expect(router.state.location.search.space).toBe("calendar");
    expect(getByRole(node, "region", { name: "Calendar agenda" })).toBeDefined();
    await click(node, "button", "Notes & agenda");
    expect(getByRole(node, "button", { name: "Open saved note" })).toBeDefined();
    await click(node, "button", "Open saved note");
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(getByRole(node, "tabpanel").textContent).toContain("Exact native note body");
    await click(node, "button", "Notes & agenda");
    failLink = false;
    await click(node, "button", "Retry linking");
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(rpc.commands.mock.calls.filter((c) => c[0] === "create").map((c) => c[1])).toEqual([
      original,
      original,
    ]);
    const links = rpc.commands.mock.calls.filter((c) => c[0] === "link");
    expect(links).toHaveLength(2);
    expect(
      links.every(
        (c) =>
          (c[1] as { input: { a: { ref: { provider: string } } } }).input.a.ref.provider ===
          "workspace-calendar",
      ),
    ).toBe(true);
    expect(getByRole(node, "tabpanel").textContent).toContain("Exact native note body");
  } finally {
    await dispose();
  }
});

it.each(["loading", "empty", "unavailable", "partial", "no-url", "disconnected"])(
  "shows %s from the live query boundary while retaining the URL date",
  async (mode) => {
    const { node, router, dispose } = await mount();
    try {
      await click(node, "button", "Tuesday, 13 October 2026");
      rpc.rangeMode = mode;
      rpc.connected = mode !== "disconnected";
      await notify();
      expect(router.state.location.search.day).toBe("2026-10-13");
      if (mode === "loading") expect(node.textContent).toContain("Loading calendar...");
      if (mode === "empty") expect(node.textContent).toContain("No meetings on this day.");
      if (mode === "unavailable")
        expect(node.textContent).toContain("Calendar is unavailable on this server.");
      if (mode === "unavailable")
        expect(
          getByRole(node, "link", { name: "Open local Office tools" }).getAttribute("href"),
        ).toBe("/workspace?space=office");
      if (mode === "partial") {
        expect(node.textContent).toContain("Showing the last saved results.");
        expect(getByRole(node, "button", { name: "Launch review" })).toBeDefined();
        expect(getByRole(node, "button", { name: "Retry calendar" })).toBeDefined();
      }
      if (mode === "no-url") {
        expect(node.textContent).toContain("No meeting link is available.");
        expect(node.querySelector("svg.lucide-video")).toBeNull();
      }
      if (mode === "disconnected") expect(node.textContent).toContain("Calendar is disconnected.");
    } finally {
      await dispose();
    }
  },
);
it("ignores a pending original event after switching environment", async () => {
  const item = JSON.stringify({
    type: "provider-resource",
    provider: "workspace-calendar",
    resourceId: event.id,
  });
  const { node, router, dispose } = await mount(item);
  try {
    expect(node.textContent).toContain("Loading event...");
    await act(() =>
      router.navigate({
        to: "/workspace",
        search: { space: "calendar", environment: "second", day: "2026-10-14" },
      }),
    );
    rpc.detail = true;
    await notify();
    expect(router.state.location.search).toMatchObject({
      environment: "second",
      day: "2026-10-14",
    });
    expect(node.textContent).not.toContain("Resolved body");
  } finally {
    await dispose();
  }
});

it.each([
  "This event was cancelled. Its links have been kept.",
  "This event was deleted. Its links have been kept.",
])("keeps a stale selected reference unavailable: %s", async (error) => {
  const item = JSON.stringify({
    type: "provider-resource",
    provider: "workspace-calendar",
    resourceId: event.id,
  });
  const { node, router, dispose } = await mount(item);
  try {
    rpc.detail = true;
    rpc.error = error;
    await notify();
    expect(getByRole(node, "alert").textContent).toBe(error);
    expect(node.textContent).not.toContain("Resolved body");
    expect(router.state.location.search).toMatchObject({ day: "2026-10-14", item });
  } finally {
    await dispose();
  }
});
