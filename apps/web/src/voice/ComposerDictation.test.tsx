// @vitest-environment happy-dom
import type { ReactElement, ReactNode } from "react";
import { act, cloneElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));
vi.mock("../components/ui/button", () => ({
  Button: ({
    children,
    render: _,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { render?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children, render }: { children: ReactNode; render: ReactNode }) =>
    cloneElement(render as ReactElement<{ children?: ReactNode }>, {}, children),
  TooltipPopup: ({ children }: { children: ReactNode }) => children,
}));

import { ComposerDictation } from "./ComposerDictation";

let root: Root | undefined;
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("ComposerDictation", () => {
  it("does not start capture while an external composer gate disables the microphone", async () => {
    const onStart = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(() => {
      root!.render(
        <ComposerDictation
          state={{ phase: "idle" }}
          disabledReason="Wait for the composer to connect before using dictation."
          onStart={onStart}
          onStop={vi.fn()}
          onCancel={vi.fn()}
          parakeetConfigured={false}
        />,
      );
    });
    (container.querySelector('[aria-label="Dictate"]') as HTMLButtonElement).click();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("uses the microphone button to stop a recording and hides setup once configured", async () => {
    const onStop = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(() => {
      root!.render(
        <ComposerDictation
          state={{ phase: "recording", backend: "parakeet" }}
          disabledReason={null}
          onStart={vi.fn()}
          onStop={onStop}
          onCancel={vi.fn()}
          parakeetConfigured
        />,
      );
    });
    expect(container.textContent).not.toContain("Set up voice");
    const recordingButton = container.querySelector(
      '[aria-label="Stop recording and transcribe"]',
    ) as HTMLButtonElement;
    expect(recordingButton.textContent).toContain("Voice dictation");
    expect(recordingButton.getAttribute("aria-pressed")).toBe("true");
    expect(recordingButton.className).toContain("bg-[#ff3b1f]");
    expect(recordingButton.querySelectorAll(".pulse-dictation-wave > span")).toHaveLength(3);
    recordingButton.click();
    expect(onStop).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("keeps the idle microphone neutral", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(() => {
      root!.render(
        <ComposerDictation
          state={{ phase: "idle" }}
          disabledReason={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onCancel={vi.fn()}
          parakeetConfigured
        />,
      );
    });
    const mic = container.querySelector('[aria-label="Dictate"]') as HTMLButtonElement;
    expect(mic.textContent).not.toContain("Voice dictation");
    expect(mic.getAttribute("aria-pressed")).toBe("false");
    expect(mic.className).not.toContain("bg-[#ff3b1f]");
  });
});
