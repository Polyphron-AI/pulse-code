// @vitest-environment happy-dom
import * as Cause from "effect/Cause";
import { openMeetingNote } from "./meetings/meetingNotes";
import { act, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import {
  EnvironmentId,
  ProjectId,
  WorkspaceNotesError,
  type WorkspaceNote,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceResourcesPanel } from "./WorkspaceResourcesPanel";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  useWorkspaceResourceState,
  useWorkspaceResources,
  WorkspaceResourcesProvider,
} from "./workspaceResourceState";

const bodies = vi.hoisted(() => ({
  active: 0,
  max: 0,
  files: vi.fn(),
  browser: vi.fn(),
  writes: vi.fn(),
  start: vi.fn(),
  toolsAvailable: true,
  noteReads: vi.fn(),
  noteVersion: 0,
  noteListeners: new Set<() => void>(),
  refresh: vi.fn(),
  notes: new Map<string, WorkspaceNote>(),
  note: {
    id: "wsn_00000000-0000-0000-0000-000000000001",
    title: "Launch review",
    body: "Paragraph one.\n\n1. Preserve this list",
    revision: 3,
    createdAt: "2026-10-17T00:00:00Z",
    updatedAt: "2026-10-17T00:00:00Z",
  },
  operate: true,
  connected: true,
  connectionListeners: new Set<() => void>(),
}));
function Body({
  name,
  request,
  selectedItem,
}: {
  name: string;
  request?: unknown;
  selectedItem?: unknown;
}) {
  useEffect(() => {
    bodies.active++;
    bodies.max = Math.max(bodies.max, bodies.active);
    return () => {
      bodies.active--;
    };
  }, []);
  return (
    <p>
      {name} {JSON.stringify(request)} Selected {JSON.stringify(selectedItem)}
    </p>
  );
}
vi.mock("./WorkspaceAgents", () => ({ WorkspaceAgents: () => <Body name="Agents" /> }));
vi.mock("./ProjectDriveExplorer", () => ({
  ProjectDriveExplorer: (props: {
    environmentId: string;
    request: unknown;
    selectedItem: unknown;
  }) => {
    bodies.files();
    return <Body {...props} name={`Files ${props.environmentId}`} />;
  },
}));
vi.mock("./WorkspaceBrowser", () => ({
  WorkspaceBrowser: (props: { environmentId: string; request: unknown; selectedItem: unknown }) => {
    bodies.browser();
    return <Body {...props} name={`Browser ${props.environmentId}`} />;
  },
}));
vi.mock("./ProjectTasksResource", () => ({ ProjectTasksResource: () => <Body name="Tasks" /> }));
vi.mock("../../state/entities", () => ({ useThreadShells: () => [], useProjects: () => [] }));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: { list: () => "links", projectHub: () => "hub" },
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    ready: true,
    workspaceTools: bodies.toolsAvailable,
    workspaceLinks: true,
  }),
}));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({ linkItem: bodies.writes }) }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: string) => (value: unknown) => bodies.start(name, value),
}));
vi.mock("../../state/workspaceNotes", () => ({
  workspaceNotes: {
    get: (input: unknown) => {
      bodies.noteReads(input);
      return `note:${JSON.stringify(input)}`;
    },
    update: "update",
    delete: "delete",
    restore: "restore",
  },
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { configProjection: () => "config" } }));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: unknown) => {
    useSyncExternalStore(
      (listener) => {
        if (typeof query !== "string" || !query.startsWith("note:")) return () => {};
        bodies.noteListeners.add(listener);
        return () => {
          bodies.noteListeners.delete(listener);
        };
      },
      () => bodies.noteVersion,
    );
    return {
      data:
        query === "config"
          ? { source: "live", config: { pulseCapabilities: { workspaceNotes: true } } }
          : typeof query === "string" && query.startsWith("note:")
            ? (() => {
                const input = JSON.parse(query.slice(5)) as {
                  environmentId: string;
                  input: { id: string };
                };
                return (
                  bodies.notes.get(JSON.stringify([input.environmentId, input.input.id])) ?? {
                    ...bodies.note,
                    id: input.input.id,
                  }
                );
              })()
            : null,
      error: null,
      isPending: false,
      refresh: bodies.refresh,
    };
  },
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => {
    const connected = useSyncExternalStore(
      (listener) => {
        bodies.connectionListeners.add(listener);
        return () => {
          bodies.connectionListeners.delete(listener);
        };
      },
      () => bodies.connected,
    );
    return connected ? ["a", "b"] : [];
  },
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => bodies.operate }));
const a = EnvironmentId.make("a");
const p = ProjectId.make("project");
let root: Root | undefined;
let node: HTMLDivElement;
const storage = { getItem: () => null, setItem: () => {} };
const retainedLinkedPage = <p>Retained linked page</p>;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  vi.clearAllMocks();
  bodies.active = 0;
  bodies.max = 0;
  bodies.toolsAvailable = true;
  bodies.notes.clear();
  vi.unstubAllGlobals();
});
function Opener() {
  const resources = useWorkspaceResources();
  const { openResource } = resources;
  return (
    <>
      <button
        onClick={() =>
          openMeetingNote(resources, {
            environmentId: resources.environmentId!,
            projectId: p,
            note: {
              type: "provider-resource",
              provider: "workspace-note",
              resourceId: bodies.note.id,
            },
          })
        }
      >
        Open note
      </button>
      <button
        onClick={() =>
          openResource({
            projectId: p,
            tab: "docs",
            request: {
              type: "provider-resource",
              provider: "workspace-note",
              resourceId: "wsn_00000000-0000-0000-0000-000000000002",
            },
          })
        }
      >
        Open second note
      </button>
      <button
        onClick={() =>
          openResource({
            projectId: ProjectId.make("other"),
            tab: "docs",
            request: {
              type: "provider-resource",
              provider: "workspace-note",
              resourceId: bodies.note.id,
            },
          })
        }
      >
        Open note in other project
      </button>
      <button
        onClick={() =>
          openResource({
            projectId: p,
            tab: "files",
            request: { type: "file", provider: "google-drive", fileId: "handoff" },
          })
        }
      >
        Open file
      </button>
      <button
        onClick={() =>
          openResource({
            projectId: p,
            tab: "docs",
            request: { type: "file", provider: "google-drive", fileId: "doc-handoff" },
          })
        }
      >
        Open document
      </button>
    </>
  );
}
function App({
  environmentId = a,
  unavailable = false,
  linked = retainedLinkedPage,
  selectedItem = null,
}: {
  environmentId?: EnvironmentId;
  unavailable?: boolean;
  linked?: ReactNode;
  selectedItem?: WorkspaceLinkEndpoint | null;
}) {
  const wide = useMediaQuery("xl");
  const state = useWorkspaceResourceState(environmentId, {
    storage,
    presentation: wide ? "dock" : "sheet",
  });
  return (
    <WorkspaceResourcesProvider value={state}>
      <WorkspaceEngagement
        environmentId={environmentId}
        space="projects"
        layout="full"
        header={{ title: "Projects", spaceLabel: "Projects", environmentLabel: environmentId }}
        resources={
          <WorkspaceResourcesPanel
            environmentId={environmentId}
            projects={[{ id: p, title: `${environmentId} project` }]}
            project={
              state.projectId === null
                ? { kind: "choose", candidates: [] }
                : unavailable
                  ? { kind: "unavailable", projectId: p }
                  : {
                      kind: "selected",
                      scope: { environmentId, projectId: state.projectId },
                      title: `${environmentId} project`,
                    }
            }
            selectedItem={selectedItem}
            onOpen={() => {}}
            footer={<p>Connection status unavailable</p>}
          />
        }
        linkedContext={{
          item:
            linked === null
              ? null
              : { ref: { type: "url", url: "https://example.invalid/a" }, title: "Page A" },
          render: () => linked,
        }}
      >
        <Opener />
      </WorkspaceEngagement>
    </WorkspaceResourcesProvider>
  );
}
async function mount(children: ReactNode = <App />) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(children));
}
it("chooses resources before selection, mounts one lazy body, retains linked items, closes and reopens", async () => {
  await mount();
  expect(bodies.files).not.toHaveBeenCalled();
  expect(bodies.browser).not.toHaveBeenCalled();
  expect(queryByRole(node, "complementary", { name: "Linked context" })).toBeNull();
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "option", { name: "a project" }).click());
  expect(getByRole(node, "tabpanel").textContent).toContain("Files a");
  expect(bodies.browser).not.toHaveBeenCalled();
  const browser = getByRole(node, "tab", { name: "Browser" });
  const files = getByRole(node, "tab", { name: "Files" });
  files.focus();
  await act(() =>
    files.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
  );
  expect(document.activeElement).toBe(browser);
  expect(bodies.browser).not.toHaveBeenCalled();
  await act(() => browser.click());
  expect(getByRole(node, "tabpanel").textContent).toContain("Browser a");
  expect(getAllByRole(node, "tab").map((tab) => tab.textContent)).toEqual([
    "Files",
    "Browser",
    "Agents",
    "Tasks",
    "Docs",
    "PRs",
  ]);
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  expect(bodies.active).toBe(0);
  expect(queryByRole(node, "complementary", { name: "Resources" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(node, "tabpanel").textContent).toContain("Browser a");
  expect(bodies.max).toBe(1);
  expect(bodies.writes).not.toHaveBeenCalled();
  expect(bodies.start).not.toHaveBeenCalled();
});
it("shares one dock between live resources and linked items through header controls", async () => {
  await mount();
  const engagement = node.querySelector("[data-workspace-engagement]")!;
  const linked = getByRole(node, "button", { name: "Linked context" });
  const resources = getByRole(node, "button", { name: "Resources" });
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
  expect(linked.closest("[data-workspace-header-controls]")).not.toBeNull();
  expect(linked.getAttribute("aria-expanded")).toBe("false");
  await act(() => linked.click());
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
  expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
    "Retained linked page",
  );
  expect(resources.getAttribute("aria-expanded")).toBe("false");
  expect(engagement.getAttribute("data-workspace-dock-open")).toBe("true");
  await act(() => linked.click());
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  expect(
    getAllByRole(node, "complementary", { hidden: true }).filter((dock) => !dock.hidden),
  ).toHaveLength(0);
  expect(engagement.getAttribute("data-workspace-dock-open")).toBe("false");
  await act(() => linked.click());
  expect(engagement.getAttribute("data-workspace-dock-open")).toBe("true");
  await act(() => resources.click());
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
  expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
});
it("hands a request through the shared provider without changing the selected item", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  expect(getByRole(node, "tabpanel").textContent).toContain("handoff");
  expect(getByRole(node, "tabpanel").textContent).toContain("Selected null");
  await act(() => root!.render(<App environmentId={EnvironmentId.make("b")} />));
  expect(queryByRole(node, "tabpanel")?.textContent).not.toContain("Files a");
  expect(node.textContent).not.toContain("handoff");
});
it("routes a Drive handoff to Docs with provider fallback and preserves the native note entrance", async () => {
  await mount();
  await act(async () => {
    await import("./WorkspaceDocsPanel");
  });
  await act(() => getByRole(node, "button", { name: "Open document" }).click());
  expect(getByRole(node, "tab", { name: "Docs" }).getAttribute("aria-selected")).toBe("true");
  expect(getByRole(node, "link", { name: "Open in Google Drive" }).getAttribute("href")).toContain(
    "doc-handoff",
  );
  expect(bodies.noteReads).not.toHaveBeenCalled();
  expect(bodies.start).not.toHaveBeenCalled();
  await act(async () => {
    await import("./meetings/WorkspaceNoteView");
    await import("../../state/workspaceNotes");
    getByRole(node, "button", { name: "Open note" }).click();
  });
  expect(getByRole(node, "region", { name: "Workspace note" }).textContent).toContain(
    bodies.note.body,
  );
  expect(queryByRole(node, "link", { name: "Open in Google Drive" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Back to documents" }).click());
  expect(queryByRole(node, "region", { name: "Workspace note" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect(getByRole(node, "region", { name: "Workspace note" }).textContent).toContain(
    bodies.note.body,
  );
});
it("moves the tab stop to the selected tab after an external resource handoff", async () => {
  await mount();
  const browser = getByRole(node, "tab", { name: "Browser" });
  await act(() => {
    browser.focus();
    browser.click();
  });
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  expect(getByRole(node, "tab", { name: "Files" }).tabIndex).toBe(0);
  expect(getByRole(node, "tab", { name: "Browser" }).tabIndex).toBe(-1);
});
it("returns dock close focus to the Resources header trigger", async () => {
  await mount();
  const close = getByRole(node, "button", { name: "Close resources" });
  await act(() => {
    close.focus();
    close.click();
  });
  expect(document.activeElement).toBe(getByRole(node, "button", { name: "Resources" }));
});

it("retains the tool during Linked context and restores the same resource request on Back", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  expect(bodies.active).toBe(1);
  expect(getByRole(node, "tabpanel").textContent).toContain("handoff");
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  expect(bodies.active).toBe(1);
  expect(queryByRole(node, "tabpanel")).toBeNull();
  await act(() => getByRole(node, "button", { name: "Back to resources" }).click());
  expect(bodies.active).toBe(1);
  expect(bodies.max).toBe(1);
  expect(getByRole(node, "tabpanel").textContent).toContain("handoff");
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "a project",
  );
  expect(document.activeElement).toBe(getByRole(node, "button", { name: "Resources" }));
});
it("keeps the empty linked-context explanation reachable beside live resources", async () => {
  await mount(<App linked={null} />);
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
    "Select an item to see its linked context.",
  );
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
});
it("transfers open resources on resize and restores the saved wide visibility after compact dismissal", async () => {
  await mount();
  // Prime happy-dom's media listeners with the initial wide match before resizing.
  await act(() => window.dispatchEvent(new Event("resize")));
  const resize = async (width: number) => {
    await act(() => {
      (
        window as unknown as {
          happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
        }
      ).happyDOM.setWindowSize({ width, height: 800 });
    });
  };
  await resize(390);
  expect(getByRole(document.body, "dialog", { name: "Resources" })).toBeDefined();
  expect(
    getByRole(node, "button", { name: "Resources", hidden: true }).getAttribute("aria-expanded"),
  ).toBe("true");
  await resize(1280);
  expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  await resize(390);
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(document.body, "dialog", { name: "Resources" })).toBeDefined();
  await resize(1280);
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
});
it.each(["Docs", "PRs"])("styles the %s fallback with existing muted text tokens", async (tab) => {
  bodies.toolsAvailable = false;
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  await act(() => getByRole(node, "tab", { name: tab }).click());
  const paragraph = getByRole(node, "tabpanel").querySelector("p")!;
  expect(paragraph.classList.contains("text-sm")).toBe(true);
  expect(paragraph.classList.contains("text-muted-foreground")).toBe(true);
});
it("keeps deleted selections unavailable until explicitly recovered", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  await act(() => root!.render(<App unavailable />));
  expect(node.textContent).toContain("This project is unavailable");
  expect(bodies.active).toBe(0);
});

it("keeps focus on the Linked context trigger when toggled closed", async () => {
  await mount();
  const trigger = getByRole(node, "button", { name: "Linked context" });
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  await act(() => trigger.click());
  expect(document.activeElement).toBe(trigger);
});

it("hands an exact native note to Docs, saves with its captured revision, keeps conflict drafts and restores deletion", async () => {
  bodies.start.mockReset();
  bodies.noteReads.mockClear();
  await mount();
  await act(async () => {
    await import("./meetings/WorkspaceNoteView");
    await import("../../state/workspaceNotes");
    getByRole(node, "button", { name: "Open note" }).click();
  });
  expect(getByRole(node, "tab", { name: "Docs" }).getAttribute("aria-selected")).toBe("true");
  expect(getByRole(node, "region", { name: "Workspace note" }).textContent).toContain(
    bodies.note.body,
  );
  expect(bodies.noteReads).toHaveBeenLastCalledWith({
    environmentId: a,
    input: { id: bodies.note.id },
  });
  await act(() => getByRole(node, "button", { name: "Edit note" }).click());
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note title" }), {
      target: { value: "Local proposal" },
    }),
  );
  bodies.start.mockResolvedValueOnce({
    _tag: "Failure",
    cause: Cause.fail(new Error("This note changed. Your draft has been kept.")),
  });
  await act(() =>
    node
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(bodies.start).toHaveBeenLastCalledWith("update", {
    environmentId: a,
    input: {
      id: bodies.note.id,
      requestId: expect.any(String),
      title: "Local proposal",
      body: bodies.note.body,
      expectedRevision: 3,
    },
  });
  expect(getByRole(node, "alert").textContent).toContain("draft has been kept");
  expect(getByRole(node, "textbox", { name: "Note text" })).toBeDefined();
  await act(() => getByRole(node, "button", { name: "Cancel" }).click());
  expect(node.textContent).toContain("Discard unsaved changes?");
  await act(() => getByRole(node, "button", { name: "Keep editing" }).click());
  await act(() => getByRole(node, "button", { name: "Reload current note" }).click());
  await act(() => getByRole(node, "button", { name: "Discard changes" }).click());
  bodies.start.mockResolvedValue({ _tag: "Success", value: undefined });
  await act(() => getByRole(node, "button", { name: "Delete note" }).click());
  expect(bodies.start).toHaveBeenLastCalledWith("delete", {
    environmentId: a,
    input: { id: bodies.note.id, requestId: expect.any(String), expectedRevision: 3 },
  });
  expect(node.textContent).toContain("Their links have been kept");
  await act(() => getByRole(node, "button", { name: "Undo delete" }).click());
  expect(bodies.start).toHaveBeenLastCalledWith("restore", {
    environmentId: a,
    input: { id: bodies.note.id, requestId: expect.any(String), expectedRevision: 4 },
  });
  expect(node.textContent).toContain(bodies.note.body);
  const reads = bodies.noteReads.mock.calls.length;
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  expect(document.activeElement).toBe(getByRole(node, "button", { name: "Resources" }));
  expect(bodies.noteReads).toHaveBeenCalledTimes(reads);
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(node, "tab", { name: "Docs" }).getAttribute("aria-selected")).toBe("true");
  expect(node.textContent).toContain(bodies.note.body);
  expect(bodies.writes).not.toHaveBeenCalled();
});
it("unmounts note reads when disconnected and keeps read-only writes disabled after reconnect", async () => {
  bodies.operate = false;
  bodies.connected = true;
  bodies.start.mockReset();
  bodies.noteReads.mockClear();
  try {
    await mount();
    await act(async () => {
      await import("./meetings/WorkspaceNoteView");
      await import("../../state/workspaceNotes");
      getByRole(node, "button", { name: "Open note" }).click();
    });
    const edit = getByRole(node, "button", { name: "Edit note" }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    await act(() => edit.click());
    expect(bodies.start).not.toHaveBeenCalled();
    const reads = bodies.noteReads.mock.calls.length;
    await act(() => {
      bodies.connected = false;
      for (const listener of bodies.connectionListeners) listener();
    });
    expect(bodies.noteReads).toHaveBeenCalledTimes(reads);
    expect(node.textContent).toContain("Notes are unavailable. Their links have been kept.");
    await act(() => {
      bodies.connected = true;
      for (const listener of bodies.connectionListeners) listener();
    });
    expect(node.textContent).toContain(bodies.note.body);
    expect((getByRole(node, "button", { name: "Delete note" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(bodies.start).not.toHaveBeenCalled();
  } finally {
    bodies.operate = true;
    bodies.connected = true;
  }
});

async function editNote(body = "Unsaved navigation draft", app: ReactNode = <App />) {
  await mount(app);
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  await act(() => getByRole(node, "button", { name: "Edit note" }).click());
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: body },
    }),
  );
}
async function closeAndReopenNote() {
  const reads = bodies.noteReads.mock.calls.length;
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  expect(bodies.noteReads).toHaveBeenCalledTimes(reads);
  expect(bodies.noteListeners.size).toBe(0);
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
}
it("retains a dirty note across resource close and reopen", async () => {
  await editNote();
  await closeAndReopenNote();
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Unsaved navigation draft",
  );
});
it("retains a dirty note when switching from Docs to Files and back", async () => {
  await editNote(
    "Unsaved navigation draft",
    <App
      selectedItem={{
        ref: {
          type: "provider-resource",
          provider: "workspace-note",
          resourceId: bodies.note.id,
        },
      }}
    />,
  );
  await act(() => getByRole(node, "tab", { name: "Files" }).click());
  expect(bodies.noteListeners.size).toBe(0);
  await act(() => getByRole(node, "tab", { name: "Docs" }).click());
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Unsaved navigation draft",
  );
});
it("retains a conflict draft and its identical retry request across close", async () => {
  await editNote();
  bodies.start.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceNotesError({
        kind: "conflict",
        message: "This note changed. Your draft has been kept.",
      }),
    ),
  });
  await act(() => getByRole(node, "button", { name: "Save note" }).click());
  const captured = bodies.start.mock.calls.at(-1);
  await closeAndReopenNote();
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Unsaved navigation draft",
  );
  expect(getByRole(node, "alert").textContent).toContain("draft has been kept");
  await act(() => getByRole(node, "button", { name: "Save note" }).click());
  expect(bodies.start.mock.calls.at(-1)).toEqual(captured);
});

