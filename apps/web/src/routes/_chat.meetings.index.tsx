import { createFileRoute } from "@tanstack/react-router";

import { MeetingsListPage } from "../meetings/MeetingsListPage";
import { parseMeetingsSearch } from "../meetings/meetingsSearch";

export const Route = createFileRoute("/_chat/meetings/")({
  validateSearch: parseMeetingsSearch,
  component: MeetingsListRoute,
});

function MeetingsListRoute() {
  const { environmentId } = Route.useSearch();
  return <MeetingsListPage environmentId={environmentId} />;
}
