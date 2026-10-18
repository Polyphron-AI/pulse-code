// @vitest-environment happy-dom
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByText, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  type ChatMessage,
  type ChatResult,
  type ChatRequest,
} from "@t3tools/contracts";
import { ChatComposer } from "./ChatCommunicationsWorkspace";
import type { ChatDraft } from "./communicationsChat";

const account = { id: "account", provider: "slack" as const, label: "Team", identity: "@alex" };
const conversation = {
  id: "C1",
  accountId: "account",
  title: "marketing",
  workspace: "Team",
  workspaceId: "T1",
  kind: "channel" as const,
  canSend: true,
};
const message: ChatMessage = {
  id: "1760343121.000001",
  accountId: "account",
  conversationId: "C1",
  author: "Alex",
  text: "Draft",
  date: "2026-10-13T09:12:01Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
let node: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let bridge: PropertyDescriptor | undefined;
const invoke = vi.fn<(request: ChatRequest) => Promise<ChatResult>>();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  bridge = Object.getOwnPropertyDescriptor(window, "desktopBridge");
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: { communicationsInvoke: invoke },
  });
  invoke.mockReset();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(() => root.unmount());
  node.remove();
  if (bridge) Object.defineProperty(window, "desktopBridge", bridge);
  else Reflect.deleteProperty(window, "desktopBridge");
  vi.unstubAllGlobals();
});
function ComposerOwner({
  props,
  acknowledged,
  visible = true,
}: {
  props: Partial<Parameters<typeof ChatComposer>[0]>;
  acknowledged: (message: ChatMessage) => void;
  visible?: boolean;
}) {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, ChatDraft>>(() => new Map());
  const pendingSends = useRef(new Map<string, NonNullable<ChatDraft["attempt"]>>());
  return visible ? (
    <ChatComposer
      account={account}
      conversation={conversation}
      writable
      environmentId={EnvironmentId.make("env-a")}
      transport="desktop"
      drafts={drafts}
      pendingSends={pendingSends}
      onDraftChange={(destination, update) =>
        setDrafts((current) =>
          new Map(current).set(
            destination,
            update(current.get(destination) ?? { text: "", generation: 0 }),
          ),
        )
      }
      onAcknowledged={acknowledged}
      {...props}
    />
  ) : null;
}
async function mount(props: Partial<Parameters<typeof ChatComposer>[0]> = {}) {
  const acknowledged = vi.fn();
  await act(() => root.render(<ComposerOwner props={props} acknowledged={acknowledged} />));
  return acknowledged;
}
function textbox() {
  return getByRole(node, "textbox", { name: "Message text" }) as HTMLTextAreaElement;
}
async function type(text: string) {
  await act(() => {
    fireEvent.change(textbox(), { target: { value: text } });
  });
}
async function enter() {
  await act(() => {
    fireEvent.keyDown(textbox(), { key: "Enter" });
  });
}

it.each([
  ["account", { accountId: "other" }],
  ["channel", { conversationId: "other" }],
  ["reply root", { threadId: "old-root", replyToId: "old-root" }],
  ["missing reply root", {}],
])("keeps a reply draft when ACK has mismatched %s", async (_label, delta) => {
  invoke.mockResolvedValue({ ok: true, message: { ...message, ...delta } });
  const acknowledged = await mount({ replyTo: { ...message, id: "root", threadId: "root" } });
  await type("Draft");
  await enter();
  expect(textbox().value).toBe("Draft");
  expect(acknowledged).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Check history before sending again.");
});

