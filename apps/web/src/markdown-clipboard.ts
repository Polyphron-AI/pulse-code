/**
 * Converts a DOM selection inside rendered chat markdown back into markdown
 * source so highlight-and-copy keeps formatting (links, emphasis, lists,
 * fences, tables) instead of flattening to plain text. The `text/plain`
 * clipboard flavor carries the markdown; `text/html` carries a sanitized
 * copy of the rendered fragment for rich-paste targets.
 */

const SKIPPED_TAGS = new Set(["BUTTON", "INPUT", "SCRIPT", "STYLE", "TEMPLATE"]);
const SKIPPED_CLASS_NAMES = ["select-none", "sr-only"];
const SANITIZED_HTML_SELECTOR = [
  "button",
  "input",
  "script",
  "style",
  "svg",
  '[aria-hidden="true"]',
  ...SKIPPED_CLASS_NAMES.map((className) => `.${className}`),
].join(", ");

export interface MarkdownClipboardPayload {
  text: string;
  html: string;
}

function isSkippedElement(element: Element): boolean {
  if (SKIPPED_TAGS.has(element.tagName) || element.localName === "svg") return true;
  if (element.getAttribute("aria-hidden") === "true") return true;
  return SKIPPED_CLASS_NAMES.some((className) => element.classList.contains(className));
}

/** Hoists surrounding whitespace outside the markers: "` bold `" → " **bold** ". */
function wrapInlineMarker(content: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content);
  const core = match?.[2] ?? "";
  if (!core) return content;
  return `${match?.[1] ?? ""}${marker}${core}${marker}${match?.[3] ?? ""}`;
}

/**
 * A code element whose pre wrapper fell outside the copied range is still
 * block code, recognizable by its highlighter line spans or embedded
 * newlines. Wrapping it like inline code produces backtick-surrounded
 * shell commands on paste.
 */
function isBlockCodeElement(element: Element, content: string): boolean {
  if (content.includes("\n")) return true;
  for (const child of element.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).classList.contains("line")) {
      return true;
    }
  }
  return false;
}

