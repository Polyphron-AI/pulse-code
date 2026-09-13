import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  setOverride: vi.fn(),
  resetOverride: vi.fn(),
  saveDefaults: vi.fn(),
  defaultRefresh: vi.fn(),
  queryError: null as "list" | "default" | null,
  result: null as ReturnType<typeof import("./useManagedMcpComposer").useManagedMcpComposer> | null,
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => ({}) }));
vi.mock("effect/unstable/reactivity", () => ({
  AsyncResult: {
    value: () => ({
      _id: "Option",
      _tag: "Some",
      value: { source: "live", config: { pulseCapabilities: { codexManagedMcp: true } } },
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
      refresh: target?.kind === "default" ? mocks.defaultRefresh : vi.fn(),
    };
  },
}));
vi.mock("./mcpState", () => ({
  pulseMcpList: () => ({ kind: "list" }),
  pulseMcpProviderDefault: () => ({ kind: "default" }),
  pulseMcpThreadOverride: () => ({ kind: "override" }),
  setPulseMcpProviderDefault: { kind: "saveDefaults" },
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
          : mocks.resetOverride,
}));
vi.mock("./McpSendPause", () => ({ McpSendPause: () => null }));

import { useManagedMcpComposer } from "./useManagedMcpComposer";

function Harness({
  threadId = ThreadId.make("thread-1"),
  identityKey = "thread:1",
  draftConnectionIds = ["linear"],
}: {
  threadId?: ThreadId | null;
  identityKey?: string;
  draftConnectionIds?: ReadonlyArray<string> | null;
}) {
  mocks.result = useManagedMcpComposer({
    environmentId: EnvironmentId.make("env-1"),
    provider: ProviderDriverKind.make("codex"),
    providerInstanceId: ProviderInstanceId.make("codex"),
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
    mocks.defaultRefresh.mockReset();
    mocks.queryError = null;
  });
  afterEach(() => {
    renderer?.unmount();
    renderer = null;
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

  it("saves the current selection as provider defaults without removing the thread override", async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => mocks.result!.picker.onSaveDefaults?.());
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
    await act(async () => mocks.result!.picker.onSaveDefaults?.());
    expect(mocks.defaultRefresh).not.toHaveBeenCalled();
    expect(mocks.resetOverride).not.toHaveBeenCalled();
    expect(mocks.result!.picker.selectedIds).toEqual(["linear"]);
  });
});
