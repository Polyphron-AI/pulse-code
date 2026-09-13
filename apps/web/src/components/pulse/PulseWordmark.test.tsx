import { PRODUCT_BASE_NAME } from "@t3tools/shared/productIdentity";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { PULSE_BRAND_ACCENT, PulseWordmark } from "./PulseWordmark";

describe("PulseWordmark", () => {
  it("renders the product name from the shared identity, not a hardcoded literal", () => {
    const html = renderToStaticMarkup(<PulseWordmark />);

    expect(html).toContain(PRODUCT_BASE_NAME);
    expect(html).not.toContain("T3");
  });

  it("carries its own accessible name so call sites need no aria-label", () => {
    const html = renderToStaticMarkup(<PulseWordmark />);

    expect(html).toContain(`role="img"`);
    expect(html).toContain(`aria-label="${PRODUCT_BASE_NAME}"`);
  });

  it("paints the accent in the Pulse palette", () => {
    const html = renderToStaticMarkup(<PulseWordmark />);

    expect(html.toLowerCase()).toContain(PULSE_BRAND_ACCENT.toLowerCase());
  });

  it("passes the slot sizing through to the mark", () => {
    const html = renderToStaticMarkup(<PulseWordmark className="h-4" />);

    expect(html).toContain("h-4");
  });
});
