import type { EnvironmentId } from "@t3tools/contracts";
import { createContext, useContext } from "react";
import { useEnvironment } from "../../state/environments";
import type { WorkspaceHeaderModel } from "./WorkspaceHeader";

export const WorkspaceHeaderContext = createContext<Pick<
  WorkspaceHeaderModel,
  "environmentLabel" | "spaceLabel"
> | null>(null);

/** Reads shell-owned environmentLabel/spaceLabel from WorkspaceHeaderContext; modules own title/subtitle/owner only. */
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
