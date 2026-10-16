// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import { getByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useWorkspaceEnvironment, WorkspaceSpaceSelector } from "./WorkspaceSpaceSelector";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import {
  parseWorkspaceSearch,
  workspaceDestinations,
  workspaceDestinationSearch,
} from "./workspaceNavigation";

const state = vi.hoisted(() => ({
  primary: "primary",
  mailRead: true,
  unavailableMailEnvironment: undefined as string | undefined,
  close: vi.fn(),
}));
vi.mock("../ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: true, setOpenMobile: state.close }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: (environmentId?: string) => ({
    environmentId: environmentId ?? state.primary,
    mailRead:
      state.mailRead && (environmentId ?? state.primary) !== state.unavailableMailEnvironment,
  }),
}));
vi.mock("../../composerDraftStore", () => ({
  useComposerDraftStore: (select: (store: unknown) => unknown) =>
    select({ getDraftThread: () => ({ environmentId: "draft-env" }) }),
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({
    render,
    children,
  }: {
    render: React.ReactElement;
    children: React.ReactNode;
  }) => ({ ...render, props: { ...(render.props as object), children } }),
  TooltipPopup: () => null,
}));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

let root: Root | undefined;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  node?.remove();
  state.primary = "primary";
  state.mailRead = true;
  state.unavailableMailEnvironment = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// Exercise the palette's shared scope and destination helpers without its unrelated services.
function PaletteDestinationProbe() {
  const location = useLocation();
  const search =
    location.pathname === "/workspace" ? parseWorkspaceSearch(location.search) : undefined;
  const scopedEnvironmentId = useWorkspaceEnvironment(search);
  const { environmentId } = useMailCapabilities(scopedEnvironmentId);
  return (
    <nav aria-label="Palette destination probe">
      {workspaceDestinations.map(({ id, label }) => (
        <Link key={id} to="/workspace" search={workspaceDestinationSearch(id, environmentId)}>
          Open {label}
        </Link>
      ))}
    </nav>
  );
}

async function mount(href: string, rail = true, probePalette = false) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <WorkspaceSpaceSelector rail={rail} />
        {probePalette && <PaletteDestinationProbe />}
        <Outlet />
      </>
    ),
  });
  const index = createRoute({ getParentRoute: () => rootRoute, path: "/" });
  const thread = createRoute({
    getParentRoute: () => rootRoute,
    path: "/$environmentId/$threadId",
  });
  const draft = createRoute({ getParentRoute: () => rootRoute, path: "/draft/$draftId" });
  const settings = createRoute({ getParentRoute: () => rootRoute, path: "/settings/email" });
  const codePages = ["/pull-requests", "/usage", "/welcome"].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path }),
  );
  const workspace = createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspace",
    // Keep raw search here so the selector must normalize legacy URLs itself.
    validateSearch: (raw): Record<string, unknown> => raw,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, thread, draft, settings, workspace, ...codePages]),
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  await router.load();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<RouterProvider router={router} />));
  return router;
}
async function click(name: string) {
  await act(async () => getByRole(node, "button", { name }).click());
}

it("routes all six destinations with one selection", async () => {
  const router = await mount("/workspace?space=projects&environment=selector-a");
  for (const [label, space, view] of [
    ["Communications", "communications", "chats"],
    ["Meetings", "meetings", "upcoming"],
    ["Calendar", "calendar", "agenda"],
    ["Email", "mail", "inbox"],
    ["Tasks", "tasks", "all"],
    ["Projects", "projects", "projects"],
  ] as const) {
    await click(label);
    expect(router.state.location.search).toEqual({ space, view, environment: "selector-a" });
    expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  }
  expect(state.close).toHaveBeenCalledWith(false);
});

it("enters Projects in the scoped Code environment and restores its exact href", async () => {
  const router = await mount("/selector-code/thread-a?diff=1#change");
  await click("Workspace");
  expect(router.state.location.search).toEqual({
    space: "projects",
    view: "projects",
    environment: "selector-code",
  });
  state.primary = "different-primary";
  await click("Code");
  expect(router.state.location.href).toBe("/selector-code/thread-a?diff=1#change");
});

it("switches environments before Code return and scopes Workspace return too", async () => {
  const router = await mount("/selector-a/thread-a");
  await click("Workspace");
  await act(async () => router.navigate({ href: "/selector-b/thread-b" }));
  await click("Workspace");
  await act(async () =>
    router.navigate({ href: "/workspace?space=tasks&view=open&environment=selector-a" }),
  );
  await click("Code");
  expect(router.state.location.pathname).toBe("/selector-a/thread-a");
  await click("Workspace");
  expect(router.state.location.search).toEqual({
    space: "tasks",
    view: "open",
    environment: "selector-a",
  });
});

it("keeps destination, view and mail identity through back/forward", async () => {
  const router = await mount(
    "/workspace?space=mail&view=later&environment=history-env&account=bot&folder=INBOX",
  );
  await click("Meetings");
  await click("Calendar");
  await act(async () => {
    router.history.back();
    await router.load();
  });
  expect(router.state.location.search).toEqual({
    space: "meetings",
    view: "upcoming",
    environment: "history-env",
  });
  await act(async () => {
    router.history.back();
    await router.load();
  });
  expect(router.state.location.search).toEqual({
    space: "mail",
    view: "later",
    environment: "history-env",
    account: "bot",
    folder: "INBOX",
  });
  await act(async () => {
    router.history.forward();
    await router.load();
  });
  expect(router.state.location.search.space).toBe("meetings");
});

