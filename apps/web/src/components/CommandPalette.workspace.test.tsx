// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { buildWorkspaceActionItems } from "./CommandPalette.logic";
import { WorkspaceEngagement } from "./workspace/WorkspaceEngagement";
import {
  WorkspaceResourcesProvider,
  useWorkspaceResourceState,
} from "./workspace/workspaceResourceState";
import { getByRole } from "@testing-library/dom";

it.each([1280, 390])(
  "uses the same context capture and Resources callbacks from the palette at %i",
  async (width) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    (
      window as unknown as {
        happyDOM: { setWindowSize(size: { width: number; height: number }): void };
      }
    ).happyDOM.setWindowSize({ width, height: 800 });
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const environmentId = EnvironmentId.make("remote");
    function App() {
      const state = useWorkspaceResourceState(environmentId, {
        presentation: width >= 1280 ? "dock" : "sheet",
        storage: { getItem: () => null, setItem() {} },
      });
      return (
        <WorkspaceResourcesProvider value={state}>
          <WorkspaceEngagement
            environmentId={environmentId}
            space="projects"
            layout="full"
            header={{ title: "Projects", environmentLabel: "Remote", spaceLabel: "Projects" }}
            resources={<p>Project resources</p>}
            linkedContext={{
              item: { ref: { type: "url", url: "https://example.invalid/a" }, title: "Item A" },
              render: () => <p>Item links</p>,
            }}
          >
            <p>Center</p>
          </WorkspaceEngagement>
        </WorkspaceResourcesProvider>
      );
    }
    try {
      await act(() => root.render(<App />));
      const actions = buildWorkspaceActionItems(null);
      const linked = actions.find((action) => action.title === "Linked context")!;
      await act(async () => linked.run());
      expect(getByRole(document.body, "heading", { name: "Item A" })).toBeDefined();
      await act(() => getByRole(document.body, "button", { name: "Close linked context" }).click());
      if (width === 390)
        expect(document.activeElement).toBe(
          getByRole(node, "button", { name: "Workspace actions" }),
        );
      await act(async () => linked.run());
      await act(async () =>
        buildWorkspaceActionItems(null)
          .find((action) => action.title === "Resources")!
          .run(),
      );
      expect(document.body.textContent).toContain("Project resources");
      await act(() => root.unmount());
      await linked.run();
      expect(document.body.textContent).not.toContain("Item links");
    } finally {
      if (node.hasChildNodes()) await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);
