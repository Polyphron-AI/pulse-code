// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { getByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceSpaceSelector } from "./WorkspaceSpaceSelector";
import { parseWorkspaceSearch } from "./workspaceNavigation";

const state = vi.hoisted(() => ({
  primary: "primary",
  mailRead: true,
  close: vi.fn(),
  write: vi.fn(),
}));
vi.mock("../ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: true, setOpenMobile: state.close }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: (environmentId?: string) => ({
    environmentId: environmentId ?? state.primary,
    mailRead: state.mailRead,
  }),
}));
vi.mock("../../composerDraftStore", () => ({
  useComposerDraftStore: (select: (store: unknown) => unknown) =>
    select({ getDraftThread: () => ({ environmentId: "draft-env" }) }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.write }));
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

let root: Root | undefined;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  node?.remove();
  state.primary = "primary";
  state.mailRead = true;
  vi.clearAllMocks();
});

async function mount(href: string, rail = true) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <WorkspaceSpaceSelector rail={rail} />
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
  const workspace = createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, thread, draft, settings, workspace]),
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

it("routes all six destinations with one selection and no command writes", async () => {
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
  expect(state.write).not.toHaveBeenCalled();
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
  expect(router.state.location.pathname).toBe("/");
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
  const router = await mount("/workspace?space=mail&account=legacy-account&folder=Sent");
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

it("retains normalized Telegram source identity when returning from Code", async () => {
  const router = await mount(
    "/workspace?space=office&officeView=communications&communicationProvider=telegram&environment=telegram-env&account=bot-1&item=bot-1%2F-42%2F2",
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
