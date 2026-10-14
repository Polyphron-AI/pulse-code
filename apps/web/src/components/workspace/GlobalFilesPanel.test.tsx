import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
const projects = vi.hoisted(() => [
  {
    id: "one",
    environmentId: "host",
    title: "Marketing",
    office: { drive: { accountId: "google", folderId: "root-one", folderName: "Campaigns" } },
  },
  { id: "two", environmentId: "host", title: "Website" },
]);
vi.mock("../../state/entities", () => ({ useProjects: () => projects }));
vi.mock("./ProjectDrivePanel", () => ({
  ProjectDrivePanel: ({
    drive,
    onOpenFile,
  }: {
    drive: { folderId: string };
    onOpenFile: (file: object) => void;
  }) => (
    <button
      data-folder={drive.folderId}
      onClick={() =>
        onOpenFile({ name: "Brief", webViewLink: "https://docs.google.com/document/d/brief" })
      }
    >
      Choose Brief
    </button>
  ),
}));
vi.mock("../ui/input", () => ({ Input: (props: object) => <input {...props} /> }));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
import { GlobalFilesPanel } from "./GlobalFilesPanel";
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
it("opens real project folders and only inserts a selected file on explicit action", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const insert = vi.fn(() => true);
  await act(async () => {
    renderer = create(<GlobalFilesPanel canInsert onInsertLink={insert} />);
  });
  expect(renderer!.root.findAllByType("button")).toHaveLength(2);
  act(() => renderer!.root.findAllByType("button")[0]!.props.onClick());
  expect(renderer!.root.findByProps({ "data-folder": "root-one" })).toBeDefined();
  act(() => renderer!.root.findByProps({ "data-folder": "root-one" }).props.onClick());
  expect(insert).not.toHaveBeenCalled();
  act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children?.includes?.(" Insert link in draft"))!
      .props.onClick(),
  );
  expect(insert).toHaveBeenCalledWith("Brief", "https://docs.google.com/document/d/brief");
});
it("shows unlinked projects and routes connection setup without inventing files", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const configure = vi.fn();
  await act(async () => {
    renderer = create(
      <GlobalFilesPanel
        canInsert={false}
        onInsertLink={() => false}
        onConfigureProject={configure}
      />,
    );
  });
  act(() => renderer!.root.findAllByType("button")[1]!.props.onClick());
  expect(renderer!.root.findAllByProps({ "data-folder": "root-one" })).toHaveLength(0);
  act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Connect Google Drive")!
      .props.onClick(),
  );
  expect(configure).toHaveBeenCalledWith(projects[1]);
});
