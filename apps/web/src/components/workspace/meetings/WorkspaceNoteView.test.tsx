// @vitest-environment happy-dom
import { createMeetingNote } from "./meetingNotes";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ProjectId, EnvironmentId, type WorkspaceNote } from "@t3tools/contracts";
import { MeetingNoteRecovery, WorkspaceNoteView, type NoteDraft } from "./WorkspaceNoteView";

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
      <WorkspaceNoteView
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
it("edits controlled text with captured revision, retains conflict draft and explicitly reloads", async () => {
  const { saved } = await mount();
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
  expect(node.textContent).toContain(note.body);
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
  expect(node.textContent).toContain(note.body);
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

it("opens a partially saved note and retries both links using the same create journal identity", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const open = vi.fn();
  const create = vi.fn().mockResolvedValue({ id: note.id, title: note.title });
  const link = vi
    .fn()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error("Disconnected"))
    .mockResolvedValue({});
  const input = {
    environmentId: EnvironmentId.make("original"),
    requestId: "00000000-0000-0000-0000-000000000001",
    title: note.title,
    body: note.body,
    projectId: ProjectId.make("project"),
    meeting: {
      ref: {
        type: "provider-resource" as const,
        provider: "workspace-calendar",
        resourceId: "wce_00000000-0000-0000-0000-000000000001",
      },
    },
  };
  function Harness() {
    const [saved, setSaved] = useState<Awaited<ReturnType<typeof createMeetingNote>> | null>(null);
    const [failed, setFailed] = useState(false);
    const [pending, setPending] = useState(false);
    const run = async () => {
      setPending(true);
      try {
        await createMeetingNote({ create, link }, input, setSaved);
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        setPending(false);
      }
    };
    return failed && saved ? (
      <MeetingNoteRecovery
        canOperate
        pending={pending}
        onOpen={() => open(saved.ref)}
        onRetry={() => void run()}
      />
    ) : (
      <button onClick={() => void run()}>Create notes</button>
    );
  }
  await act(() => root.render(<Harness />));
  await click("Create notes");
  expect(node.textContent).toContain("Note saved. Linking did not finish.");
  await click("Open saved note");
  expect(open).toHaveBeenCalledWith({
    type: "provider-resource",
    provider: "workspace-note",
    resourceId: note.id,
  });
  await click("Retry linking");
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  expect(link.mock.calls[0]).toEqual(link.mock.calls[2]);
  expect(link.mock.calls[1]).toEqual(link.mock.calls[3]);
  expect(queryByRole(node, "alert")).toBeNull();
});
