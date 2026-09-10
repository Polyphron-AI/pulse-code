export function formatMailDate(value: string | null): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

export function formatMailSize(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** HTML is rendered in an opaque, scriptless iframe; source URLs are removed. */
export function safeMailHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowed = new Set([
    "P",
    "BR",
    "DIV",
    "SPAN",
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "S",
    "BLOCKQUOTE",
    "PRE",
    "CODE",
    "UL",
    "OL",
    "LI",
    "TABLE",
    "TBODY",
    "THEAD",
    "TR",
    "TH",
    "TD",
    "HR",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "A",
  ]);
  for (const element of [...template.content.querySelectorAll("*")].toReversed()) {
    if (!allowed.has(element.tagName)) {
      if (
        ["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE"].includes(
          element.tagName,
        )
      )
        element.remove();
      else {
        while (element.firstChild) element.before(element.firstChild);
        element.remove();
      }
      continue;
    }
    while (element.attributes.length > 0) element.removeAttribute(element.attributes[0]!.name);
  }
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="color-scheme" content="light dark"><style>body{font:14px/1.6 system-ui,sans-serif;overflow-wrap:anywhere;margin:16px}table{max-width:100%;border-collapse:collapse}td,th{padding:4px}pre{white-space:pre-wrap}blockquote{border-left:2px solid #888;padding-left:12px;margin-left:0}</style></head><body>${template.innerHTML}</body></html>`;
}

export function safeMailUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function extractMailLinks(html: string | null, text: string): readonly string[] {
  const candidates: string[] = text.match(/https?:\/\/[^\s<>"\])]+/g) ?? [];
  if (html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    for (const anchor of template.content.querySelectorAll("a[href]"))
      candidates.push(anchor.getAttribute("href") ?? "");
  }
  return [...new Set(candidates.map(safeMailUrl).filter((url) => url !== null))].slice(0, 50);
}

export async function fileAsBase64(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < data.length; index += 8192)
    binary += String.fromCharCode(...data.subarray(index, index + 8192));
  return btoa(binary);
}

export function downloadMailAttachment(base64: string, filename: string, contentType: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
