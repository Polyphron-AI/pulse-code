// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, getAllByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./calendarMockupModule";
import { createWorkspaceMockupSession } from "./workspaceMockupFixtures";
it.each(["07", "08"] as const)(
  "renders %s through pure production agenda with inert commands and fresh reset",
  async (id) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetch = vi.fn(() => {
      throw new Error("Live call");
    });
    vi.stubGlobal("fetch", fetch);
    const session = createWorkspaceMockupSession(id);
    const module = createWorkspaceMockupModule(session);
    const node = document.createElement("div");
    const root = createRoot(node);
    try {
      expect(module.readyRegions).toEqual(["center"]);
      await act(() => root.render(module.center));
      expect(
        getByRole(node, "button", { name: "Tuesday, 13 October 2026" }).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");
      await act(async () => {
        getAllByRole(node, "button", { name: "Notes & agenda" })[1]!.click();
        getAllByRole(node, "button", { name: "Join meeting" })[0]!.click();
        getByRole(node, "button", { name: "Schedule" }).click();
        await module.settled();
      });
      expect(session.operations.map((o) => o.kind)).toEqual(["navigate", "join", "schedule"]);
      expect(session.operations[0]?.item).toEqual({
        type: "provider-resource",
        provider: "workspace-note",
        resourceId: session.seed.note.id,
      });
      await act(async () => {
        getByRole(node, "button", { name: "Wednesday, 14 October 2026" }).click();
        await module.settled();
      });
      expect(node.textContent).toContain("No meetings on this day.");
      expect(fetch).not.toHaveBeenCalled();
      module.dispose();
      session.dispose();
      const fresh = createWorkspaceMockupModule(createWorkspaceMockupSession(id));
      await act(() => root.render(fresh.center));
      expect(node.textContent).toContain("Marketing stand-up");
      fresh.dispose();
    } finally {
      await act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
