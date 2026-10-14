import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./office/shared", () => ({
  useOfficeRequest: () => ({ run: state.run, busy: false }),
  RequestState: () => null,
  fieldClass: "",
}));
vi.mock("./office/TalkPanel", () => ({
  TalkPanel: () => <section aria-label="Recording controls" />,
}));
vi.mock("../ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import { CalendarWorkspace } from "./CalendarWorkspace";
vi.mock("../../state/environments", () => ({ usePrimaryEnvironmentId: () => "environment" }));
vi.mock("./MeetingNotesPanel", () => ({
  MeetingNotesPanel: () => <section aria-label="Meeting notes" />,
}));
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { desktopBridge: { officeInvoke: vi.fn() } });
  state.run.mockReset().mockImplementation(async (request: { operation: string }) => {
    if (request.operation === "accounts.list")
      return {
        ok: true,
        accounts: [
          {
            id: "google",
            provider: "google",
            email: "owner@example.com",
            capabilities: ["calendar", "calendarWrite"],
          },
        ],
      };
    if (request.operation === "calendars.list")
      return {
        ok: true,
        calendars: [
          { id: "calendar", accountId: "google", name: "Team", writable: true, selected: true },
        ],
      };
    if (request.operation === "calendars.events") return { ok: true, events: [] };
    return { ok: true };
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
it("schedules only on explicit form submission and sends the selected calendar and agenda", async () => {
  await act(async () => {
    renderer = create(<CalendarWorkspace meetings />);
  });
  const schedule = renderer.root
    .findAllByType("button")
    .find((button) => button.props.children?.includes?.("Schedule meeting"));
  await act(async () => schedule!.props.onClick());
  expect(state.run.mock.calls.some(([request]) => request.operation === "calendars.create")).toBe(
    false,
  );
  const inputs = renderer.root.findAllByType("input");
  await act(async () =>
    inputs
      .find((input) => input.props.maxLength === 4096)!
      .props.onChange({ target: { value: "Launch planning" } }),
  );
  await act(async () =>
    renderer.root
      .findByType("textarea")
      .props.onChange({ target: { value: "Review launch checklist" } }),
  );
  await act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
  expect(state.run).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "calendars.create",
      accountId: "google",
      calendarId: "calendar",
      event: expect.objectContaining({
        title: "Launch planning",
        description: "Review launch checklist",
      }),
    }),
  );
});
it("exposes recordings and keeps the provided tasks sidebar outside the event editor", async () => {
  await act(async () => {
    renderer = create(<CalendarWorkspace meetings tasksPanel={<aside aria-label="Tasks" />} />);
  });
  const recordings = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === "Recordings");
  await act(async () => recordings!.props.onClick());
  expect(renderer.root.findByProps({ "aria-label": "Recording controls" })).toBeDefined();
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.props.children === "Tasks")!
      .props.onClick(),
  );
  expect(renderer.root.findByProps({ "aria-label": "Tasks" })).toBeDefined();
});
it("opens a requested Pulse note without needing a calendar event or connected provider", async () => {
  vi.stubGlobal("window", {});
  await act(async () => {
    renderer = create(
      <CalendarWorkspace
        meetings
        requestedNote={{ accountId: "google", eventId: "stored-event" }}
      />,
    );
  });
  expect(renderer.root.findByProps({ "aria-label": "Meeting notes" })).toBeDefined();
});
