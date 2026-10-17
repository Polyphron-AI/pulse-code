import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, ServerSettingsError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
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
    mocks.persist.mockResolvedValue({ _tag: outcome });
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
    expect(results).toEqual([false]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  },
);
