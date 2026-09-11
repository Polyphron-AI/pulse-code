import type { ComposerBusyBehavior, UnifiedSettings } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  behavior: "queue" as ComposerBusyBehavior,
  update: vi.fn(),
}));
vi.mock("../../hooks/useSettings", () => ({
  usePrimarySettings: (selector: (settings: UnifiedSettings) => unknown) =>
    selector({ ...DEFAULT_UNIFIED_SETTINGS, composerBusyBehavior: state.behavior }),
  useUpdatePrimarySettings: () => state.update,
}));
import { ComposerBehaviorSettings } from "./ComposerBehaviorSettings";
import { searchableSetting } from "./settingsSearch";

function row() {
  return ComposerBehaviorSettings() as ReactElement<{
    id: string;
    control: ReactElement<{ value: string; onValueChange: (value: string | null) => void }>;
    resetAction: ReactElement<{ onClick: () => void }> | null;
  }>;
}

describe("composer behavior settings contribution", () => {
  beforeEach(() => {
    state.behavior = DEFAULT_UNIFIED_SETTINGS.composerBusyBehavior;
    state.update.mockReset();
  });
  it("preserves the searchable target and current setting", () => {
    expect(row().props.id).toBe(searchableSetting("messages-while-working").id);
    expect(row().props.control.props.value).toBe(state.behavior);
    expect(row().props.resetAction).toBeNull();
  });
  it.each(["queue", "steer"])("writes only the selected %s behavior", (value) => {
    row().props.control.props.onValueChange(value);
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ composerBusyBehavior: value });
  });
  it("ignores cleared or unknown values", () => {
    row().props.control.props.onValueChange(null);
    row().props.control.props.onValueChange("unknown");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("resets to the canonical default", () => {
    state.behavior = DEFAULT_UNIFIED_SETTINGS.composerBusyBehavior === "queue" ? "steer" : "queue";
    row().props.resetAction?.props.onClick();
    expect(state.update).toHaveBeenCalledExactlyOnceWith({
      composerBusyBehavior: DEFAULT_UNIFIED_SETTINGS.composerBusyBehavior,
    });
  });
});
