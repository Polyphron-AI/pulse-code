import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
vi.mock("../ui/input", () => ({ Input: (props: object) => <input {...props} /> }));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
import { ProjectDrivePanel } from "./ProjectDrivePanel";
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
it("filters loaded Drive files without changing the folder or fetching unrelated data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const invoke = vi.fn().mockResolvedValue({
    ok: true,
    files: [
      { id: "folder", name: "SEO", mimeType: "application/vnd.google-apps.folder", parents: [] },
      { id: "doc", name: "Brief", mimeType: "text/plain", parents: [] },
    ],
  });
  vi.stubGlobal("window", { desktopBridge: { officeInvoke: invoke } });
  await act(async () => {
    renderer = create(
      <ProjectDrivePanel
        drive={{ accountId: "google", folderId: "root", folderName: "SynKEK" }}
        onConfigure={() => {}}
        onOpenFile={() => {}}
      />,
    );
  });
  const rowCount = () => renderer!.root.findByType("tbody").findAllByType("tr").length;
  expect(rowCount()).toBe(2);
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "File type" })
      .props.onChange({ target: { value: "folders" } }),
  );
  expect(rowCount()).toBe(1);
  expect(JSON.stringify(renderer!.toJSON())).toContain("SEO");
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "File type" })
      .props.onChange({ target: { value: "files" } }),
  );
  expect(rowCount()).toBe(1);
  expect(invoke).toHaveBeenCalledTimes(1);
});
