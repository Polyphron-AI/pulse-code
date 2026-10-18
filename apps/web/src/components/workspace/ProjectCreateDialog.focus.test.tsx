// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./dev/projectsMockupModule";
import { createWorkspaceMockupSession } from "./dev/workspaceMockupFixtures";

it.each(["Escape", "Cancel", "Close"] as const)(
  "returns focus to New project after %s without creating a project",
  async (close) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const session = createWorkspaceMockupSession("04");
    const module = createWorkspaceMockupModule(session);
    const node = document.body.appendChild(document.createElement("div"));
    const root = createRoot(node);
    try {
      await act(() => root.render(<>{module.center}</>));
      const trigger = getByRole(node, "button", { name: "New project" });
      await act(() => {
        trigger.focus();
        fireEvent.click(trigger);
      });
      const input = getByRole(document.body, "textbox", { name: "Project name" });
      expect(document.activeElement).toBe(input);
      if (close === "Escape") await act(() => fireEvent.keyDown(input, { key: "Escape" }));
      else await act(() => fireEvent.click(getByRole(document.body, "button", { name: close })));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(
        session.operations.filter((operation) => operation.kind === "start-project"),
      ).toHaveLength(0);
    } finally {
      await act(() => root.unmount());
      node.remove();
      module.dispose();
      session.dispose();
      vi.unstubAllGlobals();
    }
  },
);
