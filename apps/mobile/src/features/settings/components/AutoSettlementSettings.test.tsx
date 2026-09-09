import { DEFAULT_SERVER_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  environments: [] as unknown[],
  settings: { sidebarAutoSettleOnMerge: false },
  update: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.settings }));
vi.mock("../../../state/server", () => ({
  serverEnvironment: { settingsValueAtom: (id: string) => id, updateSettings: "update" },
}));
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => state.update }));
vi.mock("../../../state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
}));
vi.mock("./SettingsSwitchRow", () => ({ SettingsSwitchRow: () => null }));
import { EnvironmentAutoSettleSwitch, AutoSettlementSettings } from "./AutoSettlementSettings";
beforeEach(() => {
  state.update.mockReset();
  state.environments = ["source", "remote", "legacy", "offline"].map((id) => ({
    environmentId: id,
    label: id,
    connection: { phase: id === "offline" ? "reconnecting" : "connected" },
    serverConfig: {
      settings: DEFAULT_SERVER_SETTINGS,
      environment: { capabilities: { threadAutoSettlement: id !== "legacy" } },
    },
  }));
});
describe("mobile server auto-settlement preferences", () => {
  it("reads server values and writes the shared choice only to supported connected servers", () => {
    const row = EnvironmentAutoSettleSwitch({
      environmentId: EnvironmentId.make("source"),
      label: "source",
      connected: true,
    }) as ReactElement<{ value: boolean; onValueChange: (enabled: boolean) => void }>;
    expect(row.props.value).toBe(false);
    row.props.onValueChange(true);
    expect(state.update.mock.calls.map(([write]) => write)).toEqual(
      ["source", "remote"].map((environmentId) => ({
        environmentId,
        input: { patch: { sidebarAutoSettleOnMerge: true } },
      })),
    );
    expect(AutoSettlementSettings()).toHaveLength(3);
  });
  it("does not write from an offline row", () => {
    const row = EnvironmentAutoSettleSwitch({
      environmentId: EnvironmentId.make("offline"),
      label: "offline",
      connected: false,
    }) as ReactElement<{ disabled: boolean; onValueChange: (enabled: boolean) => void }>;
    expect(row.props.disabled).toBe(true);
    row.props.onValueChange(true);
    expect(state.update).not.toHaveBeenCalled();
  });
});
