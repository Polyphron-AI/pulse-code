import type { IssueSeverity, IssueStatus } from "@t3tools/contracts";

export const ISSUE_STATUS_PRESENTATION: Readonly<
  Record<
    IssueStatus,
    { readonly label: string; readonly tone: "outline" | "info" | "success" | "warning" }
  >
> = {
  triage: { label: "Triage", tone: "warning" },
  todo: { label: "Todo", tone: "outline" },
  in_progress: { label: "In progress", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
  wont_fix: { label: "Won't fix", tone: "outline" },
};

export const ISSUE_SEVERITY_PRESENTATION: Readonly<
  Record<IssueSeverity, { readonly label: string; readonly className: string }>
> = {
  critical: { label: "Critical", className: "text-red-600 dark:text-red-300" },
  high: { label: "High", className: "text-orange-600 dark:text-orange-300" },
  medium: { label: "Medium", className: "text-amber-600 dark:text-amber-300" },
  low: { label: "Low", className: "text-muted-foreground" },
};

export const ISSUE_STATUSES = Object.keys(ISSUE_STATUS_PRESENTATION) as IssueStatus[];
export const ISSUE_SEVERITIES = Object.keys(ISSUE_SEVERITY_PRESENTATION) as IssueSeverity[];

export function issueStatusLabel(status: IssueStatus): string {
  return ISSUE_STATUS_PRESENTATION[status].label;
}

export function issueSeverityLabel(severity: IssueSeverity | ""): string {
  return severity ? ISSUE_SEVERITY_PRESENTATION[severity].label : "Unspecified";
}

export function activityLabel(input: {
  readonly action: string;
  readonly field: string | null;
}): string {
  const action = input.action.replaceAll("_", " ");
  return input.field ? `${action} ${input.field.replaceAll("_", " ")}` : action;
}

export function compactUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? "No details";
  } catch {
    return "Details unavailable";
  }
}
