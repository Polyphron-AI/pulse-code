import type { PreviewAnnotationPayload } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { annotationCaptureMetadata, issueCaptureOrigin } from "./IssueCaptureDialog";

const annotation: PreviewAnnotationPayload = {
  id: "annotation-1",
  pageUrl: "http://localhost:5173/checkout",
  pageTitle: "Checkout",
  comment: "Total is incorrect",
  elements: [],
  regions: [],
  strokes: [],
  styleChanges: [],
  screenshot: {
    dataUrl: "data:image/png;base64,large-payload",
    width: 1200,
    height: 800,
    cropRect: { x: 0, y: 0, width: 1200, height: 800 },
  },
  createdAt: "2026-08-19T00:00:00.000Z",
};

describe("Issue capture review", () => {
  it("derives the actual preview page origin", () => {
    expect(issueCaptureOrigin("http://localhost:5173/checkout?cart=1")).toBe(
      "http://localhost:5173",
    );
    expect(issueCaptureOrigin("https://preview.example.com/path")).toBe(
      "https://preview.example.com",
    );
    expect(issueCaptureOrigin("file:///tmp/index.html")).toBeNull();
    expect(issueCaptureOrigin("not a url")).toBeNull();
  });

  it("preserves annotation structure without duplicating screenshot bytes in metadata", () => {
    const metadata = annotationCaptureMetadata(annotation);
    expect(metadata).toMatchObject({
      annotation: {
        id: "annotation-1",
        comment: "Total is incorrect",
        screenshot: { width: 1200, height: 800 },
      },
    });
    expect(JSON.stringify(metadata)).not.toContain("large-payload");
  });
});
