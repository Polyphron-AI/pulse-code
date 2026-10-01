import { describe, expect, it, vi } from "vite-plus/test";
import {
  ThreadId,
  ProviderDriverKind,
  ProviderInstanceId,
  PulseMcpPreparationId,
  type PulseMcpPrepareTurnInput,
} from "@t3tools/contracts";
import { preparePinnedMcpSubmission } from "./preparePinnedMcpSubmission";

const session = {
  threadId: ThreadId.make("queued-thread"),
  provider: ProviderDriverKind.make("codex"),
  providerInstanceId: ProviderInstanceId.make("codex_personal"),
  modelSelection: { instanceId: ProviderInstanceId.make("codex_personal"), model: "gpt-5" },
  runtimeMode: "full-access" as const,
};
const base = { session, projectId: undefined, supported: true, connectionIds: ["linear"] };

describe("pinned MCP submission", () => {
  it("pins new-worktree selection and leaves preparation to the server in the created workspace", async () => {
    const prepare = vi.fn();
    const saveSelection = vi.fn(async () => {});
    expect(
      await preparePinnedMcpSubmission({ ...base, prepare, creatingWorktree: true, saveSelection }),
    ).toBeUndefined();
    expect(saveSelection).toHaveBeenCalledWith(session.threadId, ["linear"]);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("stops a new-worktree send when its pinned selection cannot be saved", async () => {
    const prepare = vi.fn();
    await expect(
      preparePinnedMcpSubmission({
        ...base,
        prepare,
        creatingWorktree: true,
        saveSelection: async () => {
          throw new Error("save failed");
        },
      }),
    ).rejects.toThrow("save failed");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("prepares the queued instance with its pinned selection and forwards the preparation receipt", async () => {
    const preparationId = PulseMcpPreparationId.make("prepared");
    const prepare = vi.fn(async (_input: PulseMcpPrepareTurnInput) => ({
      status: "ready" as const,
      preparationId,
      selectedConnectionIds: ["linear"],
      connections: [],
    }));
    expect(await preparePinnedMcpSubmission({ ...base, prepare })).toBe(preparationId);
    expect(prepare).toHaveBeenCalledWith({
      threadId: session.threadId,
      providerSession: session,
      connectionIds: ["linear"],
    });
  });
  it("sends an explicit empty override rather than resolving new defaults", async () => {
    const prepare = vi.fn(async (_input: PulseMcpPrepareTurnInput) => ({
      status: "ready" as const,
      preparationId: PulseMcpPreparationId.make("empty"),
      selectedConnectionIds: [],
      connections: [],
    }));
    await preparePinnedMcpSubmission({ ...base, connectionIds: [], prepare });
    expect(prepare.mock.calls[0]?.[0]).toMatchObject({ connectionIds: [] });
  });
  it("pauses an offscreen send while its provider has an active turn", async () => {
    await expect(
      preparePinnedMcpSubmission({ ...base, prepare: async () => ({ status: "active-turn" }) }),
    ).rejects.toThrow("Finish or stop the active turn");
  });
  it("never silently drops selected connections on an unsupported provider", async () => {
    const prepare = vi.fn();
    await expect(
      preparePinnedMcpSubmission({ ...base, supported: false, prepare }),
    ).rejects.toThrow("unavailable");
    expect(prepare).not.toHaveBeenCalled();
  });
  it("permits an unsupported provider when no managed connections were selected", async () => {
    const prepare = vi.fn();
    expect(
      await preparePinnedMcpSubmission({ ...base, supported: false, connectionIds: [], prepare }),
    ).toBeUndefined();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("preserves a failed readiness check instead of dispatching", async () => {
    await expect(
      preparePinnedMcpSubmission({
        ...base,
        prepare: async () => ({
          status: "failed",
          selectedConnectionIds: ["linear"],
          connections: [],
        }),
      }),
    ).rejects.toThrow("did not confirm MCP readiness");
  });
});
