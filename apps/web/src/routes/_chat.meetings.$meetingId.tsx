import type { MeetingId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { MeetingDetailPage } from "../meetings/MeetingDetailPage";
import { parseMeetingsSearch } from "../meetings/meetingsSearch";

export const Route = createFileRoute("/_chat/meetings/$meetingId")({
  validateSearch: parseMeetingsSearch,
  component: MeetingDetailRoute,
});

function MeetingDetailRoute() {
  const { meetingId } = Route.useParams();
  const { environmentId } = Route.useSearch();
  return <MeetingDetailPage meetingId={meetingId as MeetingId} environmentId={environmentId} />;
}
