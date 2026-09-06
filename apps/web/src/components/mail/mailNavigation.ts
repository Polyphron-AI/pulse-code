type MailSearch = {
  environment?: string | undefined;
  account?: string | undefined;
  draft?: string | undefined;
  tab?: "drafts" | "outbox" | undefined;
};

export function parseMailSearch(search: Record<string, unknown>): MailSearch {
  const text = (value: unknown) =>
    typeof value === "string" && value.length > 0 && value.length <= 512 ? value : undefined;
  return {
    environment: text(search.environment),
    account: text(search.account),
    draft: text(search.draft),
    tab: search.tab === "drafts" || search.tab === "outbox" ? search.tab : undefined,
  };
}

export function mailFolderKind(path: string, specialUse: string | null) {
  const special = specialUse?.toLowerCase();
  if (path.toLowerCase() === "inbox") return "inbox";
  if (special === "\\sent") return "sent";
  if (special === "\\drafts") return "drafts";
  if (special === "\\trash") return "trash";
  if (special === "\\archive" || special === "\\all") return "archive";
  return "folder";
}

export function mailSenderName(from: string) {
  const displayName = from.match(/^\s*"?([^<]+?)"?\s*<[^>]+>\s*$/)?.[1]?.trim();
  return displayName || from || "Unknown sender";
}

export function mailListDate(value: string | null, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown date";
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
      });
}
