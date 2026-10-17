// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getAllByRole, getByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarWeek } from "./CalendarWeek";
import { ProjectId, type CalendarOccurrenceSummary } from "@t3tools/contracts";

it("opens overlapping and cross-midnight segments through focused native buttons with the same stable ref", async () => {
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
              time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-15" },
            },
          ]}
          dueTasks={[
            {
              ref: { type: "task", taskId: "task" },
              title: "Due task",
              dueOn: "2026-10-13",
              done: true,
              revision: 1,
              projectId: ProjectId.make("fixture"),
            },
          ]}
          onSelectDay={() => {}}
          onSelect={select}
          onOpenTask={task}
        />,
      ),
    );
    const segments = getAllByRole(node, "button", { name: /^Overnight,/ });
    expect(segments).toHaveLength(2);
    expect(segments[0]!.style.width).toBe("calc(50% - 4px)");
    expect(getAllByRole(node, "button", { name: "All-day planning" })).toHaveLength(2);
    expect(Number.parseFloat(segments[0]!.style.height)).toBe(24);
    await act(() => {
      segments[0]!.focus();
      segments[0]!.click();
    });
    await act(() => {
      segments[1]!.focus();
      segments[1]!.click();
    });
    expect(select.mock.calls.map(([event]) => event.id)).toEqual(["cross", "cross"]);
    expect(getByRole(node, "group", { name: "All day and due tasks" }).textContent).toContain(
      "All-day planning",
    );
    await act(() => getByRole(node, "button", { name: /Due task.*Completed/ }).click());
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
          onSelectDay={() => {}}
          onSelect={() => {}}
        />,
      ),
    );
    expect(node.querySelectorAll("[data-calendar-week-day]")).toHaveLength(7);
    expect(node.textContent).toContain("Clocks go back, 01:00 to 02:00 repeats");
    expect(node.textContent).not.toContain("24:00");
    const region = getByRole(node, "region", { name: "Week schedule" });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain("overflow-auto");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

const timed = (id: string, start: string, end: string): CalendarOccurrenceSummary => ({
  id,
  title: id,
  revision: 1,
  status: "confirmed",
  sourceLabel: "Saved",
  attendees: [],
  attendeesTruncated: false,
  hasDescription: false,
  time: { kind: "timed", start, end, sourceTimeZone: "UTC" },
});
it("renders true durations and the tested touching packing with time first", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    await act(() =>
      root.render(
        <CalendarWeek
          day="2026-10-13"
          timeZone="UTC"
          dueTasks={[]}
          onSelectDay={() => {}}
          onSelect={() => {}}
          events={[
            timed("First", "2026-10-13T09:00:00Z", "2026-10-13T09:30:00Z"),
            timed("Next", "2026-10-13T09:30:00Z", "2026-10-13T10:00:00Z"),
            timed("Late", "2026-10-13T23:50:00Z", "2026-10-14T00:00:00Z"),
          ]}
        />,
      ),
    );
    const first = getByRole(node, "button", { name: /^First,/ });
    const next = getByRole(node, "button", { name: /^Next,/ });
    expect(first.style.height).toBe("24px");
    expect(next.style.height).toBe("24px");
    expect(first.style.left).toBe(next.style.left);
    expect(first.style.width).toBe(next.style.width);
    expect(first.textContent).toBe("09:00First");
    expect(first.textContent).not.toContain("GMT");
    const late = getByRole(node, "button", { name: /^Late,/ });
    expect(Number.parseFloat(late.style.top) + Number.parseFloat(late.style.height)).toBe(1152);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
it.each([
  [
    "2026-11-01",
    "2026-11-01T14:00:00Z",
    "2026-11-01T14:30:00Z",
    480,
    "Clocks go back, 01:00 to 02:00 repeats",
  ],
  [
    "2026-03-08",
    "2026-03-08T13:00:00Z",
    "2026-03-08T13:30:00Z",
    432,
    "Clocks go forward, 02:00 to 03:00 is skipped",
  ],
] as const)(
  "aligns post-transition 09:00 to the single gutter on %s",
  async (day, start, end, top, note) => {
    const node = document.createElement("div");
    const root = createRoot(node);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    try {
      await act(() =>
        root.render(
          <CalendarWeek
            day={day}
            timeZone="America/New_York"
            dueTasks={[]}
            onSelectDay={() => {}}
            onSelect={() => {}}
            events={[timed("Morning", start, end)]}
          />,
        ),
      );
      const gutter = node.querySelector('[data-calendar-hour="09:00"]') as HTMLElement;
      const block = getByRole(node, "button", { name: /^Morning,/ });
      expect(gutter.style.top).toBe(`${top}px`);
      expect(block.style.top).toBe(gutter.style.top);
      expect(node.textContent).toContain(note);
      expect(node.textContent).not.toContain("24:00");
      expect(getByRole(node, "group", { name: "All day and due tasks" }).className).toContain(
        "sticky",
      );
    } finally {
      await act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
