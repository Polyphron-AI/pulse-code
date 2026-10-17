// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  defaultStringifySearch,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { getByRole, getByText, queryByRole } from "@testing-library/dom";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseWorkspaceSearch, Route } from "./_chat.workspace";
import { ProjectId, EnvironmentId } from "@t3tools/contracts";
import {
  useWorkspaceResourceState,
  useWorkspaceResources,
  WorkspaceResourcesContext,
} from "../components/workspace/workspaceResourceState";

const storage = { getItem: () => null, setItem: () => {} };
function ResourceProvider({ children }: { children?: ReactNode }) {
  const resources = useWorkspaceResourceState(EnvironmentId.make("remote"), {
    storage,
    presentation: "sheet",
  });
  return createElement(WorkspaceResourcesContext, { value: resources }, children);
}

// The unavailable containers never mount a data-backed destination.
vi.mock("../components/workspace/CommunicationsWorkspace", () => ({
  CommunicationsWorkspace: () => null,
}));
vi.mock("../components/workspace/mail/MailSpace", () => ({ MailSpace: () => null }));
vi.mock("../components/workspace/ProjectsSpace", () => ({ ProjectsSpace: () => null }));
vi.mock("../components/workspace/OfficeWorkspace", () => ({ OfficeWorkspace: () => null }));
vi.mock("../components/workspace/TasksSpace", () => ({
  TasksSpace: () =>
    createElement("main", null, createElement("h1", null, "Tasks"), "Live Tasks list"),
}));

