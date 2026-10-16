import type { EnvironmentId } from "@t3tools/contracts";
import { createContext, useContext } from "react";
import { useEnvironment } from "../../state/environments";
import type { WorkspaceHeaderModel } from "./WorkspaceHeader";

export const WorkspaceHeaderContext = createContext<Pick<
  WorkspaceHeaderModel,
  "environmentLabel" | "spaceLabel"
> | null>(null);

/** Uses the selected environment's display name for live shell and module chrome. */
export function useWorkspaceHeaderModel(
  environmentId: EnvironmentId | null,
  title: string,
  spaceLabel: string,
  subtitle?: string,
): WorkspaceHeaderModel {
  const environment = useEnvironment(environmentId);
  const shell = useContext(WorkspaceHeaderContext);
  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    spaceLabel: shell?.spaceLabel ?? spaceLabel,
    environmentLabel:
      shell?.environmentLabel ??
      (environmentId ? environment?.label || "Workspace" : "No environment connected"),
  };
}
