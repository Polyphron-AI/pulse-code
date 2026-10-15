import { createFileRoute, redirect } from "@tanstack/react-router";

import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";
import { MailSpace } from "../components/workspace/mail/MailSpace";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";

export interface WorkspaceSearch {
  readonly space?: "office" | "mail";
  readonly officeView?: "communications";
  readonly account?: string;
  readonly folder?: string;
  readonly project?: string;
}

const text = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 1_024 ? value : undefined;

export function parseWorkspaceSearch(raw: Record<string, unknown>): WorkspaceSearch {
  if (raw.space === "mail") {
    const account = text(raw.account);
    const folder = text(raw.folder);
    const project = text(raw.project);
    return {
      space: "mail",
      ...(account !== undefined ? { account } : {}),
      ...(folder !== undefined ? { folder } : {}),
      ...(project !== undefined ? { project } : {}),
    };
  }
  return {
    ...(raw.space === "office" ? { space: "office" as const } : {}),
    ...(raw.space === "office" && raw.officeView === "communications"
      ? { officeView: "communications" as const }
      : {}),
  };
}

export const Route = createFileRoute("/_chat/workspace")({
  validateSearch: parseWorkspaceSearch,
  beforeLoad: ({ search }) => {
    if (search.space !== "office" && search.space !== "mail") throw redirect({ to: "/" });
  },
  component: WorkspaceRouteView,
});

function WorkspaceRouteView() {
  const search = Route.useSearch();
  if (search.space === "mail") return <MailSpace />;
  return search.officeView === "communications" ? <CommunicationsWorkspace /> : <OfficeWorkspace />;
}
