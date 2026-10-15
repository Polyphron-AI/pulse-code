import { createFileRoute, redirect } from "@tanstack/react-router";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";
import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";

export function parseWorkspaceSearch(raw: Record<string, unknown>) {
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
    if (search.space !== "office") throw redirect({ to: "/" });
  },
  component: OfficeWorkspaceRouteView,
});

function OfficeWorkspaceRouteView() {
  const search = Route.useSearch();
  return search.officeView === "communications" ? <CommunicationsWorkspace /> : <OfficeWorkspace />;
}
