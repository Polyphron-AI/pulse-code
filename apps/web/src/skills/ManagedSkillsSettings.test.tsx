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
  mutate: vi.fn(),
  queryData: new Map<string, ReadonlyArray<unknown>>(),
  emptyQueryData: [] as ReadonlyArray<unknown>,
  configSource: "live" as "cache" | "live",
  scopes: ["orchestration:read", "orchestration:operate"] as ReadonlyArray<string>,
}));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({
    _tag: "Success",
    value: {
      source: mocks.configSource,
      config: { pulseCapabilities: { managedSkills: true } },
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
    isPending: false,
    hasError: false,
  }),
}));
vi.mock("../state/server", () => ({
  serverEnvironment: {
    configProjection: ({ environmentId }: { environmentId: string }) => environmentId,
  },
}));
vi.mock("../state/query", () => ({
  useEnvironmentQuery: (atom: string | null) => ({
    data: atom ? (mocks.queryData.get(atom) ?? mocks.emptyQueryData) : null,
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => mocks.mutate }));
vi.mock("./managedSkillsState", () => ({
  managedSkillsList: mocks.list,
  mutateManagedSkill: Symbol("mutateManagedSkill"),
}));
vi.mock("./ManagedSkillsPanel", () => ({
  ManagedSkillsPanel: ({
    environmentKey,
    disabled,
  }: {
    environmentKey: string;
    disabled: boolean;
  }) => (
    <p>
      Panel for {environmentKey} {disabled ? "read only" : "editable"}
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

import { ManagedSkillsSettings } from "./ManagedSkillsSettings";

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.environments = [];
  mocks.primaryEnvironmentId = null;
  mocks.list.mockClear();
  mocks.mutate.mockReset();
  mocks.queryData.clear();
  mocks.configSource = "live";
  mocks.scopes = [AuthOrchestrationReadScope, AuthOrchestrationOperateScope];
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

function environment(id: string, managedSkills: boolean) {
  return {
    environmentId: EnvironmentId.make(id),
    label: id,
    serverConfig: { pulseCapabilities: { managedSkills } },
  };
}

async function renderSettings() {
  await act(() => {
    renderer = create(<ManagedSkillsSettings />);
  });
}

describe("ManagedSkillsSettings", () => {
  it("does not probe the skills RPC on an upstream environment", async () => {
    mocks.environments = [environment("upstream", false)];

    await renderSettings();

    expect(mocks.list).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer!.toJSON())).toContain("not supported");
  });

  it("loads only the selected capable environment and resets on a switch", async () => {
    mocks.environments = [environment("primary", true), environment("remote", true)];
    mocks.primaryEnvironmentId = "primary";
    mocks.queryData.set("primary", []);
    mocks.queryData.set("remote", []);

    await renderSettings();
    expect(mocks.list).toHaveBeenLastCalledWith({ environmentId: "primary", input: {} });
    expect(JSON.stringify(renderer!.toJSON())).toContain('"primary"," ","editable"');

    await act(() => renderer!.root.findByProps({ children: "Select remote" }).props.onClick());

    expect(mocks.list).toHaveBeenLastCalledWith({ environmentId: "remote", input: {} });
    expect(JSON.stringify(renderer!.toJSON())).toContain('"remote"," ","editable"');
  });

  it("allows listing but keeps mutation controls read-only without operate scope", async () => {
    mocks.environments = [environment("primary", true)];
    mocks.primaryEnvironmentId = "primary";
    mocks.scopes = [AuthOrchestrationReadScope];

    await renderSettings();

    expect(mocks.list).toHaveBeenCalledWith({ environmentId: "primary", input: {} });
    expect(JSON.stringify(renderer!.toJSON())).toContain('"primary"," ","read only"');
  });

  it("does not create a list query without read scope", async () => {
    mocks.environments = [environment("primary", true)];
    mocks.primaryEnvironmentId = "primary";
    mocks.scopes = [AuthOrchestrationOperateScope];

    await renderSettings();

    expect(mocks.list).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer!.toJSON())).toContain("cannot view managed skills");
  });

  it("does not probe while the capability exists only in cached config", async () => {
    mocks.environments = [environment("primary", true)];
    mocks.primaryEnvironmentId = "primary";
    mocks.configSource = "cache";

    await renderSettings();

    expect(mocks.list).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "Waiting for current managed skills support",
    );
  });
});
