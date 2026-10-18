import { CalendarHandoffLink } from "../components/workspace/calendar/CalendarHandoffLink";
import {
  CalendarSpace,
  CalendarNotesProvider,
} from "../components/workspace/calendar/CalendarSpace";
import { MeetingsSpace } from "../components/workspace/meetings/MeetingsSpace";
import { parseNoteLocation, openMeetingNote } from "../components/workspace/meetings/meetingNotes";
import { useWorkspaceResources } from "../components/workspace/workspaceResourceState";
import { parseChatResourceId, ProjectId } from "@t3tools/contracts";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useMemo } from "react";
import { useEnvironmentQuery } from "../state/query";
import { workspaceCalendar } from "../state/workspaceCalendar";
import { useEnvironmentSettings } from "../hooks/useSettings";
import { formatEventRange, formatAllDayRange } from "@t3tools/client-runtime/calendar/dates";
import {
  calendarOccurrenceDay,
  parseCalendarLocation,
} from "../components/workspace/calendar/calendarItemRef";
import {
  WorkspaceItemActions,
  WorkspaceItemMenu,
} from "../components/workspace/WorkspaceItemActions";
import { WorkspaceLinkedContext } from "../components/workspace/WorkspaceLinkedContext";
import { useWorkspaceItemOpener } from "../components/workspace/useWorkspaceItemOpener";
import { Button } from "../components/ui/button";

import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";
import { MailSpace } from "../components/workspace/mail/MailSpace";
import { TasksSpace } from "../components/workspace/TasksSpace";
import { ProjectsSpace } from "../components/workspace/ProjectsSpace";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";
import {
  parseWorkspaceSearch,
  workspaceDestinations,
  type WorkspaceDestination,
} from "../components/workspace/workspaceNavigation";
import { EnvironmentId } from "@t3tools/contracts";
import { WorkspaceEngagement } from "../components/workspace/WorkspaceEngagement";
import { WorkspaceProjectResources } from "../components/workspace/WorkspaceResourcesPanel";
import { useWorkspaceHeaderModel } from "../components/workspace/useWorkspaceHeaderModel";
import { useMailCapabilities } from "../components/workspace/mail/useMailCapabilities";

export {
  parseWorkspaceSearch,
  type WorkspaceSearch,
} from "../components/workspace/workspaceNavigation";

export const Route = createFileRoute("/_chat/workspace")({
  validateSearch: parseWorkspaceSearch,
  beforeLoad: ({ search }) => {
    if (!search.space) throw redirect({ to: "/" });
  },
  component: WorkspaceRouteView,
});

function WorkspaceRouteView() {
  return (
    <CalendarNotesProvider>
      <WorkspaceRouteContent />
    </CalendarNotesProvider>
  );
}
function WorkspaceRouteContent() {
  const search = Route.useSearch();
  const source = useMemo(() => {
    const resource = search.item ? parseChatResourceId(search.item) : undefined;
    return resource &&
      search.item &&
      (search.communicationProvider === "slack" || search.communicationProvider === "discord")
      ? { provider: search.communicationProvider, resource, resourceId: search.item }
      : undefined;
  }, [search.communicationProvider, search.item]);
  switch (search.space) {
    case "projects":
      return <ProjectsSpace />;
    case "mail":
      return <MailSpace />;
    case "communications": {
      return (
        <CommunicationsWorkspace
          key={JSON.stringify([search.environment, search.communicationProvider, search.account])}
          source={source}
        />
      );
    }
    case "office":
      return <OfficeWorkspace />;
    case "tasks":
      return <TasksSpace />;
    case "meetings":
      return search.item && parseNoteLocation(search.item) ? (
        <NoteWorkspace />
      ) : (
        <CalendarWorkspace space="meetings" />
      );
    case "calendar":
      return <CalendarWorkspace />;
    case undefined:
      return null;
    default: {
      const unknownSpace: never = search.space;
      throw new Error(`Unknown workspace destination: ${unknownSpace}`);
    }
  }
}

function NoteWorkspace() {
  const search = Route.useSearch();
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const resources = useWorkspaceResources();
  const note = useMemo(() => parseNoteLocation(search.item), [search.item]);
  const handled = useRef<string | null>(null);
  const projectId = search.project ? ProjectId.make(search.project) : resources.projectId;
  const header = useWorkspaceHeaderModel(environmentId, "Notes", "Notes");
  const open = useWorkspaceItemOpener(environmentId);
  useEffect(() => {
    if (!environmentId || !note || resources.environmentId !== environmentId) return;
    const key = JSON.stringify([environmentId, note, projectId]);
    if (handled.current === key) return;
    handled.current = key;
    if (projectId) openMeetingNote(resources, { environmentId, note, projectId });
    else resources.reopen();
  }, [environmentId, note, projectId, resources]);
  if (!note) return <UnavailableWorkspace space="meetings" />;
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="meetings"
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources selectedItem={note ? { ref: note } : null} />}
      {...(note && environmentId
        ? {
            linkedContext: {
              item: { ref: note },
              render: (item: import("@t3tools/contracts").WorkspaceLinkEndpoint) => (
                <WorkspaceLinkedContext environmentId={environmentId} item={item} onOpen={open} />
              ),
            },
          }
        : {})}
    >
      <section aria-label="Notes" className="p-5 sm:p-8">
        <p className="text-sm text-muted-foreground">
          {note
            ? "Open this note in Docs. Choose a resource project if needed."
            : "Open a linked workspace note to preview it in Docs."}
        </p>
      </section>
    </WorkspaceEngagement>
  );
}

