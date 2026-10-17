// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole } from "@testing-library/dom";
import type { CommandPaletteRow } from "./CommandPalette.logic";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { expect, it, vi } from "vite-plus/test";
import { CommandPalette } from "./CommandPalette";
import { openCommandPalette } from "../commandPaletteBus";
import { parseWorkspaceSearch } from "./workspace/workspaceNavigation";

// Environment, provider and settings hooks are external to destination navigation.
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => [] }));
vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "default",
    themeHalves: {},
    resolvedTheme: "dark",
    appearanceMode: "dark",
  }),
}));
vi.mock("../hooks/useCustomThemes", () => ({ useCustomThemes: () => [] }));
vi.mock("../hooks/useEnvironmentTheme", () => ({ useEnvironmentThemeDefinitions: () => [] }));
vi.mock("../hooks/useSettings", () => ({
  useClientSettings: () => ({
    sidebarProjectSortOrder: "manual",
    sidebarThreadSortOrder: "latest",
  }),
}));
vi.mock("../state/entities", () => ({
  useProjects: () => [],
  useThreadShells: () => [],
  useServerConfigs: () => new Map(),
  waitForProject: vi.fn(),
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: [] }),
  usePrimaryEnvironmentId: () => "remote",
}));
vi.mock("../state/queries", () => ({ useThreadSearch: () => ({ matches: [], isPending: false }) }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("../state/query", () => ({ useEnvironmentQuery: () => ({ data: null }) }));
vi.mock("../hooks/useScratchProject", () => ({
  useScratchProject: () => ({
    scratchEnvironmentId: () => null,
    scratchWorkspaceRootFor: () => null,
    startScratchThread: vi.fn(),
  }),
}));
vi.mock("../hooks/useNewProject", () => ({ useNewProject: () => ({ createNewProject: vi.fn() }) }));
vi.mock("../hooks/useHandleNewThread", () => ({
  useHandleNewThread: () => ({
    activeDraftThread: null,
    activeThread: null,
    defaultProjectRef: null,
    handleNewThread: vi.fn(),
  }),
}));
vi.mock("../hooks/useThreadHandoff", () => ({
  useThreadHandoffTargets: () => [],
  useThreadHandoff: () => vi.fn(),
}));
vi.mock("../hooks/useOpenPanelPullRequestUrl", () => ({ useOpenPanelPullRequestUrl: () => null }));
vi.mock("../connection/useDesktopLocalBootstraps", () => ({ useDesktopLocalBootstraps: () => [] }));
vi.mock("./settings/useAvailableSettingsSearchItems", () => ({
  useAvailableSettingsSearchItems: () => [],
}));
vi.mock("./workspace/useWorkspaceEnvironment", () => ({ useWorkspaceEnvironment: () => "remote" }));
vi.mock("./workspace/mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote", mailRead: false }),
}));
// happy-dom has no list geometry. Keep the real palette's items and executor.
vi.mock("./CommandPaletteResults", () => ({
  scrollCommandPaletteRowIntoView: () => {},
  CommandPaletteVirtualizedResults: ({
    rows,
    onExecuteItem,
  }: {
    rows: readonly CommandPaletteRow[];
    onExecuteItem: (item: Extract<CommandPaletteRow, { kind: "item" }>["item"]) => void;
  }) => (
    <div>
      {rows.map((row) =>
        row.kind === "item" ? (
          <button key={row.key} onClick={() => onExecuteItem(row.item)}>
            {row.item.title}
          </button>
        ) : null,
      )}
    </div>
  ),
}));

it("carries the selected calendar day through the actual palette destination command", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rootRoute = createRootRoute({
    component: () => (
      <CommandPalette>
        <Outlet />
      </CommandPalette>
    ),
  });
  const workspace = createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
    component: () => <p>Workspace</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([workspace]),
    history: createMemoryHistory({
      initialEntries: ["/workspace?space=calendar&view=week&environment=remote&day=2026-11-01"],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() => root.render(<RouterProvider router={router} />));
    await act(() => openCommandPalette());
    await act(() => getByRole(document.body, "button", { name: "Open Meetings" }).click());
    await act(() => router.load());
    expect(router.state.location.search).toMatchObject({
      space: "meetings",
      view: "upcoming",
      environment: "remote",
      day: "2026-11-01",
    });
  } finally {
    await act(() => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});

it.each(["focused", "blurred"])(
  "captures the %s workspace action target before the real palette takes focus",
  async (focus) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const selected = vi.fn();
    const inline = vi.fn();
    const rootRoute = createRootRoute({
      component: () => (
        <CommandPalette>
          <div data-workspace-action-host="selected">
            <button data-workspace-action="addToProject" onClick={selected}>
              Selected item action
            </button>
          </div>
          <div data-workspace-action-host="item">
            <button data-workspace-action="addToProject" onClick={inline}>
              Inline item action
            </button>
          </div>
          <button>Neutral focus</button>
          <Outlet />
        </CommandPalette>
      ),
    });
    const workspace = createRoute({
      getParentRoute: () => rootRoute,
      path: "/workspace",
      validateSearch: parseWorkspaceSearch,
      component: () => <p>Workspace</p>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([workspace]),
      history: createMemoryHistory({ initialEntries: ["/workspace?space=projects"] }),
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    });
    await router.load();
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() => root.render(<RouterProvider router={router} />));
      const inlineAction = getByRole(node, "button", { name: "Inline item action" });
      await act(() => inlineAction.focus());
      if (focus === "blurred")
        await act(() => getByRole(node, "button", { name: "Neutral focus" }).focus());
      await act(() => openCommandPalette());
      const search = getByRole<HTMLInputElement>(document.body, "combobox");
      expect(document.activeElement).toBe(search);
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(() => {
        setValue.call(search, "Add selected item");
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(inlineAction.isConnected).toBe(true);
      await act(() =>
        getByRole(document.body, "button", { name: "Add selected item to project" }).click(),
      );
      expect(selected).toHaveBeenCalledTimes(focus === "blurred" ? 1 : 0);
      expect(inline).toHaveBeenCalledTimes(focus === "focused" ? 1 : 0);
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);
