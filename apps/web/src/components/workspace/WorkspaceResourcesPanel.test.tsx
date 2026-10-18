// @vitest-environment happy-dom
import * as Cause from "effect/Cause";
import { openMeetingNote } from "./meetings/meetingNotes";
import { act, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ThreadPullRequestLink,
  type WorkspaceLinkList,
  WorkspaceNotesError,
  type WorkspaceNote,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
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
  linkReads: vi.fn(),
  hubReads: vi.fn(),
  linkData: new Map<string, WorkspaceLinkList>(),
  linkErrors: new Map<string, string>(),
  linkVersion: 0,
  linkListeners: new Map<string, Set<() => void>>(),
  linksAvailable: true,
  canPreview: true,
  checkout: true,
  linkMode: "multiple" as "multiple" | "single" | "unsupported",
  navigate: vi.fn(),
  onOpen: vi.fn(),
}));
function subscribeEnvironment(listener: () => void) {
  bodies.connectionListeners.add(listener);
  return () => {
    bodies.connectionListeners.delete(listener);
  };
}
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
vi.mock("../../state/entities", () => ({
  useThreadShells: () => [
    {
      environmentId: a,
      projectId: p,
      id: ThreadId.make("source-a"),
      title: "Design",
      pullRequests: [pullRequest],
      linkedPullRequest: null,
    },
  ],
  useAllEnvironmentShellsBootstrapped: () => true,
  useProjects: () => {
    useSyncExternalStore(subscribeEnvironment, () => bodies.checkout);
    return bodies.checkout
      ? [a, b].map((environmentId) => ({
          environmentId,
          id: p,
          repositoryIdentity: {
            provider: "github",
            canonicalKey: "github.com/synkek/site",
            displayName: "synkek/site",
            locator: { remoteUrl: "https://github.com/synkek/site.git" },
          },
        }))
      : [];
  },
  useServerConfigs: () => {
    useSyncExternalStore(subscribeEnvironment, () => `${bodies.canPreview}:${bodies.linkMode}`);
    return new Map(
      [a, b].map((id) => [
        id,
        {
          environment: {
            capabilities: {
              pullRequests: bodies.canPreview,
              threadPullRequests: bodies.linkMode === "multiple",
              threadPullRequestLinking: bodies.linkMode === "single",
            },
          },
        },
      ]),
    );
  },
  useProject: () => null,
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: (input: unknown) => {
      bodies.linkReads(input);
      return `links:${JSON.stringify(input)}`;
    },
    projectHub: (input: unknown) => {
      bodies.hubReads(input);
      return "hub";
    },
    link: "workspace-link",
    unlink: "workspace-unlink",
  },
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => {
    useSyncExternalStore(
      subscribeEnvironment,
      () => `${bodies.linksAvailable}:${bodies.toolsAvailable}`,
    );
    return {
      ready: true,
      workspaceTools: bodies.toolsAvailable,
      workspaceLinks: bodies.linksAvailable,
    };
  },
}));
vi.mock("../../state/threads", () => ({
  threadEnvironment: {
    linkPullRequest: "native-link",
    unlinkPullRequest: "native-unlink",
    updateMetadata: "legacy-update",
  },
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => {
    useSyncExternalStore(subscribeEnvironment, () => bodies.operate);
    return {
      data: {
        authenticated: true,
        scopes: bodies.operate ? ["orchestration:operate"] : [],
      },
    };
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => bodies.navigate }));
vi.mock("../../browser/useOpenLink", () => ({ useOpenLink: () => vi.fn() }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: string) => (value: unknown) => {
    if (
      ![
        "update",
        "delete",
        "restore",
        "workspace-link",
        "workspace-unlink",
        "native-link",
        "native-unlink",
        "legacy-update",
      ].includes(name)
    )
      throw new Error(`Unexpected command: ${name}`);
    if (name.startsWith("workspace-")) bodies.writes(name, value);
    return bodies.start(name, value);
  },
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
        if (typeof query === "string" && query.startsWith("links:")) {
          const listeners = bodies.linkListeners.get(query) ?? new Set<() => void>();
          bodies.linkListeners.set(query, listeners);
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        }
        if (typeof query !== "string" || !query.startsWith("note:")) return () => {};
        bodies.noteListeners.add(listener);
        return () => {
          bodies.noteListeners.delete(listener);
        };
      },
      () =>
        typeof query === "string" && query.startsWith("links:")
          ? bodies.linkVersion
          : bodies.noteVersion,
    );
    return {
      data:
        query === "config"
          ? { source: "live", config: { pulseCapabilities: { workspaceNotes: true } } }
          : typeof query === "string" && query.startsWith("links:")
            ? (bodies.linkData.get(query) ?? null)
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
      error: typeof query === "string" ? (bodies.linkErrors.get(query) ?? null) : null,
      isPending:
        typeof query === "string" && query.startsWith("links:") && !bodies.linkData.has(query),
      refresh: bodies.refresh,
    };
  },
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => b,
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
const a = EnvironmentId.make("a");
const b = EnvironmentId.make("b");
const p = ProjectId.make("project");
const pullRequest: ThreadPullRequestLink = {
  host: "github.com",
  repository: "synkek/site",
  number: 42,
  url: "https://GITHUB.COM/synkek/site/pull/42/files#diff",
  source: "manual",
  linkedAt: "2026-10-13T07:00:00Z",
  snapshot: null,
  stack: null,
};
const linkQuery = (environmentId = a, projectId = p) =>
  `links:${JSON.stringify({
    environmentId,
    input: { item: { type: "project", projectId } },
  })}`;
