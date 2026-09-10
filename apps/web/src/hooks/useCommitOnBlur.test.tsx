import { act, type KeyboardEvent } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useCommitOnBlur } from "./useCommitOnBlur";

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});
describe("settings input composition", () => {
  it.each([
    { isComposing: true, keyCode: 13, blurred: false },
    { isComposing: false, keyCode: 229, blurred: false },
    { isComposing: false, keyCode: 13, blurred: true },
  ])("handles Enter with $isComposing / $keyCode", ({ isComposing, keyCode, blurred }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let props: ReturnType<typeof useCommitOnBlur>;
    function Probe() {
      props = useCommitOnBlur("value", vi.fn());
      return null;
    }
    act(() => {
      renderer = create(<Probe />);
    });
    const blur = vi.fn();
    const preventDefault = vi.fn();
    act(() =>
      props!.onKeyDown({
        key: "Enter",
        keyCode,
        nativeEvent: { isComposing },
        target: { blur },
        preventDefault,
      } as unknown as KeyboardEvent<HTMLInputElement>),
    );
    expect(blur).toHaveBeenCalledTimes(blurred ? 1 : 0);
    expect(preventDefault).toHaveBeenCalledTimes(blurred ? 1 : 0);
  });
});
