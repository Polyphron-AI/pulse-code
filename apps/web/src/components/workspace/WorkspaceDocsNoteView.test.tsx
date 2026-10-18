// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, type WorkspaceNote } from "@t3tools/contracts";
import { WorkspaceDocsNoteView, type NoteDraft } from "./WorkspaceDocsNoteView";

let root: Root;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  node?.remove();
  vi.unstubAllGlobals();
});
const note: WorkspaceNote = {
  id: "wsn_00000000-0000-0000-0000-000000000001",
  title: "Review",
  body: "<script>inert</script>\n\n1. Plan",
  revision: 3,
  createdAt: "2026-10-17T00:00:00Z",
  updatedAt: "2026-10-17T00:00:00Z",
};
async function mount(operate = true) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const saved = vi.fn(),
    removed = vi.fn(),
    restored = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState<NoteDraft | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleted, setDeleted] = useState(false);
    return (
      <WorkspaceDocsNoteView
        environmentId={EnvironmentId.make("original")}
        note={note}
        status="ready"
        canOperate={operate}
        pending={false}
        draft={draft}
        error={error}
        deleted={deleted}
        onEdit={setDraft}
        onSave={() => {
          saved(draft);
          setError("This note changed. Your draft has been kept.");
        }}
        onCancel={() => setDraft(null)}
        onReload={() => {
          setDraft(null);
          setError(null);
        }}
        onDelete={() => {
          removed();
          setDeleted(true);
        }}
        onRestore={() => {
          restored();
          setDeleted(false);
        }}
      />
    );
  }
  await act(() => root.render(<Harness />));
  return { saved, removed, restored };
}
const click = async (name: string) =>
  act(() => fireEvent.click(getByRole(node, "button", { name })));
it("reads native Markdown through the shared safe body and keeps the original source for editing", async () => {
  await mount();
  expect(node.querySelector("ol > li")?.textContent).toBe("Plan");
  expect(node.querySelector("script, img, pre")).toBeNull();
  expect(node.textContent).not.toContain("Formatted Docs view is not available yet");
  expect(node.textContent).not.toContain("<script>");
  await click("Edit note");
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    note.body,
  );
});
it("edits controlled text with captured revision, retains conflict draft and explicitly reloads", async () => {
  const { saved } = await mount();
  expect(getByRole(node, "heading", { level: 1, name: note.title })).toBeDefined();
  expect(node.querySelector("script")).toBeNull();
  await click("Edit note");
  const body = getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement;
  await act(() => {
    fireEvent.change(body, { target: { value: "Local draft 😀" } });
  });
  await act(() => fireEvent.submit(node.querySelector("form")!));
  expect(saved).toHaveBeenCalledWith({ title: "Review", body: "Local draft 😀", revision: 3 });
  expect(body.value).toBe("Local draft 😀");
  expect(getByRole(node, "alert").textContent).toContain("draft has been kept");
  await click("Reload current note");
  expect(queryByRole(node, "textbox")).toBeNull();
  expect(node.querySelector("ol > li")?.textContent).toBe("Plan");
});
it("blocks a UTF-8 oversized draft and supports explicit delete and Undo", async () => {
  const { saved, removed, restored } = await mount();
  await click("Edit note");
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: "😀".repeat(16385) },
    }),
  );
  await act(() => fireEvent.submit(node.querySelector("form")!));
  expect(saved).not.toHaveBeenCalled();
  expect((getByRole(node, "button", { name: "Save note" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: "??".repeat(16384) },
    }),
  );
  await act(() => fireEvent.submit(node.querySelector("form")!));
  expect(saved).toHaveBeenCalledOnce();
  expect(saved.mock.calls[0]![0].body).toBe("??".repeat(16384));
  await click("Cancel");
  await click("Delete note");
  expect(removed).toHaveBeenCalledOnce();
  expect(node.textContent).toContain("Their links have been kept");
  await click("Undo delete");
  expect(restored).toHaveBeenCalledOnce();
  expect(node.querySelector("ol > li")?.textContent).toBe("Plan");
});
it("denies read-only writes through real disabled controls", async () => {
  const { removed } = await mount(false);
  const button = getByRole(node, "button", { name: "Delete note" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await act(() => button.click());
  expect(removed).not.toHaveBeenCalled();
  expect((getByRole(node, "button", { name: "Edit note" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
