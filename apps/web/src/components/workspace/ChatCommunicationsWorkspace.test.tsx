import { act, type ButtonHTMLAttributes } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { ChatAccount, ChatConversation, ChatRequest, ChatResult } from "@t3tools/contracts";

vi.mock("../../hooks/useLocalStorage", async () => {
  const { useState } = await import("react");
  return { useLocalStorage: () => useState([]) };
});
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../ui/input", () => ({ Input: () => <input /> }));
vi.mock("../ui/textarea", () => ({ Textarea: () => <textarea /> }));
import { ChatCommunicationsWorkspace } from "./ChatCommunicationsWorkspace";

const account: ChatAccount = {
  id: "slack-one",
  provider: "slack",
  label: "Team",
  identity: "Alex",
};
const room: ChatConversation = {
  id: "launch",
  accountId: account.id,
  title: "Launch",
  workspace: "Team",
  kind: "channel",
  canSend: true,
};
let renderer: ReactTestRenderer | undefined;
const invoke = vi.fn<(request: ChatRequest) => Promise<ChatResult>>();
function deferredResult() {
  let resolve: (value: ChatResult) => void = () => {};
  const promise = new Promise<ChatResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { desktopBridge: { communicationsInvoke: invoke } }),
  );
  invoke.mockReset();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("opens a requested project channel after its conversations arrive and allows general navigation", async () => {
  const listing = deferredResult();
  const general = { ...room, id: "general", title: "General" };
  invoke.mockImplementation(async (request) =>
    request.operation === "conversations.list" ? listing.promise : { ok: true, messages: [] },
  );
  const onSelected = vi.fn();
  await act(async () => {
    renderer = create(
      <ChatCommunicationsWorkspace
        account={account}
        requestedConversationId={room.id}
        onConversationSelected={onSelected}
      />,
    );
  });
  expect(invoke).toHaveBeenCalledTimes(1);
  await act(async () => listing.resolve({ ok: true, conversations: [room, general] }));
  expect(invoke).toHaveBeenLastCalledWith({
    operation: "messages.list",
    accountId: account.id,
    conversationId: room.id,
  });
  expect(onSelected).not.toHaveBeenCalled();
  const generalButton = renderer!.root
    .findAllByType("button")
    .find((button) =>
      button.findAllByType("span").some((span) => span.children.join("") === "General"),
    );
  await act(async () => generalButton!.props.onClick());
  expect(onSelected).toHaveBeenCalledWith(general);
  expect(invoke).toHaveBeenLastCalledWith({
    operation: "messages.list",
    accountId: account.id,
    conversationId: general.id,
  });
});

it("ignores a late previous-account response when channel IDs match", async () => {
  const oldListing = deferredResult();
  const second = { ...account, id: "slack-two" };
  invoke.mockImplementation(async (request) =>
    "accountId" in request && request.accountId === account.id
      ? oldListing.promise
      : request.operation === "conversations.list"
        ? { ok: true, conversations: [{ ...room, accountId: second.id }] }
        : { ok: true, messages: [] },
  );
  await act(async () => {
    renderer = create(
      <ChatCommunicationsWorkspace account={account} requestedConversationId={room.id} />,
    );
  });
  await act(async () => {
    renderer!.update(
      <ChatCommunicationsWorkspace account={second} requestedConversationId={room.id} />,
    );
  });
  await act(async () => oldListing.resolve({ ok: true, conversations: [room] }));
  expect(
    invoke.mock.calls
      .filter(([request]) => request.operation === "messages.list")
      .map(([request]) => ("accountId" in request ? request.accountId : undefined)),
  ).toEqual([second.id]);
});

it("loads subsequent conversation pages to resolve a linked channel", async () => {
  invoke.mockImplementation(async (request) =>
    request.operation === "conversations.list"
      ? request.cursor
        ? { ok: true, conversations: [room] }
        : { ok: true, conversations: [], nextCursor: "next" }
      : { ok: true, messages: [] },
  );
  await act(async () => {
    renderer = create(
      <ChatCommunicationsWorkspace account={account} requestedConversationId={room.id} />,
    );
  });
  expect(invoke.mock.calls.map(([request]) => request)).toEqual([
    { operation: "conversations.list", accountId: account.id },
    { operation: "conversations.list", accountId: account.id, cursor: "next" },
    { operation: "messages.list", accountId: account.id, conversationId: room.id },
  ]);
});

