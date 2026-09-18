import type {
  PulseMcpWardenCredential,
  PulseMcpWardenSettings,
  PulseMcpWardenSettingsInput,
} from "@t3tools/contracts";

export type WardenDraft = {
  readonly origin: string;
  readonly pat: string;
  readonly replacePat: boolean;
};

export const wardenDraftFromSettings = (settings: PulseMcpWardenSettings | null): WardenDraft => ({
  origin: settings?.origin ?? "",
  pat: "",
  replacePat: false,
});

/** Omits `pat` to keep the stored token; sends an empty string to clear it. */
export function wardenInputFromDraft(
  draft: WardenDraft,
  patConfigured: boolean,
  clearPat: boolean,
): PulseMcpWardenSettingsInput {
  const origin = draft.origin.trim().replace(/\/+$/, "");
  if (clearPat) return { origin, pat: "" };
  if (!patConfigured || draft.replacePat) return { origin, pat: draft.pat };
  return { origin };
}

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function grantBadgeLabel(
  grant: PulseMcpWardenCredential["grant"],
  now: Date = new Date(),
): string {
  if (grant.status === "pending") return "Pending acceptance";
  if (grant.status === "none") return "No grant";
  if (!grant.expiresAt) return "Active";
  const expires = new Date(grant.expiresAt);
  if (Number.isNaN(expires.getTime()) || expires <= now) return "Active";
  return `Active until ${formatter.format(expires)}`;
}

const RANK = { active: 0, pending: 1, none: 2 } as const;

/** The connection badge shows the least healthy grant across its Warden values. */
export function worstGrantStatus(
  statuses: ReadonlyArray<"active" | "pending" | "none">,
): "active" | "pending" | "none" | null {
  let worst: "active" | "pending" | "none" | null = null;
  for (const status of statuses) {
    if (worst === null || RANK[status] > RANK[worst]) worst = status;
  }
  return worst;
}

const isWardenError = (
  error: unknown,
): error is { readonly kind: string; readonly message: string } =>
  typeof error === "object" &&
  error !== null &&
  (error as { _tag?: unknown })._tag === "PulseMcpWardenError" &&
  typeof (error as { kind?: unknown }).kind === "string";

export function describeWardenError(error: unknown): string {
  if (isWardenError(error)) {
    switch (error.kind) {
      case "not-configured":
        return "Enter the Pulse Go origin and a personal access token first.";
      case "unauthorized":
        return "Pulse Go rejected the token for this environment. Replace it and test again.";
      case "unavailable":
        return "Pulse Go Warden is unreachable. Check the origin and try again.";
      case "denied":
        return `Pulse Go denied the request: ${error.message}`;
      default:
        return "Pulse Go Warden returned an unexpected response.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "The Warden request failed.";
}
