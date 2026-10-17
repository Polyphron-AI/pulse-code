// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./calendarMockupModule";
import {
  createWorkspaceMockupSession,
  parseWorkspaceMockupRequest,
  workspaceCalendarMockupStates,
  workspaceCalendarHandoffMockupStates,
} from "./workspaceMockupFixtures";
it.each(
  workspaceCalendarMockupStates.filter(
    (state) => !workspaceCalendarHandoffMockupStates.some((handoff) => handoff === state),
  ),
)("offers isolated %s capture with no live calls", async (state) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    parseWorkspaceMockupRequest(
      new URL(`https://fixture.invalid/workspace?space=calendar&fixture=08&state=${state}`),
      true,
    ),
  ).toBe("08");
  const session = createWorkspaceMockupSession("08", null, state);
  const module = createWorkspaceMockupModule(session);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() => root.render(module.center));
    await act(async () => {
      await module.settled();
      await vi.dynamicImportSettled();
    });
    expect(
      getByRole(
        document.body,
        state === "picker" ? "grid" : "region",
        state === "picker" ? {} : { name: "Week schedule" },
      ),
    ).toBeDefined();
    if (state === "dst-fold") {
      const blocks = getAllByRole(node, "button", { name: /^Ops sync,/ });
      expect(blocks).toHaveLength(2);
      expect(blocks.map((block) => block.querySelector(".font-semibold")!.textContent)).toEqual([
        "Ops sync",
        "Ops sync",
      ]);
      expect(
        blocks.map((block) => block.querySelector(".shrink-0.whitespace-nowrap")!.textContent),
      ).toEqual(["GMT-4", "GMT-5"]);
    }
    if (state === "dst-gap") expect(document.body.textContent).toContain("02:00 skipped");
    if (state === "week-allday" || state === "week-overflow") {
      expect(document.body.textContent).toContain("Launch planning");
      expect(document.body.textContent).toContain("Prepare launch brief");
    }
    if (state === "week-overflow") {
      const items = getByRole(node, "region", { name: "All-day items" });
      expect(items.className).toContain("max-h-36");
      expect(getByRole(items, "button", { name: "Launch follow-up 11" })).toBeDefined();
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    node.remove();
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});
it.each(["07", "08"] as const)(
  "renders %s through pure production agenda with inert commands and fresh reset",
  async (id) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetch = vi.fn(() => {
      throw new Error("Live call");
    });
    vi.stubGlobal("fetch", fetch);
    const session = createWorkspaceMockupSession(id);
    const module = createWorkspaceMockupModule(session);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      expect(module.readyRegions).toEqual(["center"]);
      await act(() => root.render(module.center));
      expect(node.querySelectorAll("article")[1]!.textContent).toContain(
        "45 minutes · Google Meet",
      );
      expect(
        getByRole(node, "button", { name: "Tuesday, 13 October 2026" }).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");
      await act(async () => {
        getAllByRole(node, "button", { name: "Notes & agenda" })[1]!.click();
        getAllByRole(node, "link", { name: "Join meeting" })[0]!.click();
        getByRole(node, "button", { name: "Schedule" }).click();
        await module.settled();
      });
      expect(session.operations.map((o) => o.kind)).toEqual(["navigate", "join"]);
      expect(node.textContent).toContain(
        "If nothing opened, use Open meeting link or copy the address.",
      );
      await act(() => getByRole(document.body, "button", { name: "Cancel" }).click());
      expect(session.operations.map((o) => o.kind)).toEqual(["navigate", "join"]);
      await act(() => getByRole(node, "button", { name: "Schedule" }).click());
      await act(() => getByRole(document.body, "button", { name: "Google Calendar" }).click());
      await act(async () => {
        getByRole(document.body, "link", { name: "Open calendar" }).click();
        await module.settled();
      });
      expect(session.operations.map((o) => o.kind)).toEqual(["navigate", "join", "schedule"]);
      expect(session.operations[2]?.value).toBe(
        "https://calendar.google.com/calendar/r/day/2026/10/13",
      );
      await act(() => getByRole(document.body, "button", { name: "Cancel" }).click());
      expect(session.operations[0]?.item).toEqual({
        type: "provider-resource",
        provider: "workspace-note",
        resourceId: session.seed.note.id,
      });
      await act(async () => {
        getByRole(node, "button", { name: "Wednesday, 14 October 2026" }).click();
        await module.settled();
      });
      expect(node.textContent).toContain("No meetings on this day.");
      expect(fetch).not.toHaveBeenCalled();
      module.dispose();
      session.dispose();
      const fresh = createWorkspaceMockupModule(createWorkspaceMockupSession(id));
      await act(() => root.render(fresh.center));
      expect(node.textContent).toContain("Marketing stand-up");
      fresh.dispose();
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);

it.each(["07", "08"] as const)(
  "exposes missing and explicitly rejected Join states in %s without external work",
  async (id) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const open = vi.spyOn(window, "open");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      for (const state of ["no-url", "desktop-reject"] as const) {
        expect(
          parseWorkspaceMockupRequest(
            new URL(
              `https://fixture.invalid/workspace?space=${id === "07" ? "meetings" : "calendar"}&fixture=${id}&state=${state}`,
            ),
            true,
          ),
        ).toBe(id);
        const session = createWorkspaceMockupSession(id, null, state);
        const module = createWorkspaceMockupModule(session);
        await act(() => root.render(module.center));
        if (state === "no-url") {
          const cards = node.querySelectorAll("article");
          expect(
            queryByRole(cards[2]! as HTMLElement, "link", { name: "Join meeting" }),
          ).toBeNull();
          expect(cards[2]!.textContent).toContain("No meeting link is available.");
          expect(cards[2]!.querySelector("svg.lucide-video")).toBeNull();
          expect(
            queryByRole(cards[2]! as HTMLElement, "button", { name: "Join meeting" }),
          ).toBeNull();
          expect(
            queryByRole(cards[2]! as HTMLElement, "button", { name: "Item actions" }),
          ).toBeNull();
          const menuHost = cards[2]! as HTMLElement;
          expect(menuHost.textContent).not.toContain("Event actions");
          await act(() => fireEvent.contextMenu(menuHost));
          await act(() => fireEvent.keyDown(menuHost, { key: "F10", shiftKey: true }));
          expect(queryByRole(document.body, "dialog")).toBeNull();
          expect(queryByRole(document.body, "button", { name: "Copy meeting link" })).toBeNull();
          expect(getAllByRole(node, "link", { name: "Join meeting" })).toHaveLength(2);
        } else {
          await act(async () => {
            getAllByRole(node, "button", { name: "Join meeting" })[0]!.click();
            await module.settled();
          });
          expect(getByRole(node, "button", { name: "Copy meeting link" })).toBeDefined();
          expect(node.textContent).toContain("Unable to open meeting link.");
        }
        module.dispose();
        session.dispose();
      }
      expect(open).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);

it.each(["07", "08"] as const)(
  "uses the existing item menu presentation for Join and Copy in %s",
  async (id) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const session = createWorkspaceMockupSession(id);
    const module = createWorkspaceMockupModule(session);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      await act(() => root.render(module.center));
      const card = node.querySelector("article")!;
      await act(() => getByRole(card, "button", { name: "Item actions" }).click());
      const menu = getByRole(document.body, "dialog");
      const join = getByRole(menu, "link", { name: "Join meeting" });
      expect(join.getAttribute("href")).toBe(session.seed.events[0]!.joinUrl);
      expect(join.getAttribute("rel")).toBe("noopener noreferrer");
      await act(() => getByRole(menu, "button", { name: "Copy meeting link" }).click());
      expect(menu.textContent).toContain("Meeting link copied.");
      await act(async () => {
        join.click();
        await module.settled();
      });
      expect(session.operations.map((operation) => operation.kind)).toEqual(["join"]);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      module.dispose();
      session.dispose();
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);

it.each([
  "empty",
  "partial",
  "error",
  "loading",
  "disconnected",
  "unavailable",
  "no-url-menu",
  "recordings",
] as const)("provides the isolated %s controller capture state", async (state) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const session = createWorkspaceMockupSession("07", null, state);
  const module = createWorkspaceMockupModule(session);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    expect(
      parseWorkspaceMockupRequest(
        new URL(`https://fixture.invalid/workspace?space=meetings&fixture=07&state=${state}`),
        true,
      ),
    ).toBe("07");
    await act(() => root.render(module.center));
    const expected = {
      empty: "No meetings on this day.",
      partial: "Some calendars could not be refreshed.",
      error: "Fixture calendar read failed.",
      loading: "Loading calendar...",
      disconnected: "Calendar is disconnected.",
      unavailable: "Calendar is unavailable on this server.",
      "no-url-menu": "No meeting link is available.",
      recordings: "Local recordings remain on their capture device.",
    }[state];
    expect(node.textContent).toContain(expected);
    if (state === "no-url-menu") {
      const card = node.querySelectorAll("article")[0]!;
      expect(queryByRole(card as HTMLElement, "link", { name: "Join meeting" })).toBeNull();
      await act(() =>
        fireEvent.click(getByRole(card as HTMLElement, "button", { name: "Item actions" })),
      );
      expect(getByRole(document.body, "button", { name: "Start thread" })).toBeDefined();
      expect(
        queryByRole(getByRole(document.body, "dialog"), "link", { name: "Join meeting" }),
      ).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    node.remove();
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});
