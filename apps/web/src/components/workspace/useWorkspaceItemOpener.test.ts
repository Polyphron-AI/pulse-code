// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { ProjectId as importProjectId, EnvironmentId } from "@t3tools/contracts";
import {
  parseTaskLocation,
  useWorkspaceItemOpener,
  useMeetingNoteCreator,
  parseMailLocation,
} from "./useWorkspaceItemOpener";

const boundary = vi.hoisted(() => ({
  navigate: vi.fn(),
  external: vi.fn(),
  v2: false as boolean | undefined,
}));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ shell: { openExternal: boundary.external } }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => boundary.navigate }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceTasksV2: boundary.v2 }),
}));
describe("workspace source-message locations", () => {
  it("retains account and Message-ID when opening source from another space", () => {
    const source = { type: "mail", accountId: "account-b", messageId: "<captured@example.test>" };
    expect(parseMailLocation(JSON.stringify(source))).toEqual(source);
  });
  it("rejects malformed locations and unrelated item kinds", () => {
    expect(parseMailLocation("{")).toBeNull();
    expect(parseMailLocation(JSON.stringify({ type: "mail", accountId: "account-b" }))).toBeNull();
    expect(
      parseMailLocation(JSON.stringify({ type: "url", url: "https://example.test" })),
    ).toBeNull();
  });
});