it("hides the previous destination's composer when a linked channel is inaccessible", async () => {
  invoke.mockImplementation(async (request) =>
    request.operation === "conversations.list"
      ? { ok: true, conversations: [room] }
      : { ok: true, messages: [] },
  );
  await act(async () => {
    renderer = create(
      <ChatCommunicationsWorkspace account={account} requestedConversationId={room.id} />,
    );
  });
  expect(renderer!.root.findAllByType("textarea")).toHaveLength(1);
  await act(async () => {
    renderer!.update(
      <ChatCommunicationsWorkspace
        account={account}
        requestedConversationId="unavailable-channel"
      />,
    );
  });
  expect(renderer!.root.findAllByType("textarea")).toHaveLength(0);
});
it("captures a task draft from a chat message with its exact source link and editable excerpt", async () => {
  const message = {
    id: "123.456",
    accountId: account.id,
    conversationId: room.id,
    author: "Alex",
    date: "2026-10-12T00:00:00Z",
    text: "Prepare the launch\nUse the revised brief",
  };
  invoke.mockImplementation(async (request) =>
    request.operation === "conversations.list"
      ? { ok: true, conversations: [room] }
      : { ok: true, messages: [message] },
  );
  const createTask = vi.fn();
  await act(async () => {
    renderer = create(
      <ChatCommunicationsWorkspace
        account={account}
        requestedConversationId={room.id}
        requestedMessageId={message.id}
        onCreateTask={createTask}
      />,
    );
  });
  const target = renderer!.root.findByProps({ "data-source-message": true });
  expect(target.props.className).toContain("bg-accent");
  act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Create task")!
      .props.onClick(),
  );
  expect(createTask).toHaveBeenCalledWith({
    title: "Prepare the launch",
    source: {
      url: "/workspace?space=office&officeView=communications&sourceProvider=slack&sourceAccount=slack-one&sourceConversation=launch&sourceMessage=123.456",
      excerpt: message.text,
    },
  });
  expect(invoke.mock.calls.some(([request]) => request.operation === "messages.send")).toBe(false);
});
it("pages loaded channel history to find an older linked source message", async () => {
  invoke.mockImplementation(async (request) =>
    request.operation === "conversations.list"
      ? { ok: true, conversations: [room] }
      : request.operation === "messages.list" && request.cursor
        ? {
            ok: true,
            messages: [
              {
                id: "older",
                accountId: account.id,
                conversationId: room.id,
                author: "Alex",
                date: "2026-10-12T00:00:00Z",
                text: "Source",
              },
            ],
          }
        : { ok: true, messages: [], nextCursor: "older-page" },
  );
  await act(async () => {
    renderer = create(
      <ChatCommunicationsWorkspace
        account={account}
        requestedConversationId={room.id}
        requestedMessageId="older"
      />,
    );
  });
  expect(invoke).toHaveBeenCalledWith({
    operation: "messages.list",
    accountId: account.id,
    conversationId: room.id,
    cursor: "older-page",
  });
  expect(renderer!.root.findByProps({ "data-source-message": true })).toBeDefined();
});
it("opens the native Slack thread for a source reply absent from channel history", async () => {
  const reply = {
    id: "reply",
    accountId: account.id,
    conversationId: room.id,
    threadId: "root",
    author: "Alex",
    date: "2026-10-12T00:00:00Z",
    text: "Source reply",
  };
  invoke.mockImplementation(async (request) =>
    request.operation === "conversations.list"
      ? { ok: true, conversations: [room] }
      : request.operation === "messages.list" && request.threadId
        ? { ok: true, messages: [{ ...reply, id: "root", text: "Thread root" }, reply] }
        : { ok: true, messages: [] },
  );
  await act(async () => {
    renderer = create(
      <ChatCommunicationsWorkspace
        account={account}
        requestedConversationId={room.id}
        requestedMessageId="reply"
        requestedThreadId="root"
      />,
    );
  });
  expect(invoke).toHaveBeenCalledWith({
    operation: "messages.list",
    accountId: account.id,
    conversationId: room.id,
    threadId: "root",
  });
  expect(renderer!.root.findByProps({ "data-source-message": true })).toBeDefined();
});
