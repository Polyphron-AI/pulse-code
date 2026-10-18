// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, getByText } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { parseChatResourceId } from "@t3tools/contracts";
import { createWorkspaceMockupModule } from "./communicationsMockupModule";
import { createWorkspaceMockupSession } from "./workspaceMockupFixtures";
import { WorkspaceMockupApp, WorkspaceMockupRenderContext } from "./WorkspaceMockupApp";

it.each(["02", "05", "06"] as const)(
  "renders live Communications navigation and header in recipe %s without provider requests",
  async (id) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const session = createWorkspaceMockupSession(id);
    const module = createWorkspaceMockupModule(session);
    const fetch = vi.spyOn(window, "fetch");
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(
          <WorkspaceMockupRenderContext value={{ session, modules: [module], onCommit: () => {} }}>
            <WorkspaceMockupApp session={session} />
          </WorkspaceMockupRenderContext>,
        ),
      );
      expect(getByRole(node, "button", { name: "Open marketing" })).toBeDefined();
      expect(getByText(node, "SynKEK · Slack · 8 members")).toBeDefined();
      expect(getByRole(node, "button", { name: "Open Maya Chen" })).toBeDefined();
      await act(async () => getByRole(node, "button", { name: "Open design" }).click());
      expect(getByRole(node, "heading", { name: "# design" })).toBeDefined();
      const operation = session.operations.at(-1)!;
      expect(operation.item?.type).toBe("provider-resource");
      if (operation.item?.type === "provider-resource")
        expect(parseChatResourceId(operation.item.resourceId)?.version).toBe(1);
      await act(async () =>
        fireEvent.change(getByRole(node, "textbox", { name: "Search loaded conversations" }), {
          target: { value: "Maya" },
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      node.remove();
      module.dispose();
      session.dispose();
      fetch.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);
