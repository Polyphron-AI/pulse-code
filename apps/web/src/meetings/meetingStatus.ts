import type { MeetingSummaryRow } from "@t3tools/contracts";

/** The one status worth showing on a meeting, or null once its summary is ready. */
export function meetingStatusLabel(
  meeting: Pick<MeetingSummaryRow, "status" | "summaryStatus">,
): { readonly label: string; readonly variant: "info" | "warning" | "error" } | null {
  if (meeting.status === "recording") return { label: "Recording", variant: "info" };
  switch (meeting.summaryStatus) {
    case "pending":
      return { label: "Summarizing", variant: "info" };
    case "failed":
      return { label: "Summary failed", variant: "error" };
    case "none":
      return { label: "No summary", variant: "warning" };
    case "ready":
      return null;
  }
}
