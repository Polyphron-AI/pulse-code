// @vitest-environment happy-dom
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { chatResourceId, workspaceItemKey, type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole, fireEvent, getByText } from "@testing-library/dom";
import { ConversationNavigation } from "./ChatCommunicationsWorkspace";

const endpoint: WorkspaceLinkEndpoint = Object.freeze({
  title: "marketing",
  ref: Object.freeze({
    type: "provider-resource",
    provider: "slack",
    resourceId: chatResourceId({
      version: 1,
      transport: "server",
      connectionId: "slack_a",
      workspaceId: "T1",
      conversationId: "C1",
    }),
  }),
});
it("selects the clicked grouped conversation endpoint", async () => {
  const selected: WorkspaceLinkEndpoint[] = [];
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(
      <ConversationNavigation
        groups={[
          {
            label: "SynKEK",
            rows: [
              {
                key: workspaceItemKey(endpoint.ref),
                title: "marketing",
                endpoint,
                kind: "channel",
              },
            ],
          },
        ]}
        onSelect={(item) => selected.push(item)}
      />,
    );
  });
  await act(async () => {
    view.root.findByProps({ "aria-label": "Open marketing" }).props.onClick();
  });
  expect(selected).toEqual([endpoint]);
  await act(async () => view.unmount());
});

it("filters loaded provider, account and type metadata and resets without selecting", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const other: WorkspaceLinkEndpoint = {
    title: "Maya Chen",
    ref: {
      type: "provider-resource",
      provider: "slack",
      resourceId: chatResourceId({
        version: 1,
        transport: "server",
        connectionId: "slack_b",
        workspaceId: "T1",
        conversationId: "D1",
      }),
    },
  };
  const selected: WorkspaceLinkEndpoint[] = [];
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(
        <ConversationNavigation
          accountLabels={{ slack_a: "Marketing team", slack_b: "Personal workspace" }}
          groups={[
            {
              label: "SynKEK",
              project: true,
              rows: [{ key: "one", title: "marketing", endpoint, kind: "channel" }],
            },
            {
              label: "Direct messages",
              rows: [{ key: "two", title: "Maya Chen", endpoint: other, kind: "dm" }],
            },
          ]}
          onSelect={(item) => selected.push(item)}
        />,
      ),
    );
    const announcement = node.querySelector("[aria-live]");
    expect(announcement?.textContent).toBe("");
    expect(
      getByRole(node, "textbox", { name: "Search loaded conversations" }).hasAttribute(
        "aria-describedby",
      ),
    ).toBe(false);
    await act(async () => getByRole(node, "button", { name: "Toggle SynKEK" }).click());
    expect(queryByRole(node, "button", { name: "Open marketing" })).toBeNull();
    await act(async () => getByRole(node, "button", { name: "Toggle SynKEK" }).click());
    const first = getByRole(node, "button", { name: "Open marketing" });
    first.focus();
    await act(async () => fireEvent.keyDown(first, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(getByRole(node, "button", { name: "Open Maya Chen" }));
    await act(async () => getByRole(node, "button", { name: "Filter conversations" }).click());
    expect(getByRole(node, "option", { name: "Slack" }).getAttribute("value")).toBe("slack");
    expect(getByRole(node, "option", { name: "Personal workspace" }).getAttribute("value")).toBe(
      "slack_b",
    );
    expect(getByRole(node, "option", { name: "Direct messages" }).getAttribute("value")).toBe("dm");
    await act(async () =>
      fireEvent.change(getByRole(node, "combobox", { name: "Filter provider" }), {
        target: { value: "slack" },
      }),
    );
    expect(node.querySelector("[aria-live]")).toBe(announcement);
    expect(announcement?.textContent).toBe("2 loaded conversations match");
    await act(async () =>
      fireEvent.change(getByRole(node, "combobox", { name: "Filter account" }), {
        target: { value: "slack_b" },
      }),
    );
    await act(async () =>
      fireEvent.change(getByRole(node, "combobox", { name: "Filter type" }), {
        target: { value: "dm" },
      }),
    );
    expect(queryByRole(node, "button", { name: "Open marketing" })).toBeNull();
    expect(getByText(node, "1 loaded conversations match")).toBeDefined();
    await act(async () => getByRole(node, "button", { name: "Open Maya Chen" }).click());
    expect(selected).toEqual([other]);
    await act(async () => getByRole(node, "button", { name: "Reset filters" }).click());
    expect(getByRole(node, "button", { name: "Open marketing" })).toBeDefined();
    expect(node.querySelector("[aria-live]")).toBe(announcement);
    expect(announcement?.textContent).toBe("");
    expect(selected).toEqual([other]);
  } finally {
    await act(async () => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});
