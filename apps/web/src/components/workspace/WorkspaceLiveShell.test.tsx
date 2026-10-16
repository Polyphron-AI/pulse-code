// @vitest-environment happy-dom
// @effect-diagnostics nodeBuiltinImport:off - checks the shared desktop inset CSS alongside live shell state.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { AppSidebarLayout } from "../AppSidebarLayout";
import { parseWorkspaceSearch } from "./workspaceNavigation";
import * as NodeFS from "node:fs";

const shellCss = NodeFS.readFileSync("src/components/workspace/workspaceShell.css", "utf8");

const state = vi.hoisted(() => ({
  environment: "live-a" as string | null,
  mobile: false,
  artwork: true,
  fullscreen: false,
  fullscreenChanged: undefined as ((value: boolean) => void) | undefined,
}));
// Isolate providers, settings and Code-only services. Keep the live router,
// navigation hook, SidebarProvider, shell composition and rail unmocked.
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => [] }));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("../../state/entities", () => ({ useProjects: () => [] }));
vi.mock("../../env", () => ({ isElectron: true }));
vi.mock("../../branding", () => ({ APP_BASE_NAME: "Configured app" }));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => (state.artwork ? "artwork" : "none"),
  useLegacySidebarEnabled: () => false,
}));
vi.mock("../../hooks/useMediaQuery", () => ({ useIsMobile: () => state.mobile }));
vi.mock("../../hooks/useThreadVisitedMigration", () => ({ useThreadVisitedMigration: () => {} }));
vi.mock("../../panelAnimations", () => ({
  PanelAnimationSuppressionProvider: ({ children }: { children: ReactNode }) => children,
  usePanelAnimationSettings: () => ({ active: false, durationMs: 0 }),
  usePanelNavigationSuppression: () => false,
}));
vi.mock("../SidebarStageBackdrop", () => ({
  useSidebarStageBackdropVariant: (enabled: boolean) => (enabled ? "nightly" : null),
}));
vi.mock("../LegacySidebar", () => ({ default: () => null }));
vi.mock("../Sidebar", () => ({ default: () => null }));
vi.mock("../sidebar/SidebarChrome", () => ({
  SidebarBrandWidthProbe: () => null,
  SidebarChromeHeader: () => null,
}));
vi.mock("../settings/SettingsSidebarNav", () => ({ SettingsSidebarNav: () => null }));
vi.mock("../sidebar/mainAppLocation", () => ({ MainAppLocationTracker: () => null }));
vi.mock("./useWorkspaceEnvironment", () => ({
  useWorkspaceEnvironment: (search?: { environment?: string }) => search?.environment,
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: (environment?: EnvironmentId) => ({
    environmentId: environment ?? state.environment,
    mailRead: true,
  }),
}));
// Picker behavior has its own integration tests. These named controls expose
// which real header slot AppSidebarLayout chooses without connector reads.
vi.mock("./ProjectsNav", () => ({
  ProjectsNav: () => (
    <button role="combobox" aria-label="Choose project">
      Projects
    </button>
  ),
}));
vi.mock("./mail/MailNav", () => ({
  MailNav: () => <button>Email accounts and folders</button>,
}));

let root: Root | undefined;
let node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("cookieStore", { set: vi.fn().mockResolvedValue(undefined) });
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  window.desktopBridge = {
    getWindowFullscreenState: () => state.fullscreen,
    onWindowFullscreenStateChange: (listener) => {
      state.fullscreenChanged = listener;
      return () => {
        state.fullscreenChanged = undefined;
      };
    },
  } as NonNullable<Window["desktopBridge"]>;
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  node?.remove();
  delete window.desktopBridge;
  state.environment = "live-a";
  state.mobile = false;
  state.artwork = true;
  state.fullscreen = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(href: string) {
  const parent = createRootRoute({
    component: () => (
      <AppSidebarLayout>
        <Outlet />
      </AppSidebarLayout>
    ),
  });
  const workspace = createRoute({
    getParentRoute: () => parent,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
    component: () => <main>Current workspace content</main>,
  });
  const settings = createRoute({ getParentRoute: () => parent, path: "/settings" });
  const router = createRouter({
    routeTree: parent.addChildren([workspace, settings]),
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  await router.load();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<RouterProvider router={router} />));
  return router;
}

