// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { WorkspaceResourceBody, type WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";

vi.mock("./WorkspaceToolsPanel", () => ({
  WorkspaceProjectFiles: () => <p>Project files</p>,
  WorkspaceBrowser: ({ request, onOpen }: WorkspaceResourceBodyProps) => (
    <button
      onClick={() => {
        if (request) onOpen(request);
      }}
    >
      Requested Browser page
    </button>
  ),
}));
it("dispatches a requested Browser page and releases its body when switching to Files", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const onOpen = vi.fn();
  const props = {
    environmentId: EnvironmentId.make("remote"),
    projectId: ProjectId.make("p"),
    selectedItem: null,
    request: { type: "url" as const, url: "https://example.test/request" },
    onOpen,
  };
  try {
    await act(() => root.render(<WorkspaceResourceBody {...props} tab="browser" />));
    await act(() => getByRole(node, "button", { name: "Requested Browser page" }).click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(props.request);
    await act(() => root.render(<WorkspaceResourceBody {...props} tab="files" />));
    expect(queryByRole(node, "button", { name: "Requested Browser page" })).toBeNull();
    expect(node.textContent).toBe("Project files");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
