import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  serializeRenderedMarkdownFragment,
  serializeTableElementToHtml,
  writeTableToClipboard,
} from "./markdown-clipboard";

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

class FakeText {
  readonly nodeType = TEXT_NODE;
  readonly childNodes: ReadonlyArray<never> = [];

  constructor(readonly textContent: string) {}
}

class FakeElement {
  readonly nodeType = ELEMENT_NODE;
  readonly childNodes: Array<FakeElement | FakeText> = [];
  readonly classList = {
    contains: (name: string) => this.classNames.includes(name),
  };

  constructor(
    readonly tagName: string,
    private readonly classNames: ReadonlyArray<string> = [],
    private readonly attributes: Record<string, string> = {},
  ) {}

  readonly style = { textAlign: "" };

  get localName(): string {
    return this.tagName.toLowerCase();
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  append(...children: Array<FakeElement | FakeText>): this {
    this.childNodes.push(...children);
    return this;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  hasAttribute(): boolean {
    return false;
  }
}

function asNode(element: FakeElement): Node {
  return element as unknown as Node;
}

function shikiCodeLine(text: string): FakeElement {
  const token = new FakeElement("SPAN").append(new FakeText(text));
  return new FakeElement("SPAN", ["line"]).append(token);
}

describe("serializeRenderedMarkdownFragment", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Node",
      class {
        static TEXT_NODE = TEXT_NODE;
        static ELEMENT_NODE = ELEMENT_NODE;
        readonly nodeType = 0;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps inline code in backticks", () => {
    const paragraph = new FakeElement("P").append(
      new FakeText("run "),
      new FakeElement("CODE").append(new FakeText("git status")),
      new FakeText(" first"),
    );
    const container = new FakeElement("DIV").append(paragraph);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe("run `git status` first");
  });

  it("keeps a highlighted block code selection plain when its pre wrapper is outside the range", () => {
    const code = new FakeElement("CODE").append(
      shikiCodeLine("git show-ref --verify refs/remotes/origin/opt/deploy/dev"),
    );
    const container = new FakeElement("DIV").append(code);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe(
      "git show-ref --verify refs/remotes/origin/opt/deploy/dev",
    );
  });

  it("keeps a multi-line code selection plain instead of inline-wrapping it", () => {
    const code = new FakeElement("CODE").append(new FakeText("first line\nsecond line"));
    const container = new FakeElement("DIV").append(code);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe("first line\nsecond line");
  });
});