it.each([
  ["mail", "Email", ["Inbox", "Unread", "Later"], "Email accounts and folders", "button"],
  ["projects", "Projects", ["Projects", "Linked"], "Choose project", "combobox"],
] as const)(
  "wires the %s header, selection and rail in the live shell",
  async (space, label, views, control, role) => {
    await mount(`/workspace?space=${space}&environment=live-a`);
    expect(getByRole(node, "link", { name: label }).getAttribute("aria-current")).toBe("page");
    const rail = getByRole(node, "navigation", { name: "Workspace views" });
    expect(getAllByRole(rail, "button").map((button) => button.textContent)).toEqual(views);
    expect(getByRole(node, role, { name: control })).toBeDefined();
    expect(
      queryByRole(node, space === "mail" ? "combobox" : "button", {
        name: space === "mail" ? "Choose project" : "Email accounts and folders",
      }),
    ).toBeNull();
  },
);

it("leaves destinations, rail and pickers unselected on local Office tools", async () => {
  await mount("/workspace?space=office&environment=live-a");
  expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  expect(queryByRole(node, "navigation", { name: "Workspace views" })).toBeNull();
  expect(queryByRole(node, "combobox", { name: "Choose project" })).toBeNull();
  expect(queryByRole(node, "button", { name: "Email accounts and folders" })).toBeNull();
  expect(
    getAllByRole(getByRole(node, "navigation", { name: "Workspace destinations" }), "link"),
  ).toHaveLength(6);
});

it("keeps environment and Mail identity when selecting a rail view", async () => {
  const router = await mount(
    "/workspace?space=mail&view=later&environment=live-a&account=second&folder=Sent&item=message-1",
  );
  await act(async () => getByRole(node, "button", { name: "Inbox" }).click());
  expect(router.state.location.search).toEqual({
    space: "mail",
    view: "inbox",
    environment: "live-a",
    account: "second",
    folder: "Sent",
    item: "message-1",
  });
});

it("keeps navigation and Settings available without an environment", async () => {
  state.environment = null;
  const router = await mount("/workspace?space=projects");
  const destinations = getByRole(node, "navigation", { name: "Workspace destinations" });
  for (const link of getAllByRole(destinations, "link")) {
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(link.getAttribute("aria-describedby")!)?.textContent).toMatch(
      /environment/i,
    );
    await act(async () => link.click());
  }
  expect(router.state.location.search).toEqual({ space: "projects" });
  expect(queryByRole(node, "combobox", { name: "Choose project" })).toBeNull();
  expect(queryByRole(node, "navigation", { name: "Workspace views" })).toBeNull();
  await act(async () => getByRole(node, "button", { name: "Settings" }).click());
  expect(router.state.location.pathname).toBe("/settings");
});

it("restores the hidden-sidebar button after closing navigation", async () => {
  await mount("/workspace?space=projects&environment=live-a");
  expect(node.querySelector("[data-sidebar-control]")).toBeNull();
  await act(async () => getByRole(node, "button", { name: "Toggle main sidebar" }).click());
  expect(node.querySelector('[data-workspace-sidebar="closed"]')).not.toBeNull();
  const control = node.querySelector<HTMLElement>("[data-sidebar-control]")!;
  await act(async () => getByRole(control, "button", { name: "Toggle main sidebar" }).click());
  expect(node.querySelector('[data-workspace-sidebar="open"]')).not.toBeNull();
  expect(node.querySelector("[data-sidebar-control]")).toBeNull();
});

it("dismisses the compact live menu through the navigation hook", async () => {
  state.mobile = true;
  const router = await mount("/workspace?space=projects&environment=live-a");
  const trigger = getByRole(node, "button", { name: "Toggle main sidebar" });
  trigger.focus();
  await act(async () => trigger.click());
  await act(async () => getByRole(document.body, "link", { name: "Meetings" }).click());
  expect(router.state.location.search).toEqual({
    space: "meetings",
    view: "upcoming",
    environment: "live-a",
  });
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("uses configured branding and stage artwork in the live shell", async () => {
  const router = await mount("/workspace?space=projects&environment=live-a");
  expect(node.querySelector("[data-workspace-navigation-brand]")?.textContent).toBe(
    "Configured app",
  );
  expect(node.querySelector('[data-stage-art="nightly"]')).not.toBeNull();
  state.artwork = false;
  await act(async () => router.navigate({ href: "/workspace?space=mail&environment=live-a" }));
  expect(node.querySelector("[data-stage-art]")).toBeNull();
});

it("shares the macOS traffic-light inset and releases it in fullscreen", async () => {
  await mount("/workspace?space=projects&environment=live-a");
  const wrapper = node.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!;
  expect(wrapper.style.getPropertyValue("--workspace-controls-left")).toBe(
    "var(--desktop-window-controls-inset, 90px)",
  );
  expect(shellCss).toMatch(
    /padding: 0 13px 0 calc\(var\(--workspace-controls-left, 12px\) \+ 1px\)/,
  );
  await act(async () => state.fullscreenChanged?.(true));
  expect(wrapper.style.getPropertyValue("--workspace-controls-left")).toBe("");
});
