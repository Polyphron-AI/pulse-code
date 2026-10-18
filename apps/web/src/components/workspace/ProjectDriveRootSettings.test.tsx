// @vitest-environment happy-dom
import * as Cause from "effect/Cause";
import { act, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  DriveError,
  EnvironmentId,
  ProjectId,
  type DriveProjectRootResult,
  type WorkspaceLinkList,
  type DriveIdentity,
} from "@t3tools/contracts";
import { ProjectDriveRootSettings } from "./ProjectDriveRootSettings";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";

const state = vi.hoisted(() => ({
  capable: true,
  explorer: true,
  connected: true,
  operate: true,
  connectionConnected: true,
  identity: { id: "owner", name: "Owner", email: "owner@example.test" } as
    | DriveIdentity
    | undefined,
  root: { root: null, state: "unconfigured" } as DriveProjectRootResult | undefined,
  rootError: null as string | null,
  links: { linked: [], suggested: [], truncated: false } as WorkspaceLinkList,
  linkVersion: 1,
  bound: true,
  folder: true,
  rootQuery: vi.fn(),
  refresh: vi.fn(),
  bindRefresh: vi.fn(),
  bindingQueries: vi.fn(),
  batchQueries: vi.fn(),
  batchPending: false,
  batchError: null as string | null,
  setRoot: vi.fn(),
  bind: vi.fn(),
}));
const connectionId = "drv_00000000-0000-0000-0000-000000000001";
const linkId = "wl_00000000-0000-0000-0000-000000000001";
const root = { linkId, connectionId, fileId: "folder" };
const file = {
  id: "folder",
  name: "SynKEK",
  mimeType: "application/vnd.google-apps.folder",
  url: "https://drive.google.com/drive/folders/folder",
};
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    driveProjectRoot: state.capable,
    driveExplorer: state.explorer,
    driveRead: true,
    workspaceLinks: true,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => state.operate }));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (state.connected ? ["remote", "another"] : []),
}));
vi.mock("../../state/drive", () => ({
  drive: {
    projectRoot: (input: unknown) => {
      state.rootQuery(input);
      return "root";
    },
    connections: () => "connections",
    binding: ({ input }: { input: { fileId: string } }) => {
      state.bindingQueries(input.fileId);
      return `binding:${input.fileId}`;
    },
    bindings: ({ input }: { input: { fileIds: string[] } }) => {
      state.batchQueries(input.fileIds);
      return `bindings:${input.fileIds.join(",")}`;
    },
    setProjectRoot: "set",
    bind: "bind",
  },
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: () => "links" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "set" ? state.setRoot : state.bind),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: string | null) =>
    useMemo(
      () => ({
        data:
          query === "root"
            ? state.root
            : query === "links"
              ? state.links
              : query === "connections"
                ? [
                    {
                      id: "drv_00000000-0000-0000-0000-000000000001",
                      nickname: "Work",
                      connected: state.connectionConnected,
                      identity: state.identity,
                    },
                  ]
                : query?.startsWith("bindings:")
                  ? state.batchPending || state.batchError
                    ? null
                    : {
                        bindings: state.bound
                          ? query
                              .slice("bindings:".length)
                              .split(",")
                              .map((id) => ({
                                connectionId,
                                file: {
                                  ...file,
                                  id,
                                  name: id === "other-folder" ? "Another folder" : "SynKEK",
                                  mimeType:
                                    state.folder && id !== "document"
                                      ? "application/vnd.google-apps.folder"
                                      : "text/plain",
                                },
                              }))
                          : [],
                      }
                  : query?.startsWith("binding:")
                    ? {
                        binding: state.bound
                          ? {
                              connectionId: "drv_00000000-0000-0000-0000-000000000001",
                              file: {
                                id: query.slice("binding:".length),
                                name:
                                  query === "binding:other-folder" ? "Another folder" : "SynKEK",
                                mimeType:
                                  state.folder && query !== "binding:document"
                                    ? "application/vnd.google-apps.folder"
                                    : "text/plain",
                              },
                            }
                          : undefined,
                      }
                    : null,
        dataUpdatedAt: query === "links" ? state.linkVersion : 1,
        error:
          query === "root"
            ? state.rootError
            : query?.startsWith("bindings:")
              ? state.batchError
              : null,
        isPending: query?.startsWith("bindings:") ? state.batchPending : false,
        failure:
          query === "root" && state.rootError
            ? new DriveError({
                kind:
                  state.rootError === "This project is unavailable." ? "not-found" : "unavailable",
                message: state.rootError,
              })
            : null,
        refresh:
          query?.startsWith("binding:") || query?.startsWith("bindings:")
            ? state.bindRefresh
            : state.refresh,
      }),
      [
        query,
        state.root,
        state.links,
        state.connectionConnected,
        state.identity,
        state.bound,
        state.folder,
        state.batchPending,
        state.batchError,
        state.linkVersion,
        state.rootError,
      ],
    ),
}));
vi.mock("./mail/LinkedSection", () => ({
  LinkedSection: () => <div>Existing Link to search</div>,
}));
vi.mock("./useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => vi.fn() }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/dialog", () => ({
  Dialog: "div",
  DialogPopup: "div",
  DialogHeader: "div",
  DialogPanel: "div",
  DialogTitle: "h2",
}));
let domRoot: Root;
let node: HTMLDivElement;
const environmentId = EnvironmentId.make("remote");
const projectId = ProjectId.make("project");
const view = (hidden = false) => (
  <WorkspaceResourcesBodyContext value={{ restoreFocus() {}, hidden }}>
    <ProjectDriveRootSettings environmentId={environmentId} projectId={projectId} />
  </WorkspaceResourcesBodyContext>
);
const button = (label: string) => getByRole<HTMLButtonElement>(node, "button", { name: label });
const select = (label: string) => getByRole<HTMLSelectElement>(node, "combobox", { name: label });
const change = async (label: string, value: string) => {
  await act(() => {
    const input = select(label);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const click = async (label: string) => {
  await act(() => button(label).click());
};
const render = async (hidden = false) => {
  await act(() => domRoot.render(view(hidden)));
};
const choose = async (id = linkId) => {
  await click(state.root?.root ? "Replace folder" : "Choose folder");
  await change("Confirmed Drive link", id);
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  domRoot = createRoot(node);
  state.capable =
    state.explorer =
    state.connected =
    state.operate =
    state.connectionConnected =
    state.bound =
    state.folder =
      true;
  state.identity = { id: "owner", name: "Owner", email: "owner@example.test" };
  state.root = { root: null, state: "unconfigured" };
  state.rootError = null;
  state.linkVersion = 1;
  state.batchPending = false;
  state.batchError = null;
  state.refresh.mockImplementation(() => domRoot.render(view()));
  state.bindRefresh.mockImplementation(() => domRoot.render(view()));
  state.links = {
    linked: [
      {
        id: linkId,
        item: {
          ref: { type: "file", provider: "google-drive", fileId: "folder" },
          title: "SynKEK",
        },
        status: "confirmed",
        source: { type: "user" },
        updatedAt: "2026-10-13T08:30:00Z",
      },
    ],
    suggested: [],
    truncated: false,
  };
  state.setRoot.mockImplementation(async (request: { input: { root: typeof root | null } }) => {
    state.root = {
      root: request.input.root,
      state: request.input.root ? "available" : "unconfigured",
      ...(request.input.root ? { file } : {}),
    };
    state.rootError = null;
    return { _tag: "Success", value: state.root };
  });
  state.bind.mockImplementation(async () => {
    state.bound = true;
    return { _tag: "Success", value: { connectionId, file } };
  });
});
it("loads candidate bindings in one bounded batch instead of per-option reads", async () => {
  const candidate = state.links.linked[0]!;
  state.links = {
    ...state.links,
    linked: Array.from({ length: 200 }, (_, index) => ({
      ...candidate,
      id: `wl_${String(index).padStart(8, "0")}-0000-0000-0000-000000000001`,
      item: {
        ...candidate.item,
        ref: { type: "file", provider: "google-drive", fileId: `folder-${index}` },
      },
    })),
  };
  await render();
  expect(state.batchQueries).not.toHaveBeenCalled();
  await click("Choose folder");
  expect(new Set(state.batchQueries.mock.calls.map(([ids]) => ids.join(","))).size).toBe(1);
  expect(state.batchQueries.mock.calls[0]![0]).toHaveLength(200);
  expect(state.bindingQueries).not.toHaveBeenCalled();
});
it("keeps a root-only older server usable without calling unsupported batch reads", async () => {
  state.explorer = false;
  await render();
  await choose();
  expect(state.batchQueries).not.toHaveBeenCalled();
  expect(state.bindingQueries).toHaveBeenCalledWith("folder");
  expect(button("Use as project folder").disabled).toBe(false);
});
it("sorts and deduplicates batch IDs across reordered links", async () => {
  const candidate = state.links.linked[0]!;
  const document = {
    ...candidate,
    id: "wl_00000000-0000-0000-0000-000000000002",
    item: {
      ref: { type: "file" as const, provider: "google-drive" as const, fileId: "document" },
      title: "Document",
    },
  };
  state.links = {
    ...state.links,
    linked: [candidate, document, { ...candidate, id: "wl_00000000-0000-0000-0000-000000000003" }],
  };
  await render();
  await choose();
  expect(state.batchQueries.mock.calls.at(-1)![0]).toEqual(["document", "folder"]);
  state.links = { ...state.links, linked: state.links.linked.toReversed() };
  state.linkVersion++;
  await render();
  expect(new Set(state.batchQueries.mock.calls.map(([ids]) => ids.join(",")))).toEqual(
    new Set(["document,folder"]),
  );
});
it("keeps known options, selected folder, Use state and focus while changed links reload", async () => {
  const candidate = state.links.linked[0]!;
  state.links = {
    ...state.links,
    linked: [
      candidate,
      {
        ...candidate,
        id: "wl_00000000-0000-0000-0000-000000000002",
        item: {
          ref: { type: "file", provider: "google-drive", fileId: "document" },
          title: "Document",
        },
      },
    ],
  };
  await render();
  await choose();
  const use = button("Use as project folder");
  use.focus();
  expect(document.activeElement).toBe(use);
  state.links = {
    ...state.links,
    linked: state.links.linked.toReversed().concat({
      ...candidate,
      id: "wl_00000000-0000-0000-0000-000000000003",
      item: {
        ref: { type: "file", provider: "google-drive", fileId: "other-folder" },
        title: "Another folder",
      },
    }),
  };
  state.linkVersion++;
  state.batchPending = true;
  await render();
  expect(
    Array.from(select("Confirmed Drive link").options, (option) => option.textContent),
  ).toEqual(["Choose a linked item to verify", "SynKEK", "Another folder"]);
  expect(select("Confirmed Drive link").value).toBe(linkId);
  expect(node.textContent).toContain("Folder: SynKEK");
  expect(node.textContent).toContain("Bound to: Work (owner@example.test)");
  expect(use.disabled).toBe(false);
  expect(document.activeElement).toBe(use);
  state.batchPending = false;
  await render();
  expect(use.disabled).toBe(false);
  expect(document.activeElement).toBe(use);
});
it("announces a pending folder batch without disabling or blurring the dropdown", async () => {
  state.batchPending = true;
  await render();
  await click("Choose folder");
  const dropdown = select("Confirmed Drive link");
  expect(dropdown.getAttribute("aria-busy")).toBe("true");
  expect(dropdown.disabled).toBe(false);
  expect(document.activeElement).toBe(dropdown);
  expect(node.textContent).toContain("Checking which linked items are folders...");
  state.batchPending = false;
  await render();
  expect(dropdown.getAttribute("aria-busy")).toBe("false");
  expect(node.textContent).not.toContain("Checking which linked items are folders...");
});
it("retains a selected item after it verifies as a non-folder", async () => {
  await render();
  await choose();
  state.folder = false;
  await render();
  expect(select("Confirmed Drive link").selectedOptions[0]?.textContent).toBe(
    "SynKEK (not a folder)",
  );
  expect(select("Confirmed Drive link").value).toBe(linkId);
  expect(button("Use as project folder").disabled).toBe(true);
  expect(node.textContent).toContain("This linked item is not a folder.");
});
it("waits for delayed verification refresh before focusing Use", async () => {
  state.bound = false;
  state.bind.mockResolvedValueOnce({ _tag: "Success", value: { connectionId, file } });
  await render();
  await choose();
  await change("Verify with connection", connectionId);
  state.bindRefresh.mockImplementationOnce(() => {
    state.batchPending = true;
  });
  await click("Verify and bind linked item");
  expect(document.activeElement).not.toBe(button("Choose folder"));
  state.bound = true;
  state.batchPending = false;
  await render();
  expect(document.activeElement).toBe(button("Use as project folder"));
});
it("keeps checking copy out of retained reloads and errors, and returns Retry focus to the dropdown", async () => {
  await render();
  await choose();
  state.batchPending = true;
  await render();
  expect(node.textContent).not.toContain("Checking which linked items are folders...");
  state.batchError = "Batch failed";
  state.rootError = "Root failed";
  await render();
  expect(node.textContent).not.toContain("Checking which linked items are folders...");
  expect(button("Retry")).toBeTruthy();
  const retry = button("Retry folder check");
  retry.focus();
  await click("Retry folder check");
  expect(document.activeElement).toBe(retry);
  state.batchError = null;
  state.batchPending = false;
  await render();
  expect(document.activeElement).toBe(select("Confirmed Drive link"));
});
it("clears retained classifications on environment changes", async () => {
  await render();
  await choose();
  state.batchPending = true;
  await act(() =>
    domRoot.render(
      <ProjectDriveRootSettings
        environmentId={EnvironmentId.make("another")}
        projectId={projectId}
      />,
    ),
  );
  await click("Choose folder");
  expect(node.textContent).toContain("Checking which linked items are folders...");
  expect(node.textContent).not.toContain("Folder: SynKEK");
});
it("does not duplicate the root query on initial link results and announces a pending save", async () => {
  await render();
  expect(state.refresh).not.toHaveBeenCalled();
  await choose();
  let release!: (value: unknown) => void;
  state.setRoot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await click("Use as project folder");
  expect(getByRole(node, "status").textContent).toBe("Saving project folder...");
  await act(async () => release({ _tag: "Success", value: state.root }));
});
it("keeps a settings form visible when linked context hides the resource body", async () => {
  await act(() =>
    domRoot.render(
      <WorkspaceResourcesBodyContext value={{ hidden: true, restoreFocus() {} }}>
        <ProjectDriveRootSettings environmentId={environmentId} projectId={projectId} inSettings />
      </WorkspaceResourcesBodyContext>,
    ),
  );
  expect(button("Choose folder")).toBeTruthy();
});
it("shows a batch failure under the dropdown before selection and retries only that batch", async () => {
  state.batchError = "Synthetic binding lookup failure";
  await render();
  await click("Choose folder");
  const dropdown = select("Confirmed Drive link");
  const alert = getByRole(node, "alert");
  expect(dropdown.closest("label")!.nextElementSibling).toBe(alert);
  expect(alert.textContent).toContain("Could not check which linked items are folders.");
  const rootRefreshes = state.refresh.mock.calls.length;
  state.batchError = null;
  state.bindRefresh.mockImplementationOnce(() => domRoot.render(view()));
  await click("Retry folder check");
  expect(state.bindRefresh).toHaveBeenCalledTimes(1);
  expect(state.refresh).toHaveBeenCalledTimes(rootRefreshes);
  expect(queryByRole(node, "alert")).toBeNull();
});
afterEach(async () => {
  await act(() => domRoot.unmount());
  node.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("selects only an explicitly confirmed bound folder and cancels without writing", async () => {
  const candidate = state.links.linked[0]!;
  state.links = {
    ...state.links,
    linked: [
      candidate,
      {
        ...candidate,
        id: "wl_00000000-0000-0000-0000-000000000002",
        status: "suggested",
        item: { ...candidate.item, title: "Suggested folder" },
      },
      {
        ...candidate,
        id: "wl_00000000-0000-0000-0000-000000000003",
        item: { ref: { type: "url", url: "https://example.test" }, title: "Website" },
      },
      {
        ...candidate,
        id: "wl_00000000-0000-0000-0000-000000000004",
        item: {
          ref: { type: "file", provider: "google-drive", fileId: "document" },
          title: "Document",
        },
      },
    ],
    suggested: [
      { ...candidate, id: "wl_00000000-0000-0000-0000-000000000005", status: "suggested" },
    ],
  };
  await render();
  expect(node.textContent).toContain("Choose a confirmed project folder to browse Drive.");
  expect(state.setRoot).not.toHaveBeenCalled();
  await choose();
  expect(
    Array.from(select("Confirmed Drive link").options, (option) => option.textContent),
  ).toEqual(["Choose a linked item to verify", "SynKEK"]);
  expect(button("Use as project folder").disabled).toBe(false);
  expect(state.bind).not.toHaveBeenCalled();
  await click("Cancel");
  expect(queryByRole(node, "combobox", { name: "Confirmed Drive link" })).toBeNull();
  expect(node.textContent).toContain("Choose a confirmed project folder to browse Drive.");
  expect(state.setRoot).not.toHaveBeenCalled();
  await choose();
  await click("Use as project folder");
  expect(state.setRoot).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { projectId, root },
  });
  expect(node.textContent).toContain("owner@example.test");
  expect(node.textContent).toContain("Files stay in Google Drive.");
  expect(button("Replace folder")).toBeTruthy();
});
it("retains the saved root on failed replacement and clears with a disconnected Drive account", async () => {
  await render();
  await choose();
  await click("Use as project folder");
  expect(state.root?.root).toEqual(root);
  const nextLink = "wl_00000000-0000-0000-0000-000000000002";
  state.links = {
    ...state.links,
    linked: [
      ...state.links.linked,
      {
        ...state.links.linked[0]!,
        id: nextLink,
        item: {
          ref: { type: "file", provider: "google-drive", fileId: "other-folder" },
          title: "Another folder",
        },
      },
    ],
  };
  await render();
  await choose(nextLink);
  state.setRoot.mockResolvedValueOnce({
    _tag: "Failure",
    cause: Cause.fail(new Error("The folder changed. Retry.")),
  });
  await click("Use as project folder");
  expect(state.setRoot).toHaveBeenLastCalledWith({
    environmentId,
    input: { projectId, root: { ...root, linkId: nextLink, fileId: "other-folder" } },
  });
  expect(state.root?.root).toEqual(root);
  expect(getByRole(node, "alert").textContent).toBe("The folder changed. Retry.");
  expect(node.textContent).toContain("SynKEK");
  expect(node.textContent).toContain("Files stay in Google Drive.");
  expect(select("Confirmed Drive link").value).toBe(nextLink);
  await click("Cancel");
  state.connectionConnected = false;
  state.root = { ...state.root!, state: "disconnected" };
  await render();
  expect(node.textContent).toContain("Reconnect this Drive connection in Settings.");
  expect(button("Clear project folder").disabled).toBe(false);
  await click("Clear project folder");
  expect(state.setRoot).toHaveBeenLastCalledWith({
    environmentId,
    input: { projectId, root: null },
  });
  expect(node.textContent).toContain("Choose a confirmed project folder to browse Drive.");
  expect(queryByRole(node, "button", { name: "Clear project folder" })).toBeNull();
  expect(state.bind).not.toHaveBeenCalled();
});
it("focuses the link select on Choose and returns focus after Cancel, save and Clear", async () => {
  await render();
  await click("Choose folder");
  expect(document.activeElement).toBe(select("Confirmed Drive link"));
  await click("Cancel");
  expect(document.activeElement).toBe(button("Choose folder"));
  await choose();
  await click("Use as project folder");
  expect(document.activeElement).toBe(button("Replace folder"));
  await click("Clear project folder");
  expect(document.activeElement).toBe(button("Choose folder"));
});
it("requires explicit verification and account selection for missing metadata, then focuses Use", async () => {
  state.bound = false;
  await render();
  await choose();
  expect(button("Use as project folder").disabled).toBe(true);
  expect(button("Verify and bind linked item").disabled).toBe(true);
  expect(node.textContent).toContain("Choose a connection and verify this linked item");
  expect(state.bind).not.toHaveBeenCalled();
  await change("Verify with connection", connectionId);
  await click("Verify and bind linked item");
  expect(state.bind).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { connectionId, fileId: "folder" },
  });
  expect(state.setRoot).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button("Use as project folder"));
});
it("focuses Choose after binding if refreshed folder metadata is still unavailable", async () => {
  state.bound = false;
  state.bind.mockResolvedValueOnce({ _tag: "Success", value: { connectionId, file } });
  await render();
  await choose();
  await change("Verify with connection", connectionId);
  await click("Verify and bind linked item");
  expect(button("Use as project folder").disabled).toBe(true);
  expect(document.activeElement).toBe(button("Choose folder"));
});
it("refreshes after link removal and renders another client's changed root without using config authority", async () => {
  state.root = { root, state: "available", file };
  await render();
  expect(node.textContent).toContain("SynKEK");
  state.refresh.mockClear();
  state.links = { linked: [], suggested: [], truncated: false };
  state.linkVersion++;
  await render();
  expect(state.refresh).toHaveBeenCalled();
  expect(node.textContent).toContain("no longer linked");
  state.root = {
    root: { ...root, fileId: "other-root" },
    state: "disconnected",
    file: { ...file, name: "Changed by another client" },
  };
  await render();
  expect(node.textContent).toContain("Changed by another client");
  expect(node.textContent).not.toContain("SynKEK");
  expect(state.rootQuery).toHaveBeenLastCalledWith({ environmentId, input: { projectId } });
  // A dedicated-root unconfiguration must remove the old designation and restore the fallback.
  state.root = { root: null, state: "unconfigured" };
  await render();
  expect(node.textContent).toContain("Choose a confirmed project folder to browse Drive.");
  expect(node.textContent).not.toContain("Changed by another client");
  expect(button("Choose folder")).toBeTruthy();
});
it("shows truncated-link recovery and rejects deleted projects, read-only and disconnected writes", async () => {
  state.links = { ...state.links, truncated: true };
  await render();
  expect(node.textContent).toContain("More links may exist");
  await click("Link to");
  expect(node.textContent).toContain("Existing Link to search");
  state.operate = false;
  await render();
  expect(button("Choose folder").disabled).toBe(true);
  state.root = { root, state: "available", file };
  await render();
  expect(button("Replace folder").disabled).toBe(true);
  expect(button("Clear project folder").disabled).toBe(true);
  expect(node.textContent).toContain("SynKEK");
  expect(node.textContent).toContain("You need operate permission");
  state.operate = true;
  state.root = undefined;
  state.rootError = "This project is unavailable.";
  await render();
  expect(button("Choose folder").disabled).toBe(true);
  state.connected = false;
  await render();
  expect(node.textContent).toContain(
    "Connect to this environment to manage its project Drive folder.",
  );
  expect(queryByRole(node, "button")).toBeNull();
  expect(state.setRoot).not.toHaveBeenCalled();
});
it("offers Clear and Retry on an unavailable root read without claiming it is loading", async () => {
  state.root = undefined;
  state.rootError =
    "Drive settings or credentials could not be saved or read. Retry when server storage is available.";
  await render();
  expect(node.textContent).not.toContain("Loading project Drive folder");
  expect(getByRole(node, "alert").textContent).toBe(state.rootError);
  expect(button("Choose folder").disabled).toBe(true);
  expect(button("Clear project folder").disabled).toBe(false);
  await click("Retry");
  expect(state.refresh).toHaveBeenCalled();
  await click("Clear project folder");
  expect(state.setRoot).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { projectId, root: null },
  });
  expect(node.textContent).toContain("Choose a confirmed project folder to browse Drive.");
  expect(document.activeElement).toBe(button("Choose folder"));
});
it.each([undefined, { id: "owner", name: "" }, { id: "owner", name: "Owner" }])(
  "labels accounts truthfully with optional identity %j",
  async (identity) => {
    state.identity = identity;
    state.root = { root, state: "available", file };
    await render();
    await choose();
    const expected = identity?.name ? "Work (Owner)" : "Work";
    expect(select("Verify with connection").options[1]!.textContent).toBe(expected);
    expect(node.textContent).not.toContain("Disconnected");
    expect(node.textContent).not.toContain("(disconnected)");
    state.connectionConnected = false;
    await render();
    expect(node.textContent?.match(/\(disconnected\)/g)).toHaveLength(2);
    expect(node.textContent).not.toContain("(disconnected) (disconnected)");
    expect(select("Verify with connection").options).toHaveLength(1);
  },
);
it("explains pending verification and a disconnected binding below the action row", async () => {
  await render();
  await choose();
  await change("Verify with connection", connectionId);
  expect(button("Use as project folder").disabled).toBe(true);
  expect(node.textContent).toContain("Verify and bind first, or clear the connection choice.");
  await change("Verify with connection", "");
  state.connectionConnected = false;
  await render();
  expect(button("Use as project folder").disabled).toBe(true);
  expect(node.textContent).toContain("The bound Drive connection is disconnected.");
});
it("makes no root RPCs on old servers, after capability downgrade, or while hidden", async () => {
  state.capable = false;
  await render();
  expect(state.rootQuery).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Project Drive folders need a newer server.");
  await click("Link to");
  expect(node.textContent).toContain("Existing Link to search");
  const toggle = button("Close linked files");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(
    node.querySelector(`#${CSS.escape(toggle.getAttribute("aria-controls")!)}`)?.textContent,
  ).toBe("Existing Link to search");
  state.capable = true;
  await render(true);
  expect(state.rootQuery).not.toHaveBeenCalled();
  expect(node.textContent).toBe("");
  await render();
  expect(state.rootQuery).toHaveBeenCalled();
  state.rootQuery.mockClear();
  state.capable = false;
  await render();
  expect(state.rootQuery).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Project Drive folders need a newer server.");
  expect(node.textContent).toContain("Existing Link to search");
  await click("Close linked files");
  expect(button("Link to")).toBeTruthy();
  state.connected = false;
  await render();
  expect(node.textContent).toContain(
    "Connect to this environment to manage its project Drive folder.",
  );
  expect(queryByRole(node, "button")).toBeNull();
  expect(state.setRoot).not.toHaveBeenCalled();
});
