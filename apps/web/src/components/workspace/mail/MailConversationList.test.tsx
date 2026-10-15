import { act, useSyncExternalStore } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, type MailConversation, type MailMessageListItem } from "@t3tools/contracts";
import { MailConversationList } from "./MailConversationList";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../../state/query", () => ({ useEnvironmentQuery: query }));
vi.mock("../../../mail/mailReadState", () => ({
  pulseMailConversations: (input: unknown) => input,
}));
vi.mock("./MailMessageList", () => ({
  MailRow: ({ onSelect, message }: { onSelect: () => void; message: MailMessageListItem }) => (
    <button onClick={onSelect}>{message.subject}</button>
  ),
}));
vi.mock("../../ui/button", () => ({ Button: "button" }));
vi.mock("../../ui/input", () => ({ Input: "input" }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("selects the server's complete scanned group and exposes incomplete scan bounds", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const message = (uid: number): MailMessageListItem => ({
    ref: { accountId: "acct", mailbox: "INBOX", uidValidity: 1, uid },
    subject: `Message ${uid}`,
    seen: true,
    flagged: false,
    answered: false,
  });
  const conversation: MailConversation = {
    id: "root",
    newest: message(40),
    messages: [message(40), message(1)],
  };
  query.mockReturnValue({
    data: { conversations: [conversation], incomplete: true, scannedMessages: 500 },
    error: null,
  });
  const select = vi.fn();
  await act(() => {
    renderer = create(
      <MailConversationList
        environmentId={EnvironmentId.make("env")}
        accountId="acct"
        folder="INBOX"
        selectedId={undefined}
        onSelect={select}
      />,
    );
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain(
    "Older messages and conversation members may be missing",
  );
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Message 40")!
      .props.onClick(),
  );
  expect(select).toHaveBeenCalledWith(conversation);
  expect(query).toHaveBeenCalledWith({
    environmentId: "env",
    input: { accountId: "acct", mailbox: "INBOX" },
  });
});

it("refreshes the selected same-ID group and newest action target when messages arrive", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const message = (uid: number): MailMessageListItem => ({
    ref: { accountId: "acct", mailbox: "Archive", uidValidity: 1, uid },
    subject: `Message ${uid}`,
    seen: true,
    flagged: false,
    answered: false,
  });
  const initial: MailConversation = {
    id: "stable-root",
    newest: message(1),
    messages: [message(1)],
  };
  const arrived: MailConversation = {
    ...initial,
    newest: message(2),
    messages: [message(2), message(1)],
  };
  const update = vi.fn();
  const props = {
    environmentId: EnvironmentId.make("env"),
    accountId: "acct",
    folder: "Archive",
    selectedId: initial.id,
    onSelect: vi.fn(),
    onUpdate: update,
  };
  query.mockReturnValue({
    data: { conversations: [initial], incomplete: false, scannedMessages: 1 },
    error: null,
    isPending: false,
  });
  await act(() => {
    renderer = create(<MailConversationList {...props} />);
  });
  expect(update).toHaveBeenLastCalledWith(initial);
  query.mockReturnValue({
    data: { conversations: [arrived], incomplete: false, scannedMessages: 2 },
    error: null,
    isPending: false,
  });
  await act(() => renderer!.update(<MailConversationList {...props} />));
  expect(update).toHaveBeenLastCalledWith(arrived);
  expect(update.mock.lastCall?.[0].newest.ref.uid).toBe(2);
});

it("keeps the selected group through pending and cleared interim refresh data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const message = (uid: number): MailMessageListItem => ({
    ref: { accountId: "acct", mailbox: "Archive", uidValidity: 1, uid },
    seen: true,
    flagged: false,
    answered: false,
  });
  const initial: MailConversation = {
    id: "stable-root",
    newest: message(1),
    messages: [message(1)],
  };
  const arrived: MailConversation = {
    ...initial,
    newest: message(2),
    messages: [message(2), message(1)],
  };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  let snapshot: {
    data: {
      conversations: MailConversation[];
      incomplete: boolean;
      scannedMessages: number;
    } | null;
    isPending: boolean;
    error: null;
    refresh: () => void;
  } = {
    data: { conversations: [initial], incomplete: false, scannedMessages: 1 },
    isPending: false,
    error: null,
    refresh: () => {},
  };
  const emit = () => listeners.forEach((listener) => listener());
  let complete!: () => void;
  const completion = {
    promise: new Promise<void>((resolve) => {
      complete = resolve;
    }),
    resolve: () => complete(),
  };
  snapshot.refresh = () => {
    const refresh = snapshot.refresh;
    snapshot = { ...snapshot, data: null, isPending: true };
    emit();
    void completion.promise.then(() => {
      snapshot = {
        data: { conversations: [arrived], incomplete: false, scannedMessages: 2 },
        isPending: false,
        error: null,
        refresh,
      };
      emit();
    });
  };
  query.mockImplementation(() => useSyncExternalStore(subscribe, () => snapshot));
  const update = vi.fn();
  await act(() => {
    renderer = create(
      <MailConversationList
        environmentId={EnvironmentId.make("env")}
        accountId="acct"
        folder="Archive"
        selectedId={initial.id}
        onSelect={vi.fn()}
        onUpdate={update}
      />,
    );
  });
  expect(update).toHaveBeenCalledTimes(1);
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Refresh")!
      .props.onClick(),
  );
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => {
    completion.resolve();
    await completion.promise;
  });
  expect(update).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenLastCalledWith(arrived);
});