it("isolates drafts by note and environment while retaining them across project changes", async () => {
  await editNote("Environment a first note");
  await act(() => getByRole(node, "button", { name: "Open note in other project" }).click());
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Environment a first note",
  );
  await act(() => getByRole(node, "button", { name: "Open second note" }).click());
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Edit note" }).click());
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: "Second note draft" },
    }),
  );
  await act(() => root!.render(<App environmentId={EnvironmentId.make("b")} />));
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Edit note" }).click());
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: "Environment b draft" },
    }),
  );
  await act(() => root!.render(<App />));
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Environment a first note",
  );
  await act(() => getByRole(node, "button", { name: "Open second note" }).click());
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Second note draft",
  );
});
it("settles a delayed save only in the captured note after its body unmounts", async () => {
  await editNote();
  let settle!: (result: { _tag: "Success"; value: undefined }) => void;
  bodies.start.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  await act(() => getByRole(node, "button", { name: "Save note" }).click());
  expect(bodies.start.mock.calls.at(-1)?.[1]).toMatchObject({
    environmentId: a,
    input: { id: bodies.note.id },
  });
  await closeAndReopenNote();
  expect((getByRole(node, "button", { name: "Save note" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(() => getByRole(node, "button", { name: "Open second note" }).click());
  await act(() => getByRole(node, "button", { name: "Edit note" }).click());
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: "Keep second draft" },
    }),
  );
  await act(() => settle({ _tag: "Success", value: undefined }));
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Keep second draft",
  );
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
});
it("settles a closed pending failure and retries its original request after reopening", async () => {
  await editNote();
  let settle!: (result: unknown) => void;
  bodies.start.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  await act(() => getByRole(node, "button", { name: "Save note" }).click());
  const captured = bodies.start.mock.calls.at(-1);
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  await act(() =>
    settle({ _tag: "Failure", cause: Cause.fail(new Error("Disconnected during save")) }),
  );
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(node, "alert").textContent).toContain("Disconnected during save");
  bodies.start.mockResolvedValueOnce({ _tag: "Success", value: undefined });
  await act(() => getByRole(node, "button", { name: "Save note" }).click());
  expect(bodies.start.mock.calls.at(-1)).toEqual(captured);
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
});
it("shows a typed restore conflict and hides Undo when a newer active revision arrives", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  bodies.start.mockResolvedValueOnce({ _tag: "Success", value: undefined });
  await act(() => getByRole(node, "button", { name: "Delete note" }).click());
  await closeAndReopenNote();
  bodies.start.mockResolvedValueOnce({
    _tag: "Failure",
    cause: Cause.fail(new WorkspaceNotesError({ kind: "conflict", message: "Stale tombstone" })),
  });
  await act(() => getByRole(node, "button", { name: "Undo delete" }).click());
  expect(getByRole(node, "alert").textContent).toBe(
    "This note was changed or already restored. Reload it.",
  );
  expect(getByRole(node, "button", { name: "Undo delete" })).toBeDefined();
  bodies.notes.set(JSON.stringify([a, bodies.note.id]), {
    ...bodies.note,
    id: bodies.note.id as WorkspaceNote["id"],
    revision: 5,
    body: "Restored elsewhere",
  });
  await act(() => {
    bodies.noteVersion++;
    for (const listener of bodies.noteListeners) listener();
  });
  expect(bodies.refresh).toHaveBeenCalled();
  expect(queryByRole(node, "button", { name: "Undo delete" })).toBeNull();
  expect(node.textContent).toContain("Restored elsewhere");
});
it("drops edit sessions when the workspace provider is disposed", async () => {
  await editNote();
  await act(() => root!.unmount());
  root = createRoot(node);
  await act(() => root!.render(<App />));
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
});
