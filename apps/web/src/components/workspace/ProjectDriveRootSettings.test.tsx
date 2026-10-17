import * as Cause from "effect/Cause";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  type DriveProjectRootResult,
  type WorkspaceLinkList,
} from "@t3tools/contracts";
import { ProjectDriveRootSettings } from "./ProjectDriveRootSettings";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";

const state = vi.hoisted(() => ({
  capable: true,
  connected: true,
  operate: true,
  connectionConnected: true,
  root: { root: null, state: "unconfigured" } as DriveProjectRootResult,
  rootError: null as string | null,
  links: { linked: [], suggested: [], truncated: false } as WorkspaceLinkList,
  linkVersion: 1,
  bound: true,
  folder: true,
  rootQuery: vi.fn(),
  refresh: vi.fn(),
  bindRefresh: vi.fn(),
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
    driveRead: true,
    workspaceLinks: true,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => state.operate }));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (state.connected ? ["remote"] : []),
}));
vi.mock("../../state/drive", () => ({
  drive: {
    projectRoot: (input: unknown) => {
      state.rootQuery(input);
      return "root";
    },
    connections: () => "connections",
    binding: () => "binding",
    setProjectRoot: "set",
    bind: "bind",
  },
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: () => "links" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "set" ? state.setRoot : state.bind),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: string | null) => ({
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
                  identity: { email: "owner@example.test" },
                },
              ]
            : query === "binding"
              ? {
                  binding: state.bound
                    ? {
                        connectionId: "drv_00000000-0000-0000-0000-000000000001",
                        file: {
                          id: "folder",
                          name: "SynKEK",
                          mimeType: state.folder
                            ? "application/vnd.google-apps.folder"
                            : "text/plain",
                        },
                      }
                    : undefined,
                }
              : null,
    dataUpdatedAt: query === "links" ? state.linkVersion : 1,
    error: query === "root" ? state.rootError : null,
    refresh: query === "binding" ? state.bindRefresh : state.refresh,
  }),
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
let renderer: ReactTestRenderer | undefined;
const environmentId = EnvironmentId.make("remote");
const projectId = ProjectId.make("project");
const view = (hidden = false) => (
  <WorkspaceResourcesBodyContext value={{ restoreFocus() {}, hidden }}>
    <ProjectDriveRootSettings environmentId={environmentId} projectId={projectId} />
  </WorkspaceResourcesBodyContext>
);
const button = (label: string) =>
  renderer!.root.findAllByType("button").find((item) => item.children.join("") === label)!;
