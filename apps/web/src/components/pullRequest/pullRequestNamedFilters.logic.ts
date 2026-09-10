/** Normalize shared URL controls to the same bounds accepted by the list contract. */
export function pullRequestNamedFilters(raw: { author?: unknown; labels?: unknown }) {
  const author = typeof raw.author === "string" ? raw.author.trim().slice(0, 200) : "";
  const candidates = Array.isArray(raw.labels)
    ? raw.labels
    : typeof raw.labels === "string"
      ? [raw.labels]
      : [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.slice(0, 100)) {
    if (typeof candidate !== "string") continue;
    const label = candidate.trim().slice(0, 200);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length === 10) break;
  }
  return { ...(author ? { author } : {}), ...(labels.length ? { labels } : {}) };
}
