import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  setOverride: vi.fn(),
  resetOverride: vi.fn(),
  saveDefaults: vi.fn(),
  saveProjectDefaults: vi.fn(),
  resetProjectDefaults: vi.fn(),
  defaultRefresh: vi.fn(),
  projectRefresh: vi.fn(),
  queryError: null as "list" | "default" | null,
  result: null as ReturnType<typeof import("./useManagedMcpComposer").useManagedMcpComposer> | null,
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => ({}) }));
vi.mock("effect/unstable/reactivity", () => ({
  AsyncResult: {
    value: () => ({
      _id: "Option",
      _tag: "Some",
      value: {
        source: "live",
        config: {
          pulseCapabilities: {
            codexManagedMcp: true,
            claudeManagedMcp: true,
            openCodeManagedMcp: true,
          },
        },
      },
    }),
  },
}));
vi.mock("../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: ["orchestration:read", "orchestration:operate"] },
  }),
}));
vi.mock("../state/server", () => ({ serverEnvironment: { configProjection: () => ({}) } }));
vi.mock("../state/query", () => ({
  useEnvironmentQuery: (target: { kind?: string } | null) => {
    if (target === null) return { data: null, error: null, refresh: vi.fn() };
    const failed = target?.kind === mocks.queryError;
    return {
      data: failed
        ? null
        : target?.kind === "list"
          ? [
              {
                id: "linear",
                name: "Linear",
                config: { transport: "stdio", command: "linear", args: [], env: {} },
              },
            ]
          : { connectionIds: ["linear"] },
      error: failed ? new Error(`${target?.kind} failed`) : null,
      refresh:
        target?.kind === "default"
          ? mocks.defaultRefresh
          : target?.kind === "project"
            ? mocks.projectRefresh
            : vi.fn(),
    };
  },
}));
vi.mock("./mcpState", () => ({
  pulseMcpList: () => ({ kind: "list" }),
  pulseMcpProviderDefault: () => ({ kind: "default" }),
  pulseMcpProjectDefault: () => ({ kind: "project" }),
  pulseMcpThreadOverride: () => ({ kind: "override" }),
  setPulseMcpProviderDefault: { kind: "saveDefaults" },
  setPulseMcpProjectDefault: { kind: "saveProjectDefaults" },
  resetPulseMcpProjectDefault: { kind: "resetProjectDefaults" },
  preparePulseMcpTurn: { kind: "prepare" },
  setPulseMcpThreadOverride: { kind: "set" },
  resetPulseMcpThreadOverride: { kind: "reset" },
}));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: (command: { kind: string }) =>
    command.kind === "prepare"
      ? mocks.prepare
      : command.kind === "set"
        ? mocks.setOverride
        : command.kind === "saveDefaults"
          ? mocks.saveDefaults
          : command.kind === "saveProjectDefaults"
            ? mocks.saveProjectDefaults
            : command.kind === "resetProjectDefaults"
              ? mocks.resetProjectDefaults
              : mocks.resetOverride,
}));
vi.mock("./McpSendPause", () => ({ McpSendPause: () => null }));

import { useManagedMcpComposer } from "./useManagedMcpComposer";

function Harness({
  threadId = ThreadId.make("thread-1"),
  identityKey = "thread:1",
  draftConnectionIds = ["linear"],
  provider = "codex",
}: {
  threadId?: ThreadId | null;
  identityKey?: string;
  draftConnectionIds?: ReadonlyArray<string> | null;
  provider?: "codex" | "claudeAgent" | "opencode" | "cursor";
}) {
  mocks.result = useManagedMcpComposer({
    environmentId: EnvironmentId.make("env-1"),
    provider: ProviderDriverKind.make(provider),
    providerInstanceId: ProviderInstanceId.make(provider),
    projectId: ProjectId.make("project-1"),
    threadId,
    identityKey,
    modelKey: "gpt-5",
    draftConnectionIds,
    onDraftConnectionIdsChange: () => {},
    onManage: () => {},
  });
  return null;
}

