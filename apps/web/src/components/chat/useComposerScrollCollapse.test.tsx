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
const getTimelineNode = () => timeline as unknown as HTMLElement;
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
beforeEach(async () => {
  enabled = true;
  overflows = true;
  atEnd = false;
  now = 0;
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
  it("collapses on a real timeline gesture and restores without focus at the end", async () => {
    await wheel();
    expect(state.collapsed).toBe(true);
    atEnd = true;
    await act(() => {
      timeline.dispatchEvent(new Event("scroll"));
    });
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
    expect(state.collapsed).toBe(false);
  });
});
