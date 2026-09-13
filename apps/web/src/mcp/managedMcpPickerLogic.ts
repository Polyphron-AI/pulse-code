export type ManagedMcpStatus =
  | "available"
  | "error"
  | "sign-in-required"
  | "unknown"
  | "unsupported";

export interface ManagedMcpEntry {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly source: "pulse" | "provider";
  readonly status: ManagedMcpStatus;
  readonly statusMessage?: string;
}

export function filterManagedMcpEntries(
  entries: ReadonlyArray<ManagedMcpEntry>,
  query: string,
): ReadonlyArray<ManagedMcpEntry> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.name, entry.id, entry.description, entry.statusMessage]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle),
  );
}

export function toggleManagedMcpSelection(
  selectedIds: ReadonlyArray<string>,
  connectionId: string,
): ReadonlyArray<string> {
  return selectedIds.includes(connectionId)
    ? selectedIds.filter((id) => id !== connectionId)
    : [...selectedIds, connectionId];
}

export function managedMcpStatusLabel(entry: ManagedMcpEntry): string {
  if (entry.statusMessage) return entry.statusMessage;
  switch (entry.status) {
    case "available":
      return "Available";
    case "error":
      return "Connection error";
    case "sign-in-required":
      return "Sign-in required";
    case "unknown":
      return "Status unknown";
    case "unsupported":
      return "Unsupported by this provider";
  }
}
