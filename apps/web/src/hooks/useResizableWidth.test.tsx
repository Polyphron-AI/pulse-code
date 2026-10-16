import { act, useLayoutEffect, type PointerEvent } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useResizableWidth } from "./useResizableWidth";

let renderer: ReactTestRenderer;
let result: ReturnType<typeof useResizableWidth>;
let captured = false;
const target = {
  setPointerCapture: () => {
    captured = true;
  },
  hasPointerCapture: () => captured,
  releasePointerCapture: () => {
    captured = false;
  },
};
const style = {
  cursor: "",
  userSelect: "",
  removeProperty(property: string) {
    if (property === "cursor") this.cursor = "";
    if (property === "user-select") this.userSelect = "";
  },
};
const savedWidths = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => savedWidths.set(key, value));
const cancelAnimationFrame = vi.fn();
let events: EventTarget;
let frame: FrameRequestCallback | undefined;

function pointer(clientX = 100) {
  return {
    button: 0,
    pointerId: 1,
    clientX,
    currentTarget: target,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as PointerEvent<HTMLElement>;
}

function Panel({
  edge = "left",
  maxWidth = 800,
  storageKey = "test-panel-width",
  storage,
}: {
  edge?: "left" | "right";
  maxWidth?: number;
  storageKey?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
}) {
  const resize = useResizableWidth({
    storageKey,
    defaultWidth: 400,
    minWidth: 200,
    maxWidth,
    edge,
    ...(storage ? { storage } : {}),
  });
  useLayoutEffect(() => {
    result = resize;
  });
  return null;
}

beforeEach(async () => {
  savedWidths.clear();
  captured = false;
  frame = undefined;
  style.cursor = "";
  style.userSelect = "";
  events = new EventTarget();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    localStorage: { getItem: (key: string) => savedWidths.get(key) ?? null, setItem },
  });
  vi.stubGlobal("document", { body: { style } });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 42;
  });
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  await act(() => {
    renderer = create(<Panel />);
  });
});

afterEach(async () => {
  await act(() => renderer.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("panel resize cleanup", () => {
  it.each(["unmount", "lost capture", "blur", "cancel"])(
    "clears the cursor and pending resize after %s",
    async (reason) => {
      await act(() => {
        result.handlers.onPointerDown(pointer());
        result.handlers.onPointerMove(pointer(50));
      });
      await act(() => frame?.(0));
      expect(result.width).toBe(450);
      // Queue another move to check that interruption cancels pending work too.
      await act(() => result.handlers.onPointerMove(pointer(25)));
      expect(style.cursor).toBe("col-resize");
      expect(style.userSelect).toBe("none");
      await act(() => {
        if (reason === "unmount") renderer.unmount();
        if (reason === "lost capture") result.handlers.onLostPointerCapture(pointer());
        if (reason === "blur") events.dispatchEvent(new Event("blur"));
        if (reason === "cancel") result.handlers.onPointerCancel(pointer());
      });
      expect(style.cursor).toBe("");
      expect(style.userSelect).toBe("");
      expect(captured).toBe(false);
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      if (reason === "unmount") {
        expect(setItem).not.toHaveBeenCalled();
      } else {
        expect(result.width).toBe(475);
        expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      }
    },
  );

  it.each(["left", "right"] as const)(
    "uses the release position for a fast %s-edge drag",
    async (edge) => {
      await act(() => renderer.update(<Panel edge={edge} />));
      await act(() => {
        result.handlers.onPointerDown(pointer());
        result.handlers.onPointerMove(pointer(edge === "left" ? 50 : 150));
        result.handlers.onPointerUp(pointer(edge === "left" ? 25 : 175));
      });
      expect(result.width).toBe(475);
      expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    },
  );

  it.each([
    [800, 450],
    [450, 800],
  ])("uses updated bounds during a drag from max %s to %s", async (initialMax, nextMax) => {
    await act(() => renderer.update(<Panel maxWidth={initialMax} />));
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(-200));
    });
    await act(() => frame?.(0));
    expect(result.width).toBe(Math.min(700, initialMax));
    await act(() => renderer.update(<Panel maxWidth={nextMax} />));
    await act(() => result.handlers.onPointerMove(pointer(-250)));
    await act(() => frame?.(0));
    expect(result.width).toBe(Math.min(750, nextMax));
    await act(() => result.handlers.onPointerUp(pointer(-300)));
    expect(result.width).toBe(nextMax);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", String(nextMax));
  });

  it("handles release before any move event", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerUp(pointer(25));
    });
    expect(result.width).toBe(475);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
  });

  it("clamps the release position to the panel bounds", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerUp(pointer(-1000));
    });
    expect(result.width).toBe(800);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "800");
  });

  it("saves the final width when release is followed by lost capture", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(50));
      result.handlers.onPointerUp(pointer(50));
      result.handlers.onLostPointerCapture(pointer(50));
    });
    expect(result.width).toBe(450);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "450");
    expect(style.cursor).toBe("");
    expect(captured).toBe(false);
  });
});

