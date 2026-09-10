import { act, createElement } from "react";
import { create } from "react-test-renderer";
import { EventId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  useWorkspaceMutationRefresh,
  latestWorkspaceMutationId,
  workspaceMutationRefreshToken,
} from "./useWorkspaceMutationRefresh";

function activity(
  id: string,
  kind: string,
  itemType: string,
  status?: string,
): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    kind,
    tone: "tool",
    summary: "Tool activity",
    payload: { itemType, ...(status ? { status } : {}) },
    turnId: null,
    createdAt: "2026-08-30T00:00:00.000Z",
  };
}

describe("workspace mutation refresh", () => {
  it("tracks the latest completed file change or command", () => {
    expect(
      latestWorkspaceMutationId([
        activity("file-started", "tool.started", "file_change"),
        activity("search-completed", "tool.completed", "web_search"),
        activity("file-completed", "tool.completed", "file_change"),
        activity("command-completed", "tool.completed", "command_execution"),
      ]),
    ).toBe("command-completed");
  });

  it("ignores read-only and in-progress tools", () => {
    expect(
      latestWorkspaceMutationId([
        activity("command-updated", "tool.updated", "command_execution", "inProgress"),
        activity("legacy-command-updated", "tool.updated", "command_execution", "in_progress"),
        activity("image-completed", "tool.completed", "image_view"),
      ]),
    ).toBeNull();
  });

  it("accepts providers that report terminal state on an update", () => {
    expect(
      latestWorkspaceMutationId([
        activity("file-updated", "tool.updated", "file_change", "completed"),
      ]),
    ).toBe("file-updated");
  });

  it("scopes the same mutation to each preview resource", () => {
    expect(workspaceMutationRefreshToken("file:/repo/README.md", "event-1")).not.toBe(
      workspaceMutationRefreshToken("diff:/repo", "event-1"),
    );
    expect(workspaceMutationRefreshToken("file:/repo/README.md", null)).toBeNull();
  });
});

it("defers mutations while editing and refreshes each resource only once", async () => {
  const refresh = vi.fn();
  function Probe(props: { enabled: boolean; mutationId: string; resourceKey: string }) {
    useWorkspaceMutationRefresh({ ...props, refresh });
    return null;
  }
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(
        createElement(Probe, { enabled: false, mutationId: "edit-1", resourceKey: "file-a" }),
      );
    });
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      renderer?.update(
        createElement(Probe, { enabled: true, mutationId: "edit-1", resourceKey: "file-a" }),
      );
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer?.update(
        createElement(Probe, { enabled: true, mutationId: "edit-1", resourceKey: "file-a" }),
      );
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer?.update(
        createElement(Probe, { enabled: true, mutationId: "edit-1", resourceKey: "file-b" }),
      );
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
  }
});
