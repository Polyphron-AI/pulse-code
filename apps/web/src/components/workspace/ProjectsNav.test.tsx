// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole, fireEvent } from "@testing-library/dom";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ProjectsNav } from "./ProjectsNav";
import { parseWorkspaceSearch } from "./workspaceNavigation";

const close = vi.hoisted(() => vi.fn());
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("../ui/sidebar", () => ({ useSidebar: () => ({ setOpenMobile: close }) }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote" }),
}));
// Keep each row's action boundary and captured identity while faking its external actions.
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({
    children,
    item,
    environmentId,
  }: {
    children: ReactNode;
    item: { ref: { projectId: string } };
    environmentId: string;
  }) => (
    <div data-project-menu={item.ref.projectId} data-environment={environmentId}>
      {children}
    </div>
  ),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: "p", title: "Remote project", environmentId: "remote" },
    { id: "studio", title: "Remote studio", environmentId: "remote" },
    { id: "other", title: "Other environment", environmentId: "local" },
  ],
}));
let root: Root;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  node?.remove();
  close.mockClear();
  vi.unstubAllGlobals();
});

it("searches the live picker, retains scoped row actions, chooses a project and restores focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const parent = createRootRoute();
  const workspace = createRoute({
    getParentRoute: () => parent,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
    component: ProjectsNav,
  });
  const router = createRouter({
    routeTree: parent.addChildren([workspace]),
    history: createMemoryHistory({
      initialEntries: ["/workspace?space=projects&environment=remote"],
    }),
  });
  await router.load();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<RouterProvider router={router} />));
  const trigger = getByRole(node, "combobox", { name: "Choose project" });
  trigger.focus();
  await act(async () => trigger.click());
  expect(queryByRole(document.body, "option", { name: "Other environment" })).toBeNull();
  const search = getByRole(document.body, "combobox", { name: "Search projects" });
  await act(async () => fireEvent.change(search, { target: { value: "studio" } }));
  expect(queryByRole(document.body, "option", { name: "Remote project" })).toBeNull();
  const option = getByRole(document.body, "option", { name: "Remote studio" });
  expect(option.closest("[data-project-menu]")?.getAttribute("data-environment")).toBe("remote");
  expect(option.closest("[data-project-menu]")?.getAttribute("data-project-menu")).toBe("studio");
  await act(async () => option.click());
  expect(router.state.location.search).toEqual({
    space: "projects",
    environment: "remote",
    project: "studio",
  });
  expect(close).toHaveBeenCalledWith(false);
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => getByRole(document.body, "option", { name: "All projects" }).click());
  expect(router.state.location.search).toEqual({ space: "projects", environment: "remote" });
  await act(async () => trigger.click());
  await act(async () =>
    fireEvent.change(getByRole(document.body, "combobox", { name: "Search projects" }), {
      target: { value: "missing" },
    }),
  );
  expect(document.body.textContent).toContain("No matching projects.");
  expect(queryByRole(document.body, "option")).toBeNull();
});
