// @vitest-environment happy-dom
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./tasksMockupModule";
import {
  createWorkspaceMockupSession,
  parseWorkspaceMockupRequest,
  workspaceTasksMockupStates,
} from "./workspaceMockupFixtures";

it.each(["board-saving", "board-conflict", "board-page2-conflict"] as const)(
  "renders %s feedback inside the production board card",
  async (state) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const session = createWorkspaceMockupSession("03", state);
    const module = createWorkspaceMockupModule(session);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() => root.render(module.center));
      const title =
        state === "board-page2-conflict" ? "Later page task 1" : "Approve homepage copy";
      const card = container
        .querySelector(`[aria-label="Move ${title} to column"]`)!
        .closest("[data-workspace-board-task-id]")!;
      if (state === "board-saving") {
        expect(card.textContent).toContain("Saving move...");
        expect(card.querySelector("select")!.disabled).toBe(true);
      } else {
        expect(card.textContent).toContain("This task changed on another client.");
        expect(card.textContent).toContain("Refreshing tasks to load the latest changes.");
        const review = card.querySelector<HTMLButtonElement>(
          `[aria-label="Review changes to ${title}"]`,
        )!;
        await act(() => review.click());
        expect(container.querySelector('[aria-label="Selected task"]')).not.toBeNull();
      }
      await module.settled();
      expect(session.operations.filter((operation) => operation.kind === "save")).toHaveLength(1);
    } finally {
      await act(() => root.unmount());
      container.remove();
      module.dispose();
      session.dispose();
      vi.unstubAllGlobals();
    }
  },
);

it("opens the production creation menu and cancels its draft without writing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = createWorkspaceMockupSession("03", "menu");
  const module = createWorkspaceMockupModule(session);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(module.center));
    expect(
      container.querySelector('[aria-label="Task actions"]')?.getAttribute("aria-expanded"),
    ).toBe("true");
    const newTask = container.querySelector<HTMLButtonElement>(
      '[aria-label="Task creation"] [role="menuitem"]',
    )!;
    await act(() => newTask.click());
    expect(container.querySelector('[aria-label="New task title"]')).not.toBeNull();
    const cancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Cancel",
    )!;
    await act(() => cancel.click());
    expect(container.querySelector('[aria-label="New task title"]')).toBeNull();
    expect(session.operations.filter((operation) => operation.kind === "save")).toHaveLength(0);
  } finally {
    await act(() => root.unmount());
    container.remove();
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});

it("shows one production read-only board notice", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = createWorkspaceMockupSession("03", "board-read-only");
  const module = createWorkspaceMockupModule(session);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(module.center));
    const text = container.textContent;
    expect(text).toContain("Read-only session. You can browse tasks but cannot move cards.");
    expect(text).not.toContain("This connection is read-only.");
    const control = container.querySelector<HTMLSelectElement>(
      '[aria-label="Move Approve homepage copy to column"]',
    )!;
    expect(control.disabled).toBe(true);
    await act(() => {
      control.value = "Review";
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await module.settled();
    expect(session.operations).toHaveLength(0);
  } finally {
    await act(() => root.unmount());
    container.remove();
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});

it("returns the phone fixture to its list origin and focuses the opened row", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = createWorkspaceMockupSession("03", "phone-return");
  const module = createWorkspaceMockupModule(session);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(module.center));
    await module.settled();
    expect(container.querySelector('[aria-label="Selected task"]')).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Open Publish campaign landing page",
    );
    expect(container.querySelector("[data-workspace-task-list]")!.scrollTop).toBe(144);
    expect(session.operations.filter((operation) => operation.kind === "navigate")).toHaveLength(2);
  } finally {
    await act(() => root.unmount());
    container.remove();
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});

