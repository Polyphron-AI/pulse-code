import { EnvironmentId, type MailMessageListItem } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { EnvironmentQueryView } from "../../../state/query";
import { MailMessageList } from "./MailMessageList";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../state/query", () => ({ useEnvironmentQuery: query }));
vi.mock("../../../mail/mailReadState", () => ({ pulseMailMessages: (input: unknown) => input }));
vi.mock("../../../state/entities", () => ({ useProjects: () => [] }));
vi.mock("./useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceLinks: false }),
}));
vi.mock("./useMailLinks", () => ({ useMailLinks: () => ({}), linkErrorText: vi.fn() }));
vi.mock("../../ui/button", () => ({ Button: "button" }));
vi.mock("../../ui/input", () => ({ Input: "input" }));
vi.mock("../../ui/toast", () => ({ stackedThreadToast: vi.fn(), toastManager: {} }));

interface Page {
  readonly messages: ReadonlyArray<MailMessageListItem>;
  readonly nextCursor?: string;
}
const message = (uid: number, subject: string): MailMessageListItem => ({
  ref: { accountId: "acct_1", mailbox: "INBOX", uidValidity: 7, uid },
  subject,
  seen: true,
  flagged: false,
  answered: false,
});

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "Refresh reloads newest mail and drops appended pages, with stale cursor=%s",
  async (stale) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const listeners = new Set<() => void>();
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    const refresh = vi.fn(() => {
      first = { ...first, data: { messages: [message(40, "New arrival")] } };
      listeners.forEach((listener) => listener());
    });
    let first: EnvironmentQueryView<Page> = {
      data: { messages: [message(30, "Previous newest")], nextCursor: "7.30" },
      dataUpdatedAt: 0,
      error: null,
      failure: null,
      isPending: false,
      isSuccess: true,
      refresh,
    };
    const later: EnvironmentQueryView<Page> = {
      ...first,
      data: { messages: [message(20, "Older cached mail")] },
      error: stale ? "This mailbox changed since the previous page. Search again." : null,
      refresh: vi.fn(),
    };
    query.mockImplementation((atom: { input: { cursor?: string } }) =>
      useSyncExternalStore(subscribe, () => (atom.input.cursor === undefined ? first : later)),
    );
    await act(() => {
      renderer = create(
        <MailMessageList
          environmentId={EnvironmentId.make("env_1")}
          accountId="acct_1"
          folder="INBOX"
          selected={null}
          onSelect={() => {}}
        />,
      );
    });
    const button = (text: string) =>
      renderer!.root.findAllByType("button").find((node) => node.children.includes(text))!;
    await act(() => button("Load more").props.onClick());
    expect(JSON.stringify(renderer!.toJSON())).toContain("Older cached mail");
    if (stale) expect(JSON.stringify(renderer!.toJSON())).toContain("Search again.");

    const refreshButton = renderer!.root
      .findAllByType("button")
      .find((node) => node.props["aria-label"] === "Refresh");
    expect(refreshButton).toBeDefined();
    await act(() => refreshButton!.props.onClick());
    expect(refresh).toHaveBeenCalledTimes(1);
    const refreshed = JSON.stringify(renderer!.toJSON());
    expect(refreshed).toContain("New arrival");
    expect(refreshed).not.toContain("Previous newest");
    expect(refreshed).not.toContain("Older cached mail");
    expect(refreshed).not.toContain("Search again.");

    // Submitting the already active search refreshes it rather than retaining old pages.
    await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(refresh).toHaveBeenCalledTimes(2);
  },
);
