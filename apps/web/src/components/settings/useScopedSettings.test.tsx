import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, ServerSettingsError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { toastManager } from "../ui/toast";
import { useUpdateScopedSettings } from "./useScopedSettings";
const mocks = vi.hoisted(() => ({ persist: vi.fn(), phase: "connected" }));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: {
      kind: "environment",
      environmentId: "remote",
      environmentIds: ["remote"],
      members: [],
      label: "Remote",
    },
    environments: [
      {
        environmentId: "remote",
        label: "Remote",
        connection: { phase: mocks.phase },
        serverConfig: { settings: DEFAULT_SERVER_SETTINGS },
      },
    ],
  }),
  useOptionalSettingsScope: () => null,
}));
vi.mock("../../hooks/useSettings", () => ({
  mergeEnvironmentSettings: vi.fn(),
  persistClientSettingsPatch: vi.fn(),
  useClientSettings: vi.fn(),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: {} } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.persist }));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer!.unmount());
  renderer = undefined;
  mocks.phase = "connected";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it.each(["Success", "Failure", "unavailable"])(
  "reports %s from the existing scoped settings write",
  async (outcome) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.persist.mockResolvedValue({
      _tag: outcome,
      value: { ...DEFAULT_SERVER_SETTINGS, workspaceDisplayTimeZone: "Europe/London" },
    });
    if (outcome === "unavailable") mocks.phase = "disconnected";
    const results: boolean[] = [];
    function Probe() {
      const update = useUpdateScopedSettings();
      return (
        <button
          onClick={async () => {
            results.push(await update({ workspaceDisplayTimeZone: "Europe/London" }));
          }}
        >
          Save
        </button>
      );
    }
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => renderer!.root.findByType("button").props.onClick());
    expect(results).toEqual([outcome === "Success"]);
    expect(mocks.persist).toHaveBeenCalledTimes(outcome === "unavailable" ? 0 : 1);
    if (outcome !== "unavailable")
      expect(mocks.persist).toHaveBeenCalledWith({
        environmentId: "remote",
        input: { patch: { workspaceDisplayTimeZone: "Europe/London" } },
      });
  },
);
it.each(["validate-workspace-timezone", "validate-workspace-owner-profile"] as const)(
  "exposes the server's structured %s rejection to the caller",
  async (operation) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const error = new ServerSettingsError({
      settingsPath: "remote/settings.json",
      operation,
    });
    mocks.persist.mockResolvedValue({ _tag: "Failure", cause: Cause.fail(error) });
    const onError = vi.fn();
    const results: boolean[] = [];
    function Probe() {
      const update = useUpdateScopedSettings({ onError });
      return (
        <button
          onClick={async () => {
            results.push(
              await update(
                operation === "validate-workspace-owner-profile"
                  ? { workspaceOwnerProfile: { displayName: "Maya", initials: "MC" } }
                  : { workspaceDisplayTimeZone: "Europe/London" },
              ),
            );
          }}
        >
          Save
        </button>
      );
    }
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => renderer!.root.findByType("button").props.onClick());
    expect(results).toEqual([false]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  },
);

it.each(["workspaceDisplayTimeZone", "workspaceOwnerProfile"] as const)(
  "reports an unsupported %s when the server succeeds without saving it",
  async (key) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.persist.mockResolvedValue({ _tag: "Success", value: DEFAULT_SERVER_SETTINGS });
    const onUnsupportedSetting = vi.fn();
    const results: boolean[] = [];
    function Probe() {
      const update = useUpdateScopedSettings({ onUnsupportedSetting });
      return (
        <button
          onClick={async () => {
            results.push(
              await update(
                key === "workspaceOwnerProfile"
                  ? { workspaceOwnerProfile: { displayName: "Maya", initials: "MC" } }
                  : { workspaceDisplayTimeZone: "Europe/London" },
              ),
            );
          }}
        >
          Save
        </button>
      );
    }
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => renderer!.root.findByType("button").props.onClick());
    expect(results).toEqual([false]);
    expect(onUnsupportedSetting).toHaveBeenCalledExactlyOnceWith(key);
    expect(toastManager.add).not.toHaveBeenCalled();
  },
);

it.each([
  {
    label: "NFC owner",
    patch: { workspaceOwnerProfile: { displayName: "Jose\u0301", initials: "E\u0301" } },
    saved: { workspaceOwnerProfile: { displayName: "Jos\u00e9", initials: "\u00c9" } },
  },
  {
    label: "trimmed owner",
    patch: { workspaceOwnerProfile: { displayName: "  Maya  ", initials: " MC " } },
    saved: { workspaceOwnerProfile: { displayName: "Maya", initials: "MC" } },
  },
  {
    label: "host timezone reset",
    patch: { workspaceDisplayTimeZone: null },
    saved: { workspaceDisplayTimeZone: "Africa/Johannesburg" },
  },
])("accepts a successful $label save without unsupported feedback", async ({ patch, saved }) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.persist.mockResolvedValue({
    _tag: "Success",
    value: { ...DEFAULT_SERVER_SETTINGS, ...saved },
  });
  const onUnsupportedSetting = vi.fn();
  const results: boolean[] = [];
  function Probe() {
    const update = useUpdateScopedSettings({ onUnsupportedSetting });
    return (
      <button
        onClick={async () => {
          results.push(await update(patch));
        }}
      >
        Save
      </button>
    );
  }
  await act(() => {
    renderer = create(<Probe />);
  });
  await act(() => renderer!.root.findByType("button").props.onClick());
  expect(results).toEqual([true]);
  expect(onUnsupportedSetting).not.toHaveBeenCalled();
  expect(toastManager.add).not.toHaveBeenCalled();
});
