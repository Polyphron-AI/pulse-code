import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceDisplaySettings } from "./WorkspaceDisplaySettings";
const mocks = vi.hoisted(() => ({
  operate: true,
  supported: true,
  ready: true,
  zone: "Africa/Johannesburg",
  ids: ["remote"],
  kind: "environment",
  update: vi.fn(),
}));
vi.mock("../settings/SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: { kind: mocks.kind, environmentIds: mocks.ids },
    environment: { environmentId: "remote" },
    connectedEnvironments: [{ environmentId: "remote" }],
  }),
}));
vi.mock("../settings/useScopedSettings", () => ({
  useScopedSettings: () => ({ workspaceDisplayTimeZone: mocks.zone }),
  useUpdateScopedSettings: () => mocks.update,
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceTasksV2: mocks.supported, ready: mocks.ready }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer!.unmount());
  renderer = undefined;
  mocks.operate = true;
  mocks.supported = true;
  mocks.ready = true;
  mocks.ids = ["remote"];
  mocks.kind = "environment";
  mocks.zone = "Africa/Johannesburg";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("saves and resets only the selected environment timezone, retaining failed input", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.update.mockResolvedValue(false);
  await act(() => {
    renderer = create(<WorkspaceDisplaySettings />);
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Workspace timezone" })
      .props.onChange({ target: { value: "Europe/London" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.update).toHaveBeenLastCalledWith({ workspaceDisplayTimeZone: "Europe/London" });
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "could not be saved",
  );
  expect(renderer!.root.findByProps({ "aria-label": "Workspace timezone" }).props.value).toBe(
    "Europe/London",
  );
  mocks.update.mockResolvedValue(true);
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Reset")!
      .props.onClick(),
  );
  expect(mocks.update).toHaveBeenLastCalledWith({ workspaceDisplayTimeZone: null });
});
it.each(["read", "loading", "multiple", "project"])(
  "blocks timezone writes for %s scope",
  async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.operate = mode !== "read";
    mocks.ready = mode !== "loading";
    if (mode === "multiple") mocks.ids = ["remote", "other"];
    if (mode === "project") mocks.kind = "project";
    await act(() => {
      renderer = create(<WorkspaceDisplaySettings />);
    });
    for (const form of renderer!.root.findAllByType("form"))
      await act(() => form.props.onSubmit({ preventDefault() {} }));
    expect(mocks.update).not.toHaveBeenCalled();
  },
);
it("saves the server timezone without the task capability and shows no task notice", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.supported = false;
  mocks.update.mockResolvedValue(true);
  await act(() => {
    renderer = create(<WorkspaceDisplaySettings />);
  });
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.update).toHaveBeenCalledWith({ workspaceDisplayTimeZone: "Africa/Johannesburg" });
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("Tasks need a newer server.");
});
it("rejects invalid IANA zones before any write", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(<WorkspaceDisplaySettings />);
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Workspace timezone" })
      .props.onChange({ target: { value: "No/Such_Zone" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain("IANA");
});
