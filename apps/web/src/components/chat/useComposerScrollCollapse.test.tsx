import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useComposerScrollCollapse } from "./useComposerScrollCollapse";

class Timeline extends EventTarget {
  scrollTop = 200;
  scrollHeight = 1000;
  clientHeight = 400;
  scrollWidth = 400;
  clientWidth = 400;
  parentElement: Timeline | null = null;
  isContentEditable = false;
  tagName = "DIV";
}
let root: Root;
let timeline: Timeline;
let state: ReturnType<typeof useComposerScrollCollapse>;
let enabled: boolean;
let overflows: boolean;
let atEnd: boolean;
let now: number;
let timelineReady: boolean;
let animationFrames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
const getTimelineNode = () => (timelineReady ? (timeline as unknown as HTMLElement) : null);
const timelineOverflows = () => overflows;
const isAtLogicalEnd = () => atEnd;
function Probe() {
  const value = useComposerScrollCollapse({
    enabled,
    threadId: "thread",
    getTimelineNode,
    timelineOverflows,
    isAtLogicalEnd,
  });
  useLayoutEffect(() => {
    state = value;
  });
  return null;
}
async function wheel(extra: Record<string, unknown> = {}) {
  const event = new Event("wheel");
  Object.assign(event, { deltaX: 0, deltaY: -30, deltaMode: 0, ctrlKey: false }, extra);
  await act(() => {
    timeline.dispatchEvent(event);
  });
}
async function flushAnimationFrames() {
  await act(() => {
    const pending = [...animationFrames.values()];
    animationFrames.clear();
    pending.forEach((callback) => callback(now));
  });
}
beforeEach(async () => {
  enabled = true;
  overflows = true;
  atEnd = false;
  now = 0;
  timelineReady = true;
  animationFrames = new Map();
  nextFrameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    animationFrames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => animationFrames.delete(id));
  timeline = new Timeline();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1,
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { document, HTMLIFrameElement: EventTarget });
  vi.stubGlobal("HTMLElement", Timeline);
  vi.stubGlobal("Element", Timeline);
  vi.stubGlobal("getComputedStyle", () => ({ overflowX: "auto", overflowY: "auto" }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container as unknown as HTMLElement);
  await act(() => root.render(<Probe />));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("composer timeline scroll collapse", () => {
  it("attaches when the timeline becomes available after the first effect", async () => {
    enabled = false;
    await act(() => root.render(<Probe />));
    timelineReady = false;
    enabled = true;
    await act(() => root.render(<Probe />));
    timelineReady = true;
    await act(() => {
      const pending = [...animationFrames.values()];
      animationFrames.clear();
      pending.forEach((callback) => callback(now));
    });
    await wheel();
    expect(state.collapsed).toBe(true);
  });

  it("cancels pending attachment when disabled and bounds readiness retries", async () => {
    enabled = false;
    await act(() => root.render(<Probe />));
    timelineReady = false;
    enabled = true;
    await act(() => root.render(<Probe />));
    expect(animationFrames.size).toBe(1);
    enabled = false;
    await act(() => root.render(<Probe />));
    expect(animationFrames.size).toBe(0);
    enabled = true;
    await act(() => root.render(<Probe />));
    for (let index = 0; index < 12; index += 1) {
      await act(() => {
        const pending = [...animationFrames.values()];
        animationFrames.clear();
        pending.forEach((callback) => callback(now));
      });
    }
    expect(animationFrames.size).toBe(0);
    timelineReady = true;
    await wheel();
    expect(state.collapsed).toBe(false);
  });

  it("waits for the virtual list state before restoring after scroll", async () => {
    atEnd = true;
    await act(() => {
      const event = new Event("wheel");
      Object.assign(event, { deltaX: 0, deltaY: -30, deltaMode: 0, ctrlKey: false });
      timeline.dispatchEvent(event);
      timeline.dispatchEvent(new Event("scroll"));
      // LegendList publishes its updated logical position on the next frame.
      atEnd = false;
    });
    await act(() => {
      const pending = [...animationFrames.values()];
      animationFrames.clear();
      pending.forEach((callback) => callback(now));
    });
    expect(state.collapsed).toBe(true);
  });

  it("coalesces restore checks and cancels them when disabled", async () => {
    await wheel();
    await act(() => {
      timeline.dispatchEvent(new Event("scroll"));
      timeline.dispatchEvent(new Event("scroll"));
    });
    expect(animationFrames.size).toBe(1);
    enabled = false;
    await act(() => root.render(<Probe />));
    expect(animationFrames.size).toBe(0);
    expect(state.collapsed).toBe(false);
  });

  it("collapses on a real timeline gesture and restores without focus at the end", async () => {
    await wheel();
    expect(state.collapsed).toBe(true);
    atEnd = true;
    await act(() => {
      timeline.dispatchEvent(new Event("scroll"));
    });
    await flushAnimationFrames();
    expect(state.collapsed).toBe(false);
  });
  it("honors opt-out and refuses short timelines, zoom and horizontal gestures", async () => {
    overflows = false;
    await wheel();
    expect(state.collapsed).toBe(false);
    overflows = true;
    await wheel({ ctrlKey: true });
    await wheel({ deltaX: 80 });
    expect(state.collapsed).toBe(false);
    enabled = false;
    await act(() => root.render(<Probe />));
    await wheel();
    expect(state.collapsed).toBe(false);
  });
  it("keeps the composer expanded through the remainder of a restored gesture", async () => {
    await wheel();
    await act(() => state.restore());
    await wheel();
    expect(state.collapsed).toBe(false);
    now = 200;
    await wheel();
    expect(state.collapsed).toBe(true);
  });
  it("does not collapse for blur or nested scrollable content", async () => {
    await act(() => {
      timeline.dispatchEvent(new Event("blur"));
    });
    const child = new Timeline();
    child.parentElement = timeline;
    const event = new Event("wheel");
    Object.assign(event, { deltaX: 0, deltaY: -80, deltaMode: 0, ctrlKey: false });
    Object.defineProperty(event, "target", { value: child });
    await act(() => {
      timeline.dispatchEvent(event);
    });
    expect(state.collapsed).toBe(false);
  });
  it("supports timeline paging and restores immediately when disabled", async () => {
    const event = new Event("keydown");
    Object.assign(event, { key: "PageUp" });
    await act(() => {
      timeline.dispatchEvent(event);
    });
    expect(state.collapsed).toBe(true);
    enabled = false;
    await act(() => root.render(<Probe />));
    expect(state.collapsed).toBe(false);
  });
  it("restores when the conversation no longer overflows", async () => {
    await wheel();
    expect(state.collapsed).toBe(true);
    overflows = false;
    await act(() => {
      timeline.dispatchEvent(new Event("scroll"));
    });
    await flushAnimationFrames();
    expect(state.collapsed).toBe(false);
  });
});
