// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
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
      const button = getByRole(node, name === "Join meeting" ? "link" : "button", { name });
      expect(button.className).toContain("text-2xs");
      expect(button.className).toContain("font-semibold");
      expect(button.className).toContain("h-[23px]");
      expect(button.className).toContain("cursor-pointer");
    }
    expect(getByRole(node, "link", { name: "Join meeting" }).className).toContain("px-0");
    expect(getByRole(node, "group", { name: "Participants" }).children).toHaveLength(2);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each(["web", "desktop-open", "desktop-reject"])(
  "hands off on this device with safe recovery and no capture or provider work: %s",
  async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const original = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    const openExternal = vi.fn().mockResolvedValue(mode !== "desktop-reject");
    const forbidden = {
      oauth: vi.fn(),
      microphone: vi.fn(),
      recording: vi.fn(),
      transcription: vi.fn(),
      scheduling: vi.fn(),
      agentTool: vi.fn(),
      mutation: vi.fn(),
    };
    const webOpen = vi.spyOn(window, "open").mockReturnValue(null);
    vi.stubGlobal("fetch", forbidden.mutation);
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText: copy },
      mediaDevices: { getUserMedia: forbidden.microphone },
    });
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value:
        mode === "web"
          ? undefined
          : {
              openExternal,
              calendarConnect: forbidden.oauth,
              talkInvoke: forbidden.recording,
              transcribe: forbidden.transcription,
              schedule: forbidden.scheduling,
              agentTool: forbidden.agentTool,
            },
    });
    const url = "https://tenant.zoom.us/j/123456789?pwd=AbC%2B123&tk=exact&pwd=two+words#keep";
    const node = document.createElement("div");
    const root = createRoot(node);
    try {
      await act(() =>
        root.render(
          <CalendarEventCard
            event={{
              id: "handoff",
              title: "Review",
              revision: 1,
              status: "confirmed",
              time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-14" },
              sourceLabel: "Saved",
              attendees: [],
              attendeesTruncated: false,
              hasDescription: false,
              joinUrl: url,
            }}
            onSelect={() => {}}
            onNotes={() => {}}
          />,
        ),
      );
      const join = getByRole(node, mode === "web" ? "link" : "button", { name: "Join meeting" });
      const notes = getByRole(node, "button", { name: "Notes & agenda" });
      expect(notes.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(node.querySelectorAll("svg[aria-hidden=true]")).toHaveLength(1);
      if (mode === "web") {
        expect(join.getAttribute("href")).toBe(url);
        expect(join.getAttribute("target")).toBe("_blank");
        expect(join.getAttribute("rel")).toBe("noopener noreferrer");
      }
      node.addEventListener(
        "click",
        (event) => {
          if (mode === "web") {
            expect(event.defaultPrevented).toBe(false);
            event.preventDefault();
          }
        },
        { once: true },
      );
      await act(async () => {
        const click = new MouseEvent("click", { bubbles: true, cancelable: true });
        join.dispatchEvent(click);
        if (mode !== "web") expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
      });
      if (mode === "web") {
        expect(node.textContent).toContain(
          "If nothing opened, use Open meeting link or copy the address.",
        );
        expect(getByRole(node, "link", { name: "Open meeting link" }).getAttribute("href")).toBe(
          url,
        );
        expect(node.textContent).not.toMatch(/blocked|successfully opened/i);
      } else if (mode === "desktop-reject") {
        expect(node.textContent).toContain("Unable to open meeting link.");
      } else {
        expect(node.textContent).not.toContain("Unable to open");
        expect(queryByRole(node, "button", { name: "Copy meeting link" })).toBeNull();
      }
      if (mode !== "desktop-open") {
        await act(() => fireEvent.click(getByRole(node, "button", { name: "Copy meeting link" })));
        expect(copy).toHaveBeenCalledExactlyOnceWith(url);
        expect(node.textContent).toContain("Meeting link copied.");
      }
      expect(webOpen).not.toHaveBeenCalled();
      for (const fake of Object.values(forbidden)) expect(fake).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      if (original) Object.defineProperty(window, "desktopBridge", original);
      else Reflect.deleteProperty(window, "desktopBridge");
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);
