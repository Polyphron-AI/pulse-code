import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironment } from "../../state/environments";
import type { WorkspaceHeaderModel } from "./WorkspaceHeader";

/** Uses the selected environment's display name for live shell and module chrome. */
export function useWorkspaceHeaderModel(
  environmentId: EnvironmentId | null,
  title: string,
  spaceLabel: string,
  subtitle?: string,
): WorkspaceHeaderModel {
  const environment = useEnvironment(environmentId);
  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    spaceLabel,
    environmentLabel: environmentId
      ? environment?.label || "Workspace"
      : "No environment connected",
  };
}
