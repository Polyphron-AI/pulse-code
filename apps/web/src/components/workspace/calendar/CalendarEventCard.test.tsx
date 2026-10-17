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

it("keeps card actions at the reference type scale and Join flush with its text", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        <CalendarEventCard
          event={{
            id: "event",
            title: "Review",
            revision: 1,
            status: "confirmed",
            time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-14" },
            sourceLabel: "Saved",
            attendees: [{ name: "Sam Lee" }, { name: "Sam Lee" }],
            attendeesTruncated: false,
            hasDescription: false,
            joinUrl: "https://meet.google.com/abc-defg-hij",
          }}
          onSelect={() => {}}
          onNotes={() => {}}
        />,
      ),
    );
    for (const name of ["Notes & agenda", "Join meeting"]) {
      const button = getByRole(node, "button", { name });
      expect(button.className).toContain("text-2xs");
      expect(button.className).toContain("font-semibold");
      expect(button.className).toContain("h-[23px]");
      expect(button.className).toContain("cursor-pointer");
    }
    expect(getByRole(node, "button", { name: "Join meeting" }).className).toContain("px-0");
    expect(getByRole(node, "group", { name: "Participants" }).children).toHaveLength(2);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
