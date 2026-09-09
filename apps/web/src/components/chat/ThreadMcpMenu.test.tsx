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
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

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
import { ThreadMcpMenu } from "./ThreadMcpMenu";

const environmentId = EnvironmentId.make("remote-env");
const threadId = ThreadId.make("thread-a");
const instanceId = ProviderInstanceId.make("codex-work");
function render(driver = "codex", thread: ThreadId | null = threadId) {
  hooks.beginRender();
  return ThreadMcpMenu({ environmentId, threadId: thread, instanceId, driver });
}
beforeEach(() => {
  hooks.reset();
  state.reads = [];
  state.persist.mockReset();
  state.persist.mockResolvedValue({ _tag: "Success" });
  state.settings = {
    ...DEFAULT_UNIFIED_SETTINGS,
    mcpServers: {
      tools: { name: "Tools", defaultProviders: [instanceId], connectionRedacted: true },
    },
  };
});
describe("thread MCP controls", () => {
  it("shows a default as enabled and saves an override to the thread's environment", () => {
    const toggle = visitElements(render(), (element) => element.type === Switch)!;
    expect(toggle.props.checked).toBe(true);
    (toggle.props.onCheckedChange as (checked: boolean) => void)(false);
    expect(state.reads).toEqual([environmentId]);
    expect(state.persist).toHaveBeenCalledWith({
      environmentId,
      input: { patch: { threadMcpOverrides: { [threadId]: { tools: false } } } },
    });
  });
  it("restores defaults without replacing other threads' choices", () => {
    state.settings = {
      ...state.settings!,
      threadMcpOverrides: { [threadId]: { tools: false }, another: { tools: true } },
    };
    const button = visitElements(render(), (element) => element.props.children === "Use defaults")!;
    (button.props.onClick as () => void)();
    expect(state.persist).toHaveBeenCalledWith({
      environmentId,
      input: { patch: { threadMcpOverrides: { [threadId]: { tools: null } } } },
    });
  });
  it("disables unsupported providers and threads that do not exist yet", () => {
    expect(
      visitElements(render("opencode"), (element) => element.type === Switch)?.props.disabled,
    ).toBe(true);
    expect(
      visitElements(render("codex", null), (element) => element.type === Switch)?.props.disabled,
    ).toBe(true);
  });
  it("lets a thread clear overrides after switching to an unsupported provider", () => {
    state.settings = { ...state.settings!, threadMcpOverrides: { [threadId]: { tools: true } } };
    const button = visitElements(
      render("opencode"),
      (element) => element.props.children === "Use defaults",
    )!;
    expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)();
    expect(state.persist).toHaveBeenCalledWith({
      environmentId,
      input: { patch: { threadMcpOverrides: { [threadId]: { tools: null } } } },
    });
  });
});

it("searches names and IDs with effective enabled connections first", () => {
  state.settings = {
    ...state.settings!,
    mcpServers: {
      alpha: { name: "Alpha", defaultProviders: [], connectionRedacted: true },
      zulu: { name: "Zulu", defaultProviders: [instanceId], connectionRedacted: true },
      browser: { name: "Beta", defaultProviders: [], connectionRedacted: true },
      gamma: { name: "Gamma", defaultProviders: [instanceId], connectionRedacted: true },
    },
    threadMcpOverrides: { [threadId]: { browser: true, gamma: false } },
  };
  const rows = () => {
    const ids: string[] = [];
    visitElements(render(), (element) => {
      if (element.type === "label") ids.push(String(element.key));
      return false;
    });
    return ids;
  };
  expect(rows()).toEqual(["browser", "zulu", "alpha", "gamma"]);
  const search = (value: string) => {
    const input = visitElements(render(), (element) => element.type === Input)!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
  };
  search(" BROWSER ");
  expect(rows()).toEqual(["browser"]);
  search("ZULU");
  expect(rows()).toEqual(["zulu"]);
  search("missing");
  expect(rows()).toEqual([]);
  expect(
    visitElements(render(), (element) => element.props.children === "No MCPs match your search."),
  ).not.toBeNull();
  expect(state.persist).not.toHaveBeenCalled();
});
