import { PRODUCT_BASE_NAME } from "@t3tools/shared/productIdentity";
import { act } from "react";
import TestRenderer, { type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vite-plus/test";

import { PULSE_BRAND_ACCENT, PulseWordmark } from "./PulseWordmark";

describe("PulseWordmark", () => {
  async function renderWordmark(className?: string) {
    let renderer: ReactTestRenderer | undefined;

    await act(() => {
      renderer = TestRenderer.create(
        className === undefined ? <PulseWordmark /> : <PulseWordmark className={className} />,
      );
    });

    return renderer!;
  }

  it("renders an accessible Pulse product wordmark", async () => {
    const renderer = await renderWordmark();

    const image = renderer.root.findByProps({ role: "img" });
    expect(image.props["aria-label"]).toBe(PRODUCT_BASE_NAME);
    expect(
      image.findAllByType("span").some((node) => node.children.includes(PRODUCT_BASE_NAME)),
    ).toBe(true);

    const accent = renderer.root.findByProps({ "aria-hidden": true });
    expect(accent.props.style.backgroundColor).toBe(PULSE_BRAND_ACCENT);

    await act(() => renderer.unmount());
  });

  it("passes the slot sizing through to the visible wordmark", async () => {
    const renderer = await renderWordmark("h-4");

    expect(renderer.root.findByProps({ role: "img" }).findByType("span").props.className).toContain(
      "h-4",
    );

    await act(() => renderer.unmount());
  });
});
