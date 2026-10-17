// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { BrowserSurfaceSlot } from "./BrowserSurfaceSlot";
import { useBrowserSurfaceStore } from "./browserSurfaceStore";

let root: Root | undefined;
let node: HTMLDivElement | undefined;
afterEach(async () => {
  await act(() => root?.unmount());
  node?.remove();
  root = undefined;
  node = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the newer native slot visible after the older slot unmounts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useBrowserSurfaceStore.setState({ byTabId: {}, activityByTabId: {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(this.closest('[data-owner="older"]') ? 10 : 700, 80, 314, 311);
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const tabId = "remote:browser-thread:epoch-1:tab-1";
  const newer = (
    <div key="newer">
      <BrowserSurfaceSlot tabId={tabId} visible />
    </div>
  );
  await act(() =>
    root!.render(
      <>
        <div key="older" data-owner="older">
          <BrowserSurfaceSlot tabId={tabId} visible />
        </div>
        {newer}
      </>,
    ),
  );
  expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
    visible: true,
    rect: { x: 700, width: 314, height: 311 },
  });
  await act(() => root!.render(<>{newer}</>));
  await act(() => window.dispatchEvent(new Event("resize")));
  expect(node.querySelectorAll("[data-browser-surface-slot]")).toHaveLength(1);
  expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
    visible: true,
    rect: { x: 700, width: 314, height: 311 },
  });
});
