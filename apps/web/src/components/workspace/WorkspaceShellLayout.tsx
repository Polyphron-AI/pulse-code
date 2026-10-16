import { cn } from "../../lib/utils";
import type { ReactNode } from "react";
import "./workspaceShell.css";
import { WorkspaceBreadcrumb } from "../WorkspaceBreadcrumb";
import type { WorkspaceHeaderModel } from "./WorkspaceHeader";

export interface WorkspaceShellLayoutProps {
  readonly navigation: ReactNode;
  readonly breadcrumb?: ReactNode;
  readonly header?: WorkspaceHeaderModel;
  readonly onOpenWorkspace?: () => void;
  readonly electron?: boolean;
  readonly rail: ReactNode;
  readonly engagement: ReactNode;
}

export function WorkspaceShellLayout({
  navigation,
  breadcrumb,
  header,
  onOpenWorkspace,
  electron = false,
  rail,
  engagement,
}: WorkspaceShellLayoutProps) {
  return (
    <div
      data-workspace-shell=""
      className={cn("flex min-h-0 min-w-0 flex-1", electron && "wco:[--workspace-caption-band:1]")}
    >
      <div
        data-workspace-shell-navigation=""
        className="w-[207px] shrink-0 border-r border-sidebar-border bg-sidebar"
      >
        {navigation}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header && onOpenWorkspace ? (
          <div
            data-workspace-breadcrumb-strip=""
            className={cn(
              "pr-3.25",
              electron && "drag-region wco:pr-(--workspace-native-controls-inset)",
            )}
          >
            <WorkspaceBreadcrumb
              variant="workspace"
              {...header}
              onOpenWorkspace={onOpenWorkspace}
            />
          </div>
        ) : (
          breadcrumb
        )}
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="w-[52px] shrink-0">{rail}</div>
          {engagement}
        </div>
      </div>
    </div>
  );
}
