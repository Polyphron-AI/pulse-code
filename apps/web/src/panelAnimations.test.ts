import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./hooks/useMediaQuery", () => ({ useMediaQuery: vi.fn() }));
vi.mock("./hooks/useSettings", () => ({ useClientSettings: vi.fn() }));
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useClientSettings } from "./hooks/useSettings";
import { observeResponsiveBreakpointFade, usePanelAnimationSettings } from "./panelAnimations";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("panel motion", () => {
  it.each([
    [0, false, false],
    [200, true, false],
    [200, false, true],
  ] as const)("duration %i, reduced motion %s yields active %s", (durationMs, reduced, active) => {
    vi.mocked(useClientSettings).mockReturnValue(durationMs);
    vi.mocked(useMediaQuery).mockReturnValue(reduced);
    function Probe() {
      return createElement("span", null, JSON.stringify(usePanelAnimationSettings()));
    }
    expect(renderToStaticMarkup(createElement(Probe))).toContain(`&quot;active&quot;:${active}`);
    expect(useMediaQuery).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("does not register observers while motion is disabled", () => {
    const observer = vi.fn();
    vi.stubGlobal("ResizeObserver", observer);
    const element = {} as HTMLElement;
    observeResponsiveBreakpointFade({
      target: element,
      container: element,
      active: false,
      durationMs: 0,
      breakpoint: { value: 48, unit: "rem" },
    })();
    expect(observer).not.toHaveBeenCalled();
  });

  it("animates only breakpoint crossings, caps fades and cancels on disposal", () => {
    let notify: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    const observe = vi.fn();
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({ fontSize: "20px" }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const target = { animate } as unknown as HTMLElement;
    const container = { getBoundingClientRect: () => ({ width: 1000 }) } as HTMLElement;
    const stop = observeResponsiveBreakpointFade({
      target,
      container,
      active: true,
      durationMs: 200,
      breakpoint: { value: 48, unit: "rem" },
    });
    const resize = (width: number) =>
      notify([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    resize(990);
    resize(960);
    expect(animate).not.toHaveBeenCalled();
    resize(959);
    expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 100,
      easing: "ease-out",
    });
    resize(940);
    expect(animate).toHaveBeenCalledTimes(1);
    resize(1000);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledTimes(2);
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledWith(container);
  });
});
