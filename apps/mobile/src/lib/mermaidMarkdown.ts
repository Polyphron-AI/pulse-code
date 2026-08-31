export type MermaidMarkdownSegment =
  | { readonly kind: "markdown"; readonly text: string }
  | { readonly kind: "mermaid"; readonly source: string; readonly fence: string };

const OPENING_FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

export function splitMermaidMarkdown(markdown: string): ReadonlyArray<MermaidMarkdownSegment> {
  const lines = markdown.split(/(?<=\n)/);
  const segments: MermaidMarkdownSegment[] = [];
  let markdownStart = 0;
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const opening = OPENING_FENCE.exec(line.replace(/\r?\n$/, ""));
    if (!opening) {
      offset += line.length;
      continue;
    }
    const marker = opening[2] ?? "```";
    const info = (opening[3] ?? "").trim();
    const closePattern = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*(?:\\r?\\n)?$`);
    let endIndex = -1;
    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      if (closePattern.test(lines[candidate] ?? "")) {
        endIndex = candidate;
        break;
      }
    }
    if (endIndex === -1) {
      break;
    }
    if (!/^mermaid(?:\s|$)/i.test(info)) {
      for (let candidate = index; candidate <= endIndex; candidate += 1) {
        offset += lines[candidate]?.length ?? 0;
      }
      index = endIndex;
      continue;
    }

    if (offset > markdownStart) {
      segments.push({ kind: "markdown", text: markdown.slice(markdownStart, offset) });
    }
    const fencedLines = lines.slice(index, endIndex + 1);
    const fence = fencedLines.join("");
    segments.push({
      kind: "mermaid",
      source: fencedLines.slice(1, -1).join("").replace(/\n$/, ""),
      fence,
    });
    const consumed = fence.length;
    offset += consumed;
    markdownStart = offset;
    index = endIndex;
  }

  if (markdownStart < markdown.length) {
    segments.push({ kind: "markdown", text: markdown.slice(markdownStart) });
  }
  return segments.length > 0 ? segments : [{ kind: "markdown", text: markdown }];
}
