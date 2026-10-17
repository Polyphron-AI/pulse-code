// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
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
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() => root.render(module.resource));
      await act(() => node.querySelector("iframe")!.dispatchEvent(new Event("load")));
      const popup = getByRole(document.body, "dialog", {
        name: state === "captured-page" ? "Browser actions" : "Linked pages",
      });
      if (state === "captured-page") expect(popup.textContent).toContain("Marketing channel");
      else if (state === "empty-results")
        expect(popup.textContent).toContain("No linked pages match.");
      else {
        expect(getByRole(popup, "list").textContent).toContain("Project handbook");
        if (state === "truncated-results")
          expect(popup.textContent).toContain("Only loaded linked pages are searched.");
        await act(() => getByRole(popup, "button", { name: "Open Project handbook" }).click());
        expect(session.operations).toEqual([
          { kind: "navigate", item: null, value: "https://synkek.example.invalid/handbook" },
        ]);
      }
      expect(session.operations.every((operation) => operation.kind === "navigate")).toBe(true);
    } finally {
      await act(() => root.unmount());
      node.remove();
      module.dispose();
      session.dispose();
      vi.unstubAllGlobals();
    }
  },
);