describe("panel width storage changes", () => {
  it("restores separate thread widths without remounting and retains them after reload", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(50));
      result.handlers.onPointerUp(pointer(50));
    });
    expect(result.width).toBe(450);
    await act(() => renderer.update(<Panel storageKey="thread-b" />));
    expect(result.width).toBe(400);
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(-100));
      result.handlers.onPointerUp(pointer(-100));
    });
    expect(result.width).toBe(600);
    await act(() => renderer.update(<Panel />));
    expect(result.width).toBe(450);
    await act(() => renderer.unmount());
    await act(() => {
      renderer = create(<Panel storageKey="thread-b" />);
    });
    expect(result.width).toBe(600);
  });

  it("cancels an unfinished drag on a thread switch without saving it to either thread", async () => {
    savedWidths.set("thread-b", "650");
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(50));
    });
    await act(() => frame?.(0));
    expect(result.width).toBe(450);
    await act(() => result.handlers.onPointerMove(pointer(25)));
    await act(() => renderer.update(<Panel storageKey="thread-b" />));
    expect(result.width).toBe(650);
    expect(captured).toBe(false);
    expect(style.cursor).toBe("");
    await act(() => {
      frame?.(0);
      result.handlers.onPointerUp(pointer(25));
    });
    expect(result.width).toBe(650);
    expect(setItem).not.toHaveBeenCalled();
    await act(() => renderer.update(<Panel />));
    expect(result.width).toBe(400);
  });
});

it("keyboard resizing persists independently for each workspace space", async () => {
  await act(() => renderer.update(<Panel storageKey="mail-width" />));
  await act(() => result.setWidth(300));
  expect(savedWidths.get("mail-width")).toBe("300");
  await act(() => renderer.update(<Panel storageKey="projects-width" />));
  expect(result.width).toBe(400);
  await act(() => result.setWidth(500));
  await act(() => renderer.update(<Panel storageKey="mail-width" />));
  expect(result.width).toBe(300);
  expect(savedWidths.get("projects-width")).toBe("500");
});

it("isolates injected storage for reads, keyboard writes and drag completion, and restores a new session", async () => {
  savedWidths.set("test-panel-width", "700");
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
  await act(() => renderer.update(<Panel storage={storage} />));
  expect(result.width).toBe(400);
  await act(() => result.setWidth(300));
  expect(values.get("test-panel-width")).toBe("300");
  await act(() => {
    result.handlers.onPointerDown(pointer());
    result.handlers.onPointerUp(pointer(50));
  });
  expect(values.get("test-panel-width")).toBe("350");
  expect(savedWidths.get("test-panel-width")).toBe("700");
  expect(setItem).not.toHaveBeenCalled();
  const next = { getItem: () => "525", setItem: vi.fn() };
  await act(() => renderer.update(<Panel storage={next} />));
  expect(result.width).toBe(525);
});

it.each(['"300"', "null", '"Infinity"', "invalid"])(
  "rejects invalid injected width %s without live fallback",
  async (stored) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    savedWidths.set("test-panel-width", "700");
    await act(() =>
      renderer.update(<Panel storage={{ getItem: () => stored, setItem: vi.fn() }} />),
    );
    expect(result.width).toBe(400);
  },
);

it("cancels an active drag when injected storage identity changes", async () => {
  const first = { getItem: () => "300", setItem: vi.fn() };
  const next = { getItem: () => "500", setItem: vi.fn() };
  await act(() => renderer.update(<Panel storage={first} />));
  await act(() => result.handlers.onPointerDown(pointer()));
  await act(() => renderer.update(<Panel storage={next} />));
  await act(() => result.handlers.onPointerUp(pointer(50)));
  expect(result.width).toBe(500);
  expect(first.setItem).not.toHaveBeenCalled();
  expect(next.setItem).not.toHaveBeenCalled();
});
