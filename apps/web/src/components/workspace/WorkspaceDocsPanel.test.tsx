import { act, useEffect, useState, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  workspaceItemFromUrl,
  workspaceItemKey,
  type WorkspaceLinkView,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import {
  WorkspaceDocsPanel,
  WorkspaceDocsResource,
  type WorkspaceDocSelection,
} from "./WorkspaceDocsPanel";
import {
  useWorkspaceResourceState,
  WorkspaceResourcesProvider,
  WorkspaceResourcesBodyContext,
} from "./workspaceResourceState";
import type { WorkspaceResourceRequest } from "./workspaceResourceState";

const mocks = vi.hoisted(() => ({
  linked: [] as WorkspaceLinkView[],
  related: [] as { item: WorkspaceLinkEndpoint; via: WorkspaceLinkEndpoint }[],
  truncated: false,
  capable: true,
  connected: true,
  read: vi.fn(),
  bind: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  query: vi.fn(),
  activeQueries: new Set<string>(),
  menus: vi.fn(),
  mimeType: "text/plain",
  discoveryAvailable: true,
  refreshBinding: vi.fn(),
  threads: [] as { id: string; projectId: string; environmentId: string }[],
}));
vi.mock("../../state/entities", () => ({
  useThreadShells: () => mocks.threads,
  useProject: () => null,
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (mocks.connected ? ["remote", "other"] : []),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => true }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    driveRead: mocks.capable,
    workspaceLinks: true,
    workspaceItemContext: mocks.discoveryAvailable,
  }),
}));
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: () => ({ linkItem: mocks.link, unlink: mocks.unlink }),
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: (input: object) => ({ kind: "links", ...input }),
    projectHub: (input: object) => ({ kind: "hub", ...input }),
  },
}));
vi.mock("../../state/drive", () => ({
  drive: {
    binding: (input: object) => ({ kind: "binding", ...input }),
    connections: () => ({ kind: "connections" }),
    changes: () => ({ kind: "changes" }),
    read: "read",
    bind: "bind",
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: { kind: string } | null) => {
    const key = query ? JSON.stringify(query) : null;
    useEffect(() => {
      if (key === null) return;
      mocks.activeQueries.add(key);
      return () => {
        mocks.activeQueries.delete(key);
      };
    }, [key]);
    if (query) mocks.query(query);
    return {
      data:
        query?.kind === "links"
          ? { linked: mocks.linked, suggested: [], truncated: mocks.truncated }
          : query?.kind === "hub"
            ? { related: mocks.related, truncated: mocks.truncated }
            : query?.kind === "binding"
              ? {
                  binding: {
                    connectionId: "chosen",
                    file: { id: "file", name: "Brief", mimeType: mocks.mimeType },
                  },
                }
              : query?.kind === "connections"
                ? [{ id: "chosen", nickname: "Chosen account", connected: true }]
                : query?.kind === "changes"
                  ? 0
                  : null,
      error: null,
      isPending: false,
      refresh: query?.kind === "binding" ? mocks.refreshBinding : vi.fn(),
    };
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: string) => (name === "read" ? mocks.read : mocks.bind),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: (props: {
    item: WorkspaceLinkEndpoint;
    confirmed?: readonly WorkspaceLinkEndpoint[];
    children?: ReactNode;
    actions?: ReactNode;
  }) => {
    mocks.menus(props);
    return (
      <div>
        {props.children}
        <details>
          <summary>Item actions</summary>
          {props.actions}
        </details>
      </div>
    );
  },
}));
const environmentId = EnvironmentId.make("remote");
const projectId = ProjectId.make("project");
const document: WorkspaceLinkEndpoint & {
  ref: { type: "file"; provider: "google-drive"; fileId: string };
} = { ref: { type: "file", provider: "google-drive", fileId: "file" }, title: "Brief" };
const direct = (): WorkspaceLinkView => ({
  id: "wsl_00000000-0000-0000-0000-000000000001",
  item: document,
  status: "confirmed",
  source: { type: "user" },
  updatedAt: "2026-10-18T00:00:00Z",
});
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer!.unmount());
  renderer = undefined;
  mocks.linked = [];
  mocks.related = [];
  mocks.truncated = false;
  mocks.capable = true;
  mocks.connected = true;
  mocks.mimeType = "text/plain";
  mocks.discoveryAvailable = true;
  mocks.threads = [];
  mocks.read.mockReset();
  mocks.bind.mockReset();
  mocks.link.mockReset();
  mocks.unlink.mockReset();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function Harness({
  env = environmentId,
  project = projectId,
}: {
  env?: EnvironmentId;
  project?: ProjectId;
}) {
  const [selected, onSelect] = useState<WorkspaceDocSelection | null>(null);
  return (
    <WorkspaceDocsPanel
      environmentId={env}
      projectId={project}
      projectTitle="Project Alpha"
      selected={selected}
      onSelect={onSelect}
    />
  );
}
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(<Harness />);
  });
}
const button = (label: string) =>
  renderer!.root.findAllByType("button").find((node) => node.props.children === label)!;
