// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarDatePicker } from "./CalendarDatePicker";
import { CalendarDayStrip } from "./CalendarDayStrip";

it.each([false, true])(
  "exposes complete chip text and moves focus within the week, Week=%s",
  async (week) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const select = vi.fn();
    try {
      await act(() =>
        root.render(<CalendarDayStrip day="2026-10-13" onSelectDay={select} week={week} />),
      );
      const tuesday = getByRole(node, "button", { name: "Tuesday, 13 October 2026" });
      expect(tuesday.classList.contains("mx-0.5")).toBe(week);
      expect(tuesday.getAttribute("aria-label")).toBeNull();
      expect(tuesday.querySelector(".sr-only")?.textContent).toBe("Tuesday, 13 October 2026");
      expect(tuesday.querySelector('[aria-hidden="true"]')?.textContent).toBe("T 13");
      await act(() => {
        tuesday.focus();
        fireEvent.keyDown(tuesday, { key: "End" });
      });
      expect(document.activeElement).toBe(
        getByRole(node, "button", { name: "Sunday, 18 October 2026" }),
      );
      expect(select).not.toHaveBeenCalled();
      await act(() => fireEvent.keyDown(document.activeElement!, { key: "Home" }));
      expect(document.activeElement).toBe(
        getByRole(node, "button", { name: "Monday, 12 October 2026" }),
      );
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);

it("cancels by Escape or touch without changing the day and restores trigger focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const select = vi.fn();
  try {
    await act(() =>
      root.render(<CalendarDatePicker day="2026-10-13" today="2026-10-13" onSelectDay={select} />),
    );
    const trigger = getByRole(node, "button", { name: /Choose date/ });
    expect(trigger.getAttribute("aria-label")).toContain(trigger.textContent);
    for (const mode of ["escape", "touch"]) {
      await act(() => trigger.click());
      await act(() => vi.dynamicImportSettled());
      expect(getByRole(document.body, "grid")).toBeDefined();
      await act(() =>
        mode === "escape"
          ? fireEvent.keyDown(getByRole(document.body, "grid"), { key: "Escape" })
          : getByRole(document.body, "button", { name: "Cancel" }).click(),
      );
      expect(queryByRole(document.body, "grid")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(select).not.toHaveBeenCalled();
    }
  } finally {
    await act(() => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});
it("chooses a date in another month as local calendar fields", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const select = vi.fn();
  try {
    await act(() =>
      root.render(<CalendarDatePicker day="2026-10-13" today="2026-10-13" onSelectDay={select} />),
    );
    await act(() => getByRole(node, "button", { name: /Choose date/ }).click());
    await act(() => vi.dynamicImportSettled());
    await act(() => getByRole(document.body, "button", { name: /next month/i }).click());
    await act(() =>
      getByRole(document.body, "button", { name: "Monday, 2 November 2026" }).click(),
    );
    expect(select).toHaveBeenCalledExactlyOnceWith("2026-11-02");
    expect(document.activeElement).toBe(getByRole(node, "button", { name: /Choose date/ }));
    expect(queryByRole(document.body, "grid")).toBeNull();
  } finally {
    await act(() => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});

it("uses the supplied today and closes when the selected day is clicked again", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const select = vi.fn();
  try {
    await act(() =>
      root.render(
        <CalendarDatePicker day="2026-10-13" today="2026-10-15" onSelectDay={select} defaultOpen />,
      ),
    );
    const selected = getByRole(document.body, "button", { name: /Tuesday, 13 October 2026/ });
    expect(selected.closest("[data-today]")).toBeNull();
    expect(
      getByRole(document.body, "button", { name: /Thursday, 15 October 2026/ }).closest(
        "[data-today]",
      ),
    ).not.toBeNull();
    await act(() => selected.click());
    expect(select).toHaveBeenCalledExactlyOnceWith("2026-10-13");
    expect(queryByRole(document.body, "grid")).toBeNull();
  } finally {
    await act(() => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});
