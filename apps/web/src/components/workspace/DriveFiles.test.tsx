import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { DriveSearch, DriveFileAccess } from "./DriveFiles";
const mocks = vi.hoisted(() => ({
  capable: true,
  connected: true,
  search: vi.fn(),
  bind: vi.fn(),
  read: vi.fn(),
  query: vi.fn(),
  binding: "first",
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (mocks.connected ? ["remote"] : []),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: ["orchestration:operate"] },
  }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ driveRead: mocks.capable }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (input: unknown) => {
    mocks.query(input);
    if (input === "binding")
      return { data: { binding: { connectionId: mocks.binding } }, error: null, refresh: vi.fn() };
    return {
      data: [
        {
          id: "drv_00000000-0000-0000-0000-000000000001",
          nickname: "Chosen",
          connected: true,
          identity: { name: "Fixture" },
        },
      ],
      error: null,
    };
  },
}));
vi.mock("../../state/drive", () => ({
  drive: {
    connections: (input: unknown) => input,
    binding: () => "binding",
    read: "read",
    search: "search",
    bind: "bind",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) =>
    command === "search" ? mocks.search : command === "read" ? mocks.read : mocks.bind,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => children,
  DialogPopup: "section",
  DialogHeader: "header",
  DialogPanel: "main",
  DialogTitle: "h2",
}));
let renderer: ReactTestRenderer | undefined;
const environmentId = EnvironmentId.make("remote");
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.capable = true;
  mocks.connected = true;
  mocks.binding = "first";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("gates old servers without creating Drive search queries or reader controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.capable = false;
  await act(() => {
    renderer = create(
      <>
        <DriveSearch environmentId={environmentId} onLink={async () => {}} />
        <DriveFileAccess environmentId={environmentId} fileId="file" />
      </>,
    );
  });
  expect(mocks.query).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType("button")).toHaveLength(0);
});
it("unmounts search and reader queries when the environment disconnects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = (
    <>
      <DriveSearch environmentId={environmentId} onLink={async () => {}} />
      <DriveFileAccess environmentId={environmentId} fileId="file" />
    </>
  );
  await act(() => {
    renderer = create(view);
  });
  mocks.query.mockClear();
  mocks.connected = false;
  await act(() =>
    renderer!.update(
      <>
        <DriveSearch environmentId={environmentId} onLink={async () => {}} />
        <DriveFileAccess environmentId={environmentId} fileId="file" />
      </>,
    ),
  );
  expect(mocks.query).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType("button")).toHaveLength(0);
});
it("requires an explicit account, then verifies binding before linking search results", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onLink = vi.fn().mockResolvedValue(undefined);
  mocks.search.mockResolvedValue({
    _tag: "Success",
    value: {
      files: [
        {
          id: "file-one",
          name: "Brief",
          mimeType: "text/plain",
          url: "https://drive.google.com/file/d/file-one/view",
        },
      ],
      incomplete: false,
    },
  });
  mocks.bind.mockResolvedValue({
    _tag: "Success",
    value: {
      connectionId: "drv_00000000-0000-0000-0000-000000000001",
      file: { id: "file-one", name: "Latest brief" },
    },
  });
  await act(() => {
    renderer = create(<DriveSearch environmentId={environmentId} onLink={onLink} />);
  });
  expect(renderer!.root.findByType("select").props.value).toBe("");
  expect(mocks.search).not.toHaveBeenCalled();
  await act(() =>
    renderer!.root
      .findByType("select")
      .props.onChange({ target: { value: "drv_00000000-0000-0000-0000-000000000001" } }),
  );
  await act(() =>
    renderer!.root.findByType("input").props.onChange({ target: { value: "Launch" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.search).toHaveBeenCalledWith({
    environmentId,
    input: { connectionId: "drv_00000000-0000-0000-0000-000000000001", query: "Launch", limit: 20 },
  });
  expect(onLink).not.toHaveBeenCalled();
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Brief")!
      .props.onClick(),
  );
  expect(mocks.bind).toHaveBeenCalledWith({
    environmentId,
    input: { connectionId: "drv_00000000-0000-0000-0000-000000000001", fileId: "file-one" },
  });
  expect(onLink).toHaveBeenCalledWith({
    ref: { type: "file", provider: "google-drive", fileId: "file-one" },
    title: "Latest brief",
  });
});
it("invalidates accumulated pages and late reads after a subscription-driven binding change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const page = (connectionId: string, text: string, nextOffset?: number) => ({
    _tag: "Success",
    value: {
      connectionId,
      file: { id: "file", name: "Brief" },
      body: { text, truncated: nextOffset !== undefined, nextOffset },
    },
  });
  mocks.read.mockResolvedValueOnce(page("first", "Old account text", 16));
  await act(() => {
    renderer = create(<DriveFileAccess environmentId={environmentId} fileId="file" />);
  });
  const button = (label: string) =>
    renderer!.root.findAllByType("button").findLast((node) => node.props.children === label)!;
  await act(() => button("Read file").props.onClick());
  await act(() => button("Read file").props.onClick());
  expect(renderer!.root.findByType("pre").props.children).toBe("Old account text");
  let finishOld!: (value: ReturnType<typeof page>) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  await act(() => {
    button("Read more").props.onClick();
  });
  mocks.binding = "second";
  await act(() =>
    renderer!.update(<DriveFileAccess environmentId={environmentId} fileId="file" />),
  );
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
  expect(
    renderer!.root.findAllByType("button").some((node) => node.props.children === "Read more"),
  ).toBe(false);
  await act(() => finishOld(page("first", "Late old page")));
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
  mocks.read.mockResolvedValueOnce(page("second", "New account text"));
  await act(() => button("Read file").props.onClick());
  expect(mocks.read).toHaveBeenLastCalledWith({
    environmentId,
    input: { fileId: "file", offset: 0 },
  });
  expect(renderer!.root.findByType("pre").props.children).toBe("New account text");
  mocks.read.mockResolvedValueOnce(page("first", "Wrong identity"));
  await act(() => button("Read file").props.onClick());
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
  expect(renderer!.root.findByProps({ role: "alert" }).props.children).toContain(
    "connection changed",
  );
});
