// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { MailNav } from "./MailNav";
import { parseWorkspaceSearch } from "../workspaceNavigation";

// Fake only the environment's external account/folder reads.
vi.mock("./useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote", mailRead: true }),
}));
vi.mock("../../../mail/mailState", () => ({ pulseMailAccounts: () => ({ kind: "accounts" }) }));
vi.mock("../../../mail/mailReadState", () => ({
  pulseMailFolders: ({ input }: { input: { accountId: string } }) => ({
    kind: "folders",
    accountId: input.accountId,
  }),
}));
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: (query: { kind: string } | null) => ({
    data:
      query?.kind === "accounts"
        ? [
            { id: "first", nickname: "First account" },
            { id: "second", nickname: "Second account" },
          ]
        : { folders: [{ name: "INBOX" }, { name: "Sent" }] },
    error: null,
    refresh: vi.fn(),
  }),
}));
let root: Root;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  node?.remove();
  vi.unstubAllGlobals();
});

it("opens account/folder disclosure, selects Sent on account two and restores trigger focus on close", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const parent = createRootRoute();
  const workspace = createRoute({
    getParentRoute: () => parent,
    path: "/workspace",
    validateSearch: parseWorkspaceSearch,
    component: MailNav,
  });
  const router = createRouter({
    routeTree: parent.addChildren([workspace]),
    history: createMemoryHistory({ initialEntries: ["/workspace?space=mail&environment=remote"] }),
  });
  await router.load();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(queryByRole(document.body, "link", { name: "Second account" })).toBeNull();
  const trigger = getByRole(node, "button", { name: "Email accounts and folders" });
  expect(trigger.textContent).toBe("Inbox");
  trigger.focus();
  await act(async () => trigger.click());
  await act(async () => getByRole(document.body, "link", { name: "Second account" }).click());
  expect(router.state.location.search.account).toBe("second");
  await act(async () => getByRole(document.body, "link", { name: "Sent" }).click());
  expect(router.state.location.search).toEqual({
    space: "mail",
    environment: "remote",
    account: "second",
    folder: "Sent",
  });
  expect(queryByRole(document.body, "link", { name: "Sent" })).toBeNull();
  expect(trigger.textContent).toBe("Sent");
  expect(document.activeElement).toBe(trigger);
  expect(queryByRole(document.body, "button", { name: "Choose project" })).toBeNull();
});
