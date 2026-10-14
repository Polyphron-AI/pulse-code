import { act, createRef } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { OfficeAccount, OfficeMessage } from "@t3tools/contracts";
const state = vi.hoisted(() => ({ run: vi.fn(), busy: false }));
vi.mock("./office/shared", () => ({
  useOfficeRequest: () => ({ run: state.run, busy: state.busy }),
  RequestState: () => null,
}));
vi.mock("./GlobalFilesPanel", () => ({ GlobalFilesPanel: () => null }));
vi.mock("../ui/textarea", () => ({ Textarea: (props: object) => <textarea {...props} /> }));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
vi.mock("../../hooks/useLocalStorage", async () => {
  const { useState } = await import("react");
  return { useLocalStorage: () => useState([]) };
});
import {
  EmailCommunicationsWorkspace,
  DraftReply,
  type DraftReplyHandle,
} from "./EmailCommunicationsWorkspace";
let renderer: ReactTestRenderer | undefined;
const account = {
  id: "mail",
  email: "person@example.com",
  provider: "google",
  capabilities: ["mail"],
  status: "connected",
  selectedCalendarIds: [],
} satisfies OfficeAccount;
const message = {
  id: "message",
  accountId: "mail",
  subject: "Proposal",
  from: "client@example.com",
} as OfficeMessage;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  state.run.mockReset();
  state.busy = false;
});
it("adds a file link to existing draft text and saves the correct source message", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.run.mockResolvedValue({
    drafts: [
      {
        id: "draft",
        sourceMessageId: message.id,
        text: "Existing reply",
        to: "client@example.com",
        subject: "Re: Proposal",
      },
    ],
  });
  const ref = createRef<DraftReplyHandle>();
  await act(async () => {
    renderer = create(
      <DraftReply account={account} message={message} disabled={false} ref={ref} />,
    );
  });
  act(() => {
    expect(ref.current?.insertLink("Proposal", "https://docs.google.com/document/d/proposal")).toBe(
      true,
    );
  });
  expect(renderer!.root.findByType("textarea").props.value).toBe(
    "Existing reply\n\nProposal\nhttps://docs.google.com/document/d/proposal",
  );
  await act(async () => {
    renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  expect(state.run).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: "drafts.save",
      id: "draft",
      accountId: "mail",
      sourceMessageId: "message",
      text: "Existing reply\n\nProposal\nhttps://docs.google.com/document/d/proposal",
    }),
  );
});
it("does not insert links while the draft is loading or saving", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.busy = true;
  state.run.mockResolvedValue(undefined);
  const ref = createRef<DraftReplyHandle>();
  await act(async () => {
    renderer = create(
      <DraftReply account={account} message={message} disabled={false} ref={ref} />,
    );
  });
  act(() => {
    expect(ref.current?.insertLink("Proposal", "https://docs.google.com/document/d/proposal")).toBe(
      false,
    );
  });
  expect(renderer!.root.findByType("textarea").props.value).toBe("");
  await act(async () => renderer?.unmount());
  renderer = undefined;
  expect(ref.current).toBe(null);
});
it("requires review, saves first and keeps the draft when sending is uncertain", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const outgoing = { ...account, capabilities: ["mail", "mailSend"] as const };
  state.run.mockImplementation(async (request) => {
    if (request.operation === "drafts.list") return { drafts: [] };
    if (request.operation === "drafts.save") return { drafts: [{ ...request, id: "draft" }] };
    if (request.operation === "mail.send") return undefined;
  });
  await act(async () => {
    renderer = create(<DraftReply account={outgoing} message={message} disabled={false} />);
  });
  act(() =>
    renderer!.root.findByType("textarea").props.onChange({ target: { value: "Reply body" } }),
  );
  const button = (label: string) =>
    renderer!.root.findAllByType("button").find((item) => item.props.children === label)!;
  act(() => button("Review and send").props.onClick());
  expect(state.run.mock.calls.some(([request]) => request.operation === "mail.send")).toBe(false);
  await act(async () => button("Send email").props.onClick());
  expect(state.run.mock.calls.map(([request]) => request.operation)).toEqual([
    "drafts.list",
    "drafts.save",
    "mail.send",
  ]);
  expect(renderer!.root.findByType("textarea").props.value).toBe("Reply body");
  expect(renderer!.root.findByProps({ role: "status" }).props.children).toContain(
    "Check Sent mail",
  );
});
it("clears the local draft only after the provider accepts an explicit send", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const outgoing = { ...account, capabilities: ["mail", "mailSend"] as const };
  state.run.mockImplementation(async (request) => {
    if (request.operation === "drafts.list") return { drafts: [] };
    if (request.operation === "drafts.save") return { drafts: [{ ...request, id: "draft" }] };
    if (request.operation === "mail.send") return { sent: true };
    return { drafts: [] };
  });
  await act(async () => {
    renderer = create(<DraftReply account={outgoing} message={message} disabled={false} />);
  });
  act(() =>
    renderer!.root.findByType("textarea").props.onChange({ target: { value: "Reply body" } }),
  );
  const button = (label: string) =>
    renderer!.root.findAllByType("button").find((item) => item.props.children === label)!;
  act(() => button("Review and send").props.onClick());
  await act(async () => button("Send email").props.onClick());
  expect(state.run.mock.calls.map(([request]) => request.operation)).toEqual([
    "drafts.list",
    "drafts.save",
    "mail.send",
    "drafts.delete",
  ]);
  expect(renderer!.root.findByType("textarea").props.value).toBe("");
  expect(button("Review and send").props.disabled).toBe(true);
});
it("opens an exact source email outside the loaded inbox and captures it into the Tasks sidebar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { desktopBridge: { officeInvoke() {} } });
  const source = {
    ...message,
    conversationId: "thread",
    to: account.email,
    date: "2026-10-12T00:00:00Z",
    preview: "Preview",
    text: "Actual source email",
    unread: false,
  };
  state.run.mockImplementation(async (request) => {
    if (request.operation === "accounts.list") return { accounts: [account] };
    if (request.operation === "mail.list") return { messages: [] };
    if (request.operation === "mail.get") return { message: source };
    if (request.operation === "mail.thread")
      return { thread: { messages: [source], grouping: "provider", truncated: false } };
    return { drafts: [] };
  });
  const createTask = vi.fn();
  await act(async () => {
    renderer = create(
      <EmailCommunicationsWorkspace
        requestedAccountId="mail"
        requestedMessageId="message"
        onCreateTask={createTask}
        tasksPanel={<div data-testid="tasks" />}
      />,
    );
  });
  expect(state.run).toHaveBeenCalledWith({
    operation: "mail.get",
    accountId: "mail",
    messageId: "message",
  });
  act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Create task")!
      .props.onClick(),
  );
  expect(createTask).toHaveBeenCalledWith({
    title: "Proposal",
    source: {
      url: "/workspace?space=office&officeView=email&sourceProvider=google&sourceAccount=mail&sourceConversation=thread&sourceMessage=message",
      excerpt: "Actual source email",
    },
  });
  expect(renderer!.root.findByProps({ "data-testid": "tasks" })).toBeDefined();
});
