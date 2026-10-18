// @vitest-environment happy-dom
import { act, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import {
  WorkspaceResourcesProvider,
  useWorkspaceResourceState,
  useWorkspaceResources,
} from "./workspaceResourceState";
import { useOpenFiles, type OpenFiles } from "./openFiles";

let open: OpenFiles;
let state: ReturnType<typeof useWorkspaceResources>;
const environmentId = EnvironmentId.make("drive-env");
const projectId = ProjectId.make("drive-project");
const node = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const storage = { getItem: () => null, setItem: vi.fn() };
function Consumer() {
  const [selectedItem] = useState<WorkspaceLinkEndpoint>({
    ref: { type: "project", projectId },
    title: "Center project",
  });
  const nextOpen = useOpenFiles();
  const nextState = useWorkspaceResources();
  useLayoutEffect(() => {
    open = nextOpen;
    state = nextState;
  });
  return (
    <>
      <p>{selectedItem.title}</p>
      <textarea defaultValue="Keep draft" />
    </>
  );
}
function Host() {
  const value = useWorkspaceResourceState(environmentId, { storage });
  return (
    <WorkspaceResourcesProvider value={value}>
      <Consumer />
    </WorkspaceResourcesProvider>
  );
}
afterEach(async () => {
  if (root) await act(() => root.unmount());
  vi.unstubAllGlobals();
});
it("receives folder, file and root intents in the one resource state without changing the center draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(node);
  await act(() => root.render(<Host />));
  for (const intent of [{ folderId: "folder" }, { fileId: "document" }, {}]) {
    await act(() => open({ environmentId, projectId, ...intent }));
    expect(state.selectedTab).toBe("files");
    expect(state.projectId).toBe(projectId);
    expect(state.open).toBe(true);
    expect(state.request).toEqual(
      "folderId" in intent
        ? { type: "file", provider: "google-drive", fileId: "folder", driveKind: "folder" }
        : "fileId" in intent
          ? { type: "file", provider: "google-drive", fileId: "document" }
          : null,
    );
    expect(node.querySelector("textarea")!.value).toBe("Keep draft");
    expect(node.querySelector("p")!.textContent).toBe("Center project");
  }
  const before = state;
  expect(() => open({ environmentId: EnvironmentId.make("other"), projectId })).toThrow();
  expect(() =>
    open({
      environmentId,
      projectId,
      folderId: "folder",
      fileId: "doc",
    } as unknown as Parameters<OpenFiles>[0]),
  ).toThrow();
  expect(() => open({ environmentId, projectId, fileId: "../bad" })).toThrow();
  expect(state).toBe(before);
});
