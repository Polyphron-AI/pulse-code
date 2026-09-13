import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ setup: vi.fn() }));
vi.mock("../../voice/parakeetSetup", () => ({ setupParakeet: mocks.setup }));
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
}));

import { OnboardingDictationStep } from "./OnboardingDictationStep";
import {
  readDictationPreferences,
  resetDictationPreferencesForTests,
} from "../../voice/dictationPreferences";

const values = new Map<string, string>();
let renderer: ReactTestRenderer | undefined;
const click = async (text: string) => {
  const button = renderer!.root
    .findAllByType("button")
    .find((item) => item.children.join("").includes(text))!;
  await act(() => button.props.onClick());
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  values.clear();
  resetDictationPreferencesForTests();
  mocks.setup.mockReset();
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("OnboardingDictationStep", () => {
  it("records no and continues without starting a download", async () => {
    const onContinue = vi.fn();
    await act(() => {
      renderer = create(<OnboardingDictationStep onContinue={onContinue} />);
    });
    await click("Not now");
    expect(readDictationPreferences().enabled).toBe(false);
    expect(mocks.setup).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("records yes, shows progress, and continues after setup", async () => {
    let finish!: () => void;
    mocks.setup.mockImplementation((_signal: AbortSignal, progress: (value: object) => void) => {
      progress({ loaded: 40, total: 100, file: "encoder.onnx" });
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const onContinue = vi.fn();
    await act(() => {
      renderer = create(<OnboardingDictationStep onContinue={onContinue} />);
    });
    await act(() => {
      renderer!.root.findAllByType("button")[0]!.props.onClick();
    });
    expect(readDictationPreferences()).toMatchObject({ enabled: true, backend: "parakeet" });
    expect(JSON.stringify(renderer!.toJSON())).toContain("40%");
    await act(() => finish());
    await click("Continue");
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows the real setup failure and allows retry", async () => {
    mocks.setup.mockRejectedValueOnce(new Error("CompileError: bad wasm"));
    await act(() => {
      renderer = create(<OnboardingDictationStep onContinue={vi.fn()} />);
    });
    await click("Set up local dictation");
    const output = JSON.stringify(renderer!.toJSON());
    expect(output).toContain("CompileError: bad wasm");
    expect(output).toContain("Try Parakeet setup again");
  });
});
