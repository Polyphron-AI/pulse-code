// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarNotesProvider, CalendarSpace } from "./CalendarSpace";
import { MeetingsSpace } from "../meetings/MeetingsSpace";

const boundaries = vi.hoisted(() => ({
  mutation: vi.fn(),
  rpcRequests: vi.fn(),
  copy: vi.fn().mockResolvedValue(undefined),
  oauth: vi.fn(),
  officeInvoke: vi.fn(),
  talkInvoke: vi.fn(),
  agentTool: vi.fn(),
  microphone: vi.fn(),
  navigate: vi.fn(),
  workspaceLinks: false,
  canOperate: false,
  joinUrl: "https://meet.google.com/abc-defg-hij?authuser=2&hs=122#keep" as string | undefined,
  search: { space: "calendar", day: "2026-10-13", environment: "remote-server" },
}));
vi.mock("../../../rpc/requestLatencyState", async (original) => ({
  ...(await original<typeof import("../../../rpc/requestLatencyState")>()),
  trackRpcRequestSent: boundaries.rpcRequests,
}));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => boundaries.search,
  useNavigate: () => boundaries.navigate,
  useRouter: () => ({ state: { location: { href: "/workspace" } } }),
}));
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: {
      linked: [],
      events: [
        {
          id: "remote-event",
          title: "Remote meeting",
          revision: 1,
          status: "confirmed",
          time: { kind: "timed", start: "2026-10-13T07:00:00Z", end: "2026-10-13T07:30:00Z" },
          sourceLabel: "Saved",
          attendees: [],
          attendeesTruncated: false,
          hasDescription: false,
          joinUrl: boundaries.joinUrl,
        },
      ],
      dueTasks: [],
      sourceStates: [],
    },
    dataUpdatedAt: 1,
    error: null,
    isPending: false,
  }),
}));
vi.mock("../../../state/workspaceCalendar", () => ({
  workspaceCalendar: { range: (input: unknown) => input, loadMore: "loadMore" },
}));
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => boundaries.mutation }));
vi.mock("../../../hooks/useSettings", () => ({
  useEnvironmentSettings: () => "Africa/Johannesburg",
}));
vi.mock("../../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (boundaries.canOperate ? ["remote-server"] : []),
}));
vi.mock("../mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    environmentId: "remote-server",
    workspaceLinks: boundaries.workspaceLinks,
  }),
}));
vi.mock("../useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: () => ({ title: "Calendar" }),
}));
vi.mock("../workspaceResourceState", () => ({
  useWorkspaceResources: () => ({ projectId: null }),
}));
vi.mock("../useWorkspaceItemOpener", () => ({
  useWorkspaceItemOpener: () => boundaries.agentTool,
}));
vi.mock("../useWorkspaceCanOperate", () => ({
  useWorkspaceCanOperate: () => boundaries.canOperate,
}));
vi.mock("../../../state/entities", () => ({ useProjects: () => [], useThreadShells: () => [] }));
vi.mock("../../../state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => ({ bindings: [] }) }));
vi.mock("../../../hooks/useHandleNewThread", () => ({
  useNewThreadHandler: () => boundaries.mutation,
}));
vi.mock("../../../hooks/useNewProject", () => ({ useNewProject: () => boundaries.mutation }));
vi.mock("../WorkspaceEngagement", () => ({
  WorkspaceEngagement: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../WorkspaceResourcesPanel", () => ({ WorkspaceProjectResources: () => null }));
vi.mock("../mail/useMailLinks", async (original) => ({
  ...(await original<typeof import("../mail/useMailLinks")>()),
  useMailLinks: () => ({ linkItem: boundaries.mutation }),
}));

it.each([
  { space: "calendar", desktop: false, reject: false },
  { space: "meetings", desktop: false, reject: false },
  { space: "calendar", desktop: true, reject: false },
  { space: "calendar", desktop: true, reject: true },
  { space: "meetings", desktop: true, reject: false },
  { space: "meetings", desktop: true, reject: true },
])(
  "offers explicit Schedule and Join in disconnected read-only $space on desktop $desktop, reject $reject, without OAuth or mutations",
  async ({ space, desktop, reject }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", boundaries.mutation);
    vi.stubGlobal("navigator", {
      clipboard: { writeText: boundaries.copy },
      mediaDevices: { getUserMedia: boundaries.microphone },
    });
    const original = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    const openExternal = vi.fn().mockResolvedValue(!reject);
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value: desktop
        ? {
            openExternal,
            receiveProviderAuthCallback: boundaries.oauth,
            officeInvoke: boundaries.officeInvoke,
            talkInvoke: boundaries.talkInvoke,
          }
        : undefined,
    });
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    boundaries.search.space = space;
    Object.values(boundaries).forEach((value) => {
      if (vi.isMockFunction(value)) value.mockClear();
    });
    const popup = vi.spyOn(window, "open").mockReturnValue(null);
    let observer: ((event: Event) => void) | undefined;
    try {
      await act(() =>
        root.render(
          <CalendarNotesProvider>
            {space === "calendar" ? <CalendarSpace /> : <MeetingsSpace />}
          </CalendarNotesProvider>,
        ),
      );
      const url = "https://meet.google.com/abc-defg-hij?authuser=2&hs=122#keep";
      const join = getByRole(node, desktop ? "button" : "link", { name: "Join meeting" });
      if (desktop) {
        await act(() => fireEvent.click(join));
        expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
        openExternal.mockClear();
      } else expect(join.getAttribute("href")).toBe(url);
      expect(node.textContent).toContain("Calendar is disconnected.");
      const schedule = getByRole(node, "button", { name: "Schedule" });
      await act(() => fireEvent.click(schedule));
      expect(getByRole(document.body, "dialog").textContent).toContain("outside Pulse");
      expect(getByRole(document.body, "dialog").textContent).toContain("Tuesday, 13 October 2026");
      expect(boundaries.mutation).not.toHaveBeenCalled();
      expect(boundaries.rpcRequests).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
      expect(getByRole(document.body, "button", { name: "Google Calendar" })).toBeDefined();
      expect(queryByRole(document.body, "link", { name: "Open calendar" })).toBeNull();
      await act(() => fireEvent.click(getByRole(document.body, "button", { name: "Cancel" })));
      expect(boundaries.mutation).not.toHaveBeenCalled();
      expect(boundaries.rpcRequests).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
      expect(popup).not.toHaveBeenCalled();
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(document.activeElement).toBe(schedule);
      await act(() => fireEvent.click(schedule));
      await act(() =>
        fireEvent.click(getByRole(document.body, "button", { name: "Google Calendar" })),
      );
      expect(
        getByRole(document.body, "button", { name: "Google Calendar" }).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");
      const destination = getByRole(document.body, "link", {
        name: "Open calendar",
      });
      expect(document.activeElement).toBe(destination);
      if (!desktop) {
        expect(destination.getAttribute("href")).toBe(
          "https://calendar.google.com/calendar/r/day/2026/10/13",
        );
        expect(destination.getAttribute("target")).toBe("_blank");
        expect(destination.getAttribute("rel")).toBe("noopener noreferrer");
        observer = (event: Event) => {
          expect(event.defaultPrevented).toBe(false);
          event.preventDefault();
        };
        document.body.addEventListener("click", observer, { once: true });
      }
      await act(() => fireEvent.click(destination));
      if (desktop)
        expect(openExternal).toHaveBeenCalledExactlyOnceWith(
          "https://calendar.google.com/calendar/r/day/2026/10/13",
        );
      if (reject)
        expect(getByRole(document.body, "dialog").textContent).toContain(
          "Unable to open Google Calendar. Copy the address and open it on this device.",
        );
      else if (!desktop)
        expect(getByRole(document.body, "dialog").textContent).toContain(
          "If nothing opened, use Open calendar link or copy the address.",
        );
      expect(document.body.textContent).not.toMatch(/reconnect|import/i);
      for (const fake of [
        boundaries.mutation,
        boundaries.oauth,
        boundaries.microphone,
        boundaries.officeInvoke,
        boundaries.talkInvoke,
        boundaries.agentTool,
      ])
        expect(fake).not.toHaveBeenCalled();
      expect(popup).not.toHaveBeenCalled();
      expect(boundaries.navigate).not.toHaveBeenCalled();
      const opens = openExternal.mock.calls.length;
      await act(() => fireEvent.click(getByRole(document.body, "button", { name: "Cancel" })));
      await act(() => fireEvent.click(schedule));
      expect(getByRole(document.body, "button", { name: "Google Calendar" })).toBeDefined();
      expect(queryByRole(document.body, "link", { name: "Open calendar" })).toBeNull();
      await act(() => fireEvent.keyDown(getByRole(document.body, "dialog"), { key: "Escape" }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(document.activeElement).toBe(schedule);
      expect(openExternal).toHaveBeenCalledTimes(opens);
      openExternal.mockClear();
      const itemActions = getByRole(node, "button", { name: "Item actions" });
      await act(() => fireEvent.click(itemActions));
      const menu = getByRole(document.body, "dialog");
      const menuJoin = getByRole(menu, desktop ? "button" : "link", { name: "Join meeting" });
      await act(() => fireEvent.click(getByRole(menu, "button", { name: "Copy meeting link" })));
      expect(boundaries.copy).toHaveBeenCalledExactlyOnceWith(url);
      if (!desktop) {
        observer = (event: Event) => {
          expect(event.defaultPrevented).toBe(false);
          event.preventDefault();
        };
        document.body.addEventListener("click", observer, { once: true });
      }
      await act(() => fireEvent.click(menuJoin));
      if (desktop) expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
      else expect(menuJoin.getAttribute("href")).toBe(url);
      expect(boundaries.rpcRequests).not.toHaveBeenCalled();
      expect(boundaries.mutation).not.toHaveBeenCalled();
      await act(() => fireEvent.keyDown(menuJoin, { key: "Escape" }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(document.activeElement).toBe(itemActions);
    } finally {
      if (observer) document.body.removeEventListener("click", observer);
      await act(() => root.unmount());
      node.remove();
      if (original) Object.defineProperty(window, "desktopBridge", original);
      else Reflect.deleteProperty(window, "desktopBridge");
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);

it.each([false, true])(
  "hides a read-only no-link menu with workspaceLinks %s and exposes only local handoffs with a link",
  async (workspaceLinks) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const url = boundaries.joinUrl;
    boundaries.workspaceLinks = workspaceLinks;
    boundaries.joinUrl = undefined;
    try {
      await act(() =>
        root.render(
          <CalendarNotesProvider>
            <CalendarSpace />
          </CalendarNotesProvider>,
        ),
      );
      expect(queryByRole(node, "button", { name: "Item actions" })).toBeNull();
      const card = node.querySelector("article")!;
      expect(card.textContent).not.toContain("Event actions");
      expect(getByRole(card, "button", { name: "Remote meeting" }).className).not.toContain("mr-");
      const menuHost = card;
      await act(() => fireEvent.contextMenu(menuHost));
      await act(() => fireEvent.keyDown(menuHost, { key: "F10", shiftKey: true }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(queryByRole(document.body, "link", { name: "Join meeting" })).toBeNull();
      expect(queryByRole(document.body, "button", { name: "Copy meeting link" })).toBeNull();
      boundaries.joinUrl = url;
      await act(() =>
        root.render(
          <CalendarNotesProvider key="with-link">
            <CalendarSpace />
          </CalendarNotesProvider>,
        ),
      );
      const trigger = getByRole(node, "button", { name: "Item actions" });
      await act(() => fireEvent.click(trigger));
      const menu = getByRole(document.body, "dialog");
      const host = trigger.closest("[data-workspace-menu-open=true]");
      expect(host).not.toBeNull();
      expect(host!.parentElement!.className).toContain(
        "has-[[data-workspace-menu-open=true]]:opacity-100",
      );
      expect(getByRole(menu, "link", { name: "Join meeting" }).getAttribute("href")).toBe(url);
      expect(getAllByRole(menu, "button").map((button) => button.textContent)).toEqual([
        "Copy meeting link",
      ]);
      expect(getAllByRole(menu, "link")).toHaveLength(1);
      expect(menu.querySelector("input, select, textarea")).toBeNull();
      await act(() => fireEvent.keyDown(trigger, { key: "Escape" }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      boundaries.workspaceLinks = false;
      boundaries.joinUrl = url;
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);

it("offers generic actions on an operate-capable no-URL card without overlapping its title", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const url = boundaries.joinUrl;
  boundaries.canOperate = true;
  boundaries.workspaceLinks = true;
  boundaries.joinUrl = undefined;
  try {
    await act(() =>
      root.render(
        <CalendarNotesProvider>
          <CalendarSpace />
        </CalendarNotesProvider>,
      ),
    );
    const title = getByRole(node, "button", { name: "Remote meeting" });
    const trigger = getByRole(node, "button", { name: "Item actions" });
    expect(title.className).toContain("mr-10");
    expect(trigger.parentElement!.parentElement!.className).toContain("right-3");
    await act(() => fireEvent.click(trigger));
    const menu = getByRole(document.body, "dialog");
    expect(getByRole(menu, "button", { name: /Add to project/ })).toBeDefined();
    expect(queryByRole(menu, "link", { name: "Join meeting" })).toBeNull();
    expect(queryByRole(menu, "button", { name: "Join meeting" })).toBeNull();
    expect(queryByRole(menu, "button", { name: "Copy meeting link" })).toBeNull();
    await act(() => fireEvent.keyDown(trigger, { key: "Escape" }));
    expect(queryByRole(document.body, "dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally {
    boundaries.canOperate = false;
    boundaries.workspaceLinks = false;
    boundaries.joinUrl = url;
    await act(() => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});