describe("parseWorkspaceSearch", () => {
  it("preserves the environment and exact Telegram source when opening a remote linked message", () => {
    const search = {
      space: "office",
      officeView: "communications",
      communicationProvider: "telegram",
      environment: "remote-env",
      account: "telegram_1000",
      item: "telegram_1000/-42/2",
    };
    expect(parseWorkspaceSearch(search)).toEqual({
      space: "communications",
      communicationProvider: "telegram",
      environment: "remote-env",
      account: "telegram_1000",
      item: "telegram_1000/-42/2",
    });
    expect(parseWorkspaceSearch({ ...search, space: "mail" })).not.toHaveProperty(
      "communicationProvider",
    );
  });
  it("opens a project hub", () =>
    expect(parseWorkspaceSearch({ space: "projects", project: "project-1" })).toEqual({
      space: "projects",
      project: "project-1",
    }));
  it("opens the Office communications view", () => {
    expect(parseWorkspaceSearch({ space: "office", officeView: "communications" })).toEqual({
      space: "communications",
    });
  });

  it("keeps a canonical destination's environment and valid view", () => {
    expect(
      parseWorkspaceSearch({
        space: "tasks",
        view: "open",
        environment: "remote-a",
        project: "project-a",
      }),
    ).toEqual({ space: "tasks", view: "open", environment: "remote-a", project: "project-a" });
    expect(
      parseWorkspaceSearch({ space: "calendar", view: "open", environment: "remote-a" }),
    ).toEqual({ space: "calendar", environment: "remote-a" });
  });

  it.each([
    ["communications", ["chats", "unread", "later"]],
    ["meetings", ["upcoming", "recordings"]],
    ["calendar", ["agenda", "week"]],
    ["mail", ["inbox", "unread", "later"]],
    ["tasks", ["all", "open", "done"]],
    ["projects", ["projects", "linked"]],
  ])("accepts only %s's views", (space, views) => {
    for (const view of views)
      expect(parseWorkspaceSearch({ space, view })).toEqual({ space, view });
    for (const view of ["unknown", "", 7, null, "x".repeat(1025)])
      expect(parseWorkspaceSearch({ space, view })).toEqual({ space });
  });

  it("strips fixture, resource and alternative view selectors", () => {
    expect(
      parseWorkspaceSearch({
        space: "mail",
        view: "inbox",
        fixture: "01",
        workspaceMockup: "01",
        resourceProject: "other",
        resourceTab: "files",
        selectedKey: "mail-1",
        taskView: "open",
        calendarView: "week",
      }),
    ).toEqual({ space: "mail", view: "inbox" });
    for (const space of ["", undefined, 7, "unknown", "constructor", "__proto__"])
      expect(parseWorkspaceSearch({ space, environment: "a", view: "open" })).toEqual({});
  });

  it("preserves bounded mail and Telegram identities without interpreting their contents", () => {
    expect(
      parseWorkspaceSearch({ space: "mail", item: "x".repeat(8192), account: "a".repeat(1024) }),
    ).toEqual({ space: "mail", item: "x".repeat(8192), account: "a".repeat(1024) });
    expect(
      parseWorkspaceSearch({
        space: "mail",
        item: "x".repeat(8193),
        account: false,
        folder: [],
        environment: "x".repeat(1025),
      }),
    ).toEqual({ space: "mail" });
    expect(
      parseWorkspaceSearch({
        space: "communications",
        communicationProvider: "telegram",
        environment: "remote-a",
        account: "bot-1",
        item: "bot-1/-42/2",
      }),
    ).toEqual({
      space: "communications",
      communicationProvider: "telegram",
      environment: "remote-a",
      account: "bot-1",
      item: "bot-1/-42/2",
    });
  });

  it("drops unsupported views and communications outside Office", () => {
    expect(parseWorkspaceSearch({ space: "office", officeView: "unknown" })).toEqual({
      space: "office",
    });
    expect(parseWorkspaceSearch({ space: "code", officeView: "communications" })).toEqual({});
    expect(parseWorkspaceSearch({ officeView: "communications" })).toEqual({});
  });
  it("opens Mail with its account, folder and project", () => {
    expect(
      parseWorkspaceSearch({
        space: "mail",
        account: "acct_1",
        folder: "[Gmail]/All Mail",
        project: "project-1",
      }),
    ).toEqual({
      space: "mail",
      account: "acct_1",
      folder: "[Gmail]/All Mail",
      project: "project-1",
    });
  });

  it("drops Mail params outside Mail and values that are not text", () => {
    expect(parseWorkspaceSearch({ space: "office", account: "acct_1", folder: "INBOX" })).toEqual({
      space: "office",
    });
    expect(
      parseWorkspaceSearch({ space: "mail", account: 7, folder: "", project: "x".repeat(1_025) }),
    ).toEqual({ space: "mail" });
    expect(parseWorkspaceSearch({ space: "mail", officeView: "communications" })).toEqual({
      space: "mail",
    });
  });
});

