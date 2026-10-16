// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceMockupApp, WorkspaceMockupRenderContext } from "./WorkspaceMockupApp";
import { createWorkspaceMockupSession, workspaceMockupRecipes } from "./workspaceMockupFixtures";

let root: Root;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  node?.remove();
  vi.unstubAllGlobals();
});

it("mounts the shared shell and recipe navigation for all eight samples without marking later regions ready", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  for (const recipe of Object.values(workspaceMockupRecipes)) {
    const session = createWorkspaceMockupSession(recipe.id);
    const onCommit = vi.fn();
    await act(async () =>
      root.render(
        <WorkspaceMockupRenderContext value={{ session, modules: [], onCommit }}>
          <WorkspaceMockupApp key={session.id} session={session} />
        </WorkspaceMockupRenderContext>,
      ),
    );
    expect(node.querySelectorAll("[data-workspace-shell]")).toHaveLength(1);
    expect(getByRole(node, "navigation", { name: "Workspace navigation" }).textContent).toContain(
      "Pulse Next",
    );
    expect(getByRole(node, "button", { name: "Office" }).getAttribute("aria-pressed")).toBe("true");
    expect(
      getAllByRole(getByRole(node, "navigation", { name: "Workspace destinations" }), "link"),
    ).toHaveLength(6);
    expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(node.querySelector('[aria-current="page"]')?.getAttribute("href")).toContain(
      `space=${recipe.space}`,
    );
    expect(
      getByRole(node, "navigation", { name: "Workspace views" }).querySelector(
        '[aria-pressed="true"]',
      )?.textContent,
    ).toBe(
      {
        mail: "Inbox",
        communications: "Chats",
        tasks: "All tasks",
        projects: "Projects",
        meetings: "Upcoming",
        calendar: "Agenda",
      }[recipe.space],
    );
    expect(onCommit).toHaveBeenLastCalledWith({
      shellReady: false,
      incompleteRegions: ["shell.engagement", "shell.resources", "shell.footer"],
    });
    await act(async () => getByRole(node, "link", { name: "Meetings" }).click());
    await session.settled();
    expect(session.operations).toEqual([{ kind: "navigate", item: null, value: "space:meetings" }]);
    session.dispose();
  }
});
