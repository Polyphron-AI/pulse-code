import type { EnvironmentId } from "@t3tools/contracts";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  enabled: {} as Record<string, boolean>,
  updates: vi.fn(),
  environments: [] as unknown[],
}));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (
    id: string,
    selector: (value: { continueThreadsAfterServerUpdate: boolean }) => unknown,
  ) => selector({ continueThreadsAfterServerUpdate: state.enabled[id] ?? false }),
  useUpdateSharedSettings: (id: string) => (patch: unknown) => state.updates(id, patch),
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
}));
import {
  RestartContinuationEnvironmentRow,
  RestartContinuationSettings,
} from "./RestartContinuationSettings";
function row(id: string, connected = true) {
  return RestartContinuationEnvironmentRow({
    environmentId: id as EnvironmentId,
    label: id,
    connected,
  }) as ReactElement<{
    control: ReactElement<{
      checked: boolean;
      disabled: boolean;
      onCheckedChange: (value: boolean) => void;
    }>;
    resetAction: ReactElement<{ onClick: () => void }> | null;
  }>;
}
describe("restart continuation settings", () => {
  beforeEach(() => {
    state.enabled = {};
    state.environments = [];
    state.updates.mockReset();
  });
  it("reads the chosen environment and requests an explicit shared write", () => {
    state.enabled = { local: false, remote: true };
    expect(row("local").props.control.props.checked).toBe(false);
    const remote = row("remote");
    expect(remote.props.control.props.checked).toBe(true);
    remote.props.control.props.onCheckedChange(false);
    expect(state.updates).toHaveBeenCalledExactlyOnceWith("remote", {
      continueThreadsAfterServerUpdate: false,
    });
  });
  it("resets shared continuation to the off default", () => {
    state.enabled.remote = true;
    row("remote").props.resetAction?.props.onClick();
    expect(state.updates).toHaveBeenCalledExactlyOnceWith("remote", {
      continueThreadsAfterServerUpdate: false,
    });
    expect(row("local").props.resetAction).toBeNull();
  });
  it("disables offline environments and hides unsupported servers", () => {
    expect(row("offline", false).props.control.props.disabled).toBe(true);
    state.environments = [
      { environmentId: "old", serverConfig: { environment: { capabilities: {} } } },
    ];
    expect(RestartContinuationSettings()).toBeNull();
  });
});