it.each([true, false])(
  "opens URL refs through the optional Browser handler and leaves Drive external: %s",
  async (resource) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    boundary.external.mockClear();
    const openPage = vi.fn();
    const ref = { type: "url" as const, url: "https://example.test/page?utm_source=x#part" };
    function Harness() {
      const open = useWorkspaceItemOpener(
        EnvironmentId.make("remote"),
        resource ? { openPage } : undefined,
      );
      return createElement("button", {
        onClick: () => {
          open(ref);
          open({ type: "file", provider: "google-drive", fileId: "file-a" });
        },
      });
    }
    let view!: ReactTestRenderer;
    await act(() => {
      view = create(createElement(Harness));
    });
    try {
      await act(() => view.root.findByType("button").props.onClick());
      expect(openPage.mock.calls).toEqual(resource ? [[ref]] : []);
      expect(boundary.external.mock.calls).toEqual([
        ...(!resource ? [[ref.url]] : []),
        ["https://drive.google.com/file/d/file-a/view"],
      ]);
    } finally {
      await act(() => view.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it.each([true, false, undefined])(
  "opens exact task refs in their captured environment with live capability %s",
  async (flag) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    boundary.v2 = flag;
    const task = { type: "task" as const, taskId: "wskt_00000000-0000-4000-8000-000000000001" };
    function Harness() {
      const open = useWorkspaceItemOpener(EnvironmentId.make("remote"));
      return createElement("button", { onClick: () => open(task) });
    }
    let renderer!: ReactTestRenderer;
    await act(() => {
      renderer = create(createElement(Harness));
    });
    try {
      await act(() => renderer.root.findByType("button").props.onClick());
      expect(boundary.navigate).toHaveBeenLastCalledWith({
        to: "/workspace",
        search: {
          space: flag ? "tasks" : "projects",
          environment: "remote",
          item: JSON.stringify(task),
        },
      });
      expect(parseTaskLocation(JSON.stringify(task))).toEqual(task);
      expect(parseTaskLocation("{")).toBeNull();
    } finally {
      await act(() => renderer.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it("opens a calendar ref in the captured environment without granting it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.navigate.mockClear();
  const ref = {
    type: "provider-resource",
    provider: "workspace-calendar",
    resourceId: "wce_00000000-0000-0000-0000-000000000001",
  } as const;
  const capture =
    vi.fn<(open: (item: import("@t3tools/contracts").WorkspaceItemRef) => void) => void>();
  function Harness({ environment }: { environment: string }) {
    const open = useWorkspaceItemOpener(EnvironmentId.make(environment));
    return createElement("button", {
      onClick: () => {
        capture(open);
      },
    });
  }
  let renderer!: ReactTestRenderer;
  await act(() => {
    renderer = create(createElement(Harness, { environment: "original" }));
  });
  try {
    await act(() => renderer.root.findByType("button").props.onClick());
    await act(() => renderer.update(createElement(Harness, { environment: "other" })));
    const captured = capture.mock.calls[0]![0];
    await act(() => captured(ref));
    expect(boundary.navigate).toHaveBeenLastCalledWith({
      to: "/workspace",
      search: { space: "calendar", environment: "original", item: JSON.stringify(ref) },
    });
    boundary.navigate.mockClear();
    await act(() => captured({ ...ref, resourceId: "wce_invalid" }));
    expect(boundary.navigate).not.toHaveBeenCalled();
  } finally {
    await act(() => renderer.unmount());
    vi.unstubAllGlobals();
  }
});

it("opens a native note ref in the captured environment without granting it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.navigate.mockClear();
  const ref = {
    type: "provider-resource",
    provider: "workspace-note",
    resourceId: "wsn_00000000-0000-0000-0000-000000000001",
  } as const;
  const capture =
    vi.fn<(open: (item: import("@t3tools/contracts").WorkspaceItemRef) => void) => void>();
  function Harness({ environment }: { environment: string }) {
    const open = useWorkspaceItemOpener(EnvironmentId.make(environment));
    return createElement("button", {
      onClick: () => {
        capture(open);
      },
    });
  }
  let renderer!: ReactTestRenderer;
  await act(() => {
    renderer = create(createElement(Harness, { environment: "original" }));
  });
  try {
    await act(() => renderer.root.findByType("button").props.onClick());
    await act(() => renderer.update(createElement(Harness, { environment: "other" })));
    const captured = capture.mock.calls[0]![0];
    await act(() => captured(ref));
    expect(boundary.navigate).toHaveBeenLastCalledWith({
      to: "/workspace",
      search: { space: "meetings", environment: "original", item: JSON.stringify(ref) },
    });
    boundary.navigate.mockClear();
    await act(() => captured({ ...ref, resourceId: "wsn_invalid" }));
    expect(boundary.navigate).not.toHaveBeenCalled();
  } finally {
    await act(() => renderer.unmount());
    vi.unstubAllGlobals();
  }
});

const noteBoundary = vi.hoisted(() => ({
  create: vi.fn(),
  link: vi.fn(),
  operate: true,
  connected: true,
}));
vi.mock("../../state/workspaceNotes", () => ({ workspaceNotes: { create: "note-create" } }));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { link: "note-link" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: string) =>
    name === "note-create" ? noteBoundary.create : noteBoundary.link,
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (noteBoundary.connected ? ["original", "other"] : []),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => noteBoundary.operate }));

it("binds create and repair to the original environment and refuses read-only writes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  noteBoundary.create.mockReset().mockResolvedValue({
    _tag: "Success",
    value: { id: "wsn_00000000-0000-0000-0000-000000000001", title: "Review" },
  });
  noteBoundary.link
    .mockReset()
    .mockResolvedValueOnce({ _tag: "Success", value: {} })
    .mockRejectedValueOnce(new Error("Disconnected"))
    .mockResolvedValue({ _tag: "Success", value: {} });
  const captureCreator = vi.fn<(creator: ReturnType<typeof useMeetingNoteCreator>) => void>();
  function Harness({ environment }: { environment: string }) {
    const createNote = useMeetingNoteCreator(EnvironmentId.make(environment));
    return createElement("button", {
      onClick: () => {
        captureCreator(createNote);
      },
    });
  }
  let renderer!: ReactTestRenderer;
  await act(() => {
    renderer = create(createElement(Harness, { environment: "original" }));
  });
  try {
    await act(() => renderer.root.findByType("button").props.onClick());
    const original = captureCreator.mock.calls[0]![0];
    await act(() => renderer.update(createElement(Harness, { environment: "other" })));
    const input = {
      requestId: "00000000-0000-0000-0000-000000000001",
      title: "Review",
      body: "Draft",
      projectId: importProjectId.make("p"),
      meeting: {
        ref: {
          type: "provider-resource" as const,
          provider: "workspace-calendar",
          resourceId: "wce_00000000-0000-0000-0000-000000000001",
        },
      },
    };
    const saved = vi.fn();
    await expect(original(input, saved)).rejects.toThrow(
      "Note saved. Linking did not finish. Retry linking.",
    );
    expect(saved).toHaveBeenCalledOnce();
    await original(input, saved);
    expect(
      noteBoundary.create.mock.calls.every(([value]) => value.environmentId === "original"),
    ).toBe(true);
    expect(
      noteBoundary.link.mock.calls.every(([value]) => value.environmentId === "original"),
    ).toBe(true);
    expect(noteBoundary.link.mock.calls[0]).toEqual(noteBoundary.link.mock.calls[2]);
    expect(noteBoundary.link.mock.calls[1]).toEqual(noteBoundary.link.mock.calls[3]);
    noteBoundary.operate = false;
    await act(() => renderer.update(createElement(Harness, { environment: "original" })));
    await act(() => renderer.root.findByType("button").props.onClick());
    await expect(captureCreator.mock.calls.at(-1)![0](input)).rejects.toThrow("operate access");
    expect(noteBoundary.create).toHaveBeenCalledTimes(2);
  } finally {
    noteBoundary.operate = true;
    await act(() => renderer.unmount());
    vi.unstubAllGlobals();
  }
});
