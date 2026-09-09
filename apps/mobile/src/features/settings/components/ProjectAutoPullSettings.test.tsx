import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  projects: [] as unknown[],
  environments: [] as unknown[],
  update: vi.fn(),
}));
vi.mock("../../../state/entities", () => ({ useProjects: () => state.projects }));
vi.mock("../../../state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
}));
vi.mock("../../../state/projects", () => ({ projectEnvironment: { update: "update" } }));
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => state.update }));
vi.mock("./SettingsSection", () => ({ SettingsSection: () => null }));
vi.mock("./SettingsSwitchRow", () => ({ SettingsSwitchRow: () => null }));
import { ProjectAutoPullSettings } from "./ProjectAutoPullSettings";
type Row = ReactElement<{
  disabled: boolean;
  value: boolean;
  onValueChange: (enabled: boolean) => void;
}>;
beforeEach(() => {
  state.update.mockReset();
  state.projects = [
    { id: "project", environmentId: "remote", title: "Remote", autoPull: false },
    { id: "project", environmentId: "offline", title: "Offline", autoPull: true },
    { id: "legacy", environmentId: "remote", title: "Legacy" },
  ];
  state.environments = [
    { environmentId: "remote", label: "Remote", connection: { phase: "connected" } },
    { environmentId: "offline", label: "Offline", connection: { phase: "reconnecting" } },
  ];
});
describe("mobile project auto-pull", () => {
  it("hides older projects and scopes both enable and disable to the chosen checkout", () => {
    const section = ProjectAutoPullSettings() as ReactElement<{ children: Row[] }>;
    expect(section.props.children).toHaveLength(2);
    const remote = section.props.children[0]!;
    expect(remote.props.value).toBe(false);
    remote.props.onValueChange(true);
    remote.props.onValueChange(false);
    expect(state.update.mock.calls.map(([write]) => write)).toEqual(
      [true, false].map((autoPull) => ({
        environmentId: "remote",
        input: { projectId: "project", autoPull },
      })),
    );
  });
  it("preserves the offline value and prevents writes until connected", () => {
    const section = ProjectAutoPullSettings() as ReactElement<{ children: Row[] }>;
    const offline = section.props.children[1]!;
    expect(offline.props.value).toBe(true);
    expect(offline.props.disabled).toBe(true);
    offline.props.onValueChange(false);
    expect(state.update).not.toHaveBeenCalled();
  });
});