it.each(["environment", "transport", "provider", "account", "channel", "reply"])(
  "keeps separate drafts and rejects a late ACK after changing %s",
  async (part) => {
    const held = deferred<ChatResult>();
    invoke.mockReturnValue(held.promise);
    const acknowledged = vi.fn();
    await mount({ onAcknowledged: acknowledged });
    await type("Draft");
    await enter();
    const delta =
      part === "environment"
        ? { environmentId: EnvironmentId.make("env-b") }
        : part === "transport"
          ? { transport: "server" as const }
          : part === "provider"
            ? { account: { ...account, provider: "discord" as const } }
            : part === "account"
              ? {
                  account: { ...account, id: "account-b" },
                  conversation: { ...conversation, accountId: "account-b" },
                }
              : part === "channel"
                ? { conversation: { ...conversation, id: "C2" } }
                : { replyTo: { ...message, id: "root" } };
    await mount({ onAcknowledged: acknowledged, ...delta });
    if (part !== "transport") {
      expect(textbox().value).toBe("");
      await type("New destination draft");
    }
    await act(() => held.resolve({ ok: true, message }));
    expect(acknowledged).not.toHaveBeenCalled();
    if (part !== "transport") expect(textbox().value).toBe("New destination draft");
    await mount({ onAcknowledged: acknowledged });
    expect(textbox().value).toBe("Draft");
    expect(node.textContent).toContain("Check history before sending again.");
    expect(invoke).toHaveBeenCalledTimes(1);
  },
);

it("rejects an old generation even when navigation returns to the original destination before ACK", async () => {
  const held = deferred<ChatResult>();
  invoke.mockReturnValue(held.promise);
  const acknowledged = vi.fn();
  await mount({ onAcknowledged: acknowledged });
  await type("Draft");
  await enter();
  await mount({
    conversation: { ...conversation, id: "C2" },
    onAcknowledged: acknowledged,
  });
  await mount({ onAcknowledged: acknowledged });
  await act(() => held.resolve({ ok: true, message }));
  expect(textbox().value).toBe("Draft");
  expect(acknowledged).not.toHaveBeenCalled();
});

it("retains an unresolved attempt through unmount and return in its reader owner", async () => {
  const held = deferred<ChatResult>();
  invoke.mockReturnValue(held.promise);
  const acknowledged = vi.fn();
  function Reader() {
    const [visible, setVisible] = useState(true);
    return (
      <>
        <button onClick={() => setVisible((value) => !value)}>
          {visible ? "Hide composer" : "Return composer"}
        </button>
        <ComposerOwner props={{}} acknowledged={acknowledged} visible={visible} />
      </>
    );
  }
  await act(() => root.render(<Reader />));
  await type("Draft");
  await enter();
  await act(() => getByRole(node, "button", { name: "Hide composer" }).click());
  await act(() => getByRole(node, "button", { name: "Return composer" }).click());
  expect(textbox().value).toBe("Draft");
  await enter();
  await act(() => held.resolve({ ok: true, message }));
  expect(textbox().value).toBe("Draft");
  expect(node.textContent).toContain("Check history before sending again.");
  expect(acknowledged).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledTimes(1);
});

it.each(["server", "telegram"] as const)(
  "never sends from received-only %s even with writable metadata",
  async (transport) => {
    await mount({
      transport,
      account: transport === "telegram" ? { ...account, provider: "telegram" } : account,
    });
    expect(node.querySelector("textarea")).toBeNull();
    expect(node.textContent).toContain(
      transport === "telegram"
        ? "Received messages only. Telegram bot replies are not enabled."
        : "Read-only on this client. Open Pulse desktop to send with a connected desktop account.",
    );
    expect(invoke).not.toHaveBeenCalled();
  },
);

it.each(["failure", "throw"])(
  "keeps text and attempt after %s, with no automatic retry",
  async (outcome) => {
    if (outcome === "throw") invoke.mockRejectedValue(new Error("IPC disconnected"));
    else
      invoke.mockResolvedValue({
        ok: false,
        error: { code: "network", message: "Unknown outcome" },
      });
    const acknowledged = await mount();
    await type("Draft");
    await enter();
    expect(textbox().value).toBe("Draft");
    expect(node.textContent).toContain("Check history before sending again.");
    expect(acknowledged).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    const first = invoke.mock.calls[0]?.[0];
    await enter();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[0]).toEqual(first);
  },
);

