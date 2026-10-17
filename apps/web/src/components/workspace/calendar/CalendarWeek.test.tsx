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

it("keeps fold time labels unshrinkable before truncating their titles", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        <CalendarWeek
          day="2026-11-01"
          timeZone="America/New_York"
          events={[
            timed("First fold", "2026-11-01T05:30:00Z", "2026-11-01T05:45:00Z"),
            timed("Second fold", "2026-11-01T06:30:00Z", "2026-11-01T06:45:00Z"),
          ]}
          dueTasks={[]}
          onSelectDay={() => {}}
          onSelect={() => {}}
        />,
      ),
    );
    expect(node.querySelectorAll("[data-calendar-week-day]")).toHaveLength(7);
    expect(node.textContent).toContain("01:00 repeats");
    expect(
      node.querySelector('[aria-description="Clocks go back, 01:00 to 02:00 repeats"]'),
    ).not.toBeNull();
    for (const [name, offset] of [
      ["First fold", "GMT-4"],
      ["Second fold", "GMT-5"],
    ]) {
      const block = getByRole(node, "button", { name: new RegExp(`^${name},`) });
      expect(block.textContent).toBe(`${name}${offset}`);
      expect(block.querySelector(".font-semibold")!.className).toContain("min-w-[4ch]");
      expect(block.getAttribute("aria-label")).toContain(`01:30 ${offset}`);
      expect(block.getAttribute("aria-label")).toContain(`01:45 ${offset}`);
      const time = block.querySelector(".text-muted-foreground")!;
      expect(time.classList.contains("shrink-0")).toBe(true);
      expect(time.classList.contains("whitespace-nowrap")).toBe(true);
      expect(time.classList.contains("truncate")).toBe(false);
      expect(time.previousElementSibling!.classList.contains("min-w-[4ch]")).toBe(true);
      expect(time.previousElementSibling!.classList.contains("truncate")).toBe(true);
    }
    const notice = node.querySelector<HTMLElement>("[data-slot=tooltip-trigger]")!;
    // Happy DOM does not implement keyboard :focus-visible matching.
    const matches = notice.matches.bind(notice);
    const focusVisible = vi
      .spyOn(notice, "matches")
      .mockImplementation((selector) => selector === ":focus-visible" || matches(selector));
    try {
      await act(() => notice.focus());
    } finally {
      focusVisible.mockRestore();
    }
    expect(document.querySelector("[data-slot=tooltip-popup]")?.textContent).toBe(
      "Clocks go back, 01:00 to 02:00 repeats",
    );
    expect(node.textContent).not.toContain("24:00");
    const region = getByRole(node, "region", { name: "Week schedule" });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain("overflow-auto");
  } finally {
    await act(() => root.unmount());
    node.remove();
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
it("renders true durations and touching packing with the title before muted time", async () => {
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
    expect(first.textContent).toBe("First09:00");
    expect(first.querySelector(".text-muted-foreground")?.textContent).toBe("09:00");
    const time = first.querySelector(".text-muted-foreground")!;
    expect(time.classList.contains("@container")).toBe(true);
    expect(time.classList.contains("truncate")).toBe(false);
    expect(time.firstElementChild!.classList.contains("hidden")).toBe(true);
    expect(time.firstElementChild!.classList.contains("@min-[5ch]:block")).toBe(true);
    expect(time.firstElementChild!.classList.contains("whitespace-nowrap")).toBe(true);
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
      expect(node.querySelector(`[aria-description="${note}"]`)).not.toBeNull();
      expect(block.textContent).toBe("Morning09:00");
      expect(node.textContent).not.toContain("24:00");
      const band = getByRole(node, "group", { name: "All day and due tasks" });
      expect(band.className).not.toContain("sticky");
      expect(band.parentElement!.className).toContain("sticky top-0");
      expect(band.parentElement!.contains(getByRole(node, "group", { name: "Choose day" }))).toBe(
        true,
      );
    } finally {
      await act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it.each([
  ["2026-10-15", 160],
  ["2026-10-16", 240],
  ["2026-10-17", 296],
  ["2026-10-18", 296],
] as const)(
  "initially scrolls vertically and horizontally to narrow Week selection %s",
  async (day, left) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Layout is the real 600px grid: a 40px gutter, seven 80px columns and a 304px viewport.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(304);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute("data-calendar-week-day") ? 80 : 40;
    });
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      const date = this.getAttribute("data-calendar-week-day");
      return date ? 40 + (Number(date.slice(-2)) - 12) * 80 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(180);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
    const node = document.createElement("div");
    const root = createRoot(node);
    const events = [timed("Morning", "2026-10-13T09:00:00Z", "2026-10-13T09:30:00Z")];
    const render = (selected: string, rows = events) =>
      act(() =>
        root.render(
          <CalendarWeek
            day={selected}
            timeZone="UTC"
            events={rows}
            dueTasks={[]}
            onSelectDay={() => {}}
            onSelect={() => {}}
          />,
        ),
      );
    try {
      await render(day, []);
      const region = getByRole(node, "region", { name: "Week schedule" });
      expect(region.scrollLeft).toBe(left);
      // Whole columns meet the gutter unless the rightmost scroll limit clamps the snap.
      expect(region.scrollLeft % 80 === 0 || region.scrollLeft === 296).toBe(true);
      await render(day);
      const column = node.querySelector<HTMLElement>(`[data-calendar-week-day="${day}"]`)!;
      expect(region.scrollTop).toBe(384);
      expect(region.scrollLeft).toBe(left);
      expect(column.offsetLeft).toBeGreaterThanOrEqual(region.scrollLeft + 40);
      expect(column.offsetLeft + column.offsetWidth).toBeLessThanOrEqual(
        region.scrollLeft + region.clientWidth,
      );
      const gutter = node.querySelector('[data-calendar-hour="09:00"]')!.parentElement!;
      expect(gutter.className).toContain("sticky left-0");
      expect(gutter.classList.contains("border-r")).toBe(true);
      expect(gutter.classList.contains("border-border/60")).toBe(true);
      expect(
        getByRole(node, "group", { name: "Choose day" }).firstElementChild!.className,
      ).toContain("sticky left-0");
      region.scrollLeft = 10;
      region.scrollTop = 20;
      await render(day, [...events]);
      expect([region.scrollTop, region.scrollLeft]).toEqual([20, 10]);
      await render(day === "2026-10-16" ? "2026-10-15" : "2026-10-16");
      expect([region.scrollTop, region.scrollLeft]).toEqual([
        384,
        day === "2026-10-16" ? 160 : 240,
      ]);
    } finally {
      await act(() => root.unmount());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);

it("caps overflowing untimed items below sticky day labels and keeps every item reachable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const select = vi.fn();
  const base = timed("base", "2026-10-13T09:00:00Z", "2026-10-13T09:30:00Z");
  const events = Array.from({ length: 12 }, (_, index) => ({
    ...base,
    id: `all-${index}`,
    title: `All day ${index}`,
    time: { kind: "all-day" as const, startOn: "2026-10-13", endBefore: "2026-10-14" },
  }));
  try {
    await act(() =>
      root.render(
        <CalendarWeek
          day="2026-10-13"
          timeZone="UTC"
          events={events}
          dueTasks={[]}
          onSelectDay={() => {}}
          onSelect={select}
        />,
      ),
    );
    const items = getByRole(node, "region", { name: "All-day items" });
    expect(items.className).toContain("max-h-36");
    expect(items.className).toContain("overflow-y-auto");
    expect(items.classList.contains("overscroll-contain")).toBe(false);
    expect(items.tabIndex).toBe(0);
    expect(items.textContent).not.toContain("Tue 13");
    expect(getAllByRole(items, "button")).toHaveLength(12);
    await act(() => getByRole(items, "button", { name: "All day 11" }).click());
    expect(select).toHaveBeenCalledWith(events[11]);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("pins the opaque all-day gutter outside the capped item scroller", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        <CalendarWeek
          day="2026-10-15"
          timeZone="Africa/Johannesburg"
          events={[
            {
              ...timed("Planning", "2026-10-13T09:00:00Z", "2026-10-13T09:30:00Z"),
              time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-16" },
            },
          ]}
          dueTasks={[]}
          onSelectDay={() => {}}
          onSelect={() => {}}
        />,
      ),
    );
    const items = getByRole(node, "region", { name: "All-day items" });
    const lane = items.previousElementSibling!;
    expect(lane.getAttribute("aria-hidden")).toBe("true");
    for (const name of [
      "sticky",
      "left-0",
      "z-10",
      "bg-background",
      "border-r",
      "border-border/60",
    ]) {
      expect(lane.classList.contains(name)).toBe(true);
    }
    expect(items.parentElement!.className).not.toContain("overflow");
    expect(getAllByRole(items, "button", { name: "Planning" })).toHaveLength(3);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("wraps taller Week titles to two lines without enlarging the event duration", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        <CalendarWeek
          day="2026-10-13"
          timeZone="UTC"
          events={[
            timed("Long launch review title", "2026-10-13T09:00:00Z", "2026-10-13T09:45:00Z"),
          ]}
          dueTasks={[]}
          onSelectDay={() => {}}
          onSelect={() => {}}
        />,
      ),
    );
    const block = getByRole(node, "button", { name: /^Long launch review title,/ });
    expect(block.style.height).toBe("36px");
    expect(block.querySelector(".font-semibold")!.className).toContain("line-clamp-2");
    expect(block.querySelector(".font-semibold")!.className).toContain("whitespace-normal");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
