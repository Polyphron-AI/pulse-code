import {
  EnvironmentId,
  OrchestrationThread,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
vi.mock("@react-navigation/native", () => ({ useRoute: vi.fn() }));
vi.mock("../state/entities", () => ({ useProject: vi.fn(), useThreadShell: vi.fn() }));
vi.mock("../state/threads", () => ({ useEnvironmentThread: vi.fn() }));
vi.mock("./use-remote-environment-registry", () => ({
  useRemoteEnvironmentRuntime: vi.fn(),
  useSavedRemoteConnection: vi.fn(),
}));
import { threadDetailToShell } from "./use-thread-selection";
describe("mobile detail fallback shell", () => {
  it("preserves canonical PR links and lifecycle placement while shell data is unavailable", () => {
    const reference = {
      projectId: ProjectId.make("project"),
      repository: "owner/repo",
      number: 2,
      url: "https://example.com/2",
    };
    const thread = OrchestrationThread.make({
      id: ThreadId.make("thread"),
      projectId: reference.projectId,
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "model" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "feature",
      worktreePath: null,
      latestTurn: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
      archivedAt: null,
      settledOverride: "active",
      settledAt: null,
      unsettledAt: "2026-09-09T01:00:00.000Z",
      pinnedAt: "2026-09-09T02:00:00.000Z",
      pinOrderKey: "g",
      activeOrderKey: "m",
      linkedPullRequest: reference,
      branchPullRequest: { ...reference, number: 3 },
      deletedAt: null,
      messages: [],
      activities: [],
      proposedPlans: [],
      checkpoints: [],
      session: null,
    });
    const shell = threadDetailToShell(EnvironmentId.make("remote"), thread);
    expect(shell).toMatchObject({
      environmentId: "remote",
      linkedPullRequest: reference,
      branchPullRequest: { ...reference, number: 3 },
      unsettledAt: thread.unsettledAt,
      pinnedAt: thread.pinnedAt,
      pinOrderKey: "g",
      activeOrderKey: "m",
    });
    const legacy = {
      ...thread,
      linkedPullRequest: undefined,
      branchPullRequest: undefined,
      activeOrderKey: undefined,
    };
    expect(
      threadDetailToShell(EnvironmentId.make("remote"), legacy).branchPullRequest,
    ).toBeUndefined();
    expect(
      threadDetailToShell(EnvironmentId.make("remote"), { ...thread, branchPullRequest: null })
        .branchPullRequest,
    ).toBeNull();
  });
});