const projectLinks: WorkspaceLinkList = {
  linked: [
    {
      id: "wl_00000000-0000-0000-0000-000000000001",
      item: { ref: { type: "url", url: "https://github.com/synkek/site/pull/42" } },
      status: "confirmed",
      source: { type: "user" },
      updatedAt: "2026-10-13T07:00:00Z",
    },
  ],
  suggested: [],
  truncated: false,
};
beforeEach(() => {
  bodies.linkData.set(linkQuery(), projectLinks);
  bodies.linkData.set(linkQuery(b), { linked: [], suggested: [], truncated: false });
  bodies.start.mockReset();
  bodies.start.mockResolvedValue({ _tag: "Success", value: undefined });
});
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
  bodies.linkData.clear();
  bodies.linkErrors.clear();
  bodies.linkListeners.clear();
  bodies.linksAvailable = true;
  bodies.canPreview = true;
  bodies.checkout = true;
  bodies.linkMode = "multiple";
  bodies.operate = true;
  bodies.connected = true;
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
            tab: "prs",
            request: { type: "url", url: "https://github.com/synkek/site/pull/52" },
          })
        }
      >
        Open pull request
      </button>
      <button
        onClick={() =>
          openResource({
            projectId: ProjectId.make("other"),
            tab: "prs",
          })
        }
      >
        Open PRs in other project
      </button>
      <button
        onClick={() =>
          openResource({
            projectId: ProjectId.make("other"),
            tab: "docs",
            request: { type: "file", provider: "google-drive", fileId: "other-doc" },
          })
        }
      >
        Open other project's document
      </button>
      <button onClick={() => openResource({ projectId: p, tab: "docs" })}>Show documents</button>
      <button onClick={() => openResource({ projectId: ProjectId.make("other"), tab: "docs" })}>
        Show other project's documents
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
            onOpen={bodies.onOpen}
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
        <p aria-label="Center item">
          {selectedItem?.ref.type === "url" ? (
            <a href={selectedItem.ref.url}>{selectedItem.title ?? selectedItem.ref.url}</a>
          ) : (
            (selectedItem?.title ?? "No center selection")
          )}
        </p>
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
it("styles the Docs fallback with existing muted text tokens", async () => {
  bodies.linksAvailable = false;
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  await act(() => getByRole(node, "tab", { name: "Docs" }).click());
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
  await act(() => {
    root!.render(<App />);
    for (const listener of bodies.connectionListeners) listener();
  });
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
  await act(() => {
    root!.render(<App />);
    for (const listener of bodies.connectionListeners) listener();
  });
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
});

