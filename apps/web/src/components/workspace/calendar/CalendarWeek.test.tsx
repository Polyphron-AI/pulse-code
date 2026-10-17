// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getAllByRole, getByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarWeek } from "./CalendarWeek";
import { ProjectId, type CalendarOccurrenceSummary } from "@t3tools/contracts";

it("opens overlapping and cross-midnight segments by keyboard with the same stable ref", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const select = vi.fn();
  const task = vi.fn();
  const base = {
    id: "cross",
    title: "Overnight",
    revision: 1,
    status: "confirmed",
    sourceLabel: "Saved",
    attendees: [],
    attendeesTruncated: false,
    hasDescription: false,
    time: {
      kind: "timed",
      start: "2026-10-13T21:30:00Z",
      end: "2026-10-13T22:30:00Z",
      sourceTimeZone: "UTC",
    },
  } satisfies CalendarOccurrenceSummary;
  try {
    await act(() =>
      root.render(
        <CalendarWeek
          day="2026-10-13"
          timeZone="Africa/Johannesburg"
          events={[
            base,
            { ...base, id: "overlap", title: "Overlap" },
            {
              ...base,
              id: "all",
              title: "All-day planning",
              time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-14" },
            },
          ]}
          dueTasks={[
            {
              ref: { type: "task", taskId: "task" },
              title: "Due task",
              dueOn: "2026-10-13",
              done: false,
              revision: 1,
              projectId: ProjectId.make("fixture"),
            },
          ]}
          onSelect={select}
          onOpenTask={task}
        />,
      ),
    );
    const segments = getAllByRole(node, "button", { name: /^Overnight,/ });
    expect(segments).toHaveLength(2);
    expect(Number.parseFloat(segments[0]!.style.height)).toBeGreaterThanOrEqual(44);
    await act(() => fireEvent.keyDown(segments[0]!, { key: "Enter" }));
    await act(() => fireEvent.keyDown(segments[1]!, { key: " " }));
    expect(select.mock.calls.map(([event]) => event.id)).toEqual(["cross", "cross"]);
    expect(getByRole(node, "group", { name: "All day and due tasks" }).textContent).toContain(
      "All-day planning",
    );
    await act(() => getByRole(node, "button", { name: "Due task" }).click());
    expect(task.mock.calls[0]?.[0].ref.taskId).toBe("task");
    expect(node.querySelector("[draggable=true]")).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("names both fold offsets and keeps seven date columns inside a bounded scrolling region", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        <CalendarWeek
          day="2026-11-01"
          timeZone="America/New_York"
          events={[]}
          dueTasks={[]}
          onSelect={() => {}}
        />,
      ),
    );
    expect(node.querySelectorAll("[data-calendar-week-day]")).toHaveLength(7);
    expect(node.textContent).toContain("01:00 GMT-4");
    expect(node.textContent).toContain("01:00 GMT-5");
    const region = getByRole(node, "region", { name: "Week schedule" });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain("overflow-auto");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
