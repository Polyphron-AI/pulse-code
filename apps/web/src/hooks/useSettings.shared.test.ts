import { DEFAULT_SERVER_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  environments: [] as unknown[],
  update: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
}));
vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
  usePrimaryEnvironment: () => state.environments[0] ?? null,
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.update }));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: state.warning } }));
import {
  useUpdateEnvironmentSettings,
  useUpdatePrimarySettings,
  useUpdateSharedSettings,
  useSharedSettingsSync,
} from "./useSettings";
const primary = EnvironmentId.make("primary");
const remote = EnvironmentId.make("remote");
function environment(id = primary, supported = true, connected = true) {
  return {
    environmentId: id,
    label: id,
    connection: { phase: connected ? "connected" : "reconnecting" },
    serverConfig: {
      settings: DEFAULT_SERVER_SETTINGS,
      environment: { capabilities: { threadRestartContinuation: supported } },
    },
  };
}
beforeEach(() => {
  state.update.mockReset();
  state.warning.mockReset();
  state.environments = [environment(), environment(remote)];
});
describe("shared settings routing", () => {
  it("keeps explicitly scoped updates scoped", () => {
    useUpdateEnvironmentSettings(remote)({ continueThreadsAfterServerUpdate: true });
    expect(state.update).toHaveBeenCalledExactlyOnceWith({
      environmentId: remote,
      input: { patch: { continueThreadsAfterServerUpdate: true } },
    });
  });
  it("fans out only preference keys while retaining machine ownership", () => {
    useUpdatePrimarySettings()({
      continueThreadsAfterServerUpdate: false,
      enableAgentBrowserAccess: true,
    });
    expect(state.update.mock.calls.map(([write]) => write)).toEqual([
      { environmentId: primary, input: { patch: { enableAgentBrowserAccess: true } } },
      { environmentId: primary, input: { patch: { continueThreadsAfterServerUpdate: false } } },
      { environmentId: remote, input: { patch: { continueThreadsAfterServerUpdate: false } } },
    ]);
  });
  it("skips offline and older environments and reports unsaved changes", () => {
    state.environments = [environment(primary, false), environment(remote, true, false)];
    useUpdateSharedSettings(primary)({ continueThreadsAfterServerUpdate: true });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.warning).toHaveBeenCalledOnce();
  });
  it("keeps existing preferences editable on an older primary without sending restart fields", () => {
    state.environments = [environment(primary, false)];
    useUpdatePrimarySettings()({
      defaultThreadEnvMode: "worktree",
      continueThreadsAfterServerUpdate: true,
    });
    expect(state.update).toHaveBeenCalledExactlyOnceWith({
      environmentId: primary,
      input: { patch: { defaultThreadEnvMode: "worktree" } },
    });
  });
  it("reports drift without writing until explicitly applied", () => {
    state.environments = [
      environment(),
      {
        ...environment(remote),
        serverConfig: {
          ...environment(remote).serverConfig,
          settings: { ...DEFAULT_SERVER_SETTINGS, continueThreadsAfterServerUpdate: true },
        },
      },
    ];
    const sync = useSharedSettingsSync();
    expect(sync.mismatches).toEqual([{ environmentId: remote, label: remote }]);
    expect(state.update).not.toHaveBeenCalled();
    sync.applyToAll();
    expect(state.update).toHaveBeenCalledOnce();
    expect(state.update.mock.calls[0]?.[0].input.patch.continueThreadsAfterServerUpdate).toBe(
      false,
    );
  });
});
