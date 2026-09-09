import type { EnvironmentId } from "@t3tools/contracts";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  settings: {} as Record<string, { continueThreadsAfterServerUpdate: boolean }>,
  update: vi.fn(),
  environments: [] as unknown[],
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: (id: string) => state.settings[id] }));
vi.mock("../../../state/server", () => ({
  serverEnvironment: { settingsValueAtom: (id: string) => id, updateSettings: "update" },
}));
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => state.update }));
vi.mock("../../../state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
}));
vi.mock("./SettingsSection", () => ({ SettingsSection: () => null }));
vi.mock("./SettingsSwitchRow", () => ({ SettingsSwitchRow: () => null }));
import {
  EnvironmentRestartSwitch,
  RestartContinuationSettings,
} from "./RestartContinuationSettings";
function row(id: string, connected = true) {
  return EnvironmentRestartSwitch({
    environmentId: id as EnvironmentId,
    label: id,
    connected,
  }) as ReactElement<{
    value: boolean;
    disabled: boolean;
    onValueChange: (value: boolean) => void;
  }>;
}
describe("mobile restart continuation", () => {
  beforeEach(() => {
    state.settings = {};
    state.environments = [];
    state.update.mockReset();
  });
  it("reads and updates one remote environment without changing another", () => {
    state.settings = {
      remote: { continueThreadsAfterServerUpdate: true },
      other: { continueThreadsAfterServerUpdate: false },
    };
    expect(row("remote").props.value).toBe(true);
    expect(row("other").props.value).toBe(false);
    row("remote").props.onValueChange(false);
    expect(state.update).toHaveBeenCalledExactlyOnceWith({
      environmentId: "remote",
      input: { patch: { continueThreadsAfterServerUpdate: false } },
    });
  });
  it("defaults missing settings off and disables offline updates", () => {
    expect(row("offline", false).props.value).toBe(false);
    expect(row("offline", false).props.disabled).toBe(true);
  });
  it("hides controls on servers without restart continuation support", () => {
    state.environments = [{ serverConfig: { environment: { capabilities: {} } } }];
    expect(RestartContinuationSettings()).toBeNull();
  });
});
