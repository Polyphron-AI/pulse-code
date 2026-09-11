import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
const capture = vi.hoisted(() => ({ phase: "idle" }));
vi.mock("./voiceCapture", () => ({
  voiceCapture: { getSnapshot: () => capture },
}));
import { useComposerDictation } from "./useComposerDictation";

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

describe("composer dictation coordination", () => {
  it("updates busy state and reads capture state at submission time", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let dictation: ReturnType<typeof useComposerDictation>;
    function Probe() {
      dictation = useComposerDictation();
      return null;
    }
    act(() => {
      renderer = create(<Probe />);
    });
    expect(dictation!.busy).toBe(false);
    act(() => dictation!.onBusyChange(true));
    expect(dictation!.busy).toBe(true);
    expect(dictation!.sendDisabledReason(null)).toBe("Finish dictation before sending.");
    act(() => dictation!.onBusyChange(false));
    expect(dictation!.sendDisabledReason("Offline")).toBe("Offline");
    for (const phase of ["idle", "error", "recording", "transcribing"]) {
      capture.phase = phase;
      expect(dictation!.isCaptureActive()).toBe(!["idle", "error"].includes(phase));
    }
  });
});
