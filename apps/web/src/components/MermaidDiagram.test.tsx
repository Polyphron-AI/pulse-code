import { describe, expect, it } from "vite-plus/test";

import {
  canRenderMermaidSource,
  MAX_MERMAID_SOURCE_LENGTH,
  MAX_MERMAID_SVG_LENGTH,
  mermaidRenderCacheKey,
} from "./MermaidDiagram";

describe("MermaidDiagram", () => {
  it("rejects empty and oversized sources", () => {
    expect(canRenderMermaidSource("  \n")).toBe(false);
    expect(canRenderMermaidSource("graph TD; A-->B")).toBe(true);
    expect(canRenderMermaidSource("x".repeat(MAX_MERMAID_SOURCE_LENGTH + 1))).toBe(false);
  });

  it("keeps explicit source and output limits", () => {
    expect(MAX_MERMAID_SOURCE_LENGTH).toBe(50_000);
    expect(MAX_MERMAID_SVG_LENGTH).toBe(2_000_000);
  });

  it("uses the theme in cache keys", () => {
    expect(mermaidRenderCacheKey("graph TD; A-->B", "light")).not.toBe(
      mermaidRenderCacheKey("graph TD; A-->B", "dark"),
    );
  });
});
