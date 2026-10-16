// @vitest-environment happy-dom
import { act, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { CommunicationsWorkspace } from "./CommunicationsWorkspace";
import { EnvironmentId } from "@t3tools/contracts";
import { useWorkspaceResourceState, WorkspaceResourcesProvider } from "./workspaceResourceState";
import { useMediaQuery } from "../../hooks/useMediaQuery";

const storage = { getItem: () => null, setItem: () => {} };
function App() {
  const wide = useMediaQuery("xl");
  const resources = useWorkspaceResourceState(EnvironmentId.make("remote"), {
    storage,
    presentation: wide ? "dock" : "sheet",
  });
  return (
    <WorkspaceResourcesProvider value={resources}>
      <CommunicationsWorkspace />
    </WorkspaceResourcesProvider>
  );
}

// Account/channel tests isolate the separately tested project-resource boundary.
vi.mock("./WorkspaceResourcesPanel", () => ({
  WorkspaceProjectResources: () => <p>Project resources</p>,
}));

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
  useCommunicationsRequest: () => {
    const [error, setError] = useState<string | null>(null);
    const run = useCallback(async (request: { operation: string }) => {
      try {
        return await boundary.run(request);
      } catch (cause) {
        setError(String(cause));
        return undefined;
      }
    }, []);
    return { run, available: true, busy: false, error };
  },
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

it("keeps a failed account refresh inside the chat list as a full-width banner", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<App />));
  await act(async () => getByRole(node, "button", { name: /# marketing/ }).click());
  boundary.run.mockRejectedValueOnce(new Error("Account refresh failed"));
  await act(async () => getByRole(node, "button", { name: "Refresh account list" }).click());
  const list = getByRole(node, "region", { name: "Item list" });
  expect(getByRole(list, "alert").textContent).toContain("Account refresh failed");
  expect(getByRole(node, "heading", { name: "# marketing" })).toBeDefined();
  expect(getByRole(list, "alert").closest(".w-full")).not.toBeNull();
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
  await act(async () => root.render(<App />));
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
