// @vitest-environment happy-dom
import { act, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceHeader, type WorkspaceHeaderModel } from "./WorkspaceHeader";
import { WorkspaceBreadcrumb } from "../WorkspaceBreadcrumb";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
let root: Root;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  node?.remove();
  vi.unstubAllGlobals();
});
it("updates module metadata, exposes the full owner, and toggles Resources without changing the breadcrumb route", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let update!: (model: WorkspaceHeaderModel) => void;
  function App() {
    const [model, setModel] = useState<WorkspaceHeaderModel>({
      title: "Inbox",
      subtitle: "first@example.test",
      environmentLabel: "Long environment ".repeat(30),
      spaceLabel: "Email",
    });
    const [open, setOpen] = useState(false);
    useLayoutEffect(() => {
      update = setModel;
    }, []);
    const navigate = useNavigate();
    return (
      <>
        <WorkspaceBreadcrumb
          variant="workspace"
          {...model}
          onOpenWorkspace={() => void navigate({ to: "/workspace", search: { space: "projects" } })}
        />
        <WorkspaceHeader model={model} resourcesOpen={open} onResources={() => setOpen(!open)} />
      </>
    );
  }
  const parent = createRootRoute();
  const route = createRoute({ getParentRoute: () => parent, path: "/workspace", component: App });
  const router = createRouter({
    routeTree: parent.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/workspace?space=mail"] }),
  });
  await router.load();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(
    getByRole(node, "button", { name: "Long environment ".repeat(30).trim() }).textContent,
  ).toBe("Long environment ".repeat(30));
  expect(queryByRole(node, "img")).toBeNull();
  expect(node.textContent).not.toContain("sample data");
  await act(async () => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(node, "button", { name: "Resources" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(router.state.location.pathname).toBe("/workspace");
  expect(router.state.location.searchStr).toBe("?space=mail");
  await act(async () =>
    update({
      title: "# marketing",
      subtitle: "SynKEK · Slack",
      environmentLabel: "Remote B",
      spaceLabel: "Communications",
      owner: { name: "Maya Chen", initials: "MC" },
      sample: true,
    }),
  );
  expect(getByRole(node, "heading", { name: "# marketing" })).toBeDefined();
  expect(node.textContent).toContain("SynKEK · Slack");
  expect(node.textContent).not.toContain("first@example.test");
  expect(getByRole(node, "img", { name: "Maya Chen" }).textContent).toBe("MC");
  expect(node.textContent).toContain("Design preview · sample data");
  await act(async () => getByRole(node, "button", { name: "Remote B" }).click());
  expect(router.state.location.pathname).toBe("/workspace");
  expect(router.state.location.searchStr).toBe("?space=projects");
});

it("places Linked context immediately before Resources on wide screens and names it in compact overflow", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const viewport = (width: number) =>
    (
      window as unknown as {
        happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
      }
    ).happyDOM.setWindowSize({ width, height: 800 });
  viewport(1280);
  const context = vi.fn();
  const resources = vi.fn();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root.render(
      <WorkspaceHeader
        model={{ title: "Inbox", environmentLabel: "A", spaceLabel: "Mail" }}
        resourcesOpen={false}
        onResources={resources}
        onLinkedContext={context}
      />,
    ),
  );
  const trigger = getByRole(node, "button", { name: "Linked context" });
  await act(() => trigger.focus());
  expect(document.body.querySelector('[data-slot="tooltip-popup"]')?.textContent).toBe(
    "Linked context",
  );
  expect(trigger.hasAttribute("title")).toBe(false);
  expect(trigger.nextElementSibling).toBe(getByRole(node, "button", { name: "Resources" }));
  await act(() => trigger.click());
  expect(context).toHaveBeenCalledOnce();
  await act(() => window.dispatchEvent(new Event("resize")));
  await act(() => viewport(390));
  expect(queryByRole(node, "button", { name: "Linked context" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Workspace actions" }).click());
  await act(() => getByRole(document.body, "menuitem", { name: "Linked context" }).click());
  expect(context).toHaveBeenCalledTimes(2);
  expect(resources).not.toHaveBeenCalled();
  expect(getByRole(node, "button", { name: "Resources" })).toBeDefined();
});
