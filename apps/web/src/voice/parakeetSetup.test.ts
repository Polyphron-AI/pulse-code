// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ setup: vi.fn(), reset: vi.fn(), ready: false }));

vi.mock("./parakeetTranscription", () => ({
  ParakeetTranscriber: class {
    setup = mocks.setup;
    reset = mocks.reset;
    isReady = () => mocks.ready;
  },
}));

import { isParakeetConfigured, setupParakeet, subscribeParakeetSetup } from "./parakeetSetup";

beforeEach(() => {
  localStorage.clear();
  mocks.setup.mockReset();
});

describe("Parakeet setup state", () => {
  it("persists successful setup and notifies the composer", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeParakeetSetup(listener);
    mocks.setup.mockResolvedValue(undefined);

    await setupParakeet(new AbortController().signal);

    expect(isParakeetConfigured()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("clears stale setup state after a real reload failure", async () => {
    localStorage.setItem("pulse:parakeet-configured:v1", "true");
    mocks.setup.mockRejectedValue(new Error("cache missing"));

    await expect(setupParakeet(new AbortController().signal)).rejects.toThrow("cache missing");

    expect(isParakeetConfigured()).toBe(false);
  });
});
