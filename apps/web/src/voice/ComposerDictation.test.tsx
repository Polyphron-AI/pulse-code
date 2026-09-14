// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { act } from "react";
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
  TooltipTrigger: ({ children, render }: { children: ReactNode; render: ReactNode }) => (
    <>
      {render}
      {children}
    </>
  ),
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
        />,
      );
    });
    (container.querySelector('[aria-label="Dictate"]') as HTMLButtonElement).click();
    expect(onStart).not.toHaveBeenCalled();
  });
});
