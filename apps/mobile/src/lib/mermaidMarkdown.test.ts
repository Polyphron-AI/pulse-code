import { describe, expect, it } from "vite-plus/test";

import { splitMermaidMarkdown } from "./mermaidMarkdown";

describe("splitMermaidMarkdown", () => {
  it("extracts completed Mermaid fences and preserves surrounding Markdown", () => {
    expect(splitMermaidMarkdown("Before\n\n```mermaid\ngraph TD; A-->B\n```\n\nAfter")).toEqual([
      { kind: "markdown", text: "Before\n\n" },
      {
        kind: "mermaid",
        source: "graph TD; A-->B",
        fence: "```mermaid\ngraph TD; A-->B\n```\n",
      },
      { kind: "markdown", text: "\nAfter" },
    ]);
  });

  it("leaves unclosed and non-Mermaid fences alone", () => {
    const markdown = "```mermaid\ngraph TD; A-->B";
    expect(splitMermaidMarkdown(markdown)).toEqual([{ kind: "markdown", text: markdown }]);
    expect(splitMermaidMarkdown("```ts\nconst x = 1\n```")).toEqual([
      { kind: "markdown", text: "```ts\nconst x = 1\n```" },
    ]);
  });

  it("supports tilde fences and case-insensitive language names", () => {
    expect(splitMermaidMarkdown("~~~Mermaid\nsequenceDiagram\n~~~")[0]).toMatchObject({
      kind: "mermaid",
      source: "sequenceDiagram",
    });
  });

  it("does not extract Mermaid-looking text inside another fence", () => {
    const markdown = "````markdown\n```mermaid\ngraph TD; A-->B\n```\n````";
    expect(splitMermaidMarkdown(markdown)).toEqual([{ kind: "markdown", text: markdown }]);
  });
});
