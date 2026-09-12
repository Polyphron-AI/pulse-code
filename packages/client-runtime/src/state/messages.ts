import type { MessageAuthor } from "@t3tools/contracts";

/**
 * Human-readable label for a user-role message's provenance, or `null` when
 * no badge should render (the human at the keyboard typed it: `undefined` or
 * `"user"`). Shared by the web timeline and the mobile thread feed so the
 * copy stays in one place.
 */
export function messageAuthorLabel(authoredBy: MessageAuthor | undefined): string | null {
  if (authoredBy === undefined || authoredBy === "user") {
    return null;
  }
  if (typeof authoredBy === "object") {
    return "From another thread";
  }
  switch (authoredBy) {
    case "schedule":
      return "Scheduled";
    case "handoff":
      return "Handoff";
    case "assistant":
      return "Assistant";
    case "manager":
      return "Argo";
    case "watchdog":
      return "Watchdog";
  }
}