function CalendarWorkspace({ space = "calendar" }: { space?: "calendar" | "meetings" }) {
  const search = Route.useSearch();
  const item = parseCalendarLocation(search.item);
  return item ? (
    <CalendarItemWorkspace space={space} item={item} />
  ) : space === "meetings" ? (
    <MeetingsSpace />
  ) : (
    <CalendarSpace />
  );
}
function CalendarItemWorkspace({
  space,
  item,
}: {
  space: "calendar" | "meetings";
  item: NonNullable<ReturnType<typeof parseCalendarLocation>>;
}) {
  const search = Route.useSearch();
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  return environmentId ? (
    <LinkedCalendarEvent
      key={`${environmentId}:${item.resourceId}`}
      environmentId={environmentId}
      item={item}
      space={space}
    />
  ) : (
    <p>Choose an environment to open Calendar.</p>
  );
}

/** Deep links resolve only their selected ID before choosing its visible day. */
function LinkedCalendarEvent({
  environmentId,
  item,
  space,
}: {
  environmentId: EnvironmentId;
  item: NonNullable<ReturnType<typeof parseCalendarLocation>>;
  space: "calendar" | "meetings";
}) {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const open = useWorkspaceItemOpener(environmentId);
  const timeZone =
    useEnvironmentSettings(environmentId, (settings) => settings.workspaceDisplayTimeZone) ?? "UTC";
  const detail = useEnvironmentQuery(
    workspaceCalendar.detail({ environmentId, input: { id: item.resourceId } }),
  );
  const event =
    !detail.error && detail.data && "id" in detail.data && detail.data.id === item.resourceId
      ? detail.data
      : null;
  const endpoint = { ref: item, ...(event ? { title: event.title } : {}) };
  const label = space === "meetings" ? "Meetings" : "Calendar";
  const header = useWorkspaceHeaderModel(environmentId, label, label);
  const day = event ? calendarOccurrenceDay(event.time, timeZone) : undefined;
  useEffect(() => {
    if (day && day !== search.day)
      void navigate({ to: "/workspace", replace: true, search: { ...search, day } });
  }, [day, search, navigate]);
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space={space}
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
      linkedContext={{
        item: endpoint,
        render: (selected) => (
          <WorkspaceLinkedContext environmentId={environmentId} item={selected} onOpen={open} />
        ),
      }}
    >
      <section aria-label="Calendar event" className="flex flex-col gap-3 p-5 sm:p-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const { item: _item, ...rest } = search;
            void navigate({ to: "/workspace", search: rest, replace: true });
          }}
        >
          Close event
        </Button>
        {detail.error ? <p role="alert">{detail.error}</p> : null}
        {detail.error ? (
          <Button variant="ghost" size="sm" onClick={detail.refresh}>
            Retry event
          </Button>
        ) : null}
        {detail.data && "unavailableReason" in detail.data ? (
          <p>{detail.data.unavailableReason}</p>
        ) : null}
        {!event && !detail.error && !detail.data ? <p>Loading event...</p> : null}
        {event ? (
          <>
            <WorkspaceItemMenu environmentId={environmentId} item={endpoint}>
              <h2 className="text-base font-semibold">{event.title}</h2>
            </WorkspaceItemMenu>
            <p className="text-sm text-muted-foreground">
              {event.time.kind === "timed"
                ? formatEventRange(event.time.start, event.time.end, timeZone)
                : formatAllDayRange(event.time.startOn, event.time.endBefore)}{" "}
              · {event.sourceLabel}
            </p>
            {event.description ? (
              <p className="whitespace-pre-wrap text-sm">{event.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <CalendarHandoffLink
                key={event.joinUrl ?? "missing"}
                target={{ kind: "meeting", ...(event.joinUrl ? { raw: event.joinUrl } : {}) }}
              />
            </div>
            <WorkspaceItemActions environmentId={environmentId} item={endpoint} shortcuts />
          </>
        ) : null}
      </section>
    </WorkspaceEngagement>
  );
}

function UnavailableWorkspace({
  space,
}: {
  space: Extract<WorkspaceDestination, "meetings" | "calendar">;
}) {
  const search = Route.useSearch();
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const heading = workspaceDestinations.find(({ id }) => id === space)?.label;
  const header = useWorkspaceHeaderModel(
    environmentId,
    heading ?? "Workspace",
    heading ?? "Workspace",
  );
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space={space}
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      <main className="p-5 sm:p-8">
        <p className="mt-2 text-sm text-muted-foreground">
          This view is not available on this server yet.
        </p>
        {(search.space === "meetings" || search.space === "calendar") && (
          <Link
            to="/workspace"
            search={{ space: "office" }}
            className="mt-4 inline-block text-sm underline"
          >
            Open local Office tools
          </Link>
        )}
      </main>
    </WorkspaceEngagement>
  );
}
