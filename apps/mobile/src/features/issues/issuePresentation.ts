import type { IssueSeverity, IssueStatus } from "@t3tools/contracts";

export const ISSUE_STATUSES: readonly IssueStatus[] = [
  "triage",
  "todo",
  "in_progress",
  "resolved",
  "wont_fix",
];

export const ISSUE_SEVERITIES: readonly IssueSeverity[] = ["critical", "high", "medium", "low"];

export const ISSUE_STATUS_LABEL: Readonly<Record<IssueStatus, string>> = {
  triage: "Triage",
  todo: "Todo",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

export const ISSUE_SEVERITY_LABEL: Readonly<Record<IssueSeverity, string>> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function issueSeverityLabel(severity: IssueSeverity | ""): string {
  return severity ? ISSUE_SEVERITY_LABEL[severity] : "Unspecified";
}

export function compactEvidence(value: unknown, maxLength = 1_200): string {
  const serialized =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value, null, 2) ?? "No details";
          } catch {
            return "Details unavailable";
          }
        })();
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}…` : serialized;
}

export function isStaleIssueFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    error.reason === "stale-version"
  );
}

export function shouldShowInitialIssuesLoading(input: {
  readonly catalogReady: boolean;
  readonly reachableCapableEnvironmentCount: number;
  readonly connectionPending: boolean;
  readonly connectionValueCount: number;
  readonly listTargetCount: number;
  readonly listPending: boolean;
  readonly issueEntryCount: number;
}): boolean {
  return (
    !input.catalogReady ||
    (input.reachableCapableEnvironmentCount > 0 &&
      input.connectionPending &&
      input.connectionValueCount === 0) ||
    (input.listTargetCount > 0 && input.listPending && input.issueEntryCount === 0)
  );
}
