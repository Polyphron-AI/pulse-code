import { createFileRoute, redirect } from "@tanstack/react-router";

import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";
import { MailSpace } from "../components/workspace/mail/MailSpace";
import { ProjectsSpace } from "../components/workspace/ProjectsSpace";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";

export interface WorkspaceSearch {
  readonly space?: "office" | "mail" | "projects";
  readonly officeView?: "communications";
  readonly communicationProvider?: "telegram";
  readonly account?: string;
  readonly folder?: string;
  readonly project?: string;
  readonly environment?: string;
  readonly item?: string;
}

const text = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 1_024 ? value : undefined;

export function parseWorkspaceSearch(raw: Record<string, unknown>): WorkspaceSearch {
  if (raw.space === "mail" || raw.space === "projects") {
    const account = text(raw.account);
    const folder = text(raw.folder);
    const project = text(raw.project);
    const environment = text(raw.environment);
    const item = typeof raw.item === "string" && raw.item.length <= 8192 ? raw.item : undefined;
    return {
      space: raw.space,
      ...(account !== undefined ? { account } : {}),
      ...(folder !== undefined ? { folder } : {}),
      ...(project !== undefined ? { project } : {}),
      ...(environment !== undefined ? { environment } : {}),
      ...(item !== undefined ? { item } : {}),
    };
  }
  const telegram =
    raw.space === "office" &&
    raw.officeView === "communications" &&
    raw.communicationProvider === "telegram";
  const environment = text(raw.environment);
  const account = text(raw.account);
  const item = text(raw.item);
  return {
    ...(telegram
      ? {
          communicationProvider: "telegram" as const,
          ...(environment ? { environment } : {}),
          ...(account ? { account } : {}),
          ...(item ? { item } : {}),
        }
      : {}),
    ...(raw.space === "office" ? { space: "office" as const } : {}),
    ...(raw.space === "office" && raw.officeView === "communications"
      ? { officeView: "communications" as const }
      : {}),
  };
}

export const Route = createFileRoute("/_chat/workspace")({
  validateSearch: parseWorkspaceSearch,
  beforeLoad: ({ search }) => {
    if (search.space !== "office" && search.space !== "mail" && search.space !== "projects")
      throw redirect({ to: "/" });
  },
  component: WorkspaceRouteView,
});

function WorkspaceRouteView() {
  const search = Route.useSearch();
  if (search.space === "projects") return <ProjectsSpace />;
  if (search.space === "mail") return <MailSpace />;
  return search.officeView === "communications" ? <CommunicationsWorkspace /> : <OfficeWorkspace />;
}
