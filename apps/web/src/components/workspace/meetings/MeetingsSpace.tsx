import { Link, useSearch } from "@tanstack/react-router";
import { MeetingRecordingsView } from "./MeetingRecordingsView";
import { CalendarSpace } from "../calendar/CalendarSpace";
import { parseWorkspaceSearch } from "../workspaceNavigation";
import { EnvironmentId } from "@t3tools/contracts";
import { useMailCapabilities } from "../mail/useMailCapabilities";
import { WorkspaceEngagement } from "../WorkspaceEngagement";
import { WorkspaceProjectResources } from "../WorkspaceResourcesPanel";
import { useWorkspaceHeaderModel } from "../useWorkspaceHeaderModel";
export function MeetingsSpace() {
  const search = parseWorkspaceSearch(useSearch({ strict: false }));
  return search.view === "recordings" ? <RecordingsSpace /> : <CalendarSpace space="meetings" />;
}
function RecordingsSpace() {
  const search = parseWorkspaceSearch(useSearch({ strict: false }));
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const header = useWorkspaceHeaderModel(environmentId, "Meetings", "Meetings");
  // Office tools belong to this device, independently of the selected environment.
  const localTalk = window.desktopBridge?.talkInvoke ? (
    <Link to="/workspace" search={{ space: "office" }}>
      Open Pulse Talk, local to this device
    </Link>
  ) : undefined;
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="meetings"
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      <MeetingRecordingsView localTalk={localTalk} />
    </WorkspaceEngagement>
  );
}
