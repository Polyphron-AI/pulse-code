import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { prepareMcpSubmission } from "./prepareMcpSubmission";

const session = {
  threadId: ThreadId.make("mcp-draft"),
  providerInstanceId: ProviderInstanceId.make("codex"),
  runtimeMode: "full-access" as const,
  cwd: "/project",
};

describe("MCP submission boundary", () => {
  it("cancels after any draft mutation, including an edit that is later undone", async () => {
    const original = { attachments: [] };
    let draft: unknown = original;
    let listener = () => {};
    let unsubscribed = false;
    const result = await prepareMcpSubmission({
      session,
      isCurrent: () => true,
      draft: {
        read: () => draft,
        subscribe: (changed) => {
          listener = changed;
          return () => {
            unsubscribed = true;
          };
        },
      },
      prepare: async () => {
        draft = { attachments: ["new attachment"] };
        listener();
        draft = original;
        listener();
        return { status: "ready" };
      },
    });
    expect(result).toEqual({ status: "cancelled" });
    expect(unsubscribed).toBe(true);
  });
  it("preserves the ordinary send path when no preparation id is needed", async () => {
    expect(
      await prepareMcpSubmission({
        session,
        prepare: async () => ({ status: "ready" }),
        isCurrent: () => true,
      }),
    ).toEqual({ status: "ready" });
  });

  it("does not proceed when the originating draft changes during preparation", async () => {
    let current = true;
    expect(
      await prepareMcpSubmission({
        session,
        prepare: async () => {
          current = false;
          return { status: "ready" };
        },
        isCurrent: () => current,
      }),
    ).toEqual({ status: "cancelled" });
  });

  it("does not expose provider errors or send after rejection", async () => {
    expect(
      await prepareMcpSubmission({
        session,
        prepare: async () => {
          throw new Error("secret fixture");
        },
        isCurrent: () => true,
      }),
    ).toEqual({
      status: "error",
      message: "MCP preparation failed. Your draft has not been sent.",
    });
  });

  it("does not start preparation after unmount", async () => {
    expect(
      await prepareMcpSubmission({ session, prepare: undefined, isCurrent: () => true }),
    ).toEqual({ status: "cancelled" });
  });

  it("passes the new-worktree constraint through without substituting another cwd", async () => {
    let received: unknown;
    await prepareMcpSubmission({
      session,
      creatingWorktree: true,
      projectId: ProjectId.make("project-1"),
      connectionIds: ["queued-linear"],
      prepare: async (...args) => {
        received = args;
        return { status: "cancelled" };
      },
      isCurrent: () => true,
    });
    expect(received).toEqual([
      session,
      {
        creatingWorktree: true,
        projectId: ProjectId.make("project-1"),
        connectionIds: ["queued-linear"],
      },
    ]);
  });
});