it.each([
  ["tasks", "Tasks", false],
  ["meetings", "Meetings", true],
  ["calendar", "Calendar", true],
] as const)(
  "renders the %s destination",
  async (space, heading, localTools) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const rootRoute = createRootRoute();
    const chatRoute = createRoute({ getParentRoute: () => rootRoute, id: "_chat" });
    const workspaceRoute = createRoute({
      getParentRoute: () => chatRoute,
      path: "workspace",
      validateSearch: parseWorkspaceSearch,
      component: Route.options.component!,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([chatRoute.addChildren([workspaceRoute])]),
      history: createMemoryHistory({
        initialEntries: [`/workspace?space=${space}&environment=remote`],
      }),
    });
    await router.load();
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(
          createElement(ResourceProvider, null, createElement(RouterProvider, { router })),
        ),
      );
      expect(getByRole(node, "heading", { name: heading })).toBeDefined();
      expect(
        getByText(
          node,
          space === "tasks" ? "Live Tasks list" : "This view is not available on this server yet.",
        ),
      ).toBeDefined();
      const link = queryByRole(node, "link", { name: "Open local Office tools" });
      if (localTools) expect(link?.getAttribute("href")).toBe("/workspace?space=office");
      else expect(link).toBeNull();
    } finally {
      await act(async () => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
  45_000,
);

it("retains task filters through the route parser re-export", () => {
  expect(
    parseWorkspaceSearch({
      space: "tasks",
      view: "done",
      taskLayout: "list",
      taskText: "launch",
      taskOwner: "unassigned",
    }),
  ).toEqual({
    space: "tasks",
    view: "done",
    taskLayout: "list",
    taskText: "launch",
    taskOwner: "unassigned",
  });
});

it("retains exact calendar deep links and validates the independent selected day", () => {
  const item = JSON.stringify({
    type: "provider-resource",
    provider: "workspace-calendar",
    resourceId: "wce_00000000-0000-0000-0000-000000000001",
  });
  expect(
    parseWorkspaceSearch({
      space: "calendar",
      environment: "remote",
      item,
      day: "2026-10-13",
      project: "resources",
    }),
  ).toEqual({
    space: "calendar",
    environment: "remote",
    item,
    day: "2026-10-13",
    project: "resources",
  });
  expect(parseWorkspaceSearch({ space: "calendar", item, day: "2026-02-30" })).toEqual({
    space: "calendar",
    item,
  });
  expect(parseWorkspaceSearch({ space: "calendar", item: "{" })).toEqual({ space: "calendar" });
  expect(parseWorkspaceSearch({ space: "mail", day: "2026-10-13" })).not.toHaveProperty("day");
});

vi.mock("../components/workspace/mail/useMailCapabilities", () => ({
  useMailCapabilities: (environmentId?: EnvironmentId) => ({
    environmentId: environmentId ?? EnvironmentId.make("remote"),
    ready: true,
  }),
}));
vi.mock("../components/workspace/WorkspaceResourcesPanel", () => ({
  WorkspaceProjectResources: () => {
    const resources = useWorkspaceResources();
    return createElement(
      "div",
      null,
      createElement(
        "output",
        { "aria-label": "Resource selection" },
        JSON.stringify({
          tab: resources.selectedTab,
          project: resources.projectId,
          request: resources.request,
        }),
      ),
      createElement(
        "button",
        { onClick: () => resources.chooseProject(ProjectId.make("chosen")) },
        "Choose resource project",
      ),
    );
  },
}));

it.each([undefined, "explicit"])(
  "opens an exact standalone note in Docs using project %s without inventing an event",
  async (project) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const ref = {
      type: "provider-resource",
      provider: "workspace-note",
      resourceId: "wsn_00000000-0000-0000-0000-000000000001",
    };
    const search = {
      space: "meetings",
      environment: "remote",
      item: JSON.stringify(ref),
      day: "2026-10-13",
      ...(project ? { project } : {}),
    };
    const rootRoute = createRootRoute();
    const chatRoute = createRoute({ getParentRoute: () => rootRoute, id: "_chat" });
    const workspaceRoute = createRoute({
      getParentRoute: () => chatRoute,
      path: "workspace",
      validateSearch: parseWorkspaceSearch,
      component: Route.options.component!,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([chatRoute.addChildren([workspaceRoute])]),
      history: createMemoryHistory({
        initialEntries: ["/workspace" + defaultStringifySearch(search)],
      }),
    });
    await router.load();
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(
          createElement(ResourceProvider, null, createElement(RouterProvider, { router })),
        ),
      );
      if (!project) {
        expect(
          getByRole(document.body, "status", { name: "Resource selection" }).textContent,
        ).toContain('"request":null');
        await act(() =>
          getByRole(document.body, "button", { name: "Choose resource project" }).click(),
        );
      }
      const state = JSON.parse(
        getByRole(document.body, "status", { name: "Resource selection" }).textContent!,
      );
      expect(state).toEqual({ tab: "docs", project: project ?? "chosen", request: ref });
      expect(router.state.location.search.item).toBe(JSON.stringify(ref));
      expect(router.state.location.search.day).toBe("2026-10-13");
      expect(node.querySelector('[aria-label="Calendar event"]')).toBeNull();
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);
