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

it.each([false, true])(
  "keeps the newer native slot after older layout update %s and unmount, without resizing",
  async (updateOlder) => {
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
    if (updateOlder) {
      await act(() =>
        root!.render(
          <>
            <div key="older" data-owner="older">
              <BrowserSurfaceSlot tabId={tabId} visible layoutVersion={1} />
            </div>
            {newer}
          </>,
        ),
      );
      expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
        visible: true,
        rect: { x: 700 },
      });
    }
    await act(() => root!.render(<>{newer}</>));
    expect(node.querySelectorAll("[data-browser-surface-slot]")).toHaveLength(1);
    expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
      visible: true,
      rect: { x: 700, width: 314, height: 311 },
    });
    await act(() =>
      root!.render(
        <>
          <div key="newer">
            <BrowserSurfaceSlot tabId={tabId} visible={false} />
          </div>
        </>,
      ),
    );
    expect(useBrowserSurfaceStore.getState().byTabId[tabId]?.visible).toBe(false);
    await act(() => root!.render(<>{newer}</>));
    expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
      visible: true,
      rect: { x: 700 },
    });
  },
);

it.each(["unmounts", "hides"])(
  "immediately returns the native surface to the older visible slot when the newer slot %s",
  async (departure) => {
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
    const older = (
      <div key="older" data-owner="older">
        <BrowserSurfaceSlot tabId={tabId} visible />
      </div>
    );
    const newer = (visible: boolean) => (
      <div key="newer">
        <BrowserSurfaceSlot tabId={tabId} visible={visible} />
      </div>
    );
    await act(() => root!.render(<>{older}</>));
    expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
      visible: true,
      rect: { x: 10 },
    });
    await act(() => root!.render(<>{[older, newer(true)]}</>));
    expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
      visible: true,
      rect: { x: 700 },
    });
    await act(() => root!.render(<>{[older, departure === "hides" ? newer(false) : null]}</>));
    expect(useBrowserSurfaceStore.getState().byTabId[tabId]).toMatchObject({
      visible: true,
      rect: { x: 10, width: 314, height: 311 },
    });
    expect(useBrowserSurfaceStore.getState().byTabId[tabId]?.owner).not.toBeNull();
  },
);

it("installs listeners only while the native slot is visible", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useBrowserSurfaceStore.setState({ byTabId: {}, activityByTabId: {} });
  const observe = vi.fn();
  const disconnect = vi.fn();
  const resizeObserver = vi.fn(function () {
    return { observe, disconnect };
  });
  vi.stubGlobal("ResizeObserver", resizeObserver);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const subscribe = vi.spyOn(useBrowserSurfaceStore, "subscribe");
  const addListener = vi.spyOn(window, "addEventListener");
  const removeListener = vi.spyOn(window, "removeEventListener");
  const tabId = "remote:browser-thread:epoch-1:tab-1";

  await act(() => root!.render(<BrowserSurfaceSlot tabId={tabId} visible={false} />));
  expect(subscribe).not.toHaveBeenCalled();
  expect(resizeObserver).not.toHaveBeenCalled();
  expect(
    addListener.mock.calls.filter(([type]) => type === "resize" || type === "scroll"),
  ).toHaveLength(0);

  await act(() => root!.render(<BrowserSurfaceSlot tabId={tabId} visible />));
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(resizeObserver).toHaveBeenCalledTimes(1);
  expect(observe).toHaveBeenCalledWith(node.firstElementChild);
  const update = addListener.mock.calls.find(([type]) => type === "resize")?.[1];
  expect(update).toBeTypeOf("function");
  expect(addListener).toHaveBeenCalledWith("scroll", update, true);

  await act(() => root!.render(<BrowserSurfaceSlot tabId={tabId} visible={false} />));
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(removeListener).toHaveBeenCalledWith("resize", update);
  expect(removeListener).toHaveBeenCalledWith("scroll", update, true);
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
  const otherOwner = Symbol("other-slot");
  useBrowserSurfaceStore.getState().claim(tabId, otherOwner, false);
  useBrowserSurfaceStore.getState().release(tabId, otherOwner);
  expect(bounds).not.toHaveBeenCalled();
  expect(useBrowserSurfaceStore.getState().byTabId[tabId]?.owner).toBeNull();
  expect(subscribe).toHaveBeenCalledTimes(1);
});