it("returns to a requested note and draft with an unrelated center URL after PRs", async () => {
  const selectedItem: WorkspaceLinkEndpoint = {
    ref: { type: "url", url: "https://example.invalid/independent-center" },
    title: "Unrelated center URL",
  };
  await mount(<App selectedItem={selectedItem} />);
  await act(async () => {
    await import("./WorkspaceDocsPanel");
    await import("./meetings/WorkspaceNoteView");
    await import("../../state/workspaceNotes");
    await import("./WorkspacePullRequestsPanel");
  });
  expect(bodies.linkReads).not.toHaveBeenCalled();
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  await act(() => getByRole(node, "button", { name: "Edit note" }).click());
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: "Keep this Docs draft" },
    }),
  );
  const noteReads = bodies.noteReads.mock.calls.length;
  await act(() => getByRole(node, "tab", { name: "PRs" }).click());
  expect(getByRole(node, "region", { name: "Project pull requests" }).textContent).toMatch(
    /Project link.*Design/,
  );
  expect(queryByRole(node, "region", { name: "Workspace note" })).toBeNull();
  expect(bodies.noteListeners.size).toBe(0);
  expect(bodies.noteReads).toHaveBeenCalledTimes(noteReads);
  expect(
    [...bodies.linkListeners.values()].reduce((count, listeners) => count + listeners.size, 0),
  ).toBe(1);
  expect(
    bodies.linkReads.mock.calls.every(([input]) => JSON.stringify(input) === linkQuery().slice(6)),
  ).toBe(true);
  expect(bodies.hubReads).not.toHaveBeenCalled();
  expect(getAllByRole(node, "tabpanel")).toHaveLength(1);
  expect(bodies.files).not.toHaveBeenCalled();
  expect(bodies.browser).not.toHaveBeenCalled();
  await act(() => getByRole(node, "button", { name: "Open in Code" }).click());
  expect(bodies.navigate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      to: "/pull-requests",
      search: expect.objectContaining({
        selectedEnvironmentId: a,
        selectedProjectId: p,
        number: 42,
      }),
    }),
  );
  expect(bodies.start).not.toHaveBeenCalled();
  expect(bodies.writes).not.toHaveBeenCalled();
  expect(bodies.onOpen).not.toHaveBeenCalled();
  const reads = bodies.linkReads.mock.calls.length;
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  expect([...bodies.linkListeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  expect(bodies.linkReads).toHaveBeenCalledTimes(reads);
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(node, "tab", { name: "PRs" }).getAttribute("aria-selected")).toBe("true");
  expect(getByRole(node, "region", { name: "Project pull requests" })).toBeDefined();
  await act(() => getByRole(node, "tab", { name: "Docs" }).click());
  expect(queryByRole(node, "region", { name: "Project pull requests" })).toBeNull();
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Keep this Docs draft",
  );
  expect([...bodies.linkListeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  expect(node.querySelector('[aria-label="Center item"]')?.textContent).toBe(
    "Unrelated center URL",
  );
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "a project",
  );
  expect(getByRole(node, "link", { name: "Unrelated center URL" }).getAttribute("href")).toBe(
    "https://example.invalid/independent-center",
  );
  expect(bodies.start).not.toHaveBeenCalled();
  await closeAndReopenNote();
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Keep this Docs draft",
  );
  const resumedReads = bodies.noteReads.mock.calls.length;
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  expect(bodies.noteListeners.size).toBe(0);
  expect(bodies.noteReads).toHaveBeenCalledTimes(resumedReads);
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(bodies.noteListeners.size).toBe(1);
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Keep this Docs draft",
  );
});

async function openPullRequests(app: ReactNode = <App />) {
  await mount(app);
  await act(async () => {
    await import("./WorkspacePullRequestsPanel");
    getByRole(node, "button", { name: "Open pull request" }).click();
  });
}

