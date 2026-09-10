import { describe, expect, it } from "vite-plus/test";
import { extractMailLinks, safeMailUrl } from "./mailPresentation";

describe("mail source links", () => {
  it("allows only absolute web destinations without embedded credentials", () => {
    expect(safeMailUrl("https://example.com/invoice?id=4")).toBe(
      "https://example.com/invoice?id=4",
    );
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>bad</script>",
      "file:///private",
      "//example.com",
      "https://name:password@example.com",
    ])
      expect(safeMailUrl(url)).toBeNull();
  });
  it("deduplicates links in the original plain-text body", () => {
    expect(
      extractMailLinks(null, "See https://example.com/item and https://example.com/item"),
    ).toEqual(["https://example.com/item"]);
  });
});
