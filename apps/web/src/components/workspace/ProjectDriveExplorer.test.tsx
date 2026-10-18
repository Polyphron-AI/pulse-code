// @vitest-environment happy-dom
import { act, useMemo, type ReactNode } from "react";
import * as Cause from "effect/Cause";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole, fireEvent } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, type DriveProjectRootResult } from "@t3tools/contracts";
import { ProjectDriveExplorer } from "./ProjectDriveExplorer";
import { WorkspaceResourceBody } from "./WorkspaceResourceBody";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";

const state = vi.hoisted(() => ({
  explorer: true,
  read: true,
  connected: true,
  operate: true,
  root: null as DriveProjectRootResult | null,
  version: 1,
  links: [] as unknown[],
  list: vi.fn(),
  bind: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  open: vi.fn(),
  refresh: vi.fn(),
  rootReads: vi.fn(),
  rootPending: false,
  timeZone: "Africa/Johannesburg",
  openExternal: vi.fn(),
  connections: [] as { connected: boolean }[],
}));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ shell: { openExternal: state.openExternal } }),
}));
const environmentId = EnvironmentId.make("env");
const projectId = ProjectId.make("project");
const connectionId = "drv_00000000-0000-0000-0000-000000000001";
const folder = {
  id: "marketing",
  name: "Marketing",
  mimeType: "application/vnd.google-apps.folder",
  url: "https://drive.google.com/drive/folders/marketing",
};
const file = {
  id: "doc",
  name: "Strategy",
  mimeType: "application/vnd.google-apps.document",
  url: "https://docs.google.com/document/d/doc/edit",
};
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    driveExplorer: state.explorer,
    driveRead: state.read,
    workspaceLinks: true,
  }),
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (state.connected ? ["env", "other"] : []),
}));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => state.timeZone }));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => state.operate }));
vi.mock("../../state/drive", () => ({
  drive: {
    projectRoot: (input: unknown) => {
      state.rootReads(input);
      return "root";
    },
    listChildren: "list",
    bind: "bind",
    connections: () => "connections",
  },
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: () => "links" } }));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (key: unknown) =>
    useMemo(
      () => ({
        data:
          key === "connections"
            ? state.connections
            : key === "root"
              ? state.root
              : key === "links"
                ? { linked: state.links, suggested: [], truncated: false }
                : null,
        dataUpdatedAt: state.version,
        isPending: key === "root" && state.rootPending,
        error: null,
        refresh: state.refresh,
      }),
      [key, state.root, state.links, state.version, state.rootPending, state.connections],
    ),
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "list" ? state.list : state.bind),
}));
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: () => ({ linkItem: state.link, unlink: state.unlink }),
}));
vi.mock("./WorkspaceToolsPanel", () => ({
  WorkspaceProjectFiles: () => <p>Legacy linked files</p>,
}));
vi.mock("./ProjectDriveRootSettings", () => ({
  ProjectDriveRootSettings: () => <p>Project Drive folder settings</p>,
}));
vi.mock("./DriveFiles", () => ({
  errorText: (result: { cause: Cause.Cause<unknown> }) => String(Cause.squash(result.cause)),
  DriveFileAccess: () => <button>Read file</button>,
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({
    children,
    actions,
    item,
  }: {
    children: ReactNode;
    actions: ReactNode;
    item: unknown;
  }) => (
    <div data-endpoint={JSON.stringify(item)}>
      {children}
      <details>
        <summary>Item actions</summary>
        {actions}
      </details>
    </div>
  ),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
let root: Root;
let node: HTMLDivElement;
const render = async (props: Partial<React.ComponentProps<typeof ProjectDriveExplorer>> = {}) => {
  await act(() =>
    root.render(
      <ProjectDriveExplorer
        environmentId={environmentId}
        projectId={projectId}
        selectedItem={null}
        request={null}
        onOpen={state.open}
        {...props}
      />,
    ),
  );
};
const button = (name: string) =>
  getByRole<HTMLButtonElement>(node, "button", {
    name: name.startsWith("Sort by ") ? new RegExp(`^${name}`) : name,
  });
const openIntent = async () =>
  act(() =>
    getByRole<HTMLButtonElement>(getByRole(node, "status").parentElement!, "button", {
      name: "Open in Google Drive",
    }).click(),
  );
const click = async (name: string) => {
  await act(() => button(name).click());
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  state.explorer = state.read = state.connected = state.operate = true;
  state.version = 1;
  state.rootPending = false;
  state.timeZone = "Africa/Johannesburg";
  state.connections = [];
  state.links = [];
  state.root = {
    root: { linkId: "wl_00000000-0000-0000-0000-000000000001", fileId: "root", connectionId },
    state: "available",
    file: { ...folder, id: "root", name: "SynKEK" },
  };
  state.links = [
    {
      id: state.root.root!.linkId,
      status: "confirmed",
      item: { ref: { type: "file", provider: "google-drive", fileId: "root" } },
    },
  ];
  state.list.mockResolvedValue({
    _tag: "Success",
    value: { files: [folder, file], incomplete: false },
  });
  state.bind.mockResolvedValue({ _tag: "Success", value: { connectionId, file } });
  state.link.mockResolvedValue(undefined);
  state.unlink.mockResolvedValue(undefined);
  state.openExternal.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(() => root.unmount());
  node.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("browses root and back without binding or linking a child", async () => {
  await render();
  expect(state.list).toHaveBeenLastCalledWith({
    environmentId,
    input: {
      projectId,
      connectionId,
      parentId: "root",
      path: [],
      sort: "name",
      direction: "asc",
      limit: 20,
    },
  });
  await click("Open folder Marketing");
  expect(state.list.mock.calls.at(-1)![0].input).toMatchObject({
    parentId: "marketing",
    path: ["marketing"],
  });
  await click("Back to SynKEK");
  expect(state.list.mock.calls.at(-1)![0].input.parentId).toBe("root");
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});
it("submits search only on Enter, clears filters, sorts and keeps grid metadata", async () => {
  await render();
  const input = getByRole<HTMLInputElement>(node, "searchbox", { name: "Search in Drive" });
  await act(() => fireEvent.change(input, { target: { value: "  plan  " } }));
  expect(state.list).toHaveBeenCalledTimes(1);
  await act(() => fireEvent.submit(input.closest("form")!));
  expect(state.list.mock.calls.at(-1)![0].input.query).toBe("plan");
  await click("Grid view");
  expect(state.list).toHaveBeenCalledTimes(2);
  await click("List view");
  await click("Sort by Modified");
  expect(state.list.mock.calls.at(-1)![0].input.sort).toBe("modifiedTime");
  expect(
    getByRole(node, "button", { name: "Sort by Modified, oldest first" }).textContent,
  ).toContain("↑");
  await act(() =>
    fireEvent.change(getByRole(node, "combobox", { name: "Type" }), {
      target: { value: "document" },
    }),
  );
  expect(state.list.mock.calls.at(-1)![0].input.type).toBe("document");
  await click("Clear filters");
  expect(state.list.mock.calls.at(-1)![0].input.query).toBeUndefined();
});
it("deduplicates across pages and resets accumulated rows on Refresh", async () => {
  state.list
    .mockResolvedValueOnce({
      _tag: "Success",
      value: { files: [folder, file], nextCursor: "next", incomplete: true },
    })
    .mockResolvedValueOnce({
      _tag: "Success",
      value: { files: [file, { ...file, id: "doc2", name: "Second" }], incomplete: false },
    });
  await render();
  await click("Load more");
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(3);
  expect(state.list.mock.calls.at(-1)![0].input.cursor).toBe("next");
  await click("Refresh files");
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(2);
});
it("coalesces changed scopes and ignores a delayed old page and cursor", async () => {
  let release!: (value: unknown) => void;
  state.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await render();
  await click("Sort by Modified");
  await click("Sort by Modified");
  expect(state.list).toHaveBeenCalledTimes(1);
  await act(async () =>
    release({
      _tag: "Success",
      value: {
        files: [{ ...file, name: "Old result" }],
        nextCursor: "obsolete",
        incomplete: false,
      },
    }),
  );
  expect(node.textContent).not.toContain("Old result");
  expect(state.list).toHaveBeenCalledTimes(2);
  expect(state.list.mock.calls.at(-1)![0].input).toMatchObject({
    sort: "modifiedTime",
    direction: "desc",
  });
  expect(queryByRole(node, "button", { name: "Load more" })).toBeNull();
});
it("suppresses stale results after environment, project or root changes", async () => {
  let release!: (value: unknown) => void;
  state.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await render();
  await render({
    environmentId: EnvironmentId.make("other"),
    projectId: ProjectId.make("other-project"),
  });
  await act(async () =>
    release({
      _tag: "Success",
      value: {
        files: [{ ...file, name: "Old environment" }],
        nextCursor: "obsolete",
        incomplete: false,
      },
    }),
  );
  expect(node.textContent).not.toContain("Old environment");
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});
it("gates real explorer requests on live capabilities and connection state", async () => {
  state.explorer = false;
  await render();
  expect(state.list).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Legacy linked files");
  state.explorer = true;
  await render();
  expect(state.list).toHaveBeenCalledTimes(1);
  state.explorer = false;
  await render();
  expect(state.list).toHaveBeenCalledTimes(1);
  state.list.mockClear();
  await render();
  expect(state.list).not.toHaveBeenCalled();
  state.connected = false;
  state.explorer = true;
  await render();
  expect(state.list).not.toHaveBeenCalled();
});
it("returns only explicit picker choices and cancel never writes", async () => {
  const choose = vi.fn(),
    cancel = vi.fn();
  await render({ mode: "pick", onChoose: choose, onCancel: cancel });
  await click("Open file Strategy");
  expect(choose).not.toHaveBeenCalled();
  await click("Choose file");
  expect(choose).toHaveBeenCalledWith({
    endpoint: { ref: { type: "file", provider: "google-drive", fileId: "doc" }, title: "Strategy" },
    connectionId,
  });
  await click("Cancel picking");
  expect(cancel).toHaveBeenCalledOnce();
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});
it("does not show a picker action in browse mode and reads without auto-binding", async () => {
  await render();
  await click("Open file Strategy");
  expect(queryByRole(node, "button", { name: "Choose file" })).toBeNull();
  expect(button("Read file")).toBeTruthy();
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});
it("offers the explicit reader and provider open for an unloaded file intent without scanning", async () => {
  await render({ request: { type: "file", provider: "google-drive", fileId: "outside" } });
  expect(button("Read file")).toBeTruthy();
  await openIntent();
  expect(state.openExternal).toHaveBeenCalledWith("https://drive.google.com/file/d/outside/view");
  expect(state.list).toHaveBeenCalledTimes(1);
  expect(state.bind).not.toHaveBeenCalled();
});
it("clears an old handoff explanation when the next requested file is loaded", async () => {
  await render({ request: { type: "file", provider: "google-drive", fileId: "outside" } });
  await render({ request: { type: "file", provider: "google-drive", fileId: "doc" } });
  expect(node.textContent).not.toContain("This item is not in the loaded folder.");
});
it("shows root refresh progress without claiming the folder is empty", async () => {
  state.root = null;
  state.rootPending = true;
  await render();
  expect(state.list).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Loading project Drive folder...");
  expect(node.textContent).not.toContain("This folder is empty.");
});

it("keeps the folder, loaded pages, selection and scroll across root and link refreshes", async () => {
  state.list
    .mockResolvedValueOnce({ _tag: "Success", value: { files: [folder], incomplete: false } })
    .mockResolvedValueOnce({
      _tag: "Success",
      value: { files: [file], nextCursor: "next", incomplete: false },
    })
    .mockResolvedValueOnce({
      _tag: "Success",
      value: { files: [{ ...file, id: "second", name: "Second" }], incomplete: false },
    });
  node.setAttribute("data-workspace-resource-body", "");
  await render();
  await click("Open folder Marketing");
  await click("Load more");
  await click("Open file Strategy");
  node.scrollTop = 120;
  let release!: () => void;
  state.link.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => (await rowAction("doc", "Link to project")).click());
  state.rootPending = true;
  state.version++;
  await render();
  expect(node.textContent).not.toContain("Loading project Drive folder...");
  expect(button("Open file Strategy").getAttribute("aria-pressed")).toBe("true");
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(2);
  expect((await rowAction("doc", "Link to project")).disabled).toBe(true);
  state.rootPending = false;
  state.root = { ...state.root! };
  state.links = [...state.links];
  state.version++;
  await render();
  await act(async () => release());
  expect(button("Open file Strategy").getAttribute("aria-pressed")).toBe("true");
  expect(button("Back to SynKEK")).toBeTruthy();
  expect(node.scrollTop).toBe(120);
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(2);
  expect(state.list).toHaveBeenCalledTimes(3);
  expect((await rowAction("doc", "Link to project")).disabled).toBe(false);
});

it("shows a typed error when neither clipboard API nor the HTTP fallback is available", async () => {
  vi.stubGlobal("navigator", { clipboard: undefined });
  await render();
  await act(async () => (await rowAction("doc", "Copy link")).click());
  expect(getByRole(node, "alert").textContent).toBe(
    "Clipboard API is unavailable while copying Drive link.",
  );
});

it("opens an unloaded folder handoff through the shell with a folder URL", async () => {
  await render({
    request: {
      type: "file",
      provider: "google-drive",
      fileId: "outside-folder",
      driveKind: "folder",
    },
  });
  await openIntent();
  expect(state.openExternal).toHaveBeenCalledWith(
    "https://drive.google.com/drive/folders/outside-folder",
  );
  expect(queryByRole(node, "button", { name: "Read file" })).toBeNull();
  expect(state.list).toHaveBeenCalledTimes(1);
});

it("retains link failure feedback after a successful bind and root refresh", async () => {
  await render();
  await click("Open file Strategy");
  let release!: (value: unknown) => void;
  state.bind.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  state.link.mockRejectedValueOnce(new Error("Link refused"));
  await act(async () => (await rowAction("doc", "Link to project")).click());
  state.rootPending = true;
  state.version++;
  await render();
  await act(async () => release({ _tag: "Success", value: { connectionId, file } }));
  expect(getByRole(node, "alert").textContent).toContain(
    "The file is bound to the chosen connection, but linking failed. Link refused",
  );
  expect(button("Open file Strategy").getAttribute("aria-pressed")).toBe("true");
  expect(state.list).toHaveBeenCalledTimes(1);
});

it("unlinks the captured relation and relinks the same Drive endpoint", async () => {
  const relation = {
    id: "wl_00000000-0000-0000-0000-000000000002",
    status: "confirmed",
    item: { ref: { type: "file", provider: "google-drive", fileId: "doc" } },
  };
  state.links = [...state.links, relation];
  let release!: () => void;
  state.unlink.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await render();
  await act(async () => (await rowAction("doc", "Unlink from project")).click());
  await click("Open folder Marketing");
  await render({ projectId: ProjectId.make("second") });
  await act(async () => release());
  expect(state.unlink).toHaveBeenCalledExactlyOnceWith(relation.id);
  state.links = state.links.slice(0, 1);
  await render();
  await act(async () => (await rowAction("doc", "Link to project")).click());
  expect(state.link).toHaveBeenCalledWith(
    { ref: { type: "file", provider: "google-drive", fileId: "doc" }, title: "Strategy" },
    { ref: { type: "project", projectId } },
  );
});

it("copies the canonical row link and surfaces shell open rejection", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await render();
  await act(async () => (await rowAction("doc", "Copy link")).click());
  expect(writeText).toHaveBeenCalledWith(file.url);
  expect(await rowAction("doc", "Copied")).toBeTruthy();
  state.openExternal.mockRejectedValueOnce(new Error("Unable to open link."));
  await act(async () => (await rowAction("doc", "Open in Google Drive")).click());
  expect(state.openExternal).toHaveBeenCalledWith(file.url);
  expect(getByRole(node, "alert").textContent).toBe("Unable to open link.");
});

it("keeps selection and row actions when switching to grid", async () => {
  await render();
  await click("Open file Strategy");
  await click("Grid view");
  expect(button("Open file Strategy").getAttribute("aria-pressed")).toBe("true");
  await act(async () => (await rowAction("doc", "Link to project")).click());
  expect(state.bind).toHaveBeenCalledWith({
    environmentId,
    input: { connectionId, fileId: "doc" },
  });
  expect(state.list).toHaveBeenCalledTimes(1);
});

it.each(["empty", "filtered-empty", "incomplete", "loading", "error"])(
  "renders the live %s state and retries the same scope",
  async (stateName) => {
    let release!: (value: unknown) => void;
    if (stateName === "loading")
      state.list.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    else if (stateName === "error")
      state.list.mockResolvedValueOnce({
        _tag: "Failure",
        cause: Cause.fail(new Error("Drive denied")),
      });
    else
      state.list.mockResolvedValue({
        _tag: "Success",
        value: { files: [], incomplete: stateName === "incomplete" },
      });
    await render();
    if (stateName === "filtered-empty") {
      await act(() =>
        fireEvent.change(getByRole(node, "combobox", { name: "Type" }), {
          target: { value: "document" },
        }),
      );
      expect(node.textContent).toContain("No files match these filters.");
    } else if (stateName === "loading") {
      expect(getByRole(node, "status").textContent).toBe("Loading files...");
      expect(getByRole(node, "list", { name: "Drive files" }).getAttribute("aria-busy")).toBe(
        "true",
      );
      await act(async () => release({ _tag: "Success", value: { files: [], incomplete: false } }));
      expect(queryByRole(node, "status")).toBeNull();
    } else if (stateName === "error") {
      expect(getByRole(node, "alert").textContent).toBe("Error: Drive denied");
      const request = state.list.mock.calls.at(-1)![0];
      await click("Retry files");
      expect(state.list).toHaveBeenLastCalledWith(request);
      expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(2);
      expect(queryByRole(node, "alert")).toBeNull();
    } else
      expect(node.textContent).toContain(
        stateName === "incomplete"
          ? "Results may be incomplete. Refresh or open Google Drive."
          : "This folder is empty.",
      );
  },
);

it("navigates a loaded folder and the root handoff without changing center selection", async () => {
  const selectedItem = { ref: { type: "project" as const, projectId }, title: "Center project" };
  const folderRequest = {
    type: "file" as const,
    provider: "google-drive" as const,
    fileId: folder.id,
    driveKind: "folder" as const,
  };
  await render({ request: folderRequest, selectedItem });
  expect(state.list.mock.calls.at(-1)![0].input).toMatchObject({
    parentId: "marketing",
    path: ["marketing"],
  });
  await render({ request: { ...folderRequest, fileId: "root" }, selectedItem });
  expect(state.list.mock.calls.at(-1)![0].input).toMatchObject({ parentId: "root", path: [] });
  await render({ request: { ...folderRequest }, selectedItem });
  expect(state.list.mock.calls.at(-1)![0].input.parentId).toBe("marketing");
  expect(state.open).not.toHaveBeenCalled();
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});

it("explains deleted folder targets without scanning or writing", async () => {
  state.list.mockResolvedValueOnce({ _tag: "Success", value: { files: [], incomplete: false } });
  await render({
    request: { type: "file", provider: "google-drive", fileId: "deleted", driveKind: "folder" },
  });
  expect(getByRole(node, "status").textContent).toContain("This item is not in the loaded folder.");
  state.openExternal.mockRejectedValueOnce(new Error("Folder unavailable"));
  await openIntent();
  expect(getByRole(node, "alert").textContent).toBe("Folder unavailable");
  expect(state.list).toHaveBeenCalledTimes(1);
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});

it("does not resolve a folder handoff through an unavailable connection", async () => {
  state.root = { ...state.root!, state: "disconnected" };
  await render({
    request: { type: "file", provider: "google-drive", fileId: "marketing", driveKind: "folder" },
  });
  expect(node.textContent).toContain("Reconnect this Drive connection in Settings.");
  expect(state.list).not.toHaveBeenCalled();
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});

it("rechecks an unloaded handoff when another page contains its target", async () => {
  state.list.mockResolvedValueOnce({
    _tag: "Success",
    value: { files: [folder], nextCursor: "next", incomplete: false },
  });
  const request = { type: "file" as const, provider: "google-drive" as const, fileId: "doc" };
  await render({ request });
  expect(node.textContent).toContain("This item is not in the loaded folder.");
  await click("Load more");
  expect(button("Open file Strategy").getAttribute("aria-pressed")).toBe("true");
  expect(node.textContent).not.toContain("This item is not in the loaded folder.");
});
it("explains a missing connection before project-folder setup", async () => {
  state.root = { root: null, state: "unconfigured" };
  await render();
  expect(node.textContent).toContain("Connect Google Drive in Settings.");
  expect(state.list).not.toHaveBeenCalled();
});
it("restores folder selection when going Back", async () => {
  await render();
  await click("Open file Strategy");
  await click("Open folder Marketing");
  await click("Back to SynKEK");
  expect(button("Open file Strategy").getAttribute("aria-pressed")).toBe("true");
});
it("clears rows immediately after the confirmed root link disappears", async () => {
  await render();
  expect(node.textContent).toContain("Marketing");
  state.links = [];
  state.version++;
  await render();
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(0);
  expect(node.textContent).toContain("no longer linked");
});
it("sends MIME, owner and chosen-timezone dates to the server before paging", async () => {
  await render();
  await act(() =>
    fireEvent.change(getByRole(node, "combobox", { name: "People" }), { target: { value: "me" } }),
  );
  expect(state.list.mock.calls.at(-1)![0].input.owner).toBe("me");
  await click("Drive filters");
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Owner email" }), {
      target: { value: "owner@example.test" },
    }),
  );
  await act(() =>
    fireEvent.change(node.querySelector('[aria-label="Modified on or after"]')!, {
      target: { value: "2026-10-13" },
    }),
  );
  await act(() =>
    fireEvent.change(node.querySelector('[aria-label="Modified before"]')!, {
      target: { value: "2026-10-14" },
    }),
  );
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Drive filters" })));
  expect(state.list.mock.calls.at(-1)![0].input).toMatchObject({
    owner: "owner@example.test",
    modifiedAfter: "2026-10-12T22:00:00.000Z",
    modifiedBefore: "2026-10-13T22:00:00.000Z",
  });
  await act(() =>
    fireEvent.change(getByRole(node, "combobox", { name: "Type" }), {
      target: { value: "document" },
    }),
  );
  await click("Clear filters");
  const input = state.list.mock.calls.at(-1)![0].input;
  for (const key of ["query", "type", "owner", "modifiedAfter", "modifiedBefore"])
    expect(input).not.toHaveProperty(key);
});
it("clears a previously applied owner email from the advanced form", async () => {
  await render();
  await click("Drive filters");
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Owner email" }), {
      target: { value: "owner@example.test" },
    }),
  );
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Drive filters" })));
  await click("Drive filters");
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Owner email" }), {
      target: { value: "" },
    }),
  );
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Drive filters" })));
  expect(state.list.mock.calls.at(-1)![0].input).not.toHaveProperty("owner");
});
it("validates owner and reversed dates without requesting files", async () => {
  await render();
  await click("Drive filters");
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Owner email" }), {
      target: { value: "one@example.test,two@example.test" },
    }),
  );
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Drive filters" })));
  expect(getByRole(node, "alert").textContent).toBe("Enter one owner email.");
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Owner email" }), {
      target: { value: "" },
    }),
  );
  for (const label of ["Modified on or after", "Modified before"])
    await act(() =>
      fireEvent.change(node.querySelector(`[aria-label="${label}"]`)!, {
        target: { value: "2026-10-13" },
      }),
    );
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Drive filters" })));
  expect(getByRole(node, "alert").textContent).toBe("Use an end date after the start date.");
  expect(state.list).toHaveBeenCalledTimes(1);
});
it("explains an invalid workspace time zone when reopening date filters", async () => {
  await render();
  await click("Drive filters");
  await act(() =>
    fireEvent.change(node.querySelector('[aria-label="Modified on or after"]')!, {
      target: { value: "2026-10-13" },
    }),
  );
  await act(() => fireEvent.submit(getByRole(node, "form", { name: "Drive filters" })));
  state.timeZone = "Invalid/Zone";
  await render();
  await click("Drive filters");
  expect(getByRole(node, "alert").textContent).toBe(
    "The workspace time zone is invalid. Choose a valid time zone in Settings.",
  );
  expect(state.list).toHaveBeenCalledTimes(2);
});
it("keeps a captured picker choice after the resource project changes", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = vi.fn();
  const choose = vi.fn(async (choice: unknown) => {
    await gate;
    received(choice);
  });
  await render({ mode: "pick", onChoose: choose, onCancel: vi.fn() });
  await click("Open file Strategy");
  const captured = button("Choose file");
  await act(() => captured.click());
  await render({
    projectId: ProjectId.make("second"),
    mode: "pick",
    onChoose: choose,
    onCancel: vi.fn(),
  });
  await act(async () => release());
  expect(choose).toHaveBeenCalledExactlyOnceWith({
    endpoint: { ref: { type: "file", provider: "google-drive", fileId: "doc" }, title: "Strategy" },
    connectionId,
  });
  expect(button("Choose file").disabled).toBe(true);
  expect(received).toHaveBeenCalledExactlyOnceWith(choose.mock.calls[0]![0]);
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});
it("explains the permission needed by the disabled folder chooser", async () => {
  state.operate = false;
  state.root = { root: null, state: "unconfigured" };
  await render();
  expect(button("Choose folder").disabled).toBe(true);
  expect(node.textContent).toContain(
    "You need operate permission to change the project Drive folder.",
  );
  expect(queryByRole(node, "status")).toBeNull();
});
it("caps accumulated metadata at 200 and explicitly replaces it with the next page", async () => {
  let next = 0;
  state.list.mockImplementation(async () => ({
    _tag: "Success",
    value: {
      files: Array.from({ length: 20 }, () => ({ ...file, id: `doc-${next++}` })),
      nextCursor: "next",
      incomplete: false,
    },
  }));
  await render();
  for (let page = 1; page < 10; page++) await click("Load more");
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(200);
  expect(queryByRole(node, "button", { name: "Load more" })).toBeNull();
  await click("Next page");
  expect(state.list.mock.calls.at(-1)![0].input).toEqual({
    projectId,
    connectionId,
    parentId: "root",
    path: [],
    sort: "name",
    direction: "asc",
    limit: 20,
    cursor: "next",
  });
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(20);
});
it("keeps cursor page size fixed when a short first page approaches the row bound", async () => {
  let next = 0;
  state.list.mockImplementation(async () => ({
    _tag: "Success",
    value: {
      files: Array.from({ length: next === 0 ? 15 : 20 }, () => ({
        ...file,
        id: `partial-${next++}`,
      })),
      nextCursor: "next",
      incomplete: false,
    },
  }));
  await render();
  for (let page = 1; page < 10; page++) await click("Load more");
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(195);
  await click("Next page");
  expect(state.list.mock.calls.at(-1)![0].input.limit).toBe(20);
  expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(20);
  expect(node.querySelector('[data-drive-file-id="partial-195"]')).not.toBeNull();
  expect(node.querySelector('[data-drive-file-id="partial-214"]')).not.toBeNull();
});
it("uses a confirmed direct project link for the folder indicator, never a suggestion", async () => {
  state.links = [
    ...state.links,
    {
      id: "suggested",
      status: "suggested",
      item: { ref: { type: "file", provider: "google-drive", fileId: "marketing" } },
    },
  ];
  await render();
  expect(node.textContent).not.toContain("Linked to project");
  await act(() => {
    button("Open folder Marketing").focus();
    fireEvent.mouseOver(button("Open folder Marketing"));
  });
  expect(node.textContent).not.toContain("Linked to project");
  await click("Open folder Marketing");
  expect(node.textContent).not.toContain("Linked to project");
  await click("Back to SynKEK");
  state.links = [
    ...state.links.slice(0, 1),
    {
      id: "confirmed",
      status: "confirmed",
      item: { ref: { type: "file", provider: "google-drive", fileId: "marketing" } },
    },
  ];
  await render();
  expect(node.textContent).toContain("Linked to project");
});
const rowAction = async (id: string, name: string) => {
  const row = node.querySelector<HTMLElement>(`[data-drive-file-id="${id}"]`)!;
  const details = row.querySelector("details")!;
  if (!details.open) await act(() => details.querySelector("summary")!.click());
  return getByRole<HTMLButtonElement>(row, "button", { name });
};
it("binds only on explicit link and never links when binding fails", async () => {
  await render();
  state.bind.mockResolvedValueOnce({
    _tag: "Failure",
    cause: Cause.fail(new Error("Binding failed")),
  });
  await act(async () => (await rowAction("doc", "Link to project")).click());
  expect(state.bind).toHaveBeenCalledWith({
    environmentId,
    input: { connectionId, fileId: "doc" },
  });
  expect(state.link).not.toHaveBeenCalled();
});
it("retains a captured file, account and project through a pending explicit link", async () => {
  let release!: (value: unknown) => void;
  state.bind.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await render();
  const action = await rowAction("doc", "Link to project");
  await act(() => action.click());
  await render({ projectId: ProjectId.make("second") });
  await act(async () => release({ _tag: "Success", value: { connectionId, file } }));
  expect(state.link).toHaveBeenCalledWith(
    { ref: { type: "file", provider: "google-drive", fileId: "doc" }, title: "Strategy" },
    { ref: { type: "project", projectId } },
  );
});
it("browses readonly without bind, link or root mutations", async () => {
  state.operate = false;
  await render();
  await click("Open folder Marketing");
  expect(queryByRole(node, "button", { name: "Link to project" })).toBeNull();
  expect(state.list).toHaveBeenCalledTimes(2);
  expect(state.bind).not.toHaveBeenCalled();
  expect(state.link).not.toHaveBeenCalled();
});
it("mounts no root or list queries while Resources is hidden", async () => {
  await act(() =>
    root.render(
      <WorkspaceResourcesBodyContext value={{ hidden: true, restoreFocus() {} }}>
        <ProjectDriveExplorer
          environmentId={environmentId}
          projectId={projectId}
          selectedItem={null}
          request={null}
          onOpen={state.open}
        />
      </WorkspaceResourcesBodyContext>,
    ),
  );
  expect(state.rootReads).not.toHaveBeenCalled();
  expect(state.list).not.toHaveBeenCalled();
});
it.each(["root", "close", "downgrade"])(
  "discards a pending page after %s changes",
  async (change) => {
    let release!: (value: unknown) => void;
    state.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await render();
    if (change === "root") {
      state.root = { ...state.root!, root: { ...state.root!.root!, fileId: "second-root" } };
      state.links = [
        {
          id: state.root.root!.linkId,
          status: "confirmed",
          item: { ref: { type: "file", provider: "google-drive", fileId: "second-root" } },
        },
      ];
      await render();
    } else if (change === "close") {
      await act(() => root.render(null));
      await render();
    } else {
      state.explorer = false;
      await render();
    }
    await act(async () =>
      release({
        _tag: "Success",
        value: {
          files: [{ ...file, name: "Obsolete page" }],
          nextCursor: "old-cursor",
          incomplete: false,
        },
      }),
    );
    expect(node.textContent).not.toContain("Obsolete page");
    expect(queryByRole(node, "button", { name: "Load more" })).toBeNull();
    expect(state.bind).not.toHaveBeenCalled();
    expect(state.link).not.toHaveBeenCalled();
  },
);

it.each(["mail", "communications", "tasks", "projects"])(
  "mounts the same live Files switch in %s without a selected center item",
  async (space) => {
    await act(() =>
      root.render(
        <div data-space={space}>
          <WorkspaceResourceBody
            tab="files"
            environmentId={environmentId}
            projectId={projectId}
            selectedItem={null}
            request={null}
            onOpen={state.open}
          />
        </div>,
      ),
    );
    expect(getByRole(node, "region", { name: "Project Drive explorer" })).toBeTruthy();
    expect(state.list).toHaveBeenCalledTimes(1);
    expect(state.open).not.toHaveBeenCalled();
  },
);
