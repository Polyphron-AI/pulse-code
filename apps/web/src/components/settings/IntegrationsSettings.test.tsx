import type { ReactElement } from "react";
import { EnvironmentId, type IssueConnectionSnapshot } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { visitElements } from "../../test/reactElementTree";
import { reactHookHarness as hooks } from "../../test/reactHookHarness";

const state = vi.hoisted(() => ({
  environments: [] as Array<Record<string, unknown>>,
  serverConfigs: new Map<
    unknown,
    { environment: { capabilities: { issues?: boolean; integrations?: boolean } } }
  >(),
  queryData: null as IssueConnectionSnapshot | null,
  queryTargets: [] as unknown[],
  refresh: vi.fn(),
}));

const issueAtoms = vi.hoisted(() => ({
  updateConnection: Symbol("updateConnection"),
  disconnect: Symbol("disconnect"),
  setProjectMapping: Symbol("setProjectMapping"),
  removeProjectMapping: Symbol("removeProjectMapping"),
}));

const commands = vi.hoisted(() => ({
  updateConnection: vi.fn(),
  disconnect: vi.fn(),
  setProjectMapping: vi.fn(),
  removeProjectMapping: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return {
    ...actual,
    useEffect: () => undefined,
    useMemo: reactHookHarness.useMemo,
    useState: reactHookHarness.useState,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
}));

vi.mock("~/state/entities", () => ({
  useProjects: () => [],
  useServerConfigs: () => state.serverConfigs,
}));

vi.mock("~/state/issues", () => ({
  issueEnvironment: {
    connection: (target: unknown) => ({ _tag: "connection", target }),
    updateConnection: issueAtoms.updateConnection,
    disconnect: issueAtoms.disconnect,
    setProjectMapping: issueAtoms.setProjectMapping,
    removeProjectMapping: issueAtoms.removeProjectMapping,
  },
}));

vi.mock("~/state/query", () => ({
  useEnvironmentQuery: (target: unknown) => {
    state.queryTargets.push(target);
    return { data: state.queryData, error: null, isPending: false, refresh: state.refresh };
  },
}));

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (atom: symbol) =>
    atom === issueAtoms.updateConnection
      ? commands.updateConnection
      : atom === issueAtoms.disconnect
        ? commands.disconnect
        : atom === issueAtoms.setProjectMapping
          ? commands.setProjectMapping
          : commands.removeProjectMapping,
}));

import {
  PULSE_ISSUES_CAPABILITY_LABELS,
  PulseIssuesIntegration,
  issueConnectionGuidance,
  pulseIssuesConnectionActionLabel,
  pulseIssuesEnvironmentCanRun,
  pulseIssuesEnvironmentSupport,
} from "./IntegrationsSettings";
import { SETTINGS_SEARCH_ITEMS } from "./settingsSearch";

const capableId = EnvironmentId.make("capable-environment");
const unsupportedId = EnvironmentId.make("unsupported-environment");

function renderIntegration(): ReactElement<Record<string, unknown>> {
  hooks.beginRender();
  return PulseIssuesIntegration() as ReactElement<Record<string, unknown>>;
}

