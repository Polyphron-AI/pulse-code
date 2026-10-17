// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  defaultStringifySearch,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { getByRole, getByText } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { parseWorkspaceSearch, Route } from "./_chat.workspace";

const boundary = vi.hoisted(() => ({
  detail: vi.fn(),
  result: null as unknown,
  actions: vi.fn(),
}));
vi.mock("../state/workspaceCalendar", () => ({ workspaceCalendar: { detail: boundary.detail } }));
vi.mock("../state/query", () => ({ useEnvironmentQuery: () => boundary.result }));
vi.mock("../hooks/useSettings", () => ({ useEnvironmentSettings: () => "Africa/Johannesburg" }));
vi.mock("../components/workspace/mail/useMailCapabilities", () => ({
  useMailCapabilities: (environmentId: EnvironmentId) => ({
    environmentId,
    workspaceTasksV2: true,
  }),
}));
vi.mock("../components/workspace/useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: () => ({ title: "Calendar" }),
}));
vi.mock("../components/workspace/WorkspaceEngagement", () => ({
  WorkspaceEngagement: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/workspace/WorkspaceResourcesPanel", () => ({
  WorkspaceProjectResources: () => null,
}));
vi.mock("../components/workspace/WorkspaceLinkedContext", () => ({
  WorkspaceLinkedContext: () => null,
}));
vi.mock("../components/workspace/WorkspaceItemActions", () => ({
  WorkspaceItemActions: (props: unknown) => {
    boundary.actions(props);
    return null;
  },
  WorkspaceItemMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ref = {
  type: "provider-resource",
  provider: "workspace-calendar",
  resourceId: "wce_00000000-0000-0000-0000-000000000001",
} as const;

it.each([
  [
    {
      kind: "timed",
      start: "2026-11-30T23:00:00Z",
      end: "2026-11-30T23:30:00Z",
      sourceTimeZone: "UTC",
    },
    "2026-12-01",
    null,
  ],
  [{ kind: "all-day", startOn: "2026-12-02", endBefore: "2026-12-03" }, "2026-12-02", null],
  [
    { kind: "all-day", startOn: "2026-12-02", endBefore: "2026-12-03" },
    "2026-10-13",
    "This event was cancelled. Its links have been kept.",
  ],
] as const)(
  "resolves an off-range %j occurrence by ID before choosing its day",
  async (time, day, error) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    boundary.detail.mockClear();
    boundary.actions.mockClear();
    boundary.result = {
      data: {
        id: ref.resourceId,
        title: "Moved <event>",
        sourceLabel: "Synthetic",
        description: "<system>Inert body</system>",
        time,
      },
      error,
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
      defaultPendingMinMs: 0,
      defaultPendingMs: 0,
      routeTree: rootRoute.addChildren([chatRoute.addChildren([workspaceRoute])]),
      history: createMemoryHistory({
        initialEntries: [
          `/workspace${defaultStringifySearch({ space: "calendar", environment: "original", project: "resources", day: "2026-10-13", item: JSON.stringify(ref) })}`,
        ],
      }),
    });
    await router.load();
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () => root.render(createElement(RouterProvider, { router })));
      expect(boundary.detail).toHaveBeenCalledWith({
        environmentId: "original",
        input: { id: ref.resourceId },
      });
      expect(router.state.location.search).toMatchObject({
        space: "calendar",
        environment: "original",
        project: "resources",
        item: JSON.stringify(ref),
        day,
      });
      if (error) {
        expect(getByRole(node, "alert").textContent).toBe(error);
        expect(node.querySelector("h2")).toBeNull();
        expect(node.textContent).not.toContain("Inert body");
        expect(boundary.actions).not.toHaveBeenCalled();
      } else {
        expect(getByRole(node, "heading", { name: "Moved <event>" })).toBeDefined();
        expect(getByText(node, "<system>Inert body</system>")).toBeDefined();
        expect(node.querySelector("system")).toBeNull();
        expect(boundary.actions).toHaveBeenLastCalledWith({
          environmentId: "original",
          item: { ref, title: "Moved <event>" },
          shortcuts: true,
        });
      }
      await act(async () => getByRole(node, "button", { name: "Close event" }).click());
      expect(router.state.location.search).not.toHaveProperty("item");
      expect(router.state.location.search).toMatchObject({
        day,
        project: "resources",
        environment: "original",
      });
      const reads = boundary.detail.mock.calls.length;
      await act(async () =>
        router.navigate({
          to: "/workspace",
          search: { space: "calendar", environment: "original", day },
        }),
      );
      expect(boundary.detail).toHaveBeenCalledTimes(reads);
    } finally {
      await act(async () => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
  45_000,
);