it("passes a PR request ahead of the selected item and never links on selection", async () => {
  await openPullRequests(
    <App
      selectedItem={{
        ref: { type: "url", url: "https://github.com/synkek/site/pull/51" },
        title: "Center URL",
      }}
    />,
  );
  await act(() => getByRole(node, "button", { name: "Link pull request" }).click());
  expect((getByRole(node, "textbox", { name: "Pull request URL" }) as HTMLInputElement).value).toBe(
    "https://github.com/synkek/site/pull/52",
  );
  expect(node.querySelector('[aria-label="Center item"]')?.textContent).toBe("Center URL");
  expect(bodies.start).not.toHaveBeenCalled();
  expect(bodies.onOpen).not.toHaveBeenCalled();
});

it("uses the selected PR URL when a tab switch has no request", async () => {
  await openPullRequests(
    <App
      selectedItem={{
        ref: { type: "url", url: "https://github.com/synkek/site/pull/51" },
        title: "Center URL",
      }}
    />,
  );
  await act(() => getByRole(node, "tab", { name: "Files" }).click());
  await act(() => getByRole(node, "tab", { name: "PRs" }).click());
  await act(() => getByRole(node, "button", { name: "Link pull request" }).click());
  expect((getByRole(node, "textbox", { name: "Pull request URL" }) as HTMLInputElement).value).toBe(
    "https://github.com/synkek/site/pull/51",
  );
  expect(bodies.start).not.toHaveBeenCalled();
});

