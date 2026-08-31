import mermaid from "mermaid";

type RenderRequest = {
  readonly id: string;
  readonly source: string;
  readonly theme: "light" | "dark";
};

const MAX_SOURCE_LENGTH = 50_000;
const MAX_OUTPUT_DIMENSION = 4096;
const MAX_OUTPUT_PIXELS = 4_000_000;
const MAX_DATA_URL_LENGTH = 8_000_000;
const RENDERER_VERSION = "mermaid-11";

function respond(value: unknown): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(value));
}

async function render(request: RenderRequest): Promise<void> {
  if (!request.id || !request.source.trim() || request.source.length > MAX_SOURCE_LENGTH) {
    respond({ id: request.id, ok: false });
    return;
  }
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: request.theme === "dark" ? "dark" : "default",
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    });
    const { svg } = await mermaid.render(`mobile-mermaid-${request.id}`, request.source);
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgElement = document.documentElement;
    const viewBox = svgElement.getAttribute("viewBox")?.trim().split(/[ ,]+/).map(Number);
    const logicalWidth =
      viewBox?.length === 4 ? viewBox[2] : Number(svgElement.getAttribute("width"));
    const logicalHeight =
      viewBox?.length === 4 ? viewBox[3] : Number(svgElement.getAttribute("height"));
    if (
      !logicalWidth ||
      !logicalHeight ||
      !Number.isFinite(logicalWidth) ||
      !Number.isFinite(logicalHeight) ||
      logicalWidth <= 0 ||
      logicalHeight <= 0
    ) {
      throw new Error("Mermaid returned invalid dimensions");
    }
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        2,
        MAX_OUTPUT_DIMENSION / Math.max(logicalWidth, logicalHeight),
        Math.sqrt(MAX_OUTPUT_PIXELS / (logicalWidth * logicalHeight)),
      );
      const width = Math.max(1, Math.round(logicalWidth * scale));
      const height = Math.max(1, Math.round(logicalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        respond({ id: request.id, ok: false });
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      const uri = canvas.toDataURL("image/png");
      if (uri.length > MAX_DATA_URL_LENGTH) {
        respond({ id: request.id, ok: false });
        return;
      }
      respond({
        id: request.id,
        ok: true,
        uri,
        width: logicalWidth,
        height: logicalHeight,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      respond({ id: request.id, ok: false });
    };
    image.src = objectUrl;
  } catch {
    respond({ id: request.id, ok: false });
  }
}

window.addEventListener("message", (event) => {
  try {
    void render(JSON.parse(String(event.data)) as RenderRequest);
  } catch {
    respond({ id: "", ok: false });
  }
});

respond({ type: "ready", version: RENDERER_VERSION });

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(value: string): void };
  }
}
