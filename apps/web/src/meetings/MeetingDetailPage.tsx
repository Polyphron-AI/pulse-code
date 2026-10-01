import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { formatMeetingDuration, formatMeetingOffset } from "@t3tools/client-runtime/state/meetings";
import {
  type EnvironmentId,
  MEETING_TITLE_MAX_LENGTH,
  type MeetingDetail,
  type MeetingId,
} from "@t3tools/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import ChatMarkdown from "../components/ChatMarkdown";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { SidebarInset } from "../components/ui/sidebar";
import { Skeleton } from "../components/ui/skeleton";
import { toastManager } from "../components/ui/toast";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../components/WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../components/WorkspacePageContainer";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { isElectron } from "../env";
import { useClientSettings } from "../hooks/useSettings";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { formatDayAwareTimestamp } from "../timestampFormat";
import { meetingStatusLabel } from "./meetingStatus";
import { meetingEnvironment } from "./meetingsState";
import { SendMeetingToThread } from "./SendMeetingToThread";
import { useMeetingsEnvironment } from "./useMeetingsEnvironment";

function commandErrorMessage(result: Parameters<typeof squashAtomCommandFailure>[0]) {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The request failed. Try again.";
}

export function MeetingDetailPage({
  meetingId,
  environmentId: requestedEnvironmentId,
}: {
  readonly meetingId: MeetingId;
  readonly environmentId: EnvironmentId | undefined;
}) {
  const { environmentId } = useMeetingsEnvironment(requestedEnvironmentId);
  const meeting = useEnvironmentQuery(
    environmentId === null
      ? null
      : meetingEnvironment.detail({ environmentId, input: { id: meetingId } }),
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron}>
          <WorkspaceBreadcrumb ariaLabel="Meeting breadcrumb">
            <WorkspaceBreadcrumbItem>
              <Link to="/meetings" search={environmentId === null ? {} : { environmentId }}>
                Meetings
              </Link>
            </WorkspaceBreadcrumbItem>
            <WorkspaceBreadcrumbSeparator />
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">{meeting.data?.title ?? "Meeting"}</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
        </WorkspacePageHeader>
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="readable">
            {environmentId === null ? (
              <p className="text-sm text-muted-foreground">
                Connect an environment to see this meeting.
              </p>
            ) : meeting.data !== null ? (
              <MeetingDetailContent
                key={meeting.data.id}
                meeting={meeting.data}
                environmentId={environmentId}
              />
            ) : meeting.error !== null ? (
              <p className="text-sm text-destructive-foreground">{meeting.error}</p>
            ) : (
              <MeetingDetailSkeleton />
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
}

function MeetingDetailContent({
  meeting,
  environmentId,
}: {
  readonly meeting: MeetingDetail;
  readonly environmentId: EnvironmentId;
}) {
  const navigate = useNavigate();
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const rename = useAtomCommand(meetingEnvironment.rename, { reportFailure: false });
  const summarize = useAtomCommand(meetingEnvironment.summarize, { reportFailure: false });
  const deleteMeeting = useAtomCommand(meetingEnvironment.delete, { reportFailure: false });
  const [titleDraft, setTitleDraft] = useState(meeting.title);
  const [syncedTitle, setSyncedTitle] = useState(meeting.title);
  // A rename from another device or a generated title replaces the field's text.
  if (meeting.title !== syncedTitle) {
    setSyncedTitle(meeting.title);
    setTitleDraft(meeting.title);
  }
  const [renaming, setRenaming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const status = meetingStatusLabel(meeting);
  const duration = formatMeetingDuration(meeting.durationMs);

  const commitTitle = async () => {
    const title = titleDraft.trim();
    if (title.length === 0 || title === meeting.title) {
      setTitleDraft(meeting.title);
      return;
    }
    setRenaming(true);
    const result = await rename({ environmentId, input: { id: meeting.id, title } });
    setRenaming(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      setTitleDraft(meeting.title);
      toastManager.add({
        type: "error",
        title: "Could not rename the meeting",
        description: commandErrorMessage(result),
      });
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    const result = await summarize({ environmentId, input: { id: meeting.id } });
    setRegenerating(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: "Could not regenerate the summary",
        description: commandErrorMessage(result),
      });
    }
  };

  const confirmDeletion = async () => {
    setDeleting(true);
    const result = await deleteMeeting({ environmentId, input: { id: meeting.id } });
    setDeleting(false);
    if (result._tag === "Success") {
      setConfirmDelete(false);
      void navigate({ to: "/meetings", search: { environmentId } });
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: "Could not delete the meeting",
        description: commandErrorMessage(result),
      });
    }
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <Input
          aria-label="Meeting title"
          value={titleDraft}
          maxLength={MEETING_TITLE_MAX_LENGTH}
          disabled={renaming}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setTitleDraft(meeting.title);
              event.currentTarget.blur();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span>{formatDayAwareTimestamp(meeting.startedAt, timestampFormat)}</span>
          {duration === null ? null : <span>{duration}</span>}
          {status === null ? null : (
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
          )}
          <div className="ms-auto flex items-center gap-1">
            <SendMeetingToThread meeting={meeting} />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete meeting"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-sm">Summary</h2>
          {meeting.summaryStatus === "ready" || meeting.summaryStatus === "failed" ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={regenerating}
              onClick={() => void regenerate()}
            >
              <RefreshCwIcon />
              Regenerate
            </Button>
          ) : null}
        </div>
        <MeetingSummary meeting={meeting} environmentId={environmentId} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">Transcript</h2>
        {meeting.segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transcript yet.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {meeting.segments.map((segment) => (
              <li key={segment.index} className="flex gap-3 text-sm">
                <span className="shrink-0 font-mono text-xs leading-5 text-muted-foreground tabular-nums">
                  {formatMeetingOffset(segment.startMs)}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words">{segment.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              The transcript and summary are removed from this environment for every device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDeletion()}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

function MeetingSummary({
  meeting,
  environmentId,
}: {
  readonly meeting: MeetingDetail;
  readonly environmentId: EnvironmentId;
}) {
  switch (meeting.summaryStatus) {
    case "ready":
      return meeting.summary === null ? null : (
        <ChatMarkdown text={meeting.summary} cwd={undefined} environmentId={environmentId} />
      );
    case "pending":
      return <p className="text-sm text-muted-foreground">Writing the summary...</p>;
    case "failed":
      return (
        <p className="text-sm text-destructive-foreground">
          {meeting.summaryError ?? "The summary failed."}
        </p>
      );
    case "none":
      return (
        <p className="text-sm text-muted-foreground">
          {meeting.status === "recording"
            ? "The summary is written when the recording finishes."
            : "No summary yet."}
        </p>
      );
  }
}

function MeetingDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-1/4" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