it("denies link and both source unlink actions after operate permission is revoked", async () => {
  await openPullRequests();
  await act(() => getByRole(node, "button", { name: "Sources for synkek/site #42" }).click());
  await act(() => getByRole(node, "button", { name: "Link pull request" }).click());
  bodies.operate = false;
  await act(() => {
    root!.render(<App />);
    for (const listener of bodies.connectionListeners) listener();
  });
  for (const name of [
    "Link pull request",
    "Link",
    "Unlink from Design",
    "Unlink from project link",
  ]) {
    const button = getByRole(node, "button", { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(() => button.click());
  }
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Link pull request" })));
  expect(bodies.start).not.toHaveBeenCalled();
  expect(bodies.writes).not.toHaveBeenCalled();
  expect(getByRole(node, "link", { name: "Open on host" })).toBeDefined();
  bodies.operate = true;
  await act(() => {
    root!.render(<App />);
    for (const listener of bodies.connectionListeners) listener();
  });
  await act(() => getByRole(node, "button", { name: "Unlink from project link" }).click());
  expect(bodies.start).toHaveBeenCalledExactlyOnceWith("workspace-unlink", {
    environmentId: a,
    input: { id: projectLinks.linked[0]!.id },
  });
});

it("suspends PR reads while Linked context hides the retained body and resumes only on return", async () => {
  await openPullRequests();
  const reads = bodies.linkReads.mock.calls.length;
  expect(reads).toBeGreaterThan(0);
  expect(bodies.linkListeners.get(linkQuery())?.size).toBe(1);
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  expect(queryByRole(node, "tabpanel")).toBeNull();
  expect(bodies.linkListeners.get(linkQuery())?.size).toBe(0);
  await act(() => {
    bodies.linkVersion++;
    for (const listeners of bodies.linkListeners.values())
      for (const listener of listeners) listener();
    bodies.connected = false;
    for (const listener of bodies.connectionListeners) listener();
  });
  await act(() => {
    bodies.connected = true;
    for (const listener of bodies.connectionListeners) listener();
  });
  expect(bodies.linkReads).toHaveBeenCalledTimes(reads);
  expect(bodies.noteReads).not.toHaveBeenCalled();
  expect(bodies.hubReads).not.toHaveBeenCalled();
  await act(() => getByRole(node, "button", { name: "Back to resources" }).click());
  expect(getByRole(node, "region", { name: "Project pull requests" })).toBeDefined();
  expect(bodies.linkListeners.get(linkQuery())?.size).toBe(1);
  expect(bodies.start).not.toHaveBeenCalled();
});

it("keeps host links but denies reads and mutations on disconnect and workspace-link capability loss", async () => {
  await openPullRequests();
  await act(() => getByRole(node, "button", { name: "Sources for synkek/site #42" }).click());
  await act(() => getByRole(node, "button", { name: "Link pull request" }).click());
  const reads = bodies.linkReads.mock.calls.length;
  await act(() => {
    bodies.connected = false;
    for (const listener of bodies.connectionListeners) listener();
  });
  expect(getByRole(node, "alert").textContent).toContain("disconnected");
  expect(getByRole(node, "link", { name: "Open on host" }).getAttribute("href")).toBe(
    "https://github.com/synkek/site/pull/42",
  );
  expect((getByRole(node, "button", { name: "Open in Code" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(
    (getByRole(node, "button", { name: "Unlink from Design" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Link pull request" })));
  await act(() => getByRole(node, "button", { name: "Retry" }).click());
  expect(bodies.refresh).not.toHaveBeenCalled();
  expect(bodies.linkReads).toHaveBeenCalledTimes(reads);
  expect(bodies.linkListeners.get(linkQuery())?.size).toBe(0);
  await act(() => {
    bodies.connected = true;
    for (const listener of bodies.connectionListeners) listener();
  });
  expect((getByRole(node, "button", { name: "Open in Code" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  const restoredReads = bodies.linkReads.mock.calls.length;
  bodies.linksAvailable = false;
  await act(() => {
    root!.render(<App />);
    for (const listener of bodies.connectionListeners) listener();
  });
  expect(getByRole(node, "alert").textContent).toContain("newer server");
  expect(bodies.linkReads).toHaveBeenCalledTimes(restoredReads);
  expect(bodies.linkListeners.get(linkQuery())?.size).toBe(0);
  expect(
    (getByRole(node, "button", { name: "Unlink from project link" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Link pull request" })));
  expect(bodies.start).not.toHaveBeenCalled();
  expect(bodies.navigate).not.toHaveBeenCalled();
});

it.each(["capability", "checkout"])(
  "uses the host fallback when PR %s disappears",
  async (reason) => {
    await openPullRequests();
    expect(
      (getByRole(node, "button", { name: "Open in Code" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    if (reason === "capability") bodies.canPreview = false;
    else bodies.checkout = false;
    await act(() => {
      root!.render(<App />);
      for (const listener of bodies.connectionListeners) listener();
    });
    const code = getByRole(node, "button", { name: "Open in Code" }) as HTMLButtonElement;
    expect(code.disabled).toBe(true);
    await act(() => code.click());
    expect(getByRole(node, "link", { name: "Open on host" }).getAttribute("href")).toContain(
      "/pull/42",
    );
    expect(bodies.navigate).not.toHaveBeenCalled();
    expect(bodies.start).not.toHaveBeenCalled();
  },
);

it("honors a native-link capability downgrade instead of displaying cached modern sources", async () => {
  await openPullRequests();
  expect(getByRole(node, "region", { name: "Project pull requests" }).textContent).toContain(
    "Design",
  );
  bodies.linkMode = "single";
  await act(() => {
    root!.render(<App />);
    for (const listener of bodies.connectionListeners) listener();
  });
  expect(getByRole(node, "region", { name: "Project pull requests" }).textContent).not.toContain(
    "Design",
  );
  expect(getByRole(node, "link", { name: "Open on host" })).toBeDefined();
  bodies.linkMode = "unsupported";
  await act(() => {
    root!.render(<App />);
    for (const listener of bodies.connectionListeners) listener();
  });
  expect(getByRole(node, "region", { name: "Project pull requests" }).textContent).toContain(
    "Via Project link",
  );
  expect(bodies.start).not.toHaveBeenCalled();
});

it.each(["project", "environment"])(
  "clears open PR controls on %s change and ignores an old-scope query completion",
  async (change) => {
    bodies.linkData.delete(linkQuery());
    let finishRead!: (value: WorkspaceLinkList) => void;
    const delivery = new Promise<WorkspaceLinkList>((resolve) => {
      finishRead = resolve;
    }).then((data) => {
      bodies.linkData.set(linkQuery(), data);
      bodies.linkVersion++;
      for (const listeners of bodies.linkListeners.values())
        for (const listener of listeners) listener();
    });
    await openPullRequests();
    expect(getByRole(node, "status").textContent).toContain("Loading linked pull requests");
    await act(() => getByRole(node, "button", { name: "Sources for synkek/site #42" }).click());
    await act(() => getByRole(node, "button", { name: "Link pull request" }).click());
    await act(() =>
      fireEvent.change(getByRole(node, "textbox", { name: "Pull request URL" }), {
        target: { value: "https://github.com/synkek/site/pull/99" },
      }),
    );
    const nextEnvironment = change === "environment" ? b : a;
    const nextProject = change === "project" ? ProjectId.make("other") : p;
    bodies.linkData.set(linkQuery(nextEnvironment, nextProject), {
      ...projectLinks,
      linked: [
        {
          ...projectLinks.linked[0]!,
          item: { ref: { type: "url", url: "https://github.com/synkek/site/pull/71" } },
        },
      ],
    });
    if (change === "environment") {
      await act(() => root!.render(<App environmentId={b} />));
      await act(() => getByRole(node, "button", { name: "Open pull request" }).click());
    } else {
      await act(() => getByRole(node, "button", { name: "Open PRs in other project" }).click());
    }
    expect(bodies.linkListeners.get(linkQuery())?.size).toBe(0);
    expect(bodies.linkListeners.get(linkQuery(nextEnvironment, nextProject))?.size).toBe(1);
    expect(queryByRole(node, "textbox", { name: "Pull request URL" })).toBeNull();
    expect(queryByRole(node, "group", { name: /Unlink sources/ })).toBeNull();
    await act(async () => {
      finishRead({
        ...projectLinks,
        linked: [
          {
            ...projectLinks.linked[0]!,
            item: { ref: { type: "url", url: "https://github.com/synkek/site/pull/99" } },
          },
        ],
      });
      await delivery;
    });
    const collection = getByRole(node, "region", { name: "Project pull requests" });
    expect(collection.textContent).toContain("#71");
    expect(collection.textContent).not.toMatch(/#42|#99|Design/);
    await act(() => getByRole(node, "button", { name: "Link pull request" }).click());
    expect(
      (getByRole(node, "textbox", { name: "Pull request URL" }) as HTMLInputElement).value,
    ).toBe(change === "environment" ? "https://github.com/synkek/site/pull/52" : "");
    expect(bodies.start).not.toHaveBeenCalled();
  },
);

it.each(["native", "project"])(
  "keeps the captured %s unlink authority when environment and project change during the action",
  async (source) => {
    await openPullRequests();
    let settle!: (result: unknown) => void;
    bodies.start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    await act(() => getByRole(node, "button", { name: "Sources for synkek/site #42" }).click());
    await act(() =>
      getByRole(node, "button", {
        name: source === "native" ? "Unlink from Design" : "Unlink from project link",
      }).click(),
    );
    expect(bodies.start).toHaveBeenCalledExactlyOnceWith(
      source === "native" ? "native-unlink" : "workspace-unlink",
      {
        environmentId: a,
        input:
          source === "native"
            ? { threadId: "source-a", host: "github.com", repository: "synkek/site", number: 42 }
            : { id: projectLinks.linked[0]!.id },
      },
    );
    await act(() => getByRole(node, "button", { name: "Open PRs in other project" }).click());
    await act(() => root!.render(<App environmentId={b} />));
    await act(() => getByRole(node, "button", { name: "Open pull request" }).click());
    await act(() =>
      settle({ _tag: "Failure", cause: Cause.fail(new Error("Old environment denied unlink")) }),
    );
    expect(queryByRole(node, "alert")).toBeNull();
    expect(getByRole(node, "region", { name: "Project pull requests" }).textContent).toContain(
      "No linked pull requests",
    );
    expect(
      (getByRole(node, "button", { name: "Link pull request" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(bodies.start).toHaveBeenCalledTimes(1);
    expect(bodies.linkData.get(linkQuery())?.linked).toHaveLength(1);
    expect(bodies.linkData.get(linkQuery(b))?.linked).toHaveLength(0);
  },
);

it("keeps project-query authentication errors on their owning environment at the real switch", async () => {
  bodies.linkErrors.set(linkQuery(), "Authentication required in a");
  await openPullRequests();
  expect(getByRole(node, "alert").textContent).toContain("Authentication required in a");
  expect((getByRole(node, "button", { name: "Open in Code" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(() => getByRole(node, "button", { name: "Retry" }).click());
  expect(bodies.refresh).toHaveBeenCalledOnce();
  expect(bodies.linkReads.mock.calls.every(([input]) => input.environmentId === a)).toBe(true);
  expect(bodies.start).not.toHaveBeenCalled();
  expect(bodies.navigate).not.toHaveBeenCalled();
});

it.each(["Open note", "Open document"])(
  "keeps Back to documents cleared across tab and close remounts after %s",
  async (entrance) => {
    await mount();
    await act(() => getByRole(node, "button", { name: entrance }).click());
    expect(getByRole(node, "button", { name: "Back to documents" })).toBeDefined();
    await act(() => getByRole(node, "button", { name: "Back to documents" }).click());
    expect(getByRole(node, "heading", { name: "Documents" })).toBeDefined();
    expect(bodies.noteListeners.size).toBe(0);
    await act(() => getByRole(node, "tab", { name: "PRs" }).click());
    await act(() => getByRole(node, "tab", { name: "Docs" }).click());
    await closeAndReopenNote();
    expect(getByRole(node, "heading", { name: "Documents" })).toBeDefined();
    expect(queryByRole(node, "button", { name: "Back to documents" })).toBeNull();
    await act(() => getByRole(node, "button", { name: entrance }).click());
    expect(getByRole(node, "button", { name: "Back to documents" })).toBeDefined();
    expect(bodies.start).not.toHaveBeenCalled();
  },
);

it("retains a list-selected Drive address while fresh document and center intents win", async () => {
  bodies.linkData.set(linkQuery(), {
    linked: [
      {
        ...projectLinks.linked[0]!,
        item: {
          ref: { type: "file", provider: "google-drive", fileId: "listed-doc" },
          title: "Listed brief",
        },
      },
    ],
    suggested: [],
    truncated: false,
  });
  const center: WorkspaceLinkEndpoint = {
    ref: { type: "url", url: "https://example.invalid/center" },
    title: "Center URL",
  };
  await mount(<App selectedItem={center} />);
  await act(() => getByRole(node, "button", { name: "Show documents" }).click());
  await act(() => getByRole(node, "button", { name: "Listed brief" }).click());
  const host = () => getByRole(node, "link", { name: "Open in Google Drive" }).getAttribute("href");
  expect(host()).toContain("listed-doc");
  await act(() => getByRole(node, "tab", { name: "PRs" }).click());
  await act(() => getByRole(node, "tab", { name: "Docs" }).click());
  await closeAndReopenNote();
  expect(host()).toContain("listed-doc");
  await act(() =>
    root!.render(
      <App
        selectedItem={{
          ref: { type: "url", url: "https://example.invalid/another-center" },
          title: "Another center URL",
        }}
      />,
    ),
  );
  expect(host()).toContain("listed-doc");
  await act(() => root!.render(<App />));
  expect(host()).toContain("listed-doc");
  expect(bodies.noteReads).not.toHaveBeenCalled();
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect(getByRole(node, "region", { name: "Workspace note" }).textContent).toContain(
    bodies.note.body,
  );
  await act(() => getByRole(node, "button", { name: "Open document" }).click());
  expect(host()).toContain("doc-handoff");
  expect(bodies.noteListeners.size).toBe(0);
  await act(() => getByRole(node, "tab", { name: "PRs" }).click());
  await act(() => getByRole(node, "tab", { name: "Docs" }).click());
  await act(() =>
    root!.render(
      <App
        selectedItem={{
          ref: { type: "file", provider: "google-drive", fileId: "new-center-doc" },
          title: "New center document",
        }}
      />,
    ),
  );
  expect(host()).toContain("new-center-doc");
  expect(bodies.start).not.toHaveBeenCalled();
  expect(bodies.onOpen).not.toHaveBeenCalled();
});

it("restores Docs selection per environment and project without reopening the document", async () => {
  await editNote("Scope a draft");
  await act(() => getByRole(node, "tab", { name: "PRs" }).click());
  await act(() => getByRole(node, "button", { name: "Show other project's documents" }).click());
  expect(getByRole(node, "heading", { name: "Documents" })).toBeDefined();
  expect(queryByRole(node, "region", { name: "Workspace note" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Open other project's document" }).click());
  expect(getByRole(node, "link", { name: "Open in Google Drive" }).getAttribute("href")).toContain(
    "other-doc",
  );
  await act(() => getByRole(node, "button", { name: "Show documents" }).click());
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Scope a draft",
  );
  await act(() => getByRole(node, "button", { name: "Show other project's documents" }).click());
  expect(getByRole(node, "link", { name: "Open in Google Drive" }).getAttribute("href")).toContain(
    "other-doc",
  );
  await act(() => root!.render(<App environmentId={b} />));
  await act(() => getByRole(node, "button", { name: "Show documents" }).click());
  expect(getByRole(node, "heading", { name: "Documents" })).toBeDefined();
  await act(() => getByRole(node, "button", { name: "Open document" }).click());
  expect(getByRole(node, "link", { name: "Open in Google Drive" }).getAttribute("href")).toContain(
    "doc-handoff",
  );
  await act(() => root!.render(<App />));
  await act(() => getByRole(node, "button", { name: "Show documents" }).click());
  expect((getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value).toBe(
    "Scope a draft",
  );
  expect(queryByRole(node, "link", { name: "Open in Google Drive" })).toBeNull();
  await act(() => root!.render(<App environmentId={b} />));
  await act(() => getByRole(node, "button", { name: "Show documents" }).click());
  expect(getByRole(node, "link", { name: "Open in Google Drive" }).getAttribute("href")).toContain(
    "doc-handoff",
  );
  expect(bodies.noteListeners.size).toBe(0);
  expect(bodies.start).not.toHaveBeenCalled();
});

it("drops retained document selection with its provider instead of persisting it", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open document" }).click());
  expect(getByRole(node, "link", { name: "Open in Google Drive" }).getAttribute("href")).toContain(
    "doc-handoff",
  );
  await act(() => root!.unmount());
  root = createRoot(node);
  await act(() => root!.render(<App />));
  await act(() => getByRole(node, "button", { name: "Show documents" }).click());
  expect(getByRole(node, "heading", { name: "Documents" })).toBeDefined();
  expect(queryByRole(node, "link", { name: "Open in Google Drive" })).toBeNull();
  expect(bodies.start).not.toHaveBeenCalled();
});

it("keeps a center document dismissed after Back until a fresh document request", async () => {
  const selectedItem: WorkspaceLinkEndpoint = {
    ref: { type: "provider-resource", provider: "workspace-note", resourceId: bodies.note.id },
    title: "Center note",
  };
  await mount(<App selectedItem={selectedItem} />);
  await act(() => getByRole(node, "button", { name: "Show documents" }).click());
  expect(getByRole(node, "region", { name: "Workspace note" })).toBeDefined();
  await act(() => getByRole(node, "button", { name: "Back to documents" }).click());
  await act(() => getByRole(node, "tab", { name: "PRs" }).click());
  await act(() => getByRole(node, "tab", { name: "Docs" }).click());
  await closeAndReopenNote();
  expect(getByRole(node, "heading", { name: "Documents" })).toBeDefined();
  expect(bodies.noteListeners.size).toBe(0);
  await act(() => getByRole(node, "button", { name: "Open note" }).click());
  expect(getByRole(node, "region", { name: "Workspace note" })).toBeDefined();
  expect(bodies.noteListeners.size).toBe(1);
});