const choose = async () => {
  await act(() => button(state.root.root ? "Replace folder" : "Choose folder").props.onClick());
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Confirmed Drive link" })
      .props.onChange({ target: { value: linkId } }),
  );
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.capable =
    state.connected =
    state.operate =
    state.connectionConnected =
    state.bound =
    state.folder =
      true;
  state.root = { root: null, state: "unconfigured" };
  state.rootError = null;
  state.linkVersion = 1;
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
    return { _tag: "Success", value: state.root };
  });
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("selects only an explicitly confirmed bound folder and cancels without writing", async () => {
  state.links = {
    ...state.links,
    suggested: [
      {
        ...state.links.linked[0]!,
        id: "wl_00000000-0000-0000-0000-000000000002",
        status: "suggested",
      },
    ],
  };
  await act(() => {
    renderer = create(view());
  });
  expect(state.setRoot).not.toHaveBeenCalled();
  await choose();
  expect(
    renderer!.root.findByProps({ "aria-label": "Confirmed Drive link" }).findAllByType("option"),
  ).toHaveLength(2);
  expect(state.bind).not.toHaveBeenCalled();
  await act(() => button("Cancel").props.onClick());
  expect(state.setRoot).not.toHaveBeenCalled();
  await choose();
  await act(() => button("Use as project folder").props.onClick());
  expect(state.setRoot).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { projectId, root },
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("owner@example.test");
});
it("retains the saved root on failed replacement and clears with a disconnected Drive account", async () => {
  state.root = {
    root: { ...root, fileId: "old-folder" },
    state: "available",
    file: { ...file, id: "old-folder", name: "Previous folder" },
  };
  await act(() => {
    renderer = create(view());
  });
  await choose();
  state.setRoot.mockResolvedValueOnce({
    _tag: "Failure",
    cause: Cause.fail(new Error("The folder changed. Retry.")),
  });
  await act(() => button("Use as project folder").props.onClick());
  expect(JSON.stringify(renderer!.toJSON())).toContain("Previous folder");
  expect(JSON.stringify(renderer!.toJSON())).toContain("The folder changed. Retry.");
  await act(() => button("Cancel").props.onClick());
  state.connectionConnected = false;
  state.root = { ...state.root, state: "disconnected" };
  await act(() => renderer!.update(view()));
  expect(button("Clear project folder").props.disabled).toBe(false);
  await act(() => button("Clear project folder").props.onClick());
  expect(state.setRoot.mock.calls.at(-1)?.[0].input.root).toBeNull();
  expect(state.bind).not.toHaveBeenCalled();
});
it("requires explicit verification and account selection for missing metadata, and excludes non-folders", async () => {
  state.bound = false;
  await act(() => {
    renderer = create(view());
  });
  await choose();
  expect(button("Use as project folder").props.disabled).toBe(true);
  expect(button("Verify and bind linked item").props.disabled).toBe(true);
  expect(state.bind).not.toHaveBeenCalled();
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Drive connection" })
      .props.onChange({ target: { value: connectionId } }),
  );
  state.bind.mockResolvedValueOnce({ _tag: "Success", value: { connectionId, file } });
  await act(() => button("Verify and bind linked item").props.onClick());
  expect(state.bind).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { connectionId, fileId: "folder" },
  });
  expect(state.setRoot).not.toHaveBeenCalled();
  state.bound = true;
  state.folder = false;
  await act(() => renderer!.update(view()));
  expect(button("Use as project folder").props.disabled).toBe(true);
  expect(JSON.stringify(renderer!.toJSON())).toContain("not a folder");
});
it("refreshes after link removal and renders another client's changed root without using config authority", async () => {
  state.root = { root, state: "available", file };
  await act(() => {
    renderer = create(view());
  });
  state.refresh.mockClear();
  state.links = { linked: [], suggested: [], truncated: false };
  state.linkVersion++;
  await act(() => renderer!.update(view()));
  expect(state.refresh).toHaveBeenCalled();
  expect(JSON.stringify(renderer!.toJSON())).toContain("no longer linked");
  state.root = {
    root: { ...root, fileId: "other-root" },
    state: "disconnected",
    file: { ...file, name: "Changed by another client" },
  };
  await act(() => renderer!.update(view()));
  expect(JSON.stringify(renderer!.toJSON())).toContain("Changed by another client");
});
it("shows truncated-link recovery and rejects deleted projects, read-only and disconnected writes", async () => {
  state.links = { ...state.links, truncated: true };
  await act(() => {
    renderer = create(view());
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("More links may exist");
  await act(() => button("Link to").props.onClick());
  expect(JSON.stringify(renderer!.toJSON())).toContain("Existing Link to search");
  state.operate = false;
  await act(() => renderer!.update(view()));
  expect(button("Choose folder").props.disabled).toBe(true);
  state.operate = true;
  state.rootError = "This project is unavailable.";
  await act(() => renderer!.update(view()));
  expect(button("Choose folder").props.disabled).toBe(true);
  state.connected = false;
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findAllByType("button")).toHaveLength(0);
  expect(state.setRoot).not.toHaveBeenCalled();
});
it("makes no root RPCs on old servers, after capability downgrade, or while hidden", async () => {
  state.capable = false;
  await act(() => {
    renderer = create(view());
  });
  expect(state.rootQuery).not.toHaveBeenCalled();
  state.capable = true;
  await act(() => renderer!.update(view(true)));
  expect(state.rootQuery).not.toHaveBeenCalled();
  await act(() => renderer!.update(view()));
  expect(state.rootQuery).toHaveBeenCalled();
  state.rootQuery.mockClear();
  state.capable = false;
  await act(() => renderer!.update(view()));
  expect(state.rootQuery).not.toHaveBeenCalled();
  expect(state.setRoot).not.toHaveBeenCalled();
});
