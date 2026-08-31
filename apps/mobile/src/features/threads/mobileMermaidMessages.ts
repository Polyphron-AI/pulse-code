export const MOBILE_MERMAID_RENDERER_VERSION = "mermaid-11";

export type MermaidPng = {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
};

export type RendererMessage =
  | { readonly type: "ready" }
  | { readonly type: "result"; readonly id: string; readonly result: MermaidPng | null };

export function decodeMermaidRendererMessage(value: string): RendererMessage | null {
  try {
    const message = JSON.parse(value) as Record<string, unknown>;
    if (message.type === "ready" && message.version === MOBILE_MERMAID_RENDERER_VERSION) {
      return { type: "ready" };
    }
    if (typeof message.id !== "string") return null;
    if (
      message.ok !== true ||
      typeof message.uri !== "string" ||
      !message.uri.startsWith("data:image/png;base64,") ||
      typeof message.width !== "number" ||
      typeof message.height !== "number" ||
      !Number.isFinite(message.width) ||
      !Number.isFinite(message.height) ||
      message.width <= 0 ||
      message.height <= 0
    ) {
      return { type: "result", id: message.id, result: null };
    }
    return {
      type: "result",
      id: message.id,
      result: {
        uri: message.uri,
        width: message.width,
        height: message.height,
        bytes: message.uri.length * 2,
      },
    };
  } catch {
    return null;
  }
}
