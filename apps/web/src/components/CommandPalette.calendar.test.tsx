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
