// @vitest-environment happy-dom
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { getByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { DriveFileAccess } from "./DriveFiles";
const mocks = vi.hoisted(() => ({
  bind: vi.fn(),
  read: vi.fn(),
  pending: false,
  sessionListeners: new Set<() => void>(),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => {
    useSyncExternalStore(
      (listener) => {
        mocks.sessionListeners.add(listener);
        return () => {
          mocks.sessionListeners.delete(listener);
        };
      },
      () => mocks.pending,
      () => mocks.pending,
    );
    return {
      isPending: mocks.pending,
      data: { authenticated: true, scopes: ["orchestration:operate"] },
    };
  },
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ driveRead: true }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (input: unknown) => {
    if (input === "binding")
      return { data: { binding: { connectionId: "first" } }, error: null, refresh: vi.fn() };
    return {
      data: [
        {
          id: "drv_00000000-0000-0000-0000-000000000001",
          nickname: "Chosen",
          connected: true,
          identity: { name: "Fixture" },
        },
      ],
      error: null,
    };
  },
}));
vi.mock("../../state/drive", () => ({
  drive: {
    connections: (input: unknown) => input,
    binding: () => "binding",
    read: "read",
    bind: "bind",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) => (command === "read" ? mocks.read : mocks.bind),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => children,
  DialogPopup: "section",
  DialogHeader: "header",
  DialogPanel: "main",
  DialogTitle: "h2",
}));
const environmentId = EnvironmentId.make("remote");
afterEach(() => {
  mocks.pending = false;
  mocks.sessionListeners.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("keeps the Read Drive connection select focused and usable during session revalidation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const connectionId = "drv_00000000-0000-0000-0000-000000000001";
  mocks.bind.mockResolvedValue({ _tag: "Success", value: {} });
  try {
    await act(() => root.render(<DriveFileAccess environmentId={environmentId} fileId="file" />));
    await act(() => getByRole(node, "button", { name: "Read file" }).click());
    const select = getByRole<HTMLSelectElement>(node, "combobox", {
      name: "Read Drive connection",
    });
    select.focus();
    await act(() => {
      select.value = connectionId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.activeElement).toBe(select);
    expect(select.value).toBe(connectionId);
    await act(() => {
      mocks.pending = true;
      for (const notify of mocks.sessionListeners) notify();
    });
    expect(document.activeElement).toBe(select);
    expect(select.disabled).toBe(false);
    expect(select.value).toBe(connectionId);
    expect(getByRole(node, "combobox", { name: "Read Drive connection" })).toBe(select);
    await act(async () => getByRole(node, "button", { name: "Use this connection" }).click());
    expect(mocks.bind).toHaveBeenCalledWith({
      environmentId,
      input: { connectionId, fileId: "file" },
    });
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
