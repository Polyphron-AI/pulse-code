// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceNavigation, WorkspaceModeSwitch } from "./WorkspaceNavigationView";
import { WorkspaceViewRail, workspaceRailItems } from "./WorkspaceViewRail";
import { WorkspaceShellLayout } from "./WorkspaceShellLayout";
import { Sidebar, SidebarProvider, useSidebar } from "../ui/sidebar";
import {
  parseWorkspaceSearch,
  workspaceDestinationSearch,
  workspaceViews,
  type WorkspaceView,
} from "./workspaceNavigation";

let root: Root;
let node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  node?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(element: React.ReactNode) {
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(element));
}

it("keeps six destination links while routes, environment and history change", async () => {
  function NavigationProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    const search = parseWorkspaceSearch(location.search);
    return (
      <WorkspaceNavigation
        destination={search.space === "office" ? "projects" : (search.space ?? "projects")}
        environmentId={EnvironmentId.make("a")}
        mode="workspace"
        onModeChange={() => {}}
        onNavigate={(destination) => {
          void navigate({
            to: "/workspace",
            search: workspaceDestinationSearch(destination, EnvironmentId.make("a")),
          });
        }}
      />
    );
  }
  const route = createRootRoute({
    component: () => (
      <SidebarProvider>
        <NavigationProbe />
        <Outlet />
      </SidebarProvider>
    ),
  });
  const workspace = createRoute({
    getParentRoute: () => route,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
  });
  const router = createRouter({
    routeTree: route.addChildren([workspace]),
    history: createMemoryHistory({ initialEntries: ["/workspace?space=projects&environment=a"] }),
  });
  await router.load();
  await render(<RouterProvider router={router} />);
  for (const [name, space] of [
    ["Meetings", "meetings"],
    ["Email", "mail"],
    ["Projects", "projects"],
  ] as const) {
    await act(async () => getByRole(node, "link", { name }).click());
    expect(router.state.location.search).toEqual({
      space,
      view: workspaceViews[space][0],
      environment: "a",
    });
    const destinations = getByRole(node, "navigation", { name: "Workspace destinations" });
    expect(getAllByRole(destinations, "link").map((link) => link.textContent)).toEqual([
      "Communications",
      "Meetings",
      "Calendar",
      "Email",
      "Tasks",
      "Projects",
    ]);
    expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  }
  await act(async () => {
    router.history.back();
    await router.load();
  });
  expect(getByRole(node, "link", { name: "Email" }).getAttribute("aria-current")).toBe("page");
  const href = getByRole(node, "link", { name: "Workspace" }).getAttribute("href")!;
  expect(Object.fromEntries(new URL(href, "https://workspace.invalid").searchParams)).toEqual({
    space: "projects",
    view: "projects",
    environment: "a",
  });
});

it("uses two controlled mode buttons and injected settings/sidebar actions", async () => {
  const change = vi.fn();
  const settings = vi.fn();
  const toggle = vi.fn();
  await render(
    <WorkspaceNavigation
      destination="mail"
      environmentId={EnvironmentId.make("a")}
      mode="workspace"
      onModeChange={change}
      onNavigate={() => {}}
      onSettings={settings}
      onToggleSidebar={toggle}
    />,
  );
  expect(getByRole(node, "button", { name: "Workspace" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  await act(async () => getByRole(node, "button", { name: "Code" }).click());
  expect(change).toHaveBeenCalledWith("code");
  await act(async () => getByRole(node, "button", { name: "Settings" }).click());
  await act(async () => getByRole(node, "button", { name: "Toggle main sidebar" }).click());
  expect(settings).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledOnce();
  await act(async () => root.render(<WorkspaceModeSwitch mode="code" onModeChange={change} />));
  expect(getAllByRole(node, "button")).toHaveLength(2);
  expect(getByRole(node, "button", { name: "Code" }).getAttribute("aria-pressed")).toBe("true");
});

it("selects supported rail views with Enter/Space and explains unavailable views", async () => {
  const select = vi.fn();
  function RailProbe() {
    const [selected, setSelected] = useState<WorkspaceView>("all");
    return (
      <WorkspaceViewRail
        items={workspaceRailItems.tasks}
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          select(id);
        }}
      />
    );
  }
  await render(<RailProbe />);
  for (const [name, key, id] of [
    ["Open", "Enter", "open"],
    ["Done", " ", "done"],
  ] as const) {
    const button = getByRole(node, "button", { name });
    await act(async () =>
      button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })),
    );
    expect(select).toHaveBeenLastCalledWith(id);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  }
  select.mockClear();
  await act(async () =>
    root.render(
      <WorkspaceViewRail items={workspaceRailItems.mail} selected="inbox" onSelect={select} />,
    ),
  );
  const unread = getByRole(node, "button", { name: "Unread" });
  expect(unread.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(unread.getAttribute("aria-describedby")!)?.textContent).toMatch(
    /unavailable/i,
  );
  await act(async () => unread.click());
  expect(select).not.toHaveBeenCalled();
});

