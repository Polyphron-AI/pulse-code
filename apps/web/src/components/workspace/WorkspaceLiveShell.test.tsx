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
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

const cssFile = "./workspaceShell.css";
const shellCss = NodeFS.readFileSync(new NodeURL.URL(cssFile, import.meta.url), "utf8");
const compactShellCss = shellCss.replace(/\s+/g, "");
const indexCssFile = "../../index.css";
const indexCss = NodeFS.readFileSync(new NodeURL.URL(indexCssFile, import.meta.url), "utf8");

const state = vi.hoisted(() => ({
  electron: true,
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
vi.mock("../../env", () => ({
  get isElectron() {
    return state.electron;
  },
}));
vi.mock("../../state/environments", () => ({
  useEnvironment: (id: string | null) => (id ? { label: `Environment ${id}` } : null),
}));
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
  state.electron = true;
  state.environment = "live-a";
  state.mobile = false;
  state.artwork = true;
  state.fullscreen = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(href: string) {
  function Module() {
    const header = useWorkspaceHeaderModel(
      EnvironmentId.make("module-id"),
      "Module title",
      "Module fallback",
    );
    return (
      <main data-module-environment={header.environmentLabel} data-module-space={header.spaceLabel}>
        Current workspace content
      </main>
    );
  }
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
    component: Module,
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
    const crumb = getByRole(node, "navigation", { name: "Workspace breadcrumb" });
    expect(crumb.textContent).toBe(`Environment live-a/${label}`);
    expect(queryByRole(node, role, { name: control })).toBeNull();
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

it("derives module and breadcrumb labels from the same live header model", async () => {
  const router = await mount("/workspace?space=mail&environment=live-a");
  const module = node.querySelector("main")!;
  expect(module.getAttribute("data-module-environment")).toBe("Environment live-a");
  expect(module.getAttribute("data-module-space")).toBe("Email");
  await act(async () =>
    router.navigate({ href: "/workspace?space=communications&environment=live-b" }),
  );
  expect(module.getAttribute("data-module-environment")).toBe("Environment live-b");
  expect(module.getAttribute("data-module-space")).toBe("Communications");
});

it("insets the collapsed macOS engagement title past the fixed toggle and rail", async () => {
  await mount("/workspace?space=projects&environment=live-a");
  await act(async () => getByRole(node, "button", { name: "Toggle main sidebar" }).click());
  expect(node.querySelector('[data-workspace-sidebar="closed"]')).not.toBeNull();
  expect(shellCss).toMatch(
    /\[data-workspace-sidebar="closed"\] \[data-workspace-engagement-header\]\s*\{\s*padding-left: max\(16px, calc\(var\(--workspace-titlebar-content-left\) - 52px\)\)/,
  );
});

it("reserves the native caption width for the band below the 26px strip", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  await mount("/workspace?space=mail&environment=live-a");
  const shell = node.querySelector<HTMLElement>("[data-workspace-shell]")!;
  expect(shell.classList.contains("wco:[--workspace-caption-band:1]")).toBe(true);
  expect(compactShellCss).toContain(
    "[data-workspace-resources]{padding-top:calc(var(--workspace-caption-band,0)*max(0px,calc(var(--workspace-topbar-height)-26px)))",
  );
  expect(compactShellCss).toContain(
    '[data-workspace-dock-open="false"][data-workspace-engagement-header]{padding-right:max(16px,calc(var(--workspace-caption-band,0)*var(--workspace-native-controls-inset,0px)))',
  );
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

it("renders truthful Office and disconnected breadcrumbs", async () => {
  const router = await mount("/workspace?space=office&environment=live-a");
  const crumb = getByRole(node, "navigation", { name: "Workspace breadcrumb" });
  expect(crumb.textContent).toContain("Local Office tools");
  expect(crumb.textContent).toContain("Environment live-a");
  state.environment = null;
  await act(async () => router.navigate({ href: "/workspace?space=projects" }));
  expect(crumb.textContent).toContain("No environment connected");
});
it("uses the Code drag and Windows overlay reservation and clears the collapsed toggle", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  await mount("/workspace?space=mail&environment=live-a");
  const strip = node.querySelector<HTMLElement>("[data-workspace-breadcrumb-strip]")!;
  expect(strip.classList.contains("drag-region")).toBe(true);
  expect(strip.classList.contains("wco:pr-(--workspace-native-controls-inset)")).toBe(true);
  expect(strip.classList.contains("pr-3.25")).toBe(true);
  expect(indexCss).toMatch(/\.drag-region button,[\s\S]*?-webkit-app-region: no-drag/);
  await act(async () => getByRole(node, "button", { name: "Toggle main sidebar" }).click());
  expect(shellCss).toMatch(
    /\[data-workspace-sidebar="closed"\] \[data-workspace-breadcrumb-strip\]/,
  );
  expect(shellCss).toMatch(/\[data-workspace-sidebar="closed"\] \[data-workspace-view-rail\]/);
});
it("renders a plain web breadcrumb without native controls or a sample marker", async () => {
  state.electron = false;
  await mount("/workspace?space=calendar&environment=live-a");
  const strip = node.querySelector<HTMLElement>("[data-workspace-breadcrumb-strip]")!;
  expect(strip.classList.contains("drag-region")).toBe(false);
  expect(strip.className).not.toContain("workspace-native-controls-inset");
  expect(strip.textContent).toBe("Environment live-a/Calendar");
  expect(node.querySelector("[data-workspace-sample-marker]")).toBeNull();
});
