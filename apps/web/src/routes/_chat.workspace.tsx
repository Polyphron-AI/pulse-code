import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";
import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";
import { TasksWorkspace } from "../components/workspace/TasksWorkspace";
import { TasksPanel } from "../components/workspace/TasksPanel";
import { CalendarWorkspace } from "../components/workspace/CalendarWorkspace";
import { EmailCommunicationsWorkspace } from "../components/workspace/EmailCommunicationsWorkspace";
import { SidebarInset } from "../components/ui/sidebar";
import { usePrimaryEnvironmentId, useEnvironments } from "../state/environments";
import { useState, useEffect, lazy, Suspense } from "react";
import { randomUUID } from "../lib/utils";
import type { TasksPanelProps } from "../components/workspace/TasksPanel";
const officeViews = [
  "communications",
  "projects",
  "tasks",
  "meetings",
  "calendar",
  "email",
] as const;
const OfficeDesignPreview = import.meta.env.DEV
  ? lazy(() =>
      import("../components/workspace/OfficeDesignPreview").then((module) => ({
        default: module.OfficeDesignPreview,
      })),
    )
  : null;

export function parseWorkspaceSearch(raw: Record<string, unknown>) {
  return {
    ...(import.meta.env.DEV && raw.space === "office" && raw.demo === "synkek"
      ? { demo: "synkek" as const }
      : {}),
    ...(raw.space === "office" ? { space: "office" as const } : {}),
    ...(raw.space === "office" && officeViews.some((view) => view === raw.officeView)
      ? { officeView: raw.officeView as (typeof officeViews)[number] }
      : {}),
    ...(raw.space === "office" && typeof raw.project === "string" && raw.project.length <= 300
      ? { project: raw.project }
      : {}),
    ...(raw.space === "office"
      ? (Object.fromEntries(
          [
            "sourceProvider",
            "sourceAccount",
            "sourceConversation",
            "sourceMessage",
            "sourceThread",
            "sourceEnvironment",
          ].flatMap((key) =>
            typeof raw[key] === "string" && raw[key].length > 0 && raw[key].length <= 1024
              ? [[key, raw[key]]]
              : [],
          ),
        ) as {
          sourceProvider?: string;
          sourceAccount?: string;
          sourceConversation?: string;
          sourceMessage?: string;
          sourceThread?: string;
          sourceEnvironment?: string;
        })
      : {}),
    ...(raw.space === "office" && String(raw.notes) === "1" ? { notes: "1" as const } : {}),
  };
}

export const Route = createFileRoute("/_chat/workspace")({
  validateSearch: parseWorkspaceSearch,
  beforeLoad: ({ search }) => {
    if (search.space !== "office") throw redirect({ to: "/" });
  },
  component: OfficeWorkspaceRouteView,
});

function OfficeWorkspaceRouteView() {
  const search = Route.useSearch();
  const environmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const navigate = useNavigate();
  const [taskDraft, setTaskDraft] = useState<TasksPanelProps["draft"]>();
  useEffect(() => {
    setTaskDraft(undefined);
  }, [search.officeView]);
  if (search.demo && OfficeDesignPreview)
    return (
      <Suspense fallback={<p className="p-6">Loading design preview…</p>}>
        <OfficeDesignPreview key={search.officeView} view={search.officeView ?? "communications"} />
      </Suspense>
    );
  if (search.officeView === "communications" || search.officeView === "projects")
    return (
      <CommunicationsWorkspace
        openProjects={search.officeView === "projects"}
        requestedProjectKey={search.project}
        requestedSource={
          search.sourceAccount
            ? {
                provider: search.sourceProvider,
                accountId: search.sourceAccount,
                conversationId: search.sourceConversation,
                messageId: search.sourceMessage,
                threadId: search.sourceThread,
              }
            : undefined
        }
      />
    );
  if (!search.officeView) return <OfficeWorkspace />;
  const tasksPanel = environmentId ? (
    <TasksPanel
      environmentId={environmentId}
      compact
      draft={taskDraft}
      onDraftHandled={() => setTaskDraft(undefined)}
    />
  ) : undefined;
  if (search.officeView === "calendar" || search.officeView === "meetings")
    return (
      <CalendarWorkspace
        meetings={search.officeView === "meetings"}
        tasksPanel={tasksPanel}
        requestedNote={
          search.notes && search.sourceAccount && search.sourceMessage
            ? {
                accountId: search.sourceAccount,
                eventId: search.sourceMessage,
                environmentId: environments.find(
                  (item) => item.environmentId === search.sourceEnvironment,
                )?.environmentId,
              }
            : undefined
        }
      />
    );
  return (
    <SidebarInset className="min-w-0 overflow-hidden">
      {search.officeView === "tasks" ? (
        <TasksWorkspace />
      ) : search.officeView === "email" ? (
        <EmailCommunicationsWorkspace
          {...(search.sourceAccount ? { requestedAccountId: search.sourceAccount } : {})}
          requestedMessageId={search.sourceMessage}
          onCreateTask={(draft) => setTaskDraft({ ...draft, key: randomUUID() })}
          tasksPanel={tasksPanel}
          onConfigureProject={(project) =>
            void navigate({
              to: "/workspace",
              search: {
                space: "office",
                officeView: "projects",
                project: JSON.stringify([project.environmentId, project.id]),
              },
            })
          }
        />
      ) : (
        <CalendarWorkspace meetings={search.officeView === "meetings"} tasksPanel={tasksPanel} />
      )}
    </SidebarInset>
  );
}
