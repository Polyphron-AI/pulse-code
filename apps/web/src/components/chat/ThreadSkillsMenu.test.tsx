import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DEFAULT_UNIFIED_SETTINGS,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type UnifiedSettings,
} from "@t3tools/contracts";
import { reactHookHarness as hooks } from "../../test/reactHookHarness";
import { visitElements } from "../../test/reactElementTree";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";

const state = vi.hoisted(() => ({
  settings: null as UnifiedSettings | null,
  persist: vi.fn(),
  reads: [] as string[],
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { ...actual, useState: reactHookHarness.useState };
});
vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (id: string) => {
    state.reads.push(id);
    return state.settings;
  },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.persist }));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: "update" } }));
import { ThreadSkillsMenu } from "./ThreadSkillsMenu";

const environmentId = EnvironmentId.make("remote-env");
const threadId = ThreadId.make("thread-a");
const instanceId = ProviderInstanceId.make("codex-work");
function render(_driver = "codex", thread: ThreadId | null = threadId) {
  hooks.beginRender();
  return ThreadSkillsMenu({ environmentId, threadId: thread, instanceId });
}
beforeEach(() => {
  hooks.reset();
  state.reads = [];
  state.persist.mockReset();
  state.persist.mockResolvedValue({ _tag: "Success" });
  state.settings = {
    ...DEFAULT_UNIFIED_SETTINGS,
    managedSkills: {
      tools: {
        name: "Tools",
        description: "Review",
        source: { type: "upload" },
        revision: "a".repeat(64),
        autoUpdate: false,
        updatedAt: "2026-09-09T10:00:00Z",
        checkedAt: "2026-09-09T10:00:00Z",
        defaultProviders: [instanceId],
      },
    },
  };
});
describe("thread skill controls", () => {
  it("shows a default as enabled and saves an override to the thread's environment", () => {
    const toggle = visitElements(render(), (element) => element.type === Switch)!;
    expect(toggle.props.checked).toBe(true);
    (toggle.props.onCheckedChange as (checked: boolean) => void)(false);
    expect(state.reads).toEqual([environmentId]);
    expect(state.persist).toHaveBeenCalledWith({
      environmentId,
      input: { patch: { threadSkillOverrides: { [threadId]: { tools: false } } } },
    });
  });
  it("restores defaults without replacing other threads' choices", () => {
    state.settings = {
      ...state.settings!,
      threadSkillOverrides: { [threadId]: { tools: false }, another: { tools: true } },
    };
    const button = visitElements(render(), (element) => element.props.children === "Use defaults")!;
    (button.props.onClick as () => void)();
    expect(state.persist).toHaveBeenCalledWith({
      environmentId,
      input: { patch: { threadSkillOverrides: { [threadId]: { tools: null } } } },
    });
  });
  it("allows each provider and disables threads that do not exist yet", () => {
    expect(
      visitElements(render("opencode"), (element) => element.type === Switch)?.props.disabled,
    ).toBe(false);
    expect(
      visitElements(render("codex", null), (element) => element.type === Switch)?.props.disabled,
    ).toBe(true);
  });
  it("lets a thread clear overrides after switching to an unsupported provider", () => {
    state.settings = { ...state.settings!, threadSkillOverrides: { [threadId]: { tools: true } } };
    const button = visitElements(
      render("opencode"),
      (element) => element.props.children === "Use defaults",
    )!;
    expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)();
    expect(state.persist).toHaveBeenCalledWith({
      environmentId,
      input: { patch: { threadSkillOverrides: { [threadId]: { tools: null } } } },
    });
  });
});

describe("skill browsing", () => {
  const rows = (tree: ReturnType<typeof render>) => {
    const ids: string[] = [];
    visitElements(tree, (element) => {
      if (element.type === "label") ids.push(String(element.key));
      return false;
    });
    return ids;
  };
  function library() {
    const skill = state.settings!.managedSkills.tools!;
    state.settings = {
      ...state.settings!,
      managedSkills: {
        alpha: { ...skill, name: "Alpha", defaultProviders: [] },
        zulu: { ...skill, name: "Zulu" },
        beta: { ...skill, name: "Beta", description: "Browser testing", defaultProviders: [] },
        gamma: { ...skill, name: "Gamma" },
      },
      threadSkillOverrides: { [threadId]: { beta: true, gamma: false } },
    };
  }
  it("puts effective enabled skills first, including thread overrides", () => {
    library();
    expect(rows(render())).toEqual(["beta", "zulu", "alpha", "gamma"]);
  });
  it("searches names and descriptions without changing the selection", () => {
    library();
    const input = visitElements(render(), (element) => element.type === Input)!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: " BROWSER " },
    });
    expect(rows(render())).toEqual(["beta"]);
    expect(state.persist).not.toHaveBeenCalled();
    (input.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "missing" },
    });
    expect(
      visitElements(
        render(),
        (element) => element.props.children === "No skills match your search.",
      ),
    ).not.toBeNull();
  });
});
