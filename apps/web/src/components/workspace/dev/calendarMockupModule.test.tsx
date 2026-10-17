// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, getAllByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./calendarMockupModule";
import {
  createWorkspaceMockupSession,
  parseWorkspaceMockupRequest,
  workspaceCalendarMockupStates,
} from "./workspaceMockupFixtures";
it.each(workspaceCalendarMockupStates)(
  "offers isolated %s capture with no live calls",
  async (state) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      parseWorkspaceMockupRequest(
        new URL(`https://fixture.invalid/workspace?space=calendar&fixture=08&state=${state}`),
        true,
      ),
    ).toBe("08");
    const session = createWorkspaceMockupSession("08", null, state);
    const module = createWorkspaceMockupModule(session);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() => root.render(module.center));
      await act(async () => {
        await module.settled();
        await vi.dynamicImportSettled();
      });
      expect(
        getByRole(
          document.body,
          state === "picker" ? "grid" : "region",
          state === "picker" ? {} : { name: "Week schedule" },
        ),
      ).toBeDefined();
      if (state === "dst-fold") expect(node.textContent).toContain("01:30 GMT-5");
      if (state === "dst-gap")
        expect(document.body.textContent).toContain("Clocks go forward, 02:00 to 03:00 is skipped");
      if (state === "week-allday") {
        expect(document.body.textContent).toContain("Launch planning");
        expect(document.body.textContent).toContain("Prepare launch brief");
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      node.remove();
      module.dispose();
      session.dispose();
      vi.unstubAllGlobals();
    }
  },
);
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
