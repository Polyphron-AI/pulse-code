// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, getAllByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { parseChatResourceId } from "@t3tools/contracts";
import * as browser from "../workspaceBrowser.logic";
import { createWorkspaceMockupModule } from "./browserMockupModule";
import {
  createWorkspaceMockupSession,
  parseWorkspaceMockupRequest,
} from "./workspaceMockupFixtures";

it.each(["search-results", "empty-results", "truncated-results", "captured-page"] as const)(
  "exposes the isolated Browser %s state through recipe 05 only",
  async (state) => {
    const url = (id: string) =>
      new URL(`http://fixture.invalid/workspace?fixture=${id}&state=${state}`);
    expect(parseWorkspaceMockupRequest(url("05"), true)).toBe("05");
    expect(parseWorkspaceMockupRequest(url("05"), false)).toBeNull();
    expect(() => parseWorkspaceMockupRequest(url("06"), true)).toThrow("Unknown fixture state.");
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const session = createWorkspaceMockupSession("05", null, null, state);
    const module = createWorkspaceMockupModule(session);
    const capture = vi.spyOn(browser, "captureWorkspacePage");
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() => root.render(module.resource));
      const target = capture.mock.results[0]?.value?.target;
      expect(target?.ref.type).toBe("provider-resource");
      expect(parseChatResourceId(target.ref.resourceId)).toEqual({
        version: 1,
        transport: "server",
        connectionId: "fixture-slack",
        workspaceId: "fixture-team",
        conversationId: "slack-marketing",
      });
      await act(() => node.querySelector("iframe")!.dispatchEvent(new Event("load")));
      if (state !== "captured-page")
        expect(document.activeElement).toBe(
          getByRole(node, "textbox", { name: "Browser page address" }),
        );
      const popup = getByRole(document.body, state === "captured-page" ? "dialog" : "region", {
        name: state === "captured-page" ? "Browser actions" : "Linked pages",
      });
      if (state === "captured-page") {
        expect(popup.textContent).toContain("Marketing channel");
        for (const name of [
          "Back",
          "Forward",
          "Reload",
          "Start thread",
          "Add to project",
          "Start project",
          "Start automation",
        ])
          expect(getByRole(popup, "button", { name })).toBeDefined();
        const startThread = getByRole(popup, "button", { name: "Start thread" });
        const addToProject = getByRole(popup, "button", { name: "Add to project" });
        expect(startThread.classList.contains("border-transparent")).toBe(true);
        expect(startThread.classList.contains("sm:h-6")).toBe(true);
        expect(startThread.closest(".flex-col")).toBe(addToProject.closest(".flex-col"));
        await act(() => addToProject.click());
        expect(session.operations).toEqual([
          {
            kind: "add-to-project",
            item: { type: "url", url: "https://synkek.example.invalid/" },
            value: null,
          },
        ]);
      } else if (state === "empty-results")
        expect(popup.textContent).toContain("No linked pages match.");
      else {
        expect(getByRole(popup, "list").textContent).toContain("Project handbook");
        const actions = getAllByRole(popup, "button", { name: "Item actions" });
        expect(actions).toHaveLength(2);
        await act(() => actions[0]!.click());
        const menu = getByRole(document.body, "dialog", { name: "Linked page actions" });
        expect(getByRole(menu, "button", { name: "Unlink" })).toBeDefined();
        expect(getByRole(menu, "button", { name: "Start thread" })).toBeDefined();
        await act(() => actions[0]!.click());
        if (state === "truncated-results")
          expect(popup.textContent).toContain("Only loaded linked pages are searched.");
        await act(() => getByRole(popup, "button", { name: "Open Project handbook" }).click());
        expect(session.operations).toEqual([
          { kind: "navigate", item: null, value: "https://synkek.example.invalid/handbook" },
        ]);
      }
      if (state !== "captured-page")
        expect(session.operations.every((operation) => operation.kind === "navigate")).toBe(true);
    } finally {
      await act(() => root.unmount());
      node.remove();
      module.dispose();
      session.dispose();
      capture.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);
