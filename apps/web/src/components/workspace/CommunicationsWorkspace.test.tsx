// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { CommunicationsWorkspace } from "./CommunicationsWorkspace";

const boundary = vi.hoisted(() => ({
  run: vi.fn(async (request: { operation: string }) => {
    if (request.operation === "accounts.list")
      return {
        ok: true,
        accounts: [
          { id: "slack-a", provider: "slack", label: "Team A", identity: "person@example.test" },
        ],
      };
    if (request.operation === "conversations.list")
      return {
        ok: true,
        conversations: [
          {
            id: "marketing",
            accountId: "slack-a",
            title: "# marketing",
            workspace: "Team A",
            kind: "channel",
            canSend: true,
          },
        ],
      };
    return { ok: true, messages: [] };
  }),
}));
vi.mock("./useCommunicationsRequest", () => ({
  useCommunicationsRequest: () => ({
    run: boundary.run,
    available: true,
    busy: false,
    error: null,
  }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote" }),
}));
vi.mock("../../state/environments", () => ({
  useEnvironment: () => ({ label: "Remote environment" }),
}));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({ environment: "remote" }),
  Link: "a",
}));
vi.mock("./ConnectCommunicationsDialog", () => ({
  ConnectCommunicationsDialog: () => <p>Connect account dialog</p>,
}));
let root: Root;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  node?.remove();
  boundary.run.mockClear();
  vi.unstubAllGlobals();
});
it("keeps desktop account controls reachable and changes the one shared header when a channel opens", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<CommunicationsWorkspace />));
  expect(getByRole(node, "combobox", { name: "Connected communications account" })).toBeDefined();
  expect(getByRole(node, "button", { name: "Refresh account list" })).toBeDefined();
  expect(getByRole(node, "button", { name: "Disconnect Team A" })).toBeDefined();
  await act(async () => getByRole(node, "button", { name: /# marketing/ }).click());
  expect(getByRole(node, "heading", { name: "# marketing" })).toBeDefined();
  expect(node.querySelectorAll("[data-workspace-engagement-header]")).toHaveLength(1);
  expect(node.textContent).toContain("Slack");
  expect(node.textContent).toContain("person@example.test");
  expect(getByRole(node, "textbox", { name: "Message text" })).toBeDefined();
  const calls = boundary.run.mock.calls.length;
  await act(async () => getByRole(node, "button", { name: "Resources" }).click());
  expect(boundary.run).toHaveBeenCalledTimes(calls);
  expect(getByRole(node, "heading", { name: "# marketing" })).toBeDefined();
  await act(async () => getByRole(node, "button", { name: "Connect chat" }).click());
  expect(node.textContent).toContain("Connect account dialog");
});
