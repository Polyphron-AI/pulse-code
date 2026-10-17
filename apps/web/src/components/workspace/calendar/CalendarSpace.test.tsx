// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarNotesProvider, CalendarSpace } from "./CalendarSpace";
import { MeetingsSpace } from "../meetings/MeetingsSpace";

const boundaries = vi.hoisted(() => ({
  mutation: vi.fn(),
  oauth: vi.fn(),
  recording: vi.fn(),
  transcription: vi.fn(),
  scheduling: vi.fn(),
  agentTool: vi.fn(),
  microphone: vi.fn(),
  navigate: vi.fn(),
  search: { space: "calendar", day: "2026-10-13", environment: "remote-server" },
}));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => boundaries.search,
  useNavigate: () => boundaries.navigate,
}));
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: {
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
          joinUrl: "https://meet.google.com/abc-defg-hij?authuser=2&hs=122#keep",
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
vi.mock("../../../state/environments", () => ({ useConnectedEnvironmentIds: () => [] }));
vi.mock("../mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote-server" }),
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
vi.mock("../useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => false }));
vi.mock("../WorkspaceEngagement", () => ({
  WorkspaceEngagement: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../WorkspaceResourcesPanel", () => ({ WorkspaceProjectResources: () => null }));
vi.mock("../WorkspaceItemActions", () => ({ WorkspaceItemMenu: () => null }));

it.each([
  { space: "calendar", desktop: false },
  { space: "meetings", desktop: false },
  { space: "calendar", desktop: true },
  { space: "meetings", desktop: true },
])(
  "offers explicit Schedule and Join in disconnected read-only $space on desktop $desktop without OAuth or mutations",
  async ({ space, desktop }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", boundaries.mutation);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: boundaries.microphone } });
    const original = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    const openExternal = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value: desktop
        ? {
            openExternal,
            calendarConnect: boundaries.oauth,
            talkInvoke: boundaries.recording,
            transcribe: boundaries.transcription,
            schedule: boundaries.scheduling,
            agentTool: boundaries.agentTool,
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
      expect(getByRole(document.body, "button", { name: "Google Calendar" })).toBeDefined();
      expect(queryByRole(document.body, "link", { name: "Open calendar" })).toBeNull();
      await act(() => fireEvent.click(getByRole(document.body, "button", { name: "Cancel" })));
      expect(boundaries.mutation).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
      expect(popup).not.toHaveBeenCalled();
      expect(queryByRole(document.body, "dialog")).toBeNull();
      await act(() => fireEvent.click(schedule));
      await act(() =>
        fireEvent.click(getByRole(document.body, "button", { name: "Google Calendar" })),
      );
      const destination = getByRole(document.body, desktop ? "button" : "link", {
        name: "Open calendar",
      });
      if (!desktop) {
        expect(destination.getAttribute("href")).toBe(
          "https://calendar.google.com/calendar/r/day/2026/10/13",
        );
        expect(destination.getAttribute("target")).toBe("_blank");
        expect(destination.getAttribute("rel")).toBe("noopener noreferrer");
        const observer = (event: Event) => {
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
      else
        expect(getByRole(document.body, "dialog").textContent).toContain(
          "If nothing opened, use Open calendar link or copy the address.",
        );
      expect(document.body.textContent).not.toMatch(/reconnect|import/i);
      for (const fake of [
        boundaries.mutation,
        boundaries.oauth,
        boundaries.microphone,
        boundaries.recording,
        boundaries.transcription,
        boundaries.scheduling,
        boundaries.agentTool,
      ])
        expect(fake).not.toHaveBeenCalled();
      expect(popup).not.toHaveBeenCalled();
      expect(boundaries.navigate).not.toHaveBeenCalled();
      const opens = openExternal.mock.calls.length;
      await act(() => fireEvent.click(getByRole(document.body, "button", { name: "Cancel" })));
      await act(() => fireEvent.click(schedule));
      expect(getByRole(document.body, "button", { name: "Google Calendar" })).toBeDefined();
      expect(
        queryByRole(document.body, desktop ? "button" : "link", { name: "Open calendar" }),
      ).toBeNull();
      await act(() => fireEvent.keyDown(getByRole(document.body, "dialog"), { key: "Escape" }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(openExternal).toHaveBeenCalledTimes(opens);
      expect(boundaries.mutation).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      node.remove();
      if (original) Object.defineProperty(window, "desktopBridge", original);
      else Reflect.deleteProperty(window, "desktopBridge");
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);
