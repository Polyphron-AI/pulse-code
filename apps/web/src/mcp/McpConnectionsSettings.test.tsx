import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentId,
} from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  environments: [] as Array<Record<string, unknown>>,
  primaryEnvironmentId: null as string | null,
  list: vi.fn((target: { environmentId: string }) => target.environmentId),
  command: vi.fn(),
  listData: [] as ReadonlyArray<unknown>,
  configSource: "live" as "cache" | "live",
  supported: true,
  createOnly: true,
  sessionPending: false,
  scopes: ["orchestration:read", "orchestration:operate"] as ReadonlyArray<string>,
  panelUpsert: null as
    | null
    | ((environmentKey: string, input: Record<string, unknown>) => Promise<void>),
}));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({
    _tag: "Success",
    value: {
      source: mocks.configSource,
      config: {
        pulseCapabilities: {
          mcpManagement: mocks.supported,
          mcpCreateOnly: mocks.createOnly,
        },
      },
    },
    waiting: false,
  }),
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: mocks.environments, isReady: true }),
  usePrimaryEnvironmentId: () => mocks.primaryEnvironmentId,
}));
vi.mock("../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: mocks.scopes },
    isPending: mocks.sessionPending,
  }),
}));
vi.mock("../state/server", () => ({
  serverEnvironment: {
    configProjection: ({ environmentId }: { environmentId: string }) => environmentId,
  },
}));
vi.mock("../state/query", () => ({
  useEnvironmentQuery: (atom: string | null) => ({
    data: atom ? mocks.listData : null,
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => mocks.command }));
vi.mock("./mcpState", () => ({
  pulseMcpList: mocks.list,
  upsertPulseMcp: Symbol("upsert"),
  removePulseMcp: Symbol("remove"),
}));
vi.mock("./McpConnectionsPanel", () => ({
  McpConnectionsPanel: ({
    environmentKey,
    disabled,
    canCreate,
    upsert,
  }: {
    environmentKey: string;
    disabled: boolean;
    canCreate: boolean;
    upsert: (environmentKey: string, input: Record<string, unknown>) => Promise<void>;
  }) => (
    <p
      ref={() => {
        mocks.panelUpsert = upsert;
      }}
    >
      Panel for {environmentKey} {disabled ? "read only" : "editable"}{" "}
      {canCreate ? "add" : "update required"}
    </p>
  ),
}));
vi.mock("../components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (id: string) => void;
  }) => (
    <div>
      {children}
      <button type="button" onClick={() => onValueChange("remote")}>
        Select remote
      </button>
    </div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => children,
  SelectPopup: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: ({ children }: { children: ReactNode }) => children,
}));

import { McpConnectionsSettings } from "./McpConnectionsSettings";

let renderer: ReactTestRenderer | undefined;
const environment = (id: string) => ({ environmentId: EnvironmentId.make(id), label: id });
const json = () => JSON.stringify(renderer!.toJSON());

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.environments = [];
  mocks.primaryEnvironmentId = null;
  mocks.list.mockClear();
  mocks.command.mockReset();
  mocks.configSource = "live";
  mocks.supported = true;
  mocks.createOnly = true;
  mocks.sessionPending = false;
  mocks.scopes = [AuthOrchestrationReadScope, AuthOrchestrationOperateScope];
  mocks.panelUpsert = null;
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
const render = async () => {
  await act(() => {
    renderer = create(<McpConnectionsSettings />);
  });
};

describe("McpConnectionsSettings", () => {
  it("does not call an old server that lacks the live capability", async () => {
    mocks.environments = [environment("old")];
    mocks.supported = false;
    await render();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(json()).toContain("not supported");
  });

  it("does not trust a cached capability", async () => {
    mocks.environments = [environment("primary")];
    mocks.configSource = "cache";
    await render();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(json()).toContain("Waiting for current MCP management support");
  });

  it("supports fresh read-only sessions", async () => {
    mocks.environments = [environment("primary")];
    mocks.scopes = [AuthOrchestrationReadScope];
    await render();
    expect(mocks.list).toHaveBeenCalledWith({ environmentId: "primary", input: {} });
    expect(json()).toContain("read only");
  });

  it("keeps legacy management available while gating Add", async () => {
    mocks.environments = [environment("primary")];
    mocks.createOnly = false;
    await render();
    expect(mocks.list).toHaveBeenCalledWith({ environmentId: "primary", input: {} });
    expect(json()).toContain("editable");
    expect(json()).toContain("update required");
  });

  it("rejects Add at the mutation boundary after create-only support is withdrawn", async () => {
    mocks.environments = [environment("primary")];
    await render();
    mocks.createOnly = false;
    await act(() => renderer!.update(<McpConnectionsSettings />));

    await expect(
      mocks.panelUpsert!("primary", {
        id: "new-connection",
        name: "New connection",
        createOnly: true,
        config: { transport: "http", url: "https://example.com/mcp", headers: {} },
      }),
    ).rejects.toThrow("access changed");
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("drops stale scopes while the session refreshes", async () => {
    mocks.environments = [environment("primary")];
    await render();
    mocks.list.mockClear();
    mocks.sessionPending = true;
    await act(() => renderer!.update(<McpConnectionsSettings />));
    expect(mocks.list).not.toHaveBeenCalled();
    expect(json()).toContain("Checking access");
  });

  it("queries only the newly selected environment", async () => {
    mocks.environments = [environment("primary"), environment("remote")];
    mocks.primaryEnvironmentId = "primary";
    await render();
    await act(() => renderer!.root.findByProps({ children: "Select remote" }).props.onClick());
    expect(mocks.list).toHaveBeenLastCalledWith({ environmentId: "remote", input: {} });
    expect(json()).toContain("remote");
  });
});
