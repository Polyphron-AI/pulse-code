// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
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

it("opens and dismisses the fixture navigation menu at 390px without live services", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize(size: { width: number; height: number }): void };
    }
  ).happyDOM.setWindowSize({ width: 390, height: 844 });
  const session = createWorkspaceMockupSession("01");
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root.render(
      <WorkspaceMockupRenderContext value={{ session, modules: [], onCommit() {} }}>
        <WorkspaceMockupApp session={session} />
      </WorkspaceMockupRenderContext>,
    ),
  );
  const trigger = getByRole(node, "button", { name: "Toggle workspace navigation" });
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  expect(
    getAllByRole(getByRole(document.body, "dialog", { name: "Workspace menu" }), "link"),
  ).toHaveLength(7);
  await act(() => getByRole(document.body, "link", { name: "Meetings" }).click());
  await session.settled();
  expect(session.operations.at(-1)).toEqual({
    kind: "navigate",
    item: null,
    value: "space:meetings",
  });
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(
    getAllByRole(getByRole(document.body, "dialog", { name: "Resources" }), "tab"),
  ).toHaveLength(6);
  session.dispose();
});

it("mounts the shared shell and recipe navigation for all eight samples without marking later regions ready", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
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
    expect(node.querySelector("[data-workspace-shell-navigation]")?.textContent).toContain(
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
    expect(node.querySelectorAll("[data-workspace-engagement-header]")).toHaveLength(1);
    expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain("SynKEK");
    expect(getAllByRole(node, "tab")).toHaveLength(6);
    expect(node.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      {
        files: "Files",
        browser: "Browser",
        agents: "Agents",
        tasks: "Tasks",
        docs: "Docs",
        prs: "PRs",
      }[recipe.resourceTab],
    );
    expect(node.querySelectorAll('[aria-label="Resize item list"]')).toHaveLength(
      recipe.space === "mail" || recipe.space === "communications" ? 1 : 0,
    );
    expect(onCommit).toHaveBeenLastCalledWith({
      shellReady: false,
      incompleteRegions: ["shell.responsive"],
    });
    await act(async () => getByRole(node, "link", { name: "Meetings" }).click());
    await session.settled();
    expect(session.operations).toEqual([{ kind: "navigate", item: null, value: "space:meetings" }]);
    expect(node.textContent).toContain("Sample project connections");
    await act(() => getByRole(node, "button", { name: "Project workspace settings" }).click());
    await session.settled();
    expect(session.operations.at(-1)).toEqual({
      kind: "navigate",
      item: null,
      value: "project-settings",
    });
    session.dispose();
  }
});