function wrapInlineCode(code: string): string {
  const longestRun = [...(code.match(/`+/g) ?? [])].reduce(
    (max, run) => Math.max(max, run.length),
    0,
  );
  const fence = "`".repeat(Math.max(1, longestRun + (longestRun > 0 ? 1 : 0)));
  const pad = code.startsWith("`") || code.endsWith("`") ? " " : "";
  return `${fence}${pad}${code}${pad}${fence}`;
}

function codeFenceFor(code: string): string {
  const longestRun = [...(code.match(/`{3,}/g) ?? [])].reduce(
    (max, run) => Math.max(max, run.length),
    0,
  );
  return "`".repeat(Math.max(3, longestRun + 1));
}

function resolveCodeBlockLanguage(pre: Element): string | null {
  const declared =
    pre.closest("[data-language]")?.getAttribute("data-language") ??
    /(?:^|\s)language-(\S+)/.exec(pre.querySelector("code")?.className ?? "")?.[1] ??
    null;
  return declared && declared !== "text" ? declared : null;
}

function serializeCodeBlock(pre: Element): string {
  const code = (pre.textContent ?? "").replace(/\n$/, "");
  const fence = codeFenceFor(code);
  return `${fence}${resolveCodeBlockLanguage(pre) ?? ""}\n${code}\n${fence}\n\n`;
}

function serializeTableCell(cell: Element): string {
  return serializeChildren(cell).replace(/\n+/g, " ").trim().replaceAll("|", "\\|");
}

function tableSeparatorFor(headerCells: Element[]): string {
  const markers = headerCells.map((cell) => {
    const align = (cell as HTMLElement).style?.textAlign ?? cell.getAttribute("align") ?? "";
    if (align === "center") return ":---:";
    if (align === "right") return "---:";
    return "---";
  });
  return `| ${markers.join(" | ")} |`;
}

function serializeTable(table: Element): string {
  const rows = [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
  if (rows.length === 0) return "";
  const lines: string[] = [];
  let emittedSeparator = false;
  for (const row of rows) {
    const cells = [...row.children].filter(
      (cell) => cell.tagName === "TH" || cell.tagName === "TD",
    );
    if (cells.length === 0) continue;
    lines.push(`| ${cells.map((cell) => serializeTableCell(cell)).join(" | ")} |`);
    if (!emittedSeparator) {
      lines.push(tableSeparatorFor(cells));
      emittedSeparator = true;
    }
  }
  return `${lines.join("\n")}\n\n`;
}

function serializeListItem(item: Element, ordered: boolean, index: number): string {
  const checkbox = item.querySelector('input[type="checkbox"]');
  const task = checkbox ? `[${(checkbox as HTMLInputElement).checked ? "x" : " "}] ` : "";
  const marker = ordered ? `${index}. ${task}` : `- ${task}`;
  let content = serializeChildren(item)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Tight list items (no paragraph children) keep nested lists on adjacent lines.
  if (!item.querySelector(":scope > p")) {
    content = content.replace(/\n{2,}/g, "\n");
  }
  const continuationIndent = " ".repeat(marker.length);
  const [first = "", ...rest] = content.split("\n");
  return [
    `${marker}${first}`,
    ...rest.map((line) => (line.length > 0 ? `${continuationIndent}${line}` : line)),
  ].join("\n");
}

function serializeList(list: Element, ordered: boolean): string {
  const start = Number.parseInt(list.getAttribute("start") ?? "1", 10) || 1;
  const items = [...list.children].filter((child) => child.tagName === "LI");
  if (items.length === 0) return "";
  return `${items.map((item, index) => serializeListItem(item, ordered, start + index)).join("\n")}\n\n`;
}

function serializeBlockquote(quote: Element): string {
  const content = serializeChildren(quote)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!content) return "";
  const quoted = content
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
  return `${quoted}\n\n`;
}

function serializeDetails(details: Element): string {
  const summary =
    details.querySelector(":scope > [data-markdown-details-summary]")?.textContent?.trim() ??
    "Details";
  const contentNode = details.querySelector(":scope > * [data-markdown-details-content]");
  const content = contentNode ? serializeChildren(contentNode).trim() : "";
  const open = details.getAttribute("data-markdown-details-open") === "true" ? " open" : "";
  return `<details${open}>\n<summary>${summary}</summary>${content ? `\n\n${content}` : ""}\n</details>\n\n`;
}

function serializeAnchor(anchor: Element): string {
  const markdownCopy = anchor.getAttribute("data-markdown-copy");
  if (markdownCopy !== null) return markdownCopy;
  const content = serializeChildren(anchor);
  const href = anchor.getAttribute("href") ?? "";
  if (!/^https?:\/\//i.test(href)) return content;
  const label = content.trim();
  if (!label) return "";
  if (label === href) return href;
  return `[${label}](${href})`;
}

function serializeChildren(node: Node): string {
  let out = "";
  for (const child of node.childNodes) {
    out += serializeNode(child);
  }
  return out;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    // Inter-block formatting whitespace from the renderer collapses to a
    // newline; real inline whitespace passes through untouched.
    if (text.includes("\n") && text.trim().length === 0) return "\n";
    return text;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (element.hasAttribute("data-markdown-details")) {
    return serializeDetails(element);
  }
  const markdownCopy = element.getAttribute("data-markdown-copy");
  if (markdownCopy !== null) return markdownCopy;
  if (isSkippedElement(element)) return "";

  const headingLevel = /^H([1-6])$/.exec(element.tagName)?.[1];
  if (headingLevel) {
    return `${"#".repeat(Number(headingLevel))} ${serializeChildren(element).trim()}\n\n`;
  }

  switch (element.tagName) {
    case "BR":
      return "\n";
    case "HR":
      return "---\n\n";
    case "P":
      return `${serializeChildren(element).trim()}\n\n`;
    case "PRE":
      return serializeCodeBlock(element);
    case "CODE": {
      const content = element.textContent ?? "";
      return isBlockCodeElement(element, content) ? content : wrapInlineCode(content);
    }
    case "STRONG":
    case "B":
      return wrapInlineMarker(serializeChildren(element), "**");
    case "EM":
    case "I":
      return wrapInlineMarker(serializeChildren(element), "*");
    case "DEL":
    case "S":
      return wrapInlineMarker(serializeChildren(element), "~~");
    case "A":
      return serializeAnchor(element);
    case "IMG": {
      const alt = element.getAttribute("alt") ?? "";
      const src = element.getAttribute("src") ?? "";
      return alt && src ? `![${alt}](${src})` : "";
    }
    case "UL":
      return serializeList(element, false);
    case "OL":
      return serializeList(element, true);
    case "BLOCKQUOTE":
      return serializeBlockquote(element);
    case "TABLE":
      return serializeTable(element);
    case "DIV":
    case "SECTION":
    case "ARTICLE": {
      const content = serializeChildren(element);
      return content && !content.endsWith("\n") ? `${content}\n` : content;
    }
    default:
      return serializeChildren(element);
  }
}

/** Collapses serializer spacing artifacts without touching fenced code content. */
function tidyMarkdown(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?(?:```|$))/)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(/[ \t]+(?=\n)/g, "").replace(/\n{3,}/g, "\n\n"),
    )
    .join("")
    .trim();
}

export function serializeRenderedMarkdownFragment(container: Node): string {
  return tidyMarkdown(serializeChildren(container));
}

export function serializeTableElementToMarkdown(table: Element): string {
  return serializeTable(table).trim();
}

function csvCell(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return /[",\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function serializeTableElementToCsv(table: Element): string {
  const rows = [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
  const lines: string[] = [];
  for (const row of rows) {
    const cells = [...row.children].filter(
      (cell) => cell.tagName === "TH" || cell.tagName === "TD",
    );
    if (cells.length === 0) continue;
    lines.push(cells.map((cell) => csvCell(cell.textContent ?? "")).join(","));
  }
  return lines.join("\n");
}

export type TableClipboardFormat = "markdown" | "csv" | "html" | "png";

const TABLE_EXPORT_TAGS = new Set([
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "CAPTION",
  "STRONG",
  "B",
  "EM",
  "I",
  "DEL",
  "S",
  "CODE",
  "BR",
  "P",
  "A",
  "SUB",
  "SUP",
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Portable table markup: no chat chrome, clipping CSS, or external image/font resources. */
function serializeTableExportNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  if (isSkippedElement(element) || ["IFRAME", "OBJECT", "EMBED"].includes(element.tagName))
    return "";
  if (element.tagName === "IMG") return escapeHtml(element.getAttribute("alt") ?? "");
  const content = [...node.childNodes].map(serializeTableExportNode).join("");
  if (!TABLE_EXPORT_TAGS.has(element.tagName)) return content;
  const tag = element.tagName.toLowerCase();
  let attributes = "";
  if (tag === "table") {
    attributes =
      ' style="border-collapse:collapse;background:#fff;color:#111;font:14px/1.5 Arial,sans-serif;width:max-content"';
  } else if (tag === "td" || tag === "th") {
    const alignment = element.style?.textAlign || element.getAttribute("align");
    const textAlign = alignment === "center" || alignment === "right" ? alignment : "left";
    attributes = ` style="border:1px solid #d1d5db;padding:8px 12px;text-align:${textAlign};vertical-align:top;white-space:normal;overflow-wrap:anywhere;max-width:384px${tag === "th" ? ";background:#f3f4f6;font-weight:600" : ""}"`;
    for (const name of ["colspan", "rowspan"]) {
      const value = element.getAttribute(name);
      if (value && /^\d+$/.test(value)) attributes += ` ${name}="${value}"`;
    }
  } else if (tag === "a") {
    const href = element.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) attributes = ` href="${escapeHtml(href)}"`;
  }
  return tag === "br" ? "<br />" : `<${tag}${attributes}>${content}</${tag}>`;
}

export function serializeTableElementToHtml(table: Element): string {
  return `<meta charset="utf-8">${serializeTableExportNode(table)}`;
}

/** Measure the complete portable table outside the chat's scroll/clipping containers. */
export async function renderTableElementToPng(table: Element): Promise<Blob> {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-100000px;top:0;width:max-content;background:#fff;padding:12px;pointer-events:none";
  container.setAttribute("aria-hidden", "true");
  container.innerHTML = serializeTableElementToHtml(table);
  document.body.append(container);
  try {
    const width = Math.ceil(container.getBoundingClientRect().width);
    const height = Math.ceil(container.getBoundingClientRect().height);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    // Fail explicitly instead of silently cropping or creating an unusable oversized canvas.
    if (
      !width ||
      !height ||
      width * scale > 16384 ||
      height * scale > 16384 ||
      width * height * scale * scale > 32_000_000
    ) {
      throw new Error("This table is too large to copy as PNG. Try Copy as HTML instead.");
    }
    const content = document.createElement("div");
    content.style.cssText = "background:#fff;padding:12px;width:max-content";
    content.append(container.querySelector("table")!.cloneNode(true));
    const markup = new XMLSerializer().serializeToString(content);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener(
        "error",
        () => reject(new Error("Could not render this table as PNG. Try Copy as HTML instead.")),
        { once: true },
      );
    });
    // A data URL keeps the self-contained SVG origin-clean for canvas export.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG export is unavailable. Try Copy as HTML instead.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode this table as PNG."))),
        "image/png",
      );
    });
  } finally {
    container.remove();
  }
}

export async function writeTableToClipboard(
  table: Element,
  format: TableClipboardFormat,
): Promise<void> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard)
    throw new Error("Clipboard access is unavailable. Use a secure connection and try again.");
  const canWriteRich =
    typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined";
  if (format === "png") {
    if (
      !canWriteRich ||
      (typeof ClipboardItem.supports === "function" && !ClipboardItem.supports("image/png"))
    ) {
      throw new Error("Copy as PNG is unavailable in this browser. Try Copy as HTML instead.");
    }
    // Call write during the click, before rendering awaits image decoding (Safari activation).
    const png = renderTableElementToPng(table);
    void png.catch(() => {});
    await clipboard.write([new ClipboardItem({ "image/png": png })]);
    return;
  }
  if (
    format === "html" &&
    canWriteRich &&
    (typeof ClipboardItem.supports !== "function" || ClipboardItem.supports("text/html"))
  ) {
    await clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([serializeTableElementToHtml(table)], { type: "text/html" }),
        "text/plain": new Blob([serializeTableExportPlainText(table)], { type: "text/plain" }),
      }),
    ]);
    return;
  }
  if (typeof clipboard.writeText !== "function")
    throw new Error("Clipboard text copying is unavailable in this browser.");
  const text =
    format === "html"
      ? serializeTableElementToHtml(table)
      : format === "markdown"
        ? serializeTableElementToMarkdown(table)
        : serializeTableElementToCsv(table);
  await clipboard.writeText(text);
}

function serializeTableExportPlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE || isSkippedElement(node as Element)) return "";
  const element = node as Element;
  if (["IFRAME", "OBJECT", "EMBED"].includes(element.tagName)) return "";
  if (element.tagName === "IMG") return element.getAttribute("alt") ?? "";
  if (element.tagName === "BR") return "\n";
  const isRow = element.tagName === "TR";
  const children = [...node.childNodes].filter(
    (child) =>
      !isRow ||
      (child.nodeType === Node.ELEMENT_NODE && ["TD", "TH"].includes((child as Element).tagName)),
  );
  const content = children.map(serializeTableExportPlainText).join(isRow ? "\t" : "");
  return content + (element.tagName === "TR" ? "\n" : "");
}

function sanitizedHtmlFrom(container: Element): string {
  for (const node of container.querySelectorAll(SANITIZED_HTML_SELECTOR)) {
    if (
      node.classList.contains("chat-markdown-file-link") ||
      node.closest(".chat-markdown-file-link")
    ) {
      if (node.getAttribute("aria-hidden") === "true" || node.localName === "svg") {
        node.remove();
      }
      continue;
    }
    node.remove();
  }
  return `<meta charset="utf-8">${container.innerHTML}`;
}

export function chatMarkdownClipboardPayload(
  selection: Selection,
): MarkdownClipboardPayload | null {
  const texts: string[] = [];
  const htmls: string[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (range.collapsed) continue;
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    const ancestor = range.commonAncestorContainer;
    const ancestorElement =
      ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as Element) : ancestor.parentElement;
    if (ancestorElement?.closest("pre")) {
      const text = range.toString();
      if (text) {
        texts.push(text);
        htmls.push(sanitizedHtmlFrom(container));
      }
      continue;
    }
    const text = serializeRenderedMarkdownFragment(container);
    if (!text) continue;
    texts.push(text);
    htmls.push(sanitizedHtmlFrom(container));
  }
  if (texts.length === 0) return null;
  return { text: texts.join("\n\n"), html: htmls.join("") };
}
