// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./notesMockupModule";
import { createWorkspaceMockupSession } from "./workspaceMockupFixtures";

it("uses the production note view, revision conflicts, retained drafts, Undo and fresh-session reset without live calls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn(() => {
    throw new Error("No live services");
  });
  vi.stubGlobal("fetch", fetch);
  const session = createWorkspaceMockupSession("07");
  const module = createWorkspaceMockupModule(session);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const click = async (within: HTMLElement, name: string) =>
    act(() => fireEvent.click(getByRole(within, "button", { name })));
  try {
    expect(module.readyRegions).toEqual(["resource"]);
    expect(module.incompleteRegions).toEqual(["07.docs-comments"]);
    await act(() =>
      root.render(
        <>
          <div id="first">{module.resource}</div>
          <div id="second">{module.resource}</div>
        </>,
      ),
    );
    const first = node.querySelector<HTMLElement>("#first")!,
      second = node.querySelector<HTMLElement>("#second")!;
    expect(getByRole(first, "heading", { level: 2, name: "Launch priorities" })).toBeDefined();
    expect(first.querySelectorAll("ol > li")).toHaveLength(3);
    await click(first, "Edit note");
    await click(second, "Edit note");
    await act(() =>
      fireEvent.change(getByRole(first, "textbox", { name: "Note title" }), {
        target: { value: "Saved title" },
      }),
    );
    await act(async () => {
      fireEvent.submit(first.querySelector("form")!);
      await module.settled();
    });
    await act(() =>
      fireEvent.change(getByRole(second, "textbox", { name: "Note text" }), {
        target: { value: "Retained local draft" },
      }),
    );
    await act(async () => {
      fireEvent.submit(second.querySelector("form")!);
      await module.settled();
    });
    expect(getByRole(second, "alert").textContent).toContain("draft has been kept");
    expect((getByRole(second, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
      "Retained local draft",
    );
    await click(second, "Reload current note");
    expect(second.textContent).toContain("Discard unsaved changes?");
    await click(second, "Discard changes");
    expect(second.textContent).toContain("Saved title");
    await act(async () => {
      await click(first, "Delete note");
      await module.settled();
    });
    expect(first.textContent).toContain("links have been kept");
    await act(async () => {
      await click(first, "Undo delete");
      await module.settled();
    });
    expect(first.textContent).toContain("Saved title");
    expect(
      session.operations.every(
        (operation) =>
          operation.item?.type === "provider-resource" &&
          operation.item.resourceId === session.seed.note.id,
      ),
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    await act(() => root.unmount());
    module.dispose();
    const fresh = createWorkspaceMockupModule(session);
    const next = createRoot(node);
    await act(() => next.render(fresh.resource));
    expect(node.textContent).toContain(session.seed.note.title);
    await act(() => next.unmount());
    fresh.dispose();
  } finally {
    node.remove();
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});

it("opens the controller conflict capture with the retained draft and unchanged note identity", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = createWorkspaceMockupSession("07", null, "note-conflict");
  const module = createWorkspaceMockupModule(session);
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(() => root.render(module.resource));
    expect(getByRole(node, "alert").textContent).toContain("draft has been kept");
    expect(
      (getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value,
    ).toContain("Unsaved meeting follow-up");
    expect((getByRole(node, "textbox", { name: "Note title" }) as HTMLInputElement).value).toBe(
      session.seed.note.title,
    );
    expect(module.incompleteRegions).toEqual(["07.docs-comments"]);
    expect(session.operations).toHaveLength(0);
  } finally {
    await act(() => root.unmount());
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});