const text = () => JSON.stringify(renderer!.toJSON());
it("uses one Drive identity for paste and search", () => {
  const pasted = workspaceItemFromUrl("https://docs.google.com/document/d/launch-notes/edit");
  const searched = { type: "file", provider: "google-drive", fileId: "launch-notes" } as const;
  expect(pasted).toEqual(searched);
  expect(workspaceItemKey(pasted!)).toBe(workspaceItemKey(searched));
});
it("lists confirmed documents separately from one-hop discovery without reading any body", async () => {
  mocks.linked = [
    direct(),
    {
      ...direct(),
      id: "wsl_00000000-0000-0000-0000-000000000002",
      status: "suggested",
      item: { ...document, title: "Suggested only" },
    },
  ];
  mocks.related = [
    {
      item: { ref: { ...document.ref, fileId: "related" }, title: "Related brief" },
      via: { ref: { type: "url", url: "https://example.test/source" }, title: "Launch mail" },
    },
  ];
  mocks.truncated = true;
  await mount();
  expect(text()).toContain("Linked to project");
  expect(text()).toContain("Related through linked items");
  expect(text()).toContain("Via Launch mail");
  expect(text()).not.toContain("Suggested only");
  expect(text()).toContain("Showing loaded links");
  expect(
    mocks.query.mock.calls.filter(([query]) => ["binding", "connections"].includes(query.kind)),
  ).toHaveLength(0);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.bind).not.toHaveBeenCalled();
  expect(mocks.link).not.toHaveBeenCalled();
  expect(button("Back to documents")).toBeUndefined();
  expect(mocks.menus.mock.calls.find(([props]) => props.item === document)![0].confirmed).toEqual([
    { ref: { type: "project", projectId }, title: "Project Alpha" },
  ]);
});
it("opens one selected reader explicitly, renders one h1 and safely keeps plain text inert", async () => {
  mocks.linked = [direct()];
  mocks.read.mockResolvedValueOnce({
    _tag: "Success",
    value: {
      connectionId: "chosen",
      file: {
        id: "file",
        name: "Brief",
        mimeType: "text/plain",
        url: "https://drive.google.com/file/d/file/view",
      },
      body: { text: '<img src="https://tracker.test/pixel">Text', truncated: false },
    },
  });
  await mount();
  await act(() => button("Brief").props.onClick());
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.link).not.toHaveBeenCalled();
  expect(
    renderer!.root
      .findAllByType("a")
      .some((node) => node.children.join("") === "Open in Google Drive"),
  ).toBe(true);
  await act(() => button("Read file").props.onClick());
  expect(renderer!.root.findByType("h1").children).toEqual(["Brief"]);
  expect(renderer!.root.findAllByType("img")).toHaveLength(0);
  expect(text()).toContain("Sharing information unavailable");
  expect(text()).toContain("Project Alpha");
  const card = renderer!.root.findByType("article");
  expect(card.findAllByType("details")).toHaveLength(0);
  await act(() => button("Back to documents").props.onClick());
  expect(renderer!.root.findAllByType("h1")).toHaveLength(0);
  expect(button("Brief")).toBeDefined();
});
it.each(["text/markdown", "text/markdown; charset=utf-8"])(
  "formats explicitly declared %s across accumulated pages without changing reader actions",
  async (mimeType) => {
    mocks.linked = [direct()];
    mocks.mimeType = mimeType;
    const file = { id: "file", name: "Brief", mimeType };
    mocks.read
      .mockResolvedValueOnce({
        _tag: "Success",
        value: {
          connectionId: "chosen",
          file,
          body: {
            text: "# Source title\n\n## Priorities\n\n1. First",
            truncated: true,
            nextOffset: 48,
          },
        },
      })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: {
          connectionId: "chosen",
          file,
          body: { text: "\n2. Second\n\nFinal paragraph.", truncated: false },
        },
      });
    await mount();
    await act(() => button("Brief").props.onClick());
    expect(mocks.read).not.toHaveBeenCalled();
    await act(() => button("Read file").props.onClick());
    const card = () => renderer!.root.findByType("article");
    expect(card().findByType("h2").children).toEqual(["Priorities"]);
    expect(card().findAllByType("h1")).toHaveLength(1);
    expect(text()).toContain("Source title");
    await act(() => button("Read more").props.onClick());
    expect(
      card()
        .findAllByType("li")
        .map((item) => item.children.join("")),
    ).toEqual(["First", "Second"]);
    expect(text()).toContain("Final paragraph.");
    expect(mocks.read.mock.calls).toEqual([
      [{ environmentId, input: { fileId: "file", offset: 0 } }],
      [{ environmentId, input: { fileId: "file", offset: 48 } }],
    ]);
    expect(button("Read more")).toBeUndefined();
    expect(text()).toContain("Open in Google Drive");
    expect(text()).toContain("Back to documents");
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  },
);
it.each([
  "text/plain",
  "text/html",
  "text/xml",
  "application/xml",
  "application/json",
  "text/csv",
  "text/x-custom",
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
])(
  "keeps %s source text escaped and unstructured even when it looks like Markdown",
  async (mimeType) => {
    mocks.linked = [direct()];
    mocks.mimeType = mimeType;
    const body =
      '# Heading\n\n1. Literal number\n  **literal** [local](file:///secret) <img src="https://tracker.test/pixel">';
    mocks.read.mockResolvedValueOnce({
      _tag: "Success",
      value: {
        connectionId: "chosen",
        file: { id: "file", name: "Brief.md", mimeType },
        body: { text: body, truncated: false },
      },
    });
    await mount();
    await act(() => button("Brief").props.onClick());
    await act(() => button("Read file").props.onClick());
    const card = renderer!.root.findByType("article");
    expect(card.findAllByType("p").some((paragraph) => paragraph.children.join("") === body)).toBe(
      true,
    );
    for (const tag of ["h2", "h3", "ol", "strong", "a", "img"] as const)
      expect(card.findAllByType(tag)).toHaveLength(0);
    expect(text()).toContain("Plain text preview");
    expect(text()).toContain("Open in Google Drive");
  },
);
it("keeps discovery outside confirmed context and requires a separate explicit project link", async () => {
  mocks.related = [
    {
      item: document,
      via: { ref: { type: "url", url: "https://example.test/source" }, title: "Source page" },
    },
  ];
  await mount();
  await act(() => button("Brief").props.onClick());
  expect(mocks.link).not.toHaveBeenCalled();
  expect(mocks.menus.mock.calls.every(([props]) => !props.confirmed?.length)).toBe(true);
  mocks.read.mockResolvedValueOnce({
    _tag: "Success",
    value: {
      connectionId: "chosen",
      file: {
        ...document.ref,
        id: "file",
        name: "Brief",
        mimeType: "text/plain",
        url: "https://drive.google.com/file/d/file/view",
      },
      body: { text: "Discovery body", truncated: false },
    },
  });
  await act(() => button("Read file").props.onClick());
  expect(text()).toContain("Not linked to this project");
  expect(text()).not.toContain("Project Alpha");
  expect(mocks.menus.mock.calls.every(([props]) => !props.confirmed?.length)).toBe(true);
  await act(() => button("Link to project").props.onClick());
  expect(mocks.link).toHaveBeenCalledWith(document, {
    ref: { type: "project", projectId },
    title: "Project Alpha",
  });
});
it("retains an unavailable selected document after its project edge is removed remotely", async () => {
  mocks.linked = [direct()];
  await mount();
  await act(() => button("Brief").props.onClick());
  mocks.linked = [];
  await act(() => renderer!.update(<Harness />));
  expect(text()).toContain("no longer linked to this project");
  expect(text()).toContain("Link it again to keep reading it here");
  expect(text()).not.toContain("link has been kept");
  expect(button("Read file")).toBeUndefined();
  expect(mocks.unlink).not.toHaveBeenCalled();
  await act(() => button("Link to project").props.onClick());
  expect(mocks.link).toHaveBeenCalledWith(document, {
    ref: { type: "project", projectId },
    title: "Project Alpha",
  });
  mocks.linked = [direct()];
  await act(() => renderer!.update(<Harness />));
  expect(button("Read file")).toBeDefined();
});
it("ignores controlled selections from another environment or project", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(
      <WorkspaceDocsPanel
        environmentId={environmentId}
        projectId={projectId}
        selected={{ environmentId: EnvironmentId.make("other"), projectId, document }}
        onSelect={() => {}}
      />,
    );
  });
  expect(mocks.query.mock.calls.some(([query]) => query.kind === "binding")).toBe(false);
  await act(() =>
    renderer!.update(
      <WorkspaceDocsPanel
        environmentId={environmentId}
        projectId={projectId}
        selected={{ environmentId, projectId: ProjectId.make("other"), document }}
        onSelect={() => {}}
      />,
    ),
  );
  expect(mocks.query.mock.calls.some(([query]) => query.kind === "binding")).toBe(false);
});
it.each(["application/pdf", "application/vnd.google-apps.folder"])(
  "shows unsupported %s metadata without reading the body and old-server fallback without Drive RPC",
  async (mimeType) => {
    mocks.linked = [direct()];
    mocks.mimeType = mimeType;
    await mount();
    await act(() => button("Brief").props.onClick());
    expect(text()).toContain("Unsupported document type");
    expect(button("Read file").props.disabled).toBe(true);
    await act(() => button("Read file").props.onClick());
    expect(
      renderer!.root
        .findAllByType("a")
        .some(
          (node) =>
            node.children.join("") === "Open in Google Drive" && node.parent?.type !== "details",
        ),
    ).toBe(true);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.capable = false;
    mocks.query.mockClear();
    await act(() => renderer!.update(<Harness />));
    expect(text()).toContain("Open in Google Drive");
    expect(
      mocks.query.mock.calls.some(([query]) =>
        ["binding", "connections", "changes"].includes(query.kind),
      ),
    ).toBe(false);
    expect(mocks.bind).not.toHaveBeenCalled();
  },
);
it("unlinks only the chosen project edge, retains other loaded documents and supports relinking", async () => {
  const other = {
    ...direct(),
    id: "wsl_00000000-0000-0000-0000-000000000002",
    item: { ref: { ...document.ref, fileId: "other-file" }, title: "Other brief" },
  };
  mocks.linked = [direct(), other];
  mocks.unlink.mockImplementation(async (id: string) => {
    mocks.linked = mocks.linked.filter((link) => link.id !== id);
  });
  await mount();
  await act(() => button("Brief").props.onClick());
  await act(async () => {
    button("Unlink from project").props.onClick();
  });
  await act(() => renderer!.update(<Harness />));
  expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith(direct().id);
  expect(text()).toContain("no longer linked");
  await act(() => button("Back to documents").props.onClick());
  expect(button("Other brief")).toBeDefined();
  expect(button("Brief")).toBeUndefined();
});
it("suppresses a late binding success after the resource project changes", async () => {
  mocks.linked = [direct()];
  let finish!: (value: unknown) => void;
  mocks.bind.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await act(() => button("Brief").props.onClick());
  await act(() =>
    renderer!.root.findByType("select").props.onChange({ target: { value: "chosen" } }),
  );
  await act(() => {
    button("Use this connection").props.onClick();
  });
  await act(() => renderer!.update(<Harness project={ProjectId.make("other-project")} />));
  await act(() =>
    finish({ _tag: "Success", value: { connectionId: "chosen", file: { id: "file" } } }),
  );
  expect(mocks.refreshBinding).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(button("Read file")).toBeUndefined();
  await act(() => renderer!.update(<Harness />));
  expect(renderer!.root.findByType("select").props.value).toBe("");
});
it.each(["environment", "project"])(
  "suppresses Read more after the resource %s changes",
  async (change) => {
    mocks.linked = [direct()];
    mocks.read.mockResolvedValueOnce({
      _tag: "Success",
      value: {
        connectionId: "chosen",
        file: { id: "file", name: "Brief", mimeType: "text/plain" },
        body: { text: "First page", nextOffset: 10, truncated: true },
      },
    });
    await mount();
    await act(() => button("Brief").props.onClick());
    await act(() => button("Read file").props.onClick());
    let finish!: (value: unknown) => void;
    mocks.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(() => {
      button("Read more").props.onClick();
    });
    await act(() =>
      renderer!.update(
        <Harness
          {...(change === "project"
            ? { project: ProjectId.make("other-project") }
            : { env: EnvironmentId.make("other") })}
        />,
      ),
    );
    await act(() =>
      finish({
        _tag: "Success",
        value: {
          connectionId: "chosen",
          file: { id: "file", name: "Brief", mimeType: "text/plain" },
          body: { text: "Stale continuation", truncated: false },
        },
      }),
    );
    expect(text()).not.toContain("First page");
    expect(text()).not.toContain("Stale continuation");
    await act(() => renderer!.update(<Harness />));
    expect(button("Read file")).toBeDefined();
    expect(button("Read more")).toBeUndefined();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  },
);
it("does not claim an incomplete discovery list when discovery is unavailable", async () => {
  mocks.discoveryAvailable = false;
  mocks.threads = Array.from({ length: 31 }, (_, index) => ({
    id: `thread-${index}`,
    environmentId,
    projectId,
  }));
  await mount();
  expect(mocks.query.mock.calls.some(([query]) => query.kind === "hub")).toBe(false);
  expect(text()).not.toContain("may be incomplete");
});
it("suppresses a late body after the resource project changes and restores only an unread matching selection", async () => {
  mocks.linked = [direct()];
  let finish!: (value: unknown) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await act(() => button("Brief").props.onClick());
  await act(() => {
    button("Read file").props.onClick();
  });
  await act(() => renderer!.update(<Harness project={ProjectId.make("other-project")} />));
  await act(() =>
    finish({
      _tag: "Success",
      value: {
        connectionId: "chosen",
        file: { id: "file", name: "Brief", mimeType: "text/plain" },
        body: { text: "Stale project body", truncated: false },
      },
    }),
  );
  expect(text()).not.toContain("Stale project body");
  expect(button("Read file")).toBeUndefined();
  await act(() => renderer!.update(<Harness />));
  expect(button("Read file")).toBeDefined();
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("bounds one-hop discovery to this project's first 30 threads and reports the incomplete list", async () => {
  mocks.threads = Array.from({ length: 31 }, (_, index) => ({
    id: `thread-${index}`,
    environmentId,
    projectId,
  }));
  mocks.threads.push(
    { id: "other-environment", environmentId: "other", projectId },
    { id: "other-project", environmentId, projectId: "other-project" },
  );
  await mount();
  const query = mocks.query.mock.calls.find(([query]) => query.kind === "hub")![0];
  expect(query).toMatchObject({
    environmentId,
    input: { projectId, threadIds: mocks.threads.slice(0, 30).map((thread) => thread.id) },
  });
  expect(text()).toContain("Showing loaded links");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("offers separate project and captured-current-item links without granting either on open", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const currentItem: WorkspaceLinkEndpoint = {
    ref: { type: "url", url: "https://example.test/current" },
    title: "Current page",
  };
  await act(() => {
    renderer = create(
      <WorkspaceDocsPanel
        environmentId={environmentId}
        projectId={projectId}
        selected={{ environmentId, projectId, document }}
        currentItem={currentItem}
        onSelect={() => {}}
      />,
    );
  });
  expect(mocks.link).not.toHaveBeenCalled();
  await act(async () => {
    button("Link to current item").props.onClick();
  });
  expect(mocks.link).toHaveBeenCalledExactlyOnceWith(document, currentItem);
  await act(async () => {
    button("Link to project").props.onClick();
  });
  expect(mocks.link).toHaveBeenLastCalledWith(document, { ref: { type: "project", projectId } });
});

function ResourceHarness({
  env = environmentId,
  project = projectId,
  active = true,
  hidden = false,
  request = null,
}: {
  env?: EnvironmentId;
  project?: ProjectId;
  active?: boolean;
  hidden?: boolean;
  request?: WorkspaceResourceRequest | null;
}) {
  const value = useWorkspaceResourceState(env, {
    storage: { getItem: () => null, setItem: () => {} },
  });
  return (
    <WorkspaceResourcesProvider value={value}>
      <WorkspaceResourcesBodyContext value={{ hidden, restoreFocus: () => {} }}>
        {active ? (
          <WorkspaceDocsResource
            key={`${env}:${project}`}
            environmentId={env}
            projectId={project}
            selectedItem={{ ref: { type: "url", url: "https://example.test/center" } }}
            request={request}
            onOpen={() => {}}
          />
        ) : null}
      </WorkspaceResourcesBodyContext>
    </WorkspaceResourcesProvider>
  );
}

it.each(["tab", "hidden", "project", "environment"])(
  "retains only the Drive address and rejects a late body after %s leaves Docs",
  async (change) => {
    let finish!: (value: unknown) => void;
    mocks.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await act(() => {
      renderer = create(<ResourceHarness request={document.ref} />);
    });
    await act(() => {
      button("Read file").props.onClick();
    });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { fileId: "file", offset: 0 },
    });
    mocks.query.mockClear();
    await act(() =>
      renderer!.update(
        <ResourceHarness
          active={change !== "tab"}
          hidden={change === "hidden"}
          env={change === "environment" ? EnvironmentId.make("other") : environmentId}
          project={change === "project" ? ProjectId.make("other-project") : projectId}
        />,
      ),
    );
    expect(button("Read file")).toBeUndefined();
    const driveQuery = (key: string) =>
      ["binding", "connections", "changes"].includes((JSON.parse(key) as { kind: string }).kind);
    expect([...mocks.activeQueries].filter(driveQuery)).toHaveLength(0);
    if (change === "tab" || change === "hidden") {
      expect(mocks.activeQueries.size).toBe(0);
      expect(mocks.query).not.toHaveBeenCalled();
    }
    await act(() =>
      finish({
        _tag: "Success",
        value: {
          connectionId: "chosen",
          file: { id: "file", name: "Brief", mimeType: "text/plain" },
          body: { text: "Late old body", truncated: false },
        },
      }),
    );
    expect(text()).not.toContain("Late old body");
    await act(() => renderer!.update(<ResourceHarness />));
    expect(button("Read file")).toBeDefined();
    expect(button("Read file").props.disabled).toBe(false);
    expect(text()).not.toContain("Late old body");
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  },
);
