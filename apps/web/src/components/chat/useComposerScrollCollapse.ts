import { useCallback, useEffect, useRef, useState } from "react";
import {
  createComposerScrollGestureState,
  recordComposerScrollGestureEvent,
  resetComposerScrollGesture,
  shouldCollapseComposerForScrollKey,
  suppressActiveComposerScrollGesture,
} from "./composerScrollGesture";

const GESTURE_RESET_MS = 160;

export function useComposerScrollCollapse(input: {
  enabled: boolean;
  threadId: string | null;
  getTimelineNode?: (() => HTMLElement | null) | undefined;
  timelineOverflows?: (() => boolean) | undefined;
  isAtLogicalEnd?: (() => boolean) | undefined;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const gesture = useRef(createComposerScrollGestureState());
  const restore = useCallback(() => {
    suppressActiveComposerScrollGesture(gesture.current, performance.now(), GESTURE_RESET_MS);
    setCollapsed(false);
  }, []);

  useEffect(() => {
    setCollapsed(false);
    resetComposerScrollGesture(gesture.current);
  }, [input.enabled, input.threadId]);

  useEffect(() => {
    if (!input.enabled) return;
    let frame: number | null = null;
    let removeListeners: (() => void) | null = null;
    const attach = (remainingAttempts: number) => {
      const timeline = input.getTimelineNode?.();
      if (!timeline) {
        // LegendList can mount after the composer effect during a thread switch.
        // Match the timeline navigation listener's bounded readiness retry.
        if (remainingAttempts > 0) {
          frame = requestAnimationFrame(() => {
            frame = null;
            attach(remainingAttempts - 1);
          });
        }
        return;
      }
      const canCollapse = () => input.timelineOverflows?.() === true;
      const atEnd = () => input.isAtLogicalEnd?.() === true;
      const handleScroll = () => {
        if (atEnd() || !canCollapse()) restore();
      };
      const handleWheel = (event: WheelEvent) => {
        if (event.ctrlKey || !(event.target instanceof Element)) return;
        // Nested code blocks and horizontal scrollers own their gestures.
        let target: Element | null = event.target;
        while (target && target !== timeline) {
          if (
            target instanceof HTMLElement &&
            ((target.scrollHeight > target.clientHeight + 1 &&
              /auto|scroll/.test(getComputedStyle(target).overflowY)) ||
              (target.scrollWidth > target.clientWidth + 1 &&
                /auto|scroll/.test(getComputedStyle(target).overflowX)))
          )
            return;
          target = target.parentElement;
        }
        const now = performance.now();
        if (now - gesture.current.lastEventAt > GESTURE_RESET_MS)
          resetComposerScrollGesture(gesture.current);
        const delta =
          event.deltaY *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? timeline.clientHeight : 1);
        if (
          recordComposerScrollGestureEvent(gesture.current, {
            now,
            deltaPx: Math.abs(delta),
            collapseThresholdPx: 24,
            collapseEligible: canCollapse() && Math.abs(event.deltaY) > Math.abs(event.deltaX),
            canScrollInGestureDirection:
              delta < 0
                ? timeline.scrollTop > 1
                : timeline.scrollTop < timeline.scrollHeight - timeline.clientHeight - 1,
            scrollsTowardLogicalEnd: delta > 0 && atEnd(),
          })
        )
          setCollapsed(true);
      };
      const handleKey = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey || !canCollapse()) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))
        )
          return;
        if (
          shouldCollapseComposerForScrollKey({
            key: event.key,
            scrollTop: timeline.scrollTop,
            scrollHeight: timeline.scrollHeight,
            clientHeight: timeline.clientHeight,
            isAtLogicalEnd: atEnd(),
          })
        )
          setCollapsed(true);
      };
      timeline.addEventListener("wheel", handleWheel, { passive: true });
      timeline.addEventListener("scroll", handleScroll, { passive: true });
      timeline.addEventListener("keydown", handleKey);
      const resizeObserver =
        typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleScroll);
      resizeObserver?.observe(timeline);
      removeListeners = () => {
        resizeObserver?.disconnect();
        timeline.removeEventListener("wheel", handleWheel);
        timeline.removeEventListener("scroll", handleScroll);
        timeline.removeEventListener("keydown", handleKey);
      };
    };
    attach(12);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      removeListeners?.();
    };
  }, [
    input.enabled,
    input.threadId,
    input.getTimelineNode,
    input.timelineOverflows,
    input.isAtLogicalEnd,
    restore,
  ]);

  return { collapsed: input.enabled && collapsed, restore };
}