it("holds one same-tick send until one matching ACK clears the actual draft", async () => {
  const held = deferred<ChatResult>();
  invoke.mockReturnValue(held.promise);
  const acknowledged = await mount();
  expect(invoke).not.toHaveBeenCalled();
  await type("Draft");
  await act(() => {
    fireEvent.keyDown(textbox(), { key: "Enter" });
    fireEvent.keyDown(textbox(), { key: "Enter" });
  });
  expect(textbox().value).toBe("Draft");
  await act(() => held.resolve({ ok: true, message }));
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(acknowledged).toHaveBeenCalledTimes(1);
  expect(textbox().value).toBe("");
});

it("retains text and gives check-history guidance when no message is acknowledged", async () => {
  invoke.mockResolvedValue({ ok: true });
  const acknowledged = await mount();
  await type("Draft");
  await enter();
  expect(textbox().value).toBe("Draft");
  expect(acknowledged).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Check history before sending again.");
  expect(queryByText(node, /^Sent through/)).toBeNull();
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("inserts a canonical URL only after the explicit Insert action, without sending", async () => {
  await mount();
  await type("Keep draft");
  await act(() => getByRole(node, "button", { name: "Links only" }).click());
  const link = getByRole(document.body, "textbox", { name: "URL" });
  await act(() =>
    fireEvent.change(link, {
      target: { value: "https://docs.google.com/document/d/file_123/edit?utm_source=x#heading" },
    }),
  );
  expect(textbox().value).toBe("Keep draft");
  await act(() => getByRole(document.body, "button", { name: "Insert" }).click());
  expect(textbox().value).toBe("Keep draft\nhttps://docs.google.com/document/d/file_123/edit");
  expect(node.querySelector('input[type="file"]')).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});

it("keeps link button keyboard activation available while URL Enter cannot submit a message", async () => {
  await mount();
  await type("Keep draft");
  await act(() => getByRole(node, "button", { name: "Links only" }).click());
  const url = getByRole(document.body, "textbox", { name: "URL" });
  await act(() => {
    fireEvent.change(url, { target: { value: "https://example.test/path" } });
    expect(fireEvent.keyDown(url, { key: "Enter" })).toBe(false);
  });
  expect(invoke).not.toHaveBeenCalled();
  expect(textbox().value).toBe("Keep draft");
  const insert = getByRole(document.body, "button", { name: "Insert" });
  await act(() => {
    expect(fireEvent.keyDown(insert, { key: "Enter" })).toBe(true);
  });
  await act(() => insert.click());
  expect(textbox().value).toBe("Keep draft\nhttps://example.test/path");
  expect(invoke).not.toHaveBeenCalled();
});

it.each(["Cancel", "Escape", "outside"])(
  "leaves a draft unchanged when Insert link closes by %s",
  async (action) => {
    await mount();
    await type("Keep draft");
    await act(() => getByRole(node, "button", { name: "Links only" }).click());
    const link = getByRole(document.body, "textbox", { name: "URL" });
    await act(() => fireEvent.change(link, { target: { value: "https://example.test/path" } }));
    await act(() => {
      if (action === "Cancel") getByRole(document.body, "button", { name: "Cancel" }).click();
      else if (action === "Escape") fireEvent.keyDown(link, { key: "Escape" });
      else {
        fireEvent.pointerDown(document.body);
        fireEvent.mouseDown(document.body);
        fireEvent.click(document.body);
      }
    });
    expect(queryByRole(document.body, "textbox", { name: "URL" })).toBeNull();
    expect(textbox().value).toBe("Keep draft");
    expect(invoke).not.toHaveBeenCalled();
  },
);

it.each(["javascript:alert(1)", "data:text/plain,x", "file:///C:/private"])(
  "rejects %s in the actual link form",
  async (value) => {
    await mount();
    await type("Keep draft");
    await act(() => getByRole(node, "button", { name: "Links only" }).click());
    const link = getByRole(document.body, "textbox", { name: "URL" });
    await act(() => fireEvent.change(link, { target: { value } }));
    await act(() => getByRole(document.body, "button", { name: "Insert" }).click());
    expect(document.body.textContent).toContain("Enter a valid http or https link.");
    expect(textbox().value).toBe("Keep draft");
    expect(invoke).not.toHaveBeenCalled();
  },
);

it("cancels link insertion on destination change and restores the old draft", async () => {
  await mount({});
  await type("Keep draft");
  await act(() => getByRole(node, "button", { name: "Links only" }).click());
  await act(() =>
    fireEvent.change(getByRole(document.body, "textbox", { name: "URL" }), {
      target: { value: "https://example.test/path" },
    }),
  );
  await mount({ conversation: { ...conversation, id: "C2" } });
  expect(queryByRole(document.body, "textbox", { name: "URL" })).toBeNull();
  expect(textbox().value).toBe("");
  await mount({});
  expect(textbox().value).toBe("Keep draft");
  expect(queryByRole(document.body, "textbox", { name: "URL" })).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});

it("does not replace edits made after the link action captured the draft", async () => {
  await mount();
  await type("First draft");
  await act(() => getByRole(node, "button", { name: "Links only" }).click());
  await act(() =>
    fireEvent.change(getByRole(document.body, "textbox", { name: "URL" }), {
      target: { value: "https://example.test/path" },
    }),
  );
  await type("Newer draft");
  await act(() => getByRole(document.body, "button", { name: "Insert" }).click());
  expect(textbox().value).toBe("Newer draft");
  expect(invoke).not.toHaveBeenCalled();
});

it("preserves Shift+Enter and IME composition, then sends on Enter", async () => {
  invoke.mockResolvedValue({ ok: true, message });
  await mount();
  await type("Draft");
  await act(() => {
    expect(fireEvent.keyDown(textbox(), { key: "Enter", shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(textbox(), { key: "Enter", isComposing: true })).toBe(true);
  });
  expect(textbox().value).toBe("Draft");
  expect(invoke).not.toHaveBeenCalled();
  await enter();
  expect(textbox().value).toBe("");
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("captures the latest draft text when change and submit happen in the same tick", async () => {
  invoke.mockResolvedValue({ ok: true, message: { ...message, text: "Latest draft" } });
  await mount();
  await type("Older draft");
  await act(() => {
    fireEvent.change(textbox(), { target: { value: "Latest draft" } });
    fireEvent.submit(getByRole(node, "form", { name: "Conversation composer" }));
  });
  expect(invoke.mock.calls[0]?.[0]).toMatchObject({ text: "Latest draft" });
  expect(textbox().value).toBe("");
});

it.each(["slack", "discord"] as const)(
  "enforces the %s length limit for send and link insertion",
  async (provider) => {
    await mount({ account: { ...account, provider } });
    const limit = provider === "discord" ? 2000 : 4096;
    expect(textbox().maxLength).toBe(limit);
    await type("x".repeat(limit + 1));
    await enter();
    expect(invoke).not.toHaveBeenCalled();
    await type("x".repeat(limit));
    await act(() => getByRole(node, "button", { name: "Links only" }).click());
    await act(() =>
      fireEvent.change(getByRole(document.body, "textbox", { name: "URL" }), {
        target: { value: "https://example.test" },
      }),
    );
    await act(() => getByRole(document.body, "button", { name: "Insert" }).click());
    expect(textbox().value).toHaveLength(limit);
    expect(document.body.textContent).toContain("This link would exceed the message length limit.");
    expect(invoke).not.toHaveBeenCalled();
  },
);

it.each([
  "operate denied",
  "channel denied",
  "account mismatch",
  "reply mismatch",
  "no environment",
  "no IPC",
])("cannot send when %s", async (condition) => {
  if (condition === "no IPC") Reflect.deleteProperty(window, "desktopBridge");
  await mount(
    condition === "operate denied"
      ? { writable: false }
      : condition === "channel denied"
        ? { conversation: { ...conversation, canSend: false } }
        : condition === "account mismatch"
          ? { conversation: { ...conversation, accountId: "wrong" } }
          : condition === "reply mismatch"
            ? { replyTo: { ...message, accountId: "wrong" } }
            : condition === "no environment"
              ? { environmentId: null }
              : {},
  );
  expect(node.querySelector("textarea")).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});

it("preserves the Slack root in the request and clears only a root-matching ACK", async () => {
  invoke.mockResolvedValue({
    ok: true,
    message: { ...message, threadId: "root", replyToId: "root" },
  });
  const acknowledged = await mount({
    replyTo: { ...message, id: "nested", threadId: "root", replyToId: "root" },
  });
  await type("Draft");
  await enter();
  expect(invoke.mock.calls[0]?.[0]).toMatchObject({
    operation: "messages.send",
    accountId: "account",
    conversationId: "C1",
    replyToId: "root",
    text: "Draft",
  });
  expect(acknowledged).toHaveBeenCalledTimes(1);
  expect(textbox().value).toBe("");
});

it("sends Discord native thread content to the native channel without a parent reply reference", async () => {
  invoke.mockResolvedValue({ ok: true, message: { ...message, conversationId: "native-thread" } });
  const acknowledged = await mount({
    account: { ...account, provider: "discord" },
    conversation: { ...conversation, id: "native-thread", kind: "thread" },
    nativeThread: true,
    replyTo: message,
  });
  await type("Draft");
  await enter();
  expect(invoke.mock.calls[0]?.[0]).toMatchObject({
    operation: "messages.send",
    conversationId: "native-thread",
    text: "Draft",
  });
  expect(invoke.mock.calls[0]?.[0]).not.toHaveProperty("replyToId");
  expect(acknowledged).toHaveBeenCalledTimes(1);
  expect(textbox().value).toBe("");
});

it("cancel reply restores the main draft during a pending reply send and retains the reply on return", async () => {
  const held = deferred<ChatResult>();
  invoke.mockReturnValue(held.promise);
  const acknowledged = vi.fn();
  await mount({});
  await type("Main draft");
  const replying = { ...message, id: "root" };
  await mount({
    replyTo: replying,
    onAcknowledged: acknowledged,
    onCancelReply: () => {
      root.render(
        <ComposerOwner props={{ onAcknowledged: acknowledged }} acknowledged={acknowledged} />,
      );
    },
  });
  await type("Reply draft");
  await enter();
  await act(() => getByRole(node, "button", { name: "Cancel reply" }).click());
  expect(textbox().value).toBe("Main draft");
  await act(() =>
    held.resolve({ ok: true, message: { ...message, threadId: "root", replyToId: "root" } }),
  );
  expect(acknowledged).not.toHaveBeenCalled();
  await mount({ replyTo: replying });
  expect(textbox().value).toBe("Reply draft");
});

it("rejects a completion after authorization changes, and keeps its old nonce only for an explicit unchanged retry", async () => {
  const held = deferred<ChatResult>();
  invoke.mockReturnValue(held.promise);
  const acknowledged = vi.fn();
  await mount({ onAcknowledged: acknowledged });
  await type("Draft");
  await enter();
  await mount({ writable: false });
  await act(() => held.resolve({ ok: true, message }));
  await mount({ onAcknowledged: acknowledged });
  expect(textbox().value).toBe("Draft");
  expect(acknowledged).not.toHaveBeenCalled();
  const oldRequest = invoke.mock.calls[0]?.[0];
  invoke.mockResolvedValue({ ok: true, message });
  await enter();
  expect(invoke.mock.calls[1]?.[0]).toEqual(oldRequest);
  expect(textbox().value).toBe("");
});
