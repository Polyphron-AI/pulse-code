import { act } from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { ComposerStashMenu } from "./ComposerStashMenu";

vi.mock("../ui/command", () => ({
  Command: "section",
  CommandGroup: "section",
  CommandGroupLabel: "label",
  CommandItem: "article",
  CommandList: "section",
}));
vi.mock("../ui/button", () => ({ Button: "button" }));

it("dismisses outside the drawer, preserves inside and badge clicks, and removes its listener", async () => {
  const listeners = new Set<(event: Event) => void>();
  const documentTarget = {
    addEventListener: (_name: string, listener: (event: Event) => void) => listeners.add(listener),
    removeEventListener: (_name: string, listener: (event: Event) => void) =>
      listeners.delete(listener),
    dispatchEvent: (event: Event) => listeners.forEach((listener) => listener(event)),
  };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  class SyntheticElement extends EventTarget {
    constructor(readonly badge = false) {
      super();
    }
    closest() {
      return this.badge ? this : null;
    }
  }
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("Element", SyntheticElement);
  const drawer = new SyntheticElement();
  const close = vi.fn();
  let renderer: ReturnType<typeof create> | undefined;
  function pointer(target: SyntheticElement, path: EventTarget[]) {
    const event = new Event("pointerdown");
    Object.defineProperty(event, "target", { value: target });
    Object.defineProperty(event, "composedPath", { value: () => path });
    documentTarget.dispatchEvent(event);
  }
  try {
    await act(async () => {
      renderer = create(
        <ComposerStashMenu entries={[]} onRestore={() => {}} onDelete={() => {}} onClose={close} />,
        {
          createNodeMock: (element) => (element.type === "div" ? drawer : null),
        },
      );
    });
    pointer(new SyntheticElement(), [drawer]);
    pointer(new SyntheticElement(true), []);
    expect(close).not.toHaveBeenCalled();
    pointer(new SyntheticElement(), []);
    expect(close).toHaveBeenCalledTimes(1);
    renderer!.root.findByProps({ "aria-label": "Close stash" }).props.onClick();
    expect(close).toHaveBeenCalledTimes(2);
    await act(async () => {
      renderer?.unmount();
    });
    renderer = undefined;
    pointer(new SyntheticElement(), []);
    expect(close).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    vi.unstubAllGlobals();
  }
});