it("uses production conflict rebasing and deleted draft guidance", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const state of ["conflict", "deleted"] as const) {
    const session = createWorkspaceMockupSession("03", state);
    const module = createWorkspaceMockupModule(session);
    let renderer: ReactTestRenderer;
    try {
      await act(() => {
        renderer = create(<>{module.center}</>);
      });
      if (state === "conflict") {
        const reapply = renderer!.root
          .findAllByType("button")
          .find((button) => button.children.join("") === "Reapply my changes")!;
        await act(() => reapply.props.onClick());
        expect(renderer!.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
          "Unsaved launch copy",
        );
        expect(renderer!.root.findAllByProps({ "aria-label": "Task conflict" })).toHaveLength(0);
      } else {
        expect(JSON.stringify(renderer!.toJSON())).toContain(
          "This task was deleted. Its links have been kept. Copy your draft or discard it.",
        );
      }
    } finally {
      await act(() => renderer!.unmount());
      module.dispose();
      session.dispose();
    }
  }
  vi.unstubAllGlobals();
});
it("renders production rows and confirmed completion with isolated seed data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = createWorkspaceMockupSession("03");
  const module = createWorkspaceMockupModule(session);
  let renderer: ReactTestRenderer;
  try {
    await act(() => {
      renderer = create(<>{module.center}</>);
    });
    expect(module.readyRegions).toEqual(["center"]);
    expect(
      renderer!.root
        .findAllByType("button")
        .map((button) => button.props["aria-label"])
        .filter((label) => label?.startsWith("Open ")),
    ).toEqual([
      "Open Approve homepage copy",
      "Open Review October keyword plan",
      "Open Prepare product launch assets",
      "Open Publish campaign landing page",
      "Open Share weekly performance report",
    ]);
    expect(
      renderer!.root.findAllByProps({ role: "img" }).map((owner) => owner.children.join("")),
    ).toEqual(["MC", "LM", "NP", "AM", "MC"]);
    expect(
      renderer!.root
        .findAllByType("input")
        .filter((n) => n.props.type === "checkbox")
        .map((n) => n.props.checked),
    ).toEqual([false, false, false, false, true]);
    expect(renderer!.root.findAllByType("time").map((n) => n.children.join(""))).toEqual([
      "Today",
      "16 Oct",
      "16 Oct",
      "16 Oct",
      "16 Oct",
    ]);
    expect(JSON.stringify(renderer!.toJSON())).toContain("4 open · SynKEK");
    await act(async () =>
      renderer!.root
        .findByProps({ "aria-label": "Complete Approve homepage copy" })
        .props.onChange({ target: { checked: true } }),
    );
    await module.settled();
    expect(
      renderer!.root.findByProps({ "aria-label": "Reopen Approve homepage copy" }).props.checked,
    ).toBe(true);
    expect(JSON.stringify(renderer!.toJSON())).toContain("3 open · SynKEK");
    expect(session.operations).toHaveLength(1);
    await act(async () =>
      renderer!.root
        .findByProps({ "aria-label": "Reopen Approve homepage copy" })
        .props.onChange({ target: { checked: false } }),
    );
    await module.settled();
    expect(JSON.stringify(renderer!.toJSON())).toContain("4 open \u00b7 SynKEK");
    expect(session.operations).toHaveLength(2);
  } finally {
    await act(() => renderer!.unmount());
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});

it("shares confirmed rows with resource 08, resets and disposes without external calls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.spyOn(window, "fetch");
  const session = createWorkspaceMockupSession("08");
  const module = createWorkspaceMockupModule(session);
  let renderer: ReactTestRenderer;
  try {
    expect(module.readyRegions).toEqual(["resource"]);
    await act(() => {
      renderer = create(
        <>
          {module.center}
          {module.resource}
        </>,
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("SynKEK · 4 open");
    for (const completed of [true, false]) {
      await act(async () => {
        await renderer!.root
          .findAllByProps({
            "aria-label": `${completed ? "Complete" : "Reopen"} Approve homepage copy`,
          })[1]!
          .props.onChange({ target: { checked: completed } });
        await module.settled();
      });
      expect(JSON.stringify(renderer!.toJSON())).toContain(`SynKEK · ${completed ? 3 : 4} open`);
      expect(JSON.stringify(renderer!.toJSON())).toContain(`${completed ? 3 : 4} open · SynKEK`);
    }
    expect(session.operations).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
    await act(() => renderer!.unmount());
    module.dispose();
    session.dispose();
    const resetSession = createWorkspaceMockupSession("08");
    const reset = createWorkspaceMockupModule(resetSession);
    await act(() => {
      renderer = create(<>{reset.resource}</>);
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("SynKEK · 4 open");
    await act(() => renderer!.unmount());
    reset.dispose();
    resetSession.dispose();
  } finally {
    fetch.mockRestore();
    vi.unstubAllGlobals();
  }
});

it.each(workspaceTasksMockupStates)(
  "provides an isolated URL capture for task state %s",
  async (state) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    expect(
      parseWorkspaceMockupRequest(
        new URL(`http://fixture.invalid/workspace?space=tasks&fixture=03&state=${state}`),
        true,
      ),
    ).toBe("03");
    const session = createWorkspaceMockupSession("03", state);
    const module = createWorkspaceMockupModule(session);
    let renderer: ReactTestRenderer;
    try {
      await act(() => {
        renderer = create(<>{module.center}</>);
      });
      await module.settled();
      const text = JSON.stringify(renderer!.toJSON());
      if (state === "conflict") expect(text).toContain("Reapply my changes");
      if (state === "deleted") expect(text).toContain("Copy draft");
      if (state === "read-only")
        expect(
          renderer!.root
            .findAllByType("input")
            .filter((node) => node.props.type === "checkbox")
            .every((node) => node.props.disabled),
        ).toBe(true);
      if (state === "create" || state === "create-dirty")
        expect(renderer!.root.findByProps({ "aria-label": "New task project" })).toBeDefined();
      if (state === "board") {
        expect(text).toContain("0 loaded of 0");
        expect(text).toContain("4 loaded of 7");
        expect(
          renderer!.root.findAllByProps({ "aria-label": "Open Later page task 1" }),
        ).toHaveLength(0);
        await act(() =>
          renderer!.root.findByProps({ "aria-label": "Load more tasks" }).props.onClick(),
        );
        expect(
          renderer!.root.findByProps({ "aria-label": "Open Later page task 1" }),
        ).toBeDefined();
        await act(async () =>
          renderer!.root
            .findByProps({ "aria-label": "Move Approve homepage copy to column" })
            .props.onChange({ target: { value: "Review" } }),
        );
        await module.settled();
        expect(
          renderer!.root.findByProps({ "aria-label": "Move Approve homepage copy to column" }).props
            .value,
        ).toBe("Review");
      }
    } finally {
      await act(() => renderer!.unmount());
      module.dispose();
      session.dispose();
      vi.unstubAllGlobals();
    }
  },
);
