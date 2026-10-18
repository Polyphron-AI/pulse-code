// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { CommunicationsSettings } from "./CommunicationsSettings";
import { parseWorkspaceSearch } from "../workspace/workspaceNavigation";
const boundary = vi.hoisted(() => ({ supported: true, selected: true }));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: boundary.selected
      ? { kind: "environment", environmentId: EnvironmentId.make("selected-remote") }
      : { kind: "all" },
    environment: { environmentId: EnvironmentId.make("selected-remote"), label: "Selected remote" },
  }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (target: unknown) => ({
    data: target
      ? {
          source: "live",
          config: { pulseCapabilities: { communicationsSlackRead: boundary.supported } },
        }
      : null,
    error: null,
  }),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { configProjection: (target: unknown) => target },
}));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  boundary.supported = true;
  boundary.selected = true;
  vi.unstubAllGlobals();
});
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rootRoute = createRootRoute();
  const settings = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings/integrations",
    component: CommunicationsSettings,
  });
  const workspace = createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
    component: () => <p>Communications destination</p>,
  });
  const history = createMemoryHistory({ initialEntries: ["/settings/integrations"] });
  const router = createRouter({ routeTree: rootRoute.addChildren([settings, workspace]), history });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  cleanup = async () => {
    await act(async () => root.unmount());
    node.remove();
  };
  await act(async () => root.render(<RouterProvider router={router} />));
  return { node, router, history };
}
it("opens the selected server source and keeps desktop credentials separate", async () => {
  const { node, router, history } = await render();
  await act(async () => getByRole(node, "link", { name: "Manage server Slack accounts" }).click());
  expect(router.state.location.search).toEqual({
    space: "communications",
    environment: "selected-remote",
    communicationProvider: "slack",
    communicationSource: "server",
  });
  await act(async () => history.back());
  await act(async () => getByRole(node, "link", { name: "Open desktop accounts" }).click());
  expect(router.state.location.search).toEqual({
    space: "communications",
    environment: "selected-remote",
    communicationSource: "desktop",
  });
});
it("requires one explicit environment and gates unsupported server Slack", async () => {
  boundary.selected = false;
  const { node } = await render();
  expect(queryByRole(node, "link", { name: "Manage server Slack accounts" })).toBeNull();
  expect(queryByRole(node, "link", { name: "Open desktop accounts" })).toBeNull();
  expect(node.textContent).toContain("Choose one environment");
});
it("keeps the desktop entry on a server without Slack reading", async () => {
  boundary.supported = false;
  const { node } = await render();
  expect(queryByRole(node, "link", { name: "Manage server Slack accounts" })).toBeNull();
  expect(getByRole(node, "link", { name: "Open desktop accounts" })).toBeDefined();
});
