import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  projects: [] as unknown[],
  environments: [] as unknown[],
  update: vi.fn(),
  values: [] as unknown[],
  cursor: 0,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (state.values.length <= index) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  View: "View",
}));
vi.mock("../../../components/AppText", () => ({ AppText: "Text" }));
vi.mock("../../../components/ProjectIcon", () => ({
  ProjectIcon: "ProjectIcon",
  NATIVE_PROJECT_ICONS: { folder: true },
  NATIVE_PROJECT_ICON_COLORS: { blue: "blue", red: "red" },
}));
vi.mock("../../../state/entities", () => ({ useProjects: () => state.projects }));
vi.mock("../../../state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
}));
vi.mock("../../../state/projects", () => ({ projectEnvironment: { update: "update" } }));
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => state.update }));
vi.mock("./SettingsSection", () => ({ SettingsSection: "SettingsSection" }));
vi.mock("./SettingsRow", () => ({ SettingsRow: "SettingsRow" }));
import { ProjectIconSettings } from "./ProjectIconSettings";
type Node = ReactElement<{
  children?: unknown;
  label?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  onPress?: () => void;
  visible?: boolean;
}>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function render() {
  state.cursor = 0;
  return nodes(ProjectIconSettings());
}
function press(items: Node[], label: string) {
  const node = items.find(
    (item) =>
      item.props.label === label ||
      item.props.accessibilityLabel === label ||
      item.props.children === label,
  );
  expect(node).toBeDefined();
  node!.props.onPress!();
}
beforeEach(() => {
  state.update.mockReset();
  state.values = [];
  state.cursor = 0;
  state.projects = [
    { id: "same", environmentId: "remote", title: "Remote", projectIcon: null },
    {
      id: "same",
      environmentId: "offline",
      title: "Offline",
      projectIcon: { kind: "emoji", emoji: "🚀" },
    },
    { id: "legacy", environmentId: "remote", title: "Legacy" },
  ];
  state.environments = [
    { environmentId: "remote", connection: { phase: "connected" } },
    { environmentId: "offline", connection: { phase: "reconnecting" } },
  ];
});
describe("mobile project icon choices", () => {
  it("hides unsupported projects and scopes emoji and reset writes to the selected environment", () => {
    const items = render();
    expect(items.some((item) => item.props.label === "Legacy")).toBe(false);
    expect(items.find((item) => item.props.label === "Offline")?.props.disabled).toBe(true);
    press(items, "Remote");
    press(render(), "Choose 🚀");
    press(render(), "Remote");
    press(render(), "Use automatic icon");
    expect(state.update.mock.calls.map(([input]) => input)).toEqual([
      {
        environmentId: "remote",
        input: {
          projectId: "same",
          faviconPath: null,
          projectIcon: { kind: "emoji", emoji: "🚀" },
        },
      },
      {
        environmentId: "remote",
        input: { projectId: "same", faviconPath: null, projectIcon: null },
      },
    ]);
  });
  it("retains color for native icons, allows cancellation, and blocks a write after disconnect", () => {
    press(render(), "Remote");
    press(render(), "red");
    press(render(), "Choose folder");
    expect(state.update).toHaveBeenCalledWith({
      environmentId: "remote",
      input: {
        projectId: "same",
        faviconPath: null,
        projectIcon: { kind: "lucide", name: "folder", color: "red" },
      },
    });
    state.update.mockClear();
    press(render(), "Remote");
    press(render(), "Cancel");
    expect(state.update).not.toHaveBeenCalled();
    press(render(), "Remote");
    state.environments = [];
    press(render(), "Choose 🚀");
    expect(state.update).not.toHaveBeenCalled();
  });
});
