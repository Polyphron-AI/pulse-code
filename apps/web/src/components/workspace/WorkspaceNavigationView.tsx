import type { EnvironmentId } from "@t3tools/contracts";
import { BriefcaseBusinessIcon, Code2Icon, PanelLeftCloseIcon, SettingsIcon } from "lucide-react";
import type { ReactNode, MouseEvent } from "react";
import { useId } from "react";
import { SidebarStageBackdrop, type SidebarStageBackdropVariant } from "../SidebarStageBackdropArt";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  workspaceDestinations,
  workspaceDestinationSearch,
  type WorkspaceDestination,
} from "./workspaceNavigation";
import "./workspaceShell.css";

export interface WorkspaceNavigationProps {
  readonly destination?: WorkspaceDestination | undefined;
  readonly environmentId?: EnvironmentId | null;
  readonly mode: "workspace" | "code" | undefined;
  readonly onModeChange: (mode: "workspace" | "code") => void;
  readonly onNavigate: (destination: WorkspaceDestination) => void;
  readonly onSettings?: () => void;
  readonly onToggleSidebar?: () => void;
  readonly labels?: {
    readonly brand?: string;
    readonly workspaceMode?: string;
    readonly group?: string;
  };
  readonly backdropVariant?: SidebarStageBackdropVariant | null;
  readonly children?: ReactNode;
  readonly unavailableDestinations?: Partial<Record<WorkspaceDestination, string>> | undefined;
}
export interface WorkspaceModeSwitchProps {
  readonly mode: "workspace" | "code" | undefined;
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
  backdropVariant,
  unavailableDestinations,
}: WorkspaceNavigationProps) {
  const reasonId = useId();
  const href = (id: WorkspaceDestination) =>
    `/workspace?${new URLSearchParams({ ...workspaceDestinationSearch(id, environmentId) }).toString()}`;
  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: WorkspaceDestination) => {
    if (unavailableDestinations?.[id]) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onNavigate(id);
  };
  return (
    <div data-workspace-navigation="">
      <header data-workspace-navigation-brand="">
        {backdropVariant && <SidebarStageBackdrop variant={backdropVariant} workspace />}
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
        aria-disabled={Boolean(unavailableDestinations?.projects)}
        aria-describedby={unavailableDestinations?.projects ? `${reasonId}-projects` : undefined}
        onClick={(event) => navigate(event, "projects")}
        onAuxClick={(event) => navigate(event, "projects")}
      >
        <BriefcaseBusinessIcon aria-hidden="true" />
        <span>Workspace</span>
      </a>
      <div data-workspace-navigation-group="">{labels?.group ?? "Workspace"}</div>
      <nav aria-label="Workspace destinations" data-workspace-navigation-destinations="">
        {workspaceDestinations.map(({ id, label, Icon }) => {
          const reason = unavailableDestinations?.[id];
          const link = (
            <a
              data-workspace-navigation-row=""
              href={href(id)}
              aria-current={mode === "workspace" && destination === id ? "page" : undefined}
              aria-disabled={Boolean(reason)}
              aria-describedby={reason ? `${reasonId}-${id}` : undefined}
              onClick={(event) => navigate(event, id)}
              onAuxClick={(event) => navigate(event, id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </a>
          );
          return (
            <div key={id}>
              {reason ? (
                <Tooltip>
                  <TooltipTrigger render={link} />
                  <TooltipPopup>{reason}</TooltipPopup>
                </Tooltip>
              ) : (
                link
              )}
              {reason && (
                <span id={`${reasonId}-${id}`} className="sr-only">
                  {reason}
                </span>
              )}
            </div>
          );
        })}
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
