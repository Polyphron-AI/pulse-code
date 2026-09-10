import { describe, expect, it } from "vite-plus/test";
import { composerDrawerPosition } from "./composerDrawerPosition";

describe("attached composer drawer position", () => {
  it("uses the composer edges and overlaps its top seam", () => {
    expect(
      composerDrawerPosition({
        top: 600,
        left: 100,
        width: 800,
        viewportHeight: 900,
        rootFontSize: 16,
        insetRem: 1.375,
      }),
    ).toEqual({ bottom: 283, left: 122, width: 756, maxHeight: 593 });
  });
  it("follows resized panels and larger text without negative widths", () => {
    const position = composerDrawerPosition({
      top: 40,
      left: 80,
      width: 30,
      viewportHeight: 500,
      rootFontSize: 20,
      insetRem: 1.375,
    });
    expect(position).toEqual({ bottom: 439, left: 107.5, width: 0, maxHeight: 96 });
  });
});
