import { formatMeetingDuration } from "@t3tools/client-runtime/state/meetings";
import type { EnvironmentId, MeetingSummaryRow } from "@t3tools/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { AudioLinesIcon } from "lucide-react";

import { isElectron } from "../env";
import { useClientSettings } from "../hooks/useSettings";
import { useEnvironmentQuery } from "../state/query";
import { formatDayAwareTimestamp } from "../timestampFormat";
import { Badge } from "../components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SidebarInset } from "../components/ui/sidebar";
import { Skeleton } from "../components/ui/skeleton";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../components/WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../components/WorkspacePageContainer";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { MeetingRecorderSlot } from "./MeetingRecorderSlot";
import { meetingStatusLabel } from "./meetingStatus";
import { meetingEnvironment } from "./meetingsState";
import { useMeetingsEnvironment } from "./useMeetingsEnvironment";

export function MeetingsListPage({
  environmentId: requestedEnvironmentId,
}: {
  readonly environmentId: EnvironmentId | undefined;
}) {
  const navigate = useNavigate();
  const { environments, environmentId } = useMeetingsEnvironment(requestedEnvironmentId);
  const meetings = useEnvironmentQuery(
    environmentId === null ? null : meetingEnvironment.list({ environmentId, input: {} }),
  );
  const selectedEnvironment = environments.find((entry) => entry.environmentId === environmentId);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron}>
          <WorkspaceBreadcrumb ariaLabel="Meetings breadcrumb">
            <WorkspaceBreadcrumbItem current={environments.length <= 1}>
              <h1 className="truncate">Meetings</h1>
            </WorkspaceBreadcrumbItem>
            {environments.length > 1 && environmentId !== null ? (
              <>
                <WorkspaceBreadcrumbSeparator />
                <WorkspaceBreadcrumbItem current className="min-w-10">
                  <Select
                    value={environmentId}
                    onValueChange={(value) => {
                      if (typeof value !== "string") return;
                      void navigate({
                        to: "/meetings",
                        search: { environmentId: value as EnvironmentId },
                      });
                    }}
                  >
                    <SelectTrigger
                      aria-label="Environment"
                      size="compact"
                      variant="ghost"
                      className="w-auto min-w-0"
                    >
                      <SelectValue>{selectedEnvironment?.label ?? "Environment"}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup align="start" alignItemWithTrigger={false}>
                      {environments.map((entry) => (
                        <SelectItem key={entry.environmentId} value={entry.environmentId}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </WorkspaceBreadcrumbItem>
              </>
            ) : null}
          </WorkspaceBreadcrumb>
          <div className="min-w-0 flex-1" />
          <MeetingRecorderSlot environmentId={environmentId} />
        </WorkspacePageHeader>
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="readable">
            {environmentId === null ? (
              <p className="text-sm text-muted-foreground">
                Connect an environment to see meetings.
              </p>
            ) : meetings.error !== null && meetings.data === null ? (
              <p className="text-sm text-destructive-foreground">{meetings.error}</p>
            ) : meetings.data === null ? (
              <MeetingListSkeleton />
            ) : meetings.data.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <AudioLinesIcon />
                  </EmptyMedia>
                  <EmptyTitle>No meetings yet</EmptyTitle>
                  <EmptyDescription>
                    Meetings are recorded from the Pulse desktop app. Their transcripts and
                    summaries show up here on every device connected to this environment.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {meetings.data.map((meeting) => (
                  <MeetingListRow
                    key={meeting.id}
                    meeting={meeting}
                    environmentId={environmentId}
                  />
                ))}
              </ul>
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
}

function MeetingListRow({
  meeting,
  environmentId,
}: {
  readonly meeting: MeetingSummaryRow;
  readonly environmentId: EnvironmentId;
}) {
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const status = meetingStatusLabel(meeting);
  const duration = formatMeetingDuration(meeting.durationMs);
  return (
    <li>
      <Link
        to="/meetings/$meetingId"
        params={{ meetingId: meeting.id }}
        search={{ environmentId }}
        className="flex flex-col gap-1 rounded-md px-2 py-3 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-sm">{meeting.title}</span>
          {status === null ? null : (
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDayAwareTimestamp(meeting.startedAt, timestampFormat)}
          {duration === null ? null : ` · ${duration}`}
        </span>
        {meeting.summaryPreview === null ? null : (
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {meeting.summaryPreview}
          </span>
        )}
      </Link>
    </li>
  );
}

function MeetingListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col gap-2 px-2 py-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
