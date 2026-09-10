import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { QuitHoldOverlay } from "./QuitHoldOverlay";

describe("QuitHoldOverlay", () => {
  let listener: (event: unknown) => void;
  let renderer: ReactTestRenderer;
  const unsubscribe = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    vi.stubGlobal("window", {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
      desktopBridge: {
        onQuitShortcut: (callback: typeof listener) => {
          listener = callback;
          return unsubscribe;
        },
      },
    });
    await act(async () => {
      renderer = create(<QuitHoldOverlay />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("supports hold hints from older shells and hides them after release", async () => {
    await act(async () => {
      listener("down");
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Hold ⌘Q to Quit");
    await act(async () => {
      listener("up");
      vi.advanceTimersByTime(1199);
    });
    expect(renderer.toJSON()).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("closes a double-press hint when its acceptance window expires", async () => {
    await act(async () => {
      listener({ state: "down", mode: "double-click" });
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Press ⌘Q again to Quit");
    await act(async () => {
      listener({ state: "up" });
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("cancels a pending hold hide when a new shortcut starts", async () => {
    await act(async () => {
      listener({ state: "down", mode: "hold" });
      listener({ state: "up" });
    });
    await act(async () => {
      listener({ state: "down", mode: "double-click" });
      vi.advanceTimersByTime(1200);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Press ⌘Q again to Quit");
  });
});
