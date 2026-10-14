/** Names remain display labels; a bounded safe segment and unique id form the folder. */
export function projectFolderPath(base: string, title: string, id: string): string {
  const segment =
    title
      .trim()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "project";
  const root = base.trim().replace(/[\\/]+$/, "") || "~/Pulse Projects";
  return `${root}/${segment}-${id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12)}`;
}

export function driveResourceId(value: string): string | null {
  if (/^[\w-]+$/.test(value.trim())) return value.trim();
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["drive.google.com", "docs.google.com"].includes(url.hostname)
    )
      return null;
    return (
      /\/(?:folders|d)\/([\w-]+)(?:\/|$)/.exec(url.pathname)?.[1] ??
      url.searchParams.get("id")?.match(/^[\w-]+$/)?.[0] ??
      null
    );
  } catch {
    return null;
  }
}
