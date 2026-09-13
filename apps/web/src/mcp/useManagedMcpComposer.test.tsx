import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
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
  useEnvironmentQuery: (target: { kind?: string } | null) => ({
    data:
      target?.kind === "list"
        ? [
            {
              id: "linear",
              name: "Linear",
              config: { transport: "stdio", command: "linear", args: [], env: {} },
            },
          ]
        : { connectionIds: ["linear"] },
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("./mcpState", () => ({
  pulseMcpList: () => ({ kind: "list" }),
  pulseMcpProviderDefault: () => ({ kind: "default" }),
  pulseMcpThreadOverride: () => ({ kind: "override" }),
  preparePulseMcpTurn: { kind: "prepare" },
  setPulseMcpThreadOverride: { kind: "set" },
  resetPulseMcpThreadOverride: { kind: "reset" },
}));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: (command: { kind: string }) =>
    command.kind === "prepare"
      ? mocks.prepare
      : vi.fn(async () => ({ _tag: "Success", value: {} })),
}));
vi.mock("./McpSendPause", () => ({ McpSendPause: () => null }));

import { useManagedMcpComposer } from "./useManagedMcpComposer";

function Harness() {
  mocks.result = useManagedMcpComposer({
    environmentId: EnvironmentId.make("env-1"),
    provider: ProviderDriverKind.make("codex"),
    providerInstanceId: ProviderInstanceId.make("codex"),
    threadId: ThreadId.make("thread-1"),
    identityKey: "thread:1",
    modelKey: "gpt-5",
    draftConnectionIds: ["linear"],
    onDraftConnectionIdsChange: () => {},
    onManage: () => {},
  });
  return null;
}

describe("useManagedMcpComposer", () => {
  let renderer: ReactTestRenderer | null = null;
  afterEach(() => {
    renderer?.unmount();
    renderer = null;
    mocks.prepare.mockReset();
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
});