function hasText(node: unknown, text: string): boolean {
  if (typeof node === "string") return node.includes(text);
  if (Array.isArray(node)) return node.some((child) => hasText(child, text));
  if (!node || typeof node !== "object" || !("props" in node)) return false;
  return hasText((node as { props: { children?: unknown } }).props.children, text);
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Pulse Issues integration settings", () => {
  beforeEach(() => {
    hooks.reset();
    state.environments = [];
    state.serverConfigs = new Map();
    state.queryData = null;
    state.queryTargets = [];
    state.refresh.mockReset();
    commands.updateConnection.mockReset().mockResolvedValue({ _tag: "Success" });
    commands.disconnect.mockReset().mockResolvedValue({ _tag: "Success" });
    commands.setProjectMapping.mockReset().mockResolvedValue({ _tag: "Success" });
    commands.removeProjectMapping.mockReset().mockResolvedValue({ _tag: "Success" });
  });

  it.each([
    ["Origin http://localhost:5173 is not allowed", "Allow this Pulse Code origin"],
    ["Authentication token expired", "Create or replace the personal access token"],
    ["Forbidden: missing permission", "Use a Pulse account"],
    ["No projects are available", "Create or unarchive a project"],
    ["Connection refused", "Check that Pulse is reachable"],
  ])("turns %s into actionable guidance", (error, expected) => {
    expect(issueConnectionGuidance(error)).toContain(expected);
  });

  it("classifies shared, native-compatible, loading, and unsupported environments", () => {
    expect(pulseIssuesEnvironmentSupport({ issues: true, integrations: true })).toBe(
      "provider-lifecycle",
    );
    expect(pulseIssuesEnvironmentSupport({ issues: true })).toBe("native-issues");
    expect(pulseIssuesEnvironmentSupport(null)).toBe("loading");
    expect(pulseIssuesEnvironmentSupport({})).toBe("unsupported");
    expect(pulseIssuesEnvironmentCanRun("provider-lifecycle")).toBe(true);
    expect(pulseIssuesEnvironmentCanRun("native-issues")).toBe(true);
    expect(pulseIssuesEnvironmentCanRun("unsupported")).toBe(false);
  });

  it("keeps connection, capability, and mapping controls discoverable through search", () => {
    expect(
      SETTINGS_SEARCH_ITEMS.filter((item) => item.to === "/settings/integrations").map(
        (item) => item.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        "pulse-issues-connection",
        "pulse-issues-capabilities",
        "pulse-project-mapping",
      ]),
    );
    expect(PULSE_ISSUES_CAPABILITY_LABELS).toEqual([
      "Read Issues and Reports",
      "Update Issues",
      "Map workspaces",
    ]);
  });

  it("shows mixed capability states and never mounts an Issues query for unsupported servers", () => {
    state.environments = [
      { environmentId: capableId, label: "Capable server" },
      { environmentId: unsupportedId, label: "Older server" },
    ];
    state.serverConfigs.set(capableId, {
      environment: { capabilities: { issues: true, integrations: true } },
    });
    state.serverConfigs.set(unsupportedId, { environment: { capabilities: {} } });

    let panel = renderIntegration();
    expect(state.queryTargets.at(-1)).not.toBeNull();
    expect(
      visitElements(panel, (element) => element.props.id === "pulse-issues-capabilities"),
    ).not.toBeNull();

    const selector = visitElements(
      panel,
      (element) =>
        element.props.value === capableId && typeof element.props.onValueChange === "function",
    );
    (selector?.props.onValueChange as ((value: EnvironmentId) => void) | undefined)?.(
      unsupportedId,
    );
    panel = renderIntegration();

    expect(state.queryTargets.at(-1)).toBeNull();
    expect(
      visitElements(panel, (element) => hasText(element, "Pulse Issues is unavailable")),
    ).not.toBeNull();
  });

  it("submits credentials once, clears the input, and labels later connects reauthorization", async () => {
    state.environments = [{ environmentId: capableId, label: "Capable server" }];
    state.serverConfigs.set(capableId, {
      environment: { capabilities: { issues: true } },
    });
    state.queryData = {
      status: "disconnected",
      endpoint: null,
      tokenConfigured: false,
      projects: [],
      mappings: [],
      lastCheckedAt: null,
      error: null,
    };

    let panel = renderIntegration();
    const endpointInput = visitElements(
      panel,
      (element) => element.props.placeholder === "https://pulse.example.com",
    );
    const tokenInput = visitElements(panel, (element) => element.props.type === "password");
    (endpointInput?.props.onChange as ((event: unknown) => void) | undefined)?.({
      currentTarget: { value: "https://pulse.example.test" },
    });
    (tokenInput?.props.onChange as ((event: unknown) => void) | undefined)?.({
      currentTarget: { value: "secret-token" },
    });

    panel = renderIntegration();
    const connect = visitElements(
      panel,
      (element) => typeof element.props.onClick === "function" && hasText(element, "Connect"),
    );
    (connect?.props.onClick as (() => void) | undefined)?.();
    await flushPromises();

    expect(commands.updateConnection).toHaveBeenCalledWith({
      environmentId: capableId,
      input: { endpoint: "https://pulse.example.test", token: "secret-token" },
    });
    panel = renderIntegration();
    expect(visitElements(panel, (element) => element.props.type === "password")?.props.value).toBe(
      "",
    );
    expect(pulseIssuesConnectionActionLabel(true)).toBe("Reauthorize");
    expect(state.refresh).toHaveBeenCalledOnce();
  });
});
