// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarSchedule } from "./CalendarSchedule";

it.each(["Cancel", "Escape"])(
  "focuses Open calendar after selection and returns to Schedule on %s",
  async (close) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() => root.render(<CalendarSchedule day="2026-10-13" client={{}} />));
      const schedule = getByRole(node, "button", { name: "Schedule" });
      await act(() => fireEvent.click(schedule));
      const provider = getByRole(document.body, "button", { name: "Google Calendar" });
      expect(provider.getAttribute("aria-pressed")).toBe("false");
      await act(() => {
        provider.focus();
        fireEvent.click(provider);
      });
      expect(getByRole(document.body, "button", { name: "Google Calendar" })).toBe(provider);
      expect(provider.getAttribute("aria-pressed")).toBe("true");
      const destination = getByRole(document.body, "link", { name: "Open calendar" });
      expect(document.activeElement).toBe(destination);
      expect(destination.getAttribute("href")).toBe(
        "https://calendar.google.com/calendar/r/day/2026/10/13",
      );
      expect(getByRole(document.body, "dialog").textContent).toContain("Tuesday, 13 October 2026");
      if (close === "Cancel")
        await act(() => fireEvent.click(getByRole(document.body, "button", { name: "Cancel" })));
      else await act(() => fireEvent.keyDown(destination, { key: "Escape" }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(document.activeElement).toBe(schedule);
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);
