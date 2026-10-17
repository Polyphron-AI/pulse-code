import { Link, useSearch } from "@tanstack/react-router";
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
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="meetings"
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      <section aria-label="Recordings" className="p-4">
        <p>Published recordings are not available in this environment.</p>
        {window.desktopBridge?.talkInvoke ? (
          // Office tools belong to this device, independently of the selected environment.
          <Link to="/workspace" search={{ space: "office" }}>
            Open Pulse Talk, local to this device
          </Link>
        ) : (
          <p>Local recordings remain on their capture device. Open Pulse Talk on that device.</p>
        )}
      </section>
    </WorkspaceEngagement>
  );
}
