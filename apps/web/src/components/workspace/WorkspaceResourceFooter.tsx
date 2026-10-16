import { SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceResourceScope } from "./workspaceResourceState";

export interface WorkspaceResourceFooterProps {
  readonly scope: WorkspaceResourceScope;
  readonly observations: readonly {
    readonly source: string;
    readonly state: "connected" | "unavailable" | "unknown";
  }[];
  readonly sample: boolean;
  readonly onSettings: (scope: WorkspaceResourceScope) => void;
}
export function resourceConnectionLabel(
  observations: readonly { readonly state: "connected" | "unavailable" | "unknown" }[],
) {
  if (observations.some((source) => source.state === "unavailable")) return "Unavailable";
  if (observations.length > 0 && observations.every((source) => source.state === "connected"))
    return "Connected";
  return "Connection status unavailable";
}

/** Presents supported project health only. Opening settings is the sole read entrance. */
export function WorkspaceResourceFooter(props: WorkspaceResourceFooterProps): ReactNode {
  const label = props.sample
    ? "Sample project connections"
    : resourceConnectionLabel(props.observations);
  return (
    <div
      data-workspace-resource-health={
        props.sample || label === "Connected"
          ? "connected"
          : label === "Unavailable"
            ? "unavailable"
            : "unknown"
      }
    >
      <span data-workspace-connection-dot="" aria-hidden="true" />
      <span role="status">{label}</span>
      <button
        type="button"
        aria-label="Project workspace settings"
        onClick={() => props.onSettings({ ...props.scope })}
      >
        <SettingsIcon />
      </button>
    </div>
  );
}
