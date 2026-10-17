// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { WorkspaceItemActionButtons } from "./WorkspaceItemActionButtons";

it.each([undefined, "menu"] as const)(
  "keeps shared actions usable in the %s layout",
  async (layout) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const actions = ["Start thread", "Add to project", "Start project", "Start automation"];
    const run = vi.fn();
    try {
      await act(() =>
        root.render(
          <div data-testid="host">
            <WorkspaceItemActionButtons
              layout={layout}
              startThread={{ onClick: () => run("Start thread") }}
              addToProject={{ onClick: () => run("Add to project") }}
              startProject={{ onClick: () => run("Start project") }}
              startAutomation={{ onClick: () => run("Start automation") }}
            />
          </div>,
        ),
      );
      const host = node.querySelector('[data-testid="host"]')!;
      for (const [index, name] of actions.entries()) {
        const button = getByRole(node, "button", { name });
        expect(button.classList.contains(layout === "menu" ? "sm:h-6" : "sm:h-7")).toBe(true);
        expect(
          button.classList.contains(
            layout !== "menu" && index === 0 ? "border-input" : "border-transparent",
          ),
        ).toBe(true);
        if (layout === "menu") {
          const column = host.firstElementChild!;
          expect(column.classList.contains("flex-col")).toBe(true);
          expect(column.classList.contains("flex-wrap")).toBe(false);
          expect(column.contains(button)).toBe(true);
        } else {
          expect(host.firstElementChild!.classList.contains("flex-col")).toBe(false);
        }
        await act(() => {
          button.focus();
          expect(document.activeElement).toBe(button);
          button.click();
        });
      }
      expect(run.mock.calls).toEqual(actions.map((name) => [name]));
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);