it("keeps each rail registry in canonical order and shares all layout regions", async () => {
  for (const destination of Object.keys(workspaceViews) as (keyof typeof workspaceViews)[]) {
    expect(workspaceRailItems[destination].map(({ id }) => id)).toEqual(
      workspaceViews[destination],
    );
  }
  await render(
    <WorkspaceShellLayout
      navigation={<span>Navigation</span>}
      breadcrumb={<span>Breadcrumb</span>}
      rail={<span>Rail</span>}
      engagement={<main>Engagement</main>}
    />,
  );
  expect(node.querySelector("[data-workspace-shell-navigation]")?.textContent).toBe("Navigation");
  expect(node.textContent).toBe("NavigationBreadcrumbRailEngagement");
});

it("navigates a rail view through router history while retaining Mail identity", async () => {
  function RailRoute() {
    const location = useLocation();
    const navigate = useNavigate();
    const search = parseWorkspaceSearch(location.search);
    return (
      <WorkspaceViewRail
        items={workspaceRailItems.mail}
        selected={search.view ?? "inbox"}
        onSelect={(view) => {
          void navigate({ to: "/workspace", search: { ...search, view } });
        }}
      />
    );
  }
  const parent = createRootRoute();
  const workspace = createRoute({
    getParentRoute: () => parent,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
    component: RailRoute,
  });
  const router = createRouter({
    routeTree: parent.addChildren([workspace]),
    history: createMemoryHistory({
      initialEntries: ["/workspace?space=mail&view=later&environment=a&account=second&folder=Sent"],
    }),
  });
  await router.load();
  await render(<RouterProvider router={router} />);
  await act(async () =>
    getByRole(node, "button", { name: "Inbox" }).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ),
  );
  expect(router.state.location.search).toEqual({
    space: "mail",
    view: "inbox",
    environment: "a",
    account: "second",
    folder: "Sent",
  });
  await act(async () => {
    router.history.back();
    await router.load();
  });
  expect(router.state.location.search.view).toBe("later");
  await act(async () => getByRole(node, "button", { name: "Unread" }).click());
  expect(router.state.location.search.view).toBe("later");
});

it("dismisses the compact menu after navigation and returns focus to its trigger", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation((media) => ({
    media,
    matches: media.includes("max-width"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true,
    onchange: null,
  }));
  function CompactProbe() {
    const { toggleSidebar, setOpenMobile } = useSidebar();
    const [destination, setDestination] = useState<"meetings" | "projects">("projects");
    return (
      <>
        <button type="button" onClick={toggleSidebar}>
          Open workspace navigation
        </button>
        <Sidebar>
          <WorkspaceNavigation
            environmentId={EnvironmentId.make("a")}
            destination={destination}
            mode="workspace"
            onModeChange={() => {}}
            onToggleSidebar={toggleSidebar}
            onNavigate={(next) => {
              if (next === "meetings") setDestination(next);
              setOpenMobile(false);
            }}
          />
        </Sidebar>
        <main aria-label="Current destination">{destination}</main>
      </>
    );
  }
  await render(
    <SidebarProvider>
      <CompactProbe />
    </SidebarProvider>,
  );
  const trigger = getByRole(node, "button", { name: "Open workspace navigation" });
  trigger.focus();
  await act(async () => trigger.click());
  expect(getAllByRole(document.body, "link")).toHaveLength(7);
  await act(async () => getByRole(document.body, "link", { name: "Meetings" }).click());
  expect(getByRole(node, "main", { name: "Current destination" }).textContent).toBe("meetings");
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("blocks modified and auxiliary clicks on unavailable destinations", async () => {
  const navigate = vi.fn();
  await render(
    <WorkspaceNavigation
      destination="projects"
      environmentId={EnvironmentId.make("a")}
      mode="workspace"
      onModeChange={() => {}}
      onNavigate={navigate}
      unavailableDestinations={{ mail: "Email is unavailable on this server." }}
    />,
  );
  const email = getByRole(node, "link", { name: "Email" });
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
    const event = new MouseEvent(options.button === 1 ? "auxclick" : "click", {
      ...options,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      email.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  }
  expect(navigate).not.toHaveBeenCalled();
});
