import { describe, expect, it } from "vite-plus/test";

import { decodeMermaidRendererMessage } from "./mobileMermaidMessages";

describe("decodeMermaidRendererMessage", () => {
  it("accepts only the matching renderer handshake", () => {
    expect(decodeMermaidRendererMessage('{"type":"ready","version":"mermaid-11"}')).toEqual({
      type: "ready",
    });
    expect(decodeMermaidRendererMessage('{"type":"ready","version":"old"}')).toBeNull();
  });

  it("validates PNG results and dimensions", () => {
    expect(
      decodeMermaidRendererMessage(
        '{"id":"one","ok":true,"uri":"data:image/png;base64,AA==","width":120,"height":80}',
      ),
    ).toMatchObject({ type: "result", id: "one", result: { width: 120, height: 80 } });
    expect(
      decodeMermaidRendererMessage(
        '{"id":"one","ok":true,"uri":"https://example.com/x.png","width":120,"height":80}',
      ),
    ).toEqual({ type: "result", id: "one", result: null });
  });

  it("ignores malformed messages", () => {
    expect(decodeMermaidRendererMessage("not json")).toBeNull();
    expect(decodeMermaidRendererMessage("{}")).toBeNull();
  });
});