describe("table exports", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Node",
      class {
        static TEXT_NODE = TEXT_NODE;
        static ELEMENT_NODE = ELEMENT_NODE;
        readonly nodeType = 0;
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function table(): Element {
    return asNode(
      new FakeElement("TABLE", [], { style: "width:1px;overflow:hidden" }).append(
        new FakeElement("TBODY").append(
          new FakeElement("TR").append(
            new FakeElement("TD").append(
              new FakeElement("STRONG").append(new FakeText("Full <text> & details")),
            ),
            new FakeElement("TD").append(
              new FakeElement("A", [], { href: "javascript:alert(1)", onclick: "alert(1)" }).append(
                new FakeText("Unsafe link"),
              ),
              new FakeElement("IMG", [], {
                src: "https://example.com/image.png",
                alt: "Image description",
              }),
              new FakeElement("SCRIPT").append(new FakeText("alert(1)")),
              new FakeElement("BUTTON").append(new FakeText("Copy")),
            ),
          ),
        ),
      ),
    ) as Element;
  }

  it("exports all cell content and formatting without clipping, controls, scripts, or resource URLs", () => {
    const html = serializeTableElementToHtml(table());
    expect(html).toContain("<strong>Full &lt;text&gt; &amp; details</strong>");
    expect(html).toContain("Unsafe link");
    expect(html).toContain("Image description");
    expect(html).toContain("white-space:normal");
    expect(html).not.toMatch(
      /javascript:|onclick|<img|<script|<button|example.com|overflow:hidden/,
    );
  });

  it("writes HTML and readable plain text together", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly data: Record<string, Blob>) {}
      },
    );
    await writeTableToClipboard(table(), "html");
    const item = write.mock.calls[0]?.[0][0];
    expect(await item.data["text/html"].text()).toContain("<table");
    expect(await item.data["text/plain"].text()).toContain("Full <text> & details");
  });

  it("falls back to HTML source when rich clipboard writing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("ClipboardItem", undefined);
    await writeTableToClipboard(table(), "html");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("<table"));
  });

  it("rejects unsupported PNG copying rather than claiming success", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    vi.stubGlobal("ClipboardItem", undefined);
    await expect(writeTableToClipboard(table(), "png")).rejects.toThrow("PNG");
  });

  it("propagates a failed clipboard write", async () => {
    const cause = new Error("Permission denied");
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn().mockRejectedValue(cause) } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly data: Record<string, Blob>) {}
      },
    );
    await expect(writeTableToClipboard(table(), "html")).rejects.toBe(cause);
  });

  function stubPngRendering(width = 900, height = 300) {
    const remove = vi.fn();
    const context = { scale: vi.fn(), drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: (blob: Blob | null) => void) =>
        callback(new Blob(["png"], { type: "image/png" })),
    };
    const container = {
      style: { cssText: "" },
      innerHTML: "",
      setAttribute: vi.fn(),
      append: vi.fn(),
      remove,
      getBoundingClientRect: () => ({ width, height }),
      querySelector: () => ({ cloneNode: () => ({}) }),
    };
    let loaded: (() => void) | undefined;
    let failed: (() => void) | undefined;
    let imageSource = "";
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    vi.stubGlobal("document", {
      body: { append: vi.fn() },
      createElement: (name: string) => (name === "canvas" ? canvas : container),
    });
    vi.stubGlobal(
      "XMLSerializer",
      class {
        serializeToString() {
          return '<div xmlns="http://www.w3.org/1999/xhtml">Complete table</div>';
        }
      },
    );
    vi.stubGlobal(
      "Image",
      class {
        addEventListener(event: string, callback: () => void) {
          if (event === "load") loaded = callback;
          else failed = callback;
        }
        set src(value: string) {
          imageSource = value;
        }
      },
    );
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly data: Record<string, Promise<Blob>>) {}
      },
    );
    const write = vi.fn(async ([item]: Array<{ data: Record<string, Promise<Blob>> }>) => {
      if (!item) throw new Error("Missing clipboard item");
      await item.data["image/png"];
    });
    vi.stubGlobal("navigator", { clipboard: { write } });
    return {
      write,
      canvas,
      context,
      remove,
      container,
      load: () => loaded?.(),
      fail: () => failed?.(),
      source: () => imageSource,
    };
  }

  it("starts the clipboard write before PNG decoding and exports full measured bounds", async () => {
    const rendering = stubPngRendering();
    const copied = writeTableToClipboard(table(), "png");
    expect(rendering.write).toHaveBeenCalledOnce();
    expect(rendering.write.mock.calls[0]?.[0][0]?.data["image/png"]).toBeInstanceOf(Promise);
    expect(decodeURIComponent(rendering.source())).toContain('width="900" height="300"');
    expect(rendering.container.innerHTML).toContain("Full &lt;text&gt; &amp; details");
    rendering.load();
    await copied;
    expect((await rendering.write.mock.calls[0]?.[0][0]?.data["image/png"])?.type).toBe(
      "image/png",
    );
    expect(rendering.canvas.width).toBe(1800);
    expect(rendering.canvas.height).toBe(600);
    expect(rendering.context.drawImage).toHaveBeenCalledOnce();
    expect(rendering.remove).toHaveBeenCalledOnce();
  });

  it("rejects oversized PNGs and cleans up instead of truncating them", async () => {
    const rendering = stubPngRendering(20000);
    await expect(writeTableToClipboard(table(), "png")).rejects.toThrow("too large");
    expect(rendering.context.drawImage).not.toHaveBeenCalled();
    expect(rendering.remove).toHaveBeenCalledOnce();
  });

  it("cleans up when PNG image decoding fails", async () => {
    const rendering = stubPngRendering();
    const copied = writeTableToClipboard(table(), "png");
    rendering.fail();
    await expect(copied).rejects.toThrow("Could not render");
    expect(rendering.context.drawImage).not.toHaveBeenCalled();
    expect(rendering.remove).toHaveBeenCalledOnce();
  });
});
