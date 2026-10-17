// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { MeetingsSpace } from "./MeetingsSpace";
import { parseWorkspaceSearch } from "../workspaceNavigation";
vi.mock("../mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "fixture" }),
}));
vi.mock("../useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: () => ({ title: "Meetings" }),
}));
vi.mock("../WorkspaceEngagement", () => ({
  WorkspaceEngagement: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../WorkspaceResourcesPanel", () => ({ WorkspaceProjectResources: () => null }));
it("keeps Recordings honest and offers device-local guidance without capture", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component: MeetingsSpace,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/workspace?space=meetings&view=recordings"] }),
  });
  await router.load();
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(() => root.render(<RouterProvider router={router} />));
    expect(node.textContent).toContain(
      "Published recordings are not available in this environment.",
    );
    expect(node.textContent).toContain("Local recordings remain on their capture device.");
    expect(queryByRole(node, "button", { name: /record/i })).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
