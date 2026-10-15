import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { DriveSearch, DriveFileAccess } from "./DriveFiles";
const mocks = vi.hoisted(() => ({ capable: true, search: vi.fn(), bind: vi.fn(), query: vi.fn() }));
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
  drive: { connections: (input: unknown) => input, search: "search", bind: "bind" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) => (command === "search" ? mocks.search : mocks.bind),
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
