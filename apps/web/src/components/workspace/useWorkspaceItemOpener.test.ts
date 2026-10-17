// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { EnvironmentId } from "@t3tools/contracts";
import {
  parseTaskLocation,
  useWorkspaceItemOpener,
  parseMailLocation,
} from "./useWorkspaceItemOpener";

const boundary = vi.hoisted(() => ({ navigate: vi.fn(), v2: false as boolean | undefined }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => boundary.navigate }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceTasksV2: boundary.v2 }),
}));
describe("workspace source-message locations", () => {
  it("retains account and Message-ID when opening source from another space", () => {
    const source = { type: "mail", accountId: "account-b", messageId: "<captured@example.test>" };
    expect(parseMailLocation(JSON.stringify(source))).toEqual(source);
  });
  it("rejects malformed locations and unrelated item kinds", () => {
    expect(parseMailLocation("{")).toBeNull();
    expect(parseMailLocation(JSON.stringify({ type: "mail", accountId: "account-b" }))).toBeNull();
    expect(
      parseMailLocation(JSON.stringify({ type: "url", url: "https://example.test" })),
    ).toBeNull();
  });
});

it.each([true, false, undefined])(
  "opens exact task refs in their captured environment with live capability %s",
  async (flag) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    boundary.v2 = flag;
    const task = { type: "task" as const, taskId: "wskt_00000000-0000-4000-8000-000000000001" };
    function Harness() {
      const open = useWorkspaceItemOpener(EnvironmentId.make("remote"));
      return createElement("button", { onClick: () => open(task) });
    }
    let renderer!: ReactTestRenderer;
    await act(() => {
      renderer = create(createElement(Harness));
    });
    try {
      await act(() => renderer.root.findByType("button").props.onClick());
      expect(boundary.navigate).toHaveBeenLastCalledWith({
        to: "/workspace",
        search: {
          space: flag ? "tasks" : "projects",
          environment: "remote",
          item: JSON.stringify(task),
        },
      });
      expect(parseTaskLocation(JSON.stringify(task))).toEqual(task);
      expect(parseTaskLocation("{")).toBeNull();
    } finally {
      await act(() => renderer.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it("opens a calendar ref in the captured environment without granting it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.navigate.mockClear();
  const ref = {
    type: "provider-resource",
    provider: "workspace-calendar",
    resourceId: "wce_00000000-0000-0000-0000-000000000001",
  } as const;
  const capture =
    vi.fn<(open: (item: import("@t3tools/contracts").WorkspaceItemRef) => void) => void>();
  function Harness({ environment }: { environment: string }) {
    const open = useWorkspaceItemOpener(EnvironmentId.make(environment));
    return createElement("button", {
      onClick: () => {
        capture(open);
      },
    });
  }
  let renderer!: ReactTestRenderer;
  await act(() => {
    renderer = create(createElement(Harness, { environment: "original" }));
  });
  try {
    await act(() => renderer.root.findByType("button").props.onClick());
    await act(() => renderer.update(createElement(Harness, { environment: "other" })));
    const captured = capture.mock.calls[0]![0];
    await act(() => captured(ref));
    expect(boundary.navigate).toHaveBeenLastCalledWith({
      to: "/workspace",
      search: { space: "calendar", environment: "original", item: JSON.stringify(ref) },
    });
    boundary.navigate.mockClear();
    await act(() => captured({ ...ref, resourceId: "wce_invalid" }));
    expect(boundary.navigate).not.toHaveBeenCalled();
  } finally {
    await act(() => renderer.unmount());
    vi.unstubAllGlobals();
  }
});
