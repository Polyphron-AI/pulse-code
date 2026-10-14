import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentId,
  type OfficeEvent,
} from "@t3tools/contracts";
const state = vi.hoisted(() => ({ save: vi.fn(), task: vi.fn(), run: vi.fn(), note: null }));
vi.mock("../../state/entities", () => ({ useProjects: () => [] }));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: {
      authenticated: true,
      scopes: [AuthOrchestrationOperateScope, AuthOrchestrationReadScope],
    },
  }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({ isSuccess: true, data: state.note }),
}));
vi.mock("../../state/meetingNotes", () => ({
  saveMeetingNote: "save",
  meetingNotesSubscription: () => ({}),
}));
vi.mock("../../state/tasks", () => ({ mutateTask: "task" }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: "save" | "task") => state[command],
}));
vi.mock("./office/shared", () => ({
  useOfficeRequest: () => ({ run: state.run, busy: false }),
  RequestState: () => null,
  fieldClass: "",
}));
import { MeetingNotesPanel } from "./MeetingNotesPanel";
const event: OfficeEvent = {
  id: "event",
  accountId: "google",
  calendarId: "primary",
  title: "Planning",
  start: "2026-10-12T09:00:00Z",
  end: "2026-10-12T10:00:00Z",
};
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {});
  state.save.mockReset().mockResolvedValue({ _tag: "Success" });
  state.task.mockReset().mockResolvedValue({ _tag: "Success" });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () => {
    renderer = create(
      <MeetingNotesPanel
        environmentId={EnvironmentId.make("local")}
        event={event}
        onClose={() => {}}
      />,
    );
  });
}
const button = (text: string) =>
  renderer.root.findAllByType("button").find((node) => node.props.children === text)!;
it("saves Pulse-owned notes only after explicit save with the meeting key and revision", async () => {
  await open();
  await act(async () =>
    renderer.root.findByType("textarea").props.onChange({ target: { value: "Launch notes" } }),
  );
  expect(state.save).not.toHaveBeenCalled();
  await act(async () => button("Save notes").props.onClick());
  expect(state.save).toHaveBeenCalledWith({
    environmentId: "local",
    input: {
      accountId: "google",
      eventId: "event",
      title: "Planning",
      text: "Launch notes",
      projectId: null,
      revision: null,
    },
  });
});
it("reviews lines without creating tasks and creates only selected edited action items", async () => {
  await open();
  await act(async () =>
    renderer.root
      .findByType("textarea")
      .props.onChange({ target: { value: "Prepare copy\nGeneral discussion" } }),
  );
  await act(async () => button("Review lines as action items").props.onClick());
  expect(state.task).not.toHaveBeenCalled();
  const checkbox = renderer.root
    .findAllByType("input")
    .find((node) => node.props.type === "checkbox")!;
  await act(async () => checkbox.props.onChange({ target: { checked: true } }));
  await act(async () => button("Create selected tasks").props.onClick());
  expect(state.task).toHaveBeenCalledTimes(1);
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(state.task).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        title: "Prepare copy",
        status: "todo",
        projectId: null,
        description: expect.stringContaining("Source excerpt:\nPrepare copy"),
        source: {
          url: "/workspace?space=office&officeView=meetings&notes=1&sourceEnvironment=local&sourceAccount=google&sourceMessage=event",
          excerpt: "Prepare copy",
        },
      }),
    }),
  );
  expect(button("Create selected tasks").props.disabled).toBe(true);
});
