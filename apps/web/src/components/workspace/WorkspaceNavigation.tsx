import type { EnvironmentId } from "@t3tools/contracts";
import { BriefcaseBusinessIcon, Code2Icon, PanelLeftCloseIcon, SettingsIcon } from "lucide-react";
import type { ReactNode, MouseEvent } from "react";
import { useId } from "react";
import { SidebarStageBackdrop } from "../SidebarStageBackdropArt";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  workspaceDestinations,
  workspaceDestinationSearch,
  type WorkspaceDestination,
} from "./workspaceNavigation";
import "./workspaceShell.css";

export interface WorkspaceNavigationProps {
  readonly destination: WorkspaceDestination;
  readonly environmentId: EnvironmentId;
  readonly mode: "workspace" | "code";
  readonly onModeChange: (mode: "workspace" | "code") => void;
  readonly onNavigate: (destination: WorkspaceDestination) => void;
  readonly onSettings?: () => void;
  readonly onToggleSidebar?: () => void;
  readonly labels?: {
    readonly brand: string;
    readonly workspaceMode: string;
    readonly group: string;
  };
  readonly children?: ReactNode;
  readonly unavailableDestinations?: Partial<Record<WorkspaceDestination, string>>;
}
export interface WorkspaceModeSwitchProps {
  readonly mode: "workspace" | "code";
  readonly onModeChange: (mode: "workspace" | "code") => void;
  readonly labels?: { readonly workspace: string; readonly code: string };
}

export function WorkspaceModeSwitch({ mode, onModeChange, labels }: WorkspaceModeSwitchProps) {
  return (
    <div role="group" aria-label="Workspace mode" data-workspace-mode-switch="">
      {(
        [
          { id: "workspace", label: labels?.workspace ?? "Workspace", Icon: BriefcaseBusinessIcon },
          { id: "code", label: labels?.code ?? "Code", Icon: Code2Icon },
        ] as const
      ).map(({ id, label, Icon }) => (
        <button key={id} type="button" aria-pressed={mode === id} onClick={() => onModeChange(id)}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function WorkspaceNavigation({
  destination,
  environmentId,
  mode,
  onModeChange,
  onNavigate,
  onSettings,
  onToggleSidebar,
  labels,
  children,
  unavailableDestinations,
}: WorkspaceNavigationProps) {
  const reasonId = useId();
  const href = (id: WorkspaceDestination) =>
    `/workspace?${new URLSearchParams({ ...workspaceDestinationSearch(id, environmentId) }).toString()}`;
  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: WorkspaceDestination) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (unavailableDestinations?.[id]) return;
    onNavigate(id);
  };
  return (
    <div data-workspace-navigation="">
      <header data-workspace-navigation-brand="">
        <SidebarStageBackdrop variant="dev" workspace />
        <button
          type="button"
          aria-label="Toggle main sidebar"
          disabled={!onToggleSidebar}
          onClick={onToggleSidebar}
        >
          <PanelLeftCloseIcon aria-hidden="true" />
        </button>
        <span>{labels?.brand ?? "Pulse Code"}</span>
      </header>
      <div data-workspace-navigation-mode="">
        <WorkspaceModeSwitch
          mode={mode}
          onModeChange={onModeChange}
          labels={{ workspace: labels?.workspaceMode ?? "Workspace", code: "Code" }}
        />
      </div>
      <a
        data-workspace-navigation-entrance=""
        data-workspace-navigation-row=""
        href={href("projects")}
        onClick={(event) => navigate(event, "projects")}
      >
        <BriefcaseBusinessIcon aria-hidden="true" />
        <span>Workspace</span>
      </a>
      <div data-workspace-navigation-group="">{labels?.group ?? "Workspace"}</div>
      <nav aria-label="Workspace destinations" data-workspace-navigation-destinations="">
        {workspaceDestinations.map(({ id, label, Icon }) => (
          <div key={id}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    data-workspace-navigation-row=""
                    href={href(id)}
                    aria-current={mode === "workspace" && destination === id ? "page" : undefined}
                    aria-disabled={Boolean(unavailableDestinations?.[id])}
                    aria-describedby={
                      unavailableDestinations?.[id] ? `${reasonId}-${id}` : undefined
                    }
                    onClick={(event) => navigate(event, id)}
                  />
                }
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </TooltipTrigger>
              {unavailableDestinations?.[id] && (
                <TooltipPopup>{unavailableDestinations[id]}</TooltipPopup>
              )}
            </Tooltip>
            {unavailableDestinations?.[id] && (
              <span id={`${reasonId}-${id}`} className="sr-only">
                {unavailableDestinations[id]}
              </span>
            )}
          </div>
        ))}
      </nav>
      <button
        data-workspace-navigation-settings=""
        data-workspace-navigation-row=""
        type="button"
        disabled={!onSettings}
        onClick={onSettings}
      >
        <SettingsIcon aria-hidden="true" />
        <span>Settings</span>
      </button>
      {children}
    </div>
  );
}
