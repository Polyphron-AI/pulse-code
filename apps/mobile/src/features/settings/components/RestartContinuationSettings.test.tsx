import { DEFAULT_SERVER_SETTINGS, type EnvironmentId } from "@t3tools/contracts";
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
vi.mock("./SettingsRow", () => ({ SettingsRow: () => null }));
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
  it("reads each environment and applies changes to connected supported environments", () => {
    state.settings = {
      remote: { continueThreadsAfterServerUpdate: true },
      other: { continueThreadsAfterServerUpdate: false },
    };
    state.environments = ["remote", "other", "offline", "legacy"].map((id) => ({
      environmentId: id,
      label: id,
      connection: { phase: id === "offline" ? "reconnecting" : "connected" },
      serverConfig: {
        settings: state.settings[id] ?? {},
        environment: { capabilities: { threadRestartContinuation: id !== "legacy" } },
      },
    }));
    expect(row("remote").props.value).toBe(true);
    expect(row("other").props.value).toBe(false);
    row("remote").props.onValueChange(false);
    expect(state.update).toHaveBeenCalledTimes(2);
    expect(state.update).toHaveBeenNthCalledWith(1, {
      environmentId: "remote",
      input: { patch: { continueThreadsAfterServerUpdate: false } },
    });
    expect(state.update).toHaveBeenNthCalledWith(2, {
      environmentId: "other",
      input: { patch: { continueThreadsAfterServerUpdate: false } },
    });
  });
  it("offers explicit shared recovery using the named connected source", () => {
    state.environments = ["remote", "other"].map((id) => ({
      environmentId: id,
      label: id,
      connection: { phase: "connected" },
      serverConfig: {
        settings: { ...DEFAULT_SERVER_SETTINGS, continueThreadsAfterServerUpdate: id === "remote" },
        environment: { capabilities: { threadRestartContinuation: true } },
      },
    }));
    const section = RestartContinuationSettings() as ReactElement<{
      children: ReactElement<{ value: string; onPress: () => void }>[];
    }>;
    const action = section.props.children[0]!;
    expect(action.props.value).toBe("remote");
    expect(state.update).not.toHaveBeenCalled();
    action.props.onPress();
    expect(state.update).toHaveBeenCalledTimes(2);
    expect(state.update.mock.calls[1]?.[0].input.patch.continueThreadsAfterServerUpdate).toBe(true);
  });
  it("defaults missing settings off and disables offline updates", () => {
    expect(row("offline", false).props.value).toBe(false);
    expect(row("offline", false).props.disabled).toBe(true);
  });
  it("hides controls on servers without restart continuation support", () => {
    state.environments = [
      { connection: { phase: "connected" }, serverConfig: { environment: { capabilities: {} } } },
    ];
    expect(RestartContinuationSettings()).toBeNull();
  });
});