it("uses the draft environment and keeps Settings out of Code memory", async () => {
  const router = await mount("/draft/draft-a");
  await click("Workspace");
  expect(router.state.location.search.environment).toBe("draft-env");
  await act(async () => router.navigate({ href: "/settings/email" }));
  await click("Code");
  expect(router.state.location.pathname).toBe("/draft/draft-a");
});

it("keeps unsupported Mail visible without opening it on old servers", async () => {
  state.mailRead = false;
  const router = await mount("/workspace?space=projects&environment=old-server");
  await click("Email");
  expect(router.state.location.search.space).toBe("projects");
  expect(getByRole(node, "button", { name: "Email" }).getAttribute("aria-disabled")).toBe("true");
});

it("dismisses compact navigation and uses the same scoped destinations", async () => {
  const router = await mount("/compact-env/thread-a", false);
  await click("Workspace");
  await click("Email");
  expect(router.state.location.search).toEqual({
    space: "mail",
    view: "inbox",
    environment: "compact-env",
  });
  expect(state.close).toHaveBeenCalledWith(false);
});

it("makes an unscoped legacy Workspace return explicit before the primary changes", async () => {
  state.primary = "legacy-primary";
  const router = await mount("/legacy-other/thread-initial");
  await act(async () =>
    router.navigate({ href: "/workspace?space=mail&account=legacy-account&folder=Sent" }),
  );
  await act(async () => router.navigate({ href: "/legacy-primary/thread-a" }));
  state.primary = "new-primary";
  await click("Workspace");
  expect(router.state.location.search).toEqual({
    space: "mail",
    account: "legacy-account",
    folder: "Sent",
    environment: "legacy-primary",
  });
});

it("keeps rail and palette destinations on the primary after unscoped Mail", async () => {
  state.primary = "unscoped-primary";
  state.unavailableMailEnvironment = "unscoped-other";
  const router = await mount("/unscoped-other/thread-a", true, true);
  for (const [label, space, view] of [
    ["Communications", "communications", "chats"],
    ["Meetings", "meetings", "upcoming"],
    ["Calendar", "calendar", "agenda"],
    ["Email", "mail", "inbox"],
    ["Tasks", "tasks", "all"],
    ["Projects", "projects", "projects"],
  ] as const) {
    await act(async () =>
      router.navigate({ href: "/workspace?space=mail&account=primary-account&folder=Sent" }),
    );
    const link = getByRole(node, "link", { name: `Open ${label}` });
    const href = new URL(link.getAttribute("href")!, "https://workspace.invalid");
    expect(href.pathname).toBe("/workspace");
    expect(Object.fromEntries(href.searchParams)).toEqual({
      space,
      view,
      environment: "unscoped-primary",
    });
    await click(label);
    expect(router.state.location.search).toEqual({
      space,
      view,
      environment: "unscoped-primary",
    });
    expect(getByRole(node, "button", { name: "Email" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
  }
});

it("retains normalized Telegram source identity when returning from Code", async () => {
  const router = await mount(
    "/workspace?space=office&officeView=communications&communicationProvider=telegram&environment=telegram-env&account=bot-1&item=bot-1%2F-42%2F2",
  );
  expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(getByRole(node, "button", { name: "Communications" }).getAttribute("aria-current")).toBe(
    "page",
  );
  await act(async () => router.navigate({ href: "/telegram-env/thread-a" }));
  await click("Workspace");
  expect(router.state.location.search).toEqual({
    space: "communications",
    communicationProvider: "telegram",
    environment: "telegram-env",
    account: "bot-1",
    item: "bot-1/-42/2",
  });
});

it.each(["/pull-requests", "/usage", "/welcome"])("keeps Code active on %s", async (href) => {
  await mount(href);
  expect(getByRole(node, "button", { name: "Workspace" })).toBeDefined();
  expect(getByRole(node, "button", { name: "Code" }).getAttribute("aria-current")).toBe("page");
  expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});

it("drops a non-text environment before navigating to another destination", async () => {
  state.primary = "numeric-primary";
  const router = await mount("/numeric-primary/thread-a");
  await act(async () => router.navigate({ href: "/workspace?space=projects&environment=1" }));
  await click("Meetings");
  expect(router.state.location.search).toEqual({
    space: "meetings",
    view: "upcoming",
    environment: "numeric-primary",
  });
});

it("does not reopen local Office tools through the Workspace mode switch", async () => {
  state.primary = "office-return";
  const router = await mount("/office-return/thread-a");
  await click("Workspace");
  await click("Tasks");
  await act(async () => router.navigate({ href: "/workspace?space=office" }));
  await click("Code");
  await click("Workspace");
  expect(router.state.location.search).toEqual({
    space: "tasks",
    view: "all",
    environment: "office-return",
  });
});