describe("useManagedMcpComposer", () => {
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => {
    mocks.prepare.mockReset();
    mocks.setOverride.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
    mocks.resetOverride.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
    mocks.saveDefaults.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
    mocks.saveProjectDefaults.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
    mocks.resetProjectDefaults.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
    mocks.defaultRefresh.mockReset();
    mocks.projectRefresh.mockReset();
    mocks.queryError = null;
  });
  afterEach(() => {
    renderer?.unmount();
    renderer = null;
  });

  it.each(["codex", "claudeAgent", "opencode"] as const)(
    "enables managed MCP for the %s capability",
    async (provider) => {
      await act(async () => {
        renderer = create(<Harness provider={provider} />);
      });
      expect(mocks.result?.blockedReason).toBeNull();
      expect(mocks.result?.picker.disabled).toBe(false);
    },
  );

  it("keeps unsupported providers explicitly blocked", async () => {
    await act(async () => {
      renderer = create(<Harness provider="cursor" />);
    });
    expect(mocks.result?.blockedReason).toContain("unavailable for this provider");
  });

  it("defers managed MCP preparation while a new worktree is being created", async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await mocks.result!.prepare(
        {
          threadId: ThreadId.make("thread-1"),
          provider: ProviderDriverKind.make("codex"),
          providerInstanceId: ProviderInstanceId.make("codex"),
          runtimeMode: "full-access",
        },
        { creatingWorktree: true },
      );
    });

    expect(outcome).toEqual({ status: "ready" });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("keeps the send pending after failure and carries exclusions into continue", async () => {
    mocks.prepare
      .mockResolvedValueOnce({
        _tag: "Success",
        value: {
          status: "failed",
          selectedConnectionIds: ["linear"],
          connections: [
            { connectionId: "linear", name: "Linear", status: "failed", message: "Token expired" },
          ],
        },
      })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: {
          status: "ready",
          preparationId: "prep-1",
          selectedConnectionIds: [],
          connections: [],
        },
      });
    await act(async () => {
      renderer = create(<Harness />);
    });
    const session = {
      threadId: ThreadId.make("thread-1"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access" as const,
    };
    let promise!: Promise<unknown>;
    await act(async () => {
      promise = mocks.result!.prepare(session);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      const pause = mocks.result!.pause as {
        props: { onContinueWithout: (ids: string[]) => void };
      };
      pause.props.onContinueWithout(["linear"]);
      await Promise.resolve();
    });
    const outcome = await promise;
    expect(outcome).toEqual({ status: "ready", preparationId: "prep-1" });
    expect(mocks.prepare.mock.calls[1]?.[0].input.excludedConnectionIds).toEqual(["linear"]);
  });

  it.each(["list", "default"] as const)(
    "reports an initial %s query failure instead of remaining loading",
    async (query) => {
      mocks.queryError = query;
      await act(async () => {
        renderer = create(<Harness />);
      });
      expect(mocks.result!.blockedReason).toBe("MCP selection could not be loaded.");
      expect(mocks.result!.picker.loading).toBe(false);
    },
  );

  it("accumulates continue-without exclusions across repeated failures", async () => {
    const failed = (id: string) => ({
      _tag: "Success",
      value: {
        status: "failed",
        connections: [{ connectionId: id, name: id, status: "failed", message: "offline" }],
      },
    });
    mocks.prepare
      .mockResolvedValueOnce(failed("linear"))
      .mockResolvedValueOnce(failed("github"))
      .mockResolvedValueOnce({
        _tag: "Success",
        value: { status: "ready", preparationId: "continued", connections: [] },
      });
    await act(async () => {
      renderer = create(<Harness />);
    });
    const outcome = mocks.result!.prepare({
      threadId: ThreadId.make("thread-1"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
    });
    await act(async () => void (await Promise.resolve()));
    await act(async () =>
      (
        mocks.result!.pause as { props: { onContinueWithout: (ids: string[]) => void } }
      ).props.onContinueWithout(["linear"]),
    );
    await act(async () =>
      (
        mocks.result!.pause as { props: { onContinueWithout: (ids: string[]) => void } }
      ).props.onContinueWithout(["github"]),
    );
    await expect(outcome).resolves.toEqual({ status: "ready", preparationId: "continued" });
    expect(mocks.prepare.mock.calls[2]?.[0].input.excludedConnectionIds).toEqual([
      "linear",
      "github",
    ]);
  });

  it("cancels from the pause and ignores a late retry result", async () => {
    let resolveRetry!: (value: unknown) => void;
    mocks.prepare
      .mockResolvedValueOnce({ _tag: "Failure" })
      .mockReturnValueOnce(new Promise((resolve) => (resolveRetry = resolve)));
    await act(async () => {
      renderer = create(<Harness />);
    });
    const outcome = mocks.result!.prepare({
      threadId: ThreadId.make("thread-1"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
    });
    await act(async () => void (await Promise.resolve()));
    await act(async () =>
      (mocks.result!.pause as { props: { onRetry: () => void } }).props.onRetry(),
    );
    await act(async () =>
      (
        mocks.result!.pause as { props: { onOpenChange: (open: boolean) => void } }
      ).props.onOpenChange(false),
    );
    await expect(outcome).resolves.toEqual({ status: "cancelled" });
    await act(async () =>
      resolveRetry({ _tag: "Success", value: { status: "ready", preparationId: "stale" } }),
    );
    expect(mocks.result!.pause).toBeNull();
  });

  it("settles an initial RPC after an unrelated rerender and unmount", async () => {
    let resolveRpc!: (value: unknown) => void;
    mocks.prepare.mockReturnValue(
      new Promise((resolve) => {
        resolveRpc = resolve;
      }),
    );
    await act(async () => {
      renderer = create(<Harness />);
    });
    const promise = mocks.result!.prepare({
      threadId: ThreadId.make("thread-1"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
    });
    await act(async () => renderer!.update(<Harness />));
    await act(async () => renderer!.unmount());
    renderer = null;
    await expect(promise).resolves.toEqual({ status: "cancelled" });
    await act(async () =>
      resolveRpc({
        _tag: "Success",
        value: { status: "ready", preparationId: "stale", connections: [] },
      }),
    );
    expect(mocks.result!.pause).toBeNull();
  });

  it("shows retry as busy and keeps double retry single-flight", async () => {
    let resolveRetry!: (value: unknown) => void;
    mocks.prepare
      .mockResolvedValueOnce({ _tag: "Failure" })
      .mockReturnValueOnce(new Promise((resolve) => (resolveRetry = resolve)));
    await act(async () => {
      renderer = create(<Harness />);
    });
    const promise = mocks.result!.prepare({
      threadId: ThreadId.make("thread-1"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const retry = (mocks.result!.pause as { props: { onRetry: () => void } }).props.onRetry;
    await act(async () => {
      retry();
      retry();
      await Promise.resolve();
    });
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect((mocks.result!.pause as { props: { busy: boolean } }).props.busy).toBe(true);
    await act(async () =>
      resolveRetry({
        _tag: "Success",
        value: { status: "ready", preparationId: "retried", connections: [] },
      }),
    );
    await expect(promise).resolves.toEqual({ status: "ready", preparationId: "retried" });
  });

  it("can start another preparation after a successful retry", async () => {
    mocks.prepare
      .mockResolvedValueOnce({ _tag: "Failure" })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: { status: "ready", preparationId: "first", connections: [] },
      })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: { status: "ready", preparationId: "second", connections: [] },
      });
    await act(async () => {
      renderer = create(<Harness />);
    });
    const session = {
      threadId: ThreadId.make("thread-1"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access" as const,
    };
    const first = mocks.result!.prepare(session);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () =>
      (mocks.result!.pause as { props: { onRetry: () => void } }).props.onRetry(),
    );
    await expect(first).resolves.toEqual({ status: "ready", preparationId: "first" });
    await expect(mocks.result!.prepare(session)).resolves.toEqual({
      status: "ready",
      preparationId: "second",
    });
  });

  it("preserves the current override when Use defaults fails", async () => {
    mocks.resetOverride.mockResolvedValue({ _tag: "Failure" });
    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => mocks.result!.picker.onUseDefaults());
    expect(mocks.result!.picker.selectionMode).toBe("override");
    expect(mocks.result!.picker.selectedIds).toEqual(["linear"]);
  });

  it("persists a draft selection when the draft is promoted", async () => {
    await act(async () => {
      renderer = create(<Harness threadId={null} identityKey="draft:1" />);
    });
    await act(async () =>
      renderer!.update(<Harness threadId={ThreadId.make("thread-1")} identityKey="thread:1" />),
    );
    expect(mocks.setOverride).toHaveBeenCalledWith({
      environmentId: EnvironmentId.make("env-1"),
      input: { threadId: ThreadId.make("thread-1"), connectionIds: ["linear"] },
    });
  });

  it("persists a draft selection on a remount with a thread without duplicate rerender writes", async () => {
    await act(async () => {
      renderer = create(<Harness threadId={ThreadId.make("thread-1")} />);
    });
    expect(mocks.setOverride).toHaveBeenCalledOnce();
    await act(async () => renderer!.update(<Harness threadId={ThreadId.make("thread-1")} />));
    expect(mocks.setOverride).toHaveBeenCalledOnce();
  });

  it("preserves the draft selection when remount persistence fails", async () => {
    mocks.setOverride.mockResolvedValue({ _tag: "Failure" });
    await act(async () => {
      renderer = create(<Harness threadId={ThreadId.make("thread-1")} />);
    });
    expect(mocks.result!.picker.selectionMode).toBe("override");
    expect(mocks.result!.picker.selectedIds).toEqual(["linear"]);
    expect(mocks.resetOverride).not.toHaveBeenCalled();
  });

  it("waits for promotion persistence before resetting to provider defaults", async () => {
    let finishPersistence!: (value: unknown) => void;
    mocks.setOverride.mockReturnValue(new Promise((resolve) => (finishPersistence = resolve)));
    await act(async () => {
      renderer = create(<Harness threadId={ThreadId.make("thread-1")} />);
    });
    const reset = mocks.result!.picker.onUseDefaults();
    await act(async () => void (await Promise.resolve()));
    expect(mocks.resetOverride).not.toHaveBeenCalled();
    await act(async () => finishPersistence({ _tag: "Success", value: {} }));
    await act(async () => reset);
    expect(mocks.resetOverride).toHaveBeenCalledOnce();
    expect(mocks.setOverride.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resetOverride.mock.invocationCallOrder[0]!,
    );
  });

  it("serializes rapid selection writes before resetting to defaults", async () => {
    let finishA!: (value: unknown) => void;
    let finishB!: (value: unknown) => void;
    mocks.setOverride
      .mockReturnValueOnce(new Promise((resolve) => (finishA = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (finishB = resolve)));
    await act(async () => {
      renderer = create(<Harness draftConnectionIds={["a"]} />);
    });
    await act(async () => renderer!.update(<Harness draftConnectionIds={["b"]} />));
    expect(mocks.setOverride).toHaveBeenCalledTimes(1);
    const reset = mocks.result!.picker.onUseDefaults();
    expect(mocks.resetOverride).not.toHaveBeenCalled();
    await act(async () => finishA({ _tag: "Success", value: {} }));
    expect(mocks.setOverride).toHaveBeenCalledTimes(2);
    expect(mocks.resetOverride).not.toHaveBeenCalled();
    await act(async () => finishB({ _tag: "Success", value: {} }));
    await act(async () => reset);
    expect(mocks.setOverride.mock.calls.map((call) => call[0].input.connectionIds)).toEqual([
      ["a"],
      ["b"],
    ]);
    expect(mocks.resetOverride).toHaveBeenCalledOnce();
  });

  it("persists draft IDs to the actual session thread before preparing", async () => {
    const order: string[] = [];
    mocks.setOverride.mockImplementation(async () => {
      order.push("persist");
      return { _tag: "Success", value: {} };
    });
    mocks.prepare.mockImplementation(async () => {
      order.push("prepare");
      return { _tag: "Success", value: { status: "ready", preparationId: "prepared" } };
    });
    await act(async () => {
      renderer = create(<Harness threadId={null} identityKey="draft:local" />);
    });
    const actualThreadId = ThreadId.make("actual-server-thread");
    await expect(
      mocks.result!.prepare({
        threadId: actualThreadId,
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: ProviderInstanceId.make("codex"),
        runtimeMode: "full-access",
      }),
    ).resolves.toEqual({ status: "ready", preparationId: "prepared" });
    expect(mocks.setOverride).toHaveBeenCalledWith({
      environmentId: EnvironmentId.make("env-1"),
      input: { threadId: actualThreadId, connectionIds: ["linear"] },
    });
    expect(order).toEqual(["persist", "prepare"]);
  });

  it("blocks preparation when persisting the actual session thread fails", async () => {
    mocks.setOverride.mockResolvedValue({ _tag: "Failure" });
    await act(async () => {
      renderer = create(<Harness threadId={null} identityKey="draft:local" />);
    });
    void mocks.result!.prepare({
      threadId: ThreadId.make("actual-server-thread"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect((mocks.result!.pause as { props: { error: string } }).props.error).toContain(
      "could not check MCP connections",
    );
    await act(async () =>
      (
        mocks.result!.pause as { props: { onOpenChange: (open: boolean) => void } }
      ).props.onOpenChange(false),
    );
  });

  it("retries a failed selection persistence before preparing", async () => {
    mocks.setOverride
      .mockResolvedValueOnce({ _tag: "Failure" })
      .mockResolvedValueOnce({ _tag: "Success", value: {} });
    mocks.prepare.mockResolvedValue({
      _tag: "Success",
      value: { status: "ready", preparationId: "retried" },
    });
    await act(async () => {
      renderer = create(<Harness threadId={null} identityKey="draft:local" />);
    });
    const outcome = mocks.result!.prepare({
      threadId: ThreadId.make("actual-server-thread"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () =>
      (mocks.result!.pause as { props: { onRetry: () => void } }).props.onRetry(),
    );
    await expect(outcome).resolves.toEqual({ status: "ready", preparationId: "retried" });
    expect(mocks.setOverride).toHaveBeenCalledTimes(2);
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it("does not prepare after identity cancellation while selection persistence is pending", async () => {
    let finishPersistence!: (value: unknown) => void;
    mocks.setOverride.mockReturnValue(new Promise((resolve) => (finishPersistence = resolve)));
    await act(async () => {
      renderer = create(<Harness threadId={null} identityKey="draft:first" />);
    });
    const outcome = mocks.result!.prepare({
      threadId: ThreadId.make("actual-server-thread"),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
    });
    await act(async () => renderer!.update(<Harness threadId={null} identityKey="draft:second" />));
    await expect(outcome).resolves.toEqual({ status: "cancelled" });
    await act(async () => finishPersistence({ _tag: "Success", value: {} }));
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("saves the current selection as provider defaults without removing the thread override", async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => mocks.result!.picker.onSaveGlobalDefaults?.());
    expect(mocks.saveDefaults).toHaveBeenCalledWith({
      environmentId: EnvironmentId.make("env-1"),
      input: {
        providerInstanceId: ProviderInstanceId.make("codex"),
        connectionIds: ["linear"],
      },
    });
    expect(mocks.defaultRefresh).toHaveBeenCalledOnce();
    expect(mocks.resetOverride).not.toHaveBeenCalled();
    expect(mocks.result!.picker.selectionMode).toBe("override");

    mocks.saveDefaults.mockResolvedValueOnce({ _tag: "Failure" });
    mocks.defaultRefresh.mockClear();
    await act(async () => mocks.result!.picker.onSaveGlobalDefaults?.());
    expect(mocks.defaultRefresh).not.toHaveBeenCalled();
    expect(mocks.resetOverride).not.toHaveBeenCalled();
    expect(mocks.result!.picker.selectedIds).toEqual(["linear"]);
  });

  it("saves the current selection as project defaults", async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => mocks.result!.picker.onSaveProjectDefaults?.());
    expect(mocks.saveProjectDefaults).toHaveBeenCalledWith({
      environmentId: EnvironmentId.make("env-1"),
      input: {
        projectId: ProjectId.make("project-1"),
        providerInstanceId: ProviderInstanceId.make("codex"),
        connectionIds: ["linear"],
      },
    });
  });

  it("resets project defaults to the global selection", async () => {
    await act(async () => {
      renderer = create(<Harness draftConnectionIds={null} />);
    });
    await act(async () => mocks.result!.picker.onResetProjectDefaults?.());
    expect(mocks.resetProjectDefaults).toHaveBeenCalledWith({
      environmentId: EnvironmentId.make("env-1"),
      input: {
        projectId: ProjectId.make("project-1"),
        providerInstanceId: ProviderInstanceId.make("codex"),
      },
    });
    expect(mocks.projectRefresh).toHaveBeenCalledOnce();
  });
});
