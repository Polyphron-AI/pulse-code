// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarEventCard } from "./CalendarEventCard";
it("opens a title independently of notes and collapses absent conferencing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const select = vi.fn();
  const notes = vi.fn();
  await act(async () =>
    root.render(
      <CalendarEventCard
        event={{
          id: "event",
          title: "Review",
          revision: 1,
          status: "confirmed",
          time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-14" },
          sourceLabel: "Saved",
          attendees: [{ name: "Maya Chen", initials: "MC" }],
          attendeesTruncated: false,
          hasDescription: false,
        }}
        onSelect={select}
        onNotes={notes}
      />,
    ),
  );
  await act(async () => getByRole(node, "button", { name: "Review" }).click());
  expect(select).toHaveBeenCalledOnce();
  await act(async () => getByRole(node, "button", { name: "Notes & agenda" }).click());
  expect(notes).toHaveBeenCalledOnce();
  expect(queryByRole(node, "button", { name: "Join meeting" })).toBeNull();
  expect(node.textContent).not.toContain("minutes");
  expect(getByRole(node, "img", { name: "Maya Chen" })).toBeDefined();
  expect(node.querySelector("button button")).toBeNull();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
