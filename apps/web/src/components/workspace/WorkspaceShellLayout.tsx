import type { ReactNode } from "react";
import "./workspaceShell.css";

export interface WorkspaceShellLayoutProps {
  readonly navigation: ReactNode;
  readonly breadcrumb: ReactNode;
  readonly rail: ReactNode;
  readonly engagement: ReactNode;
}

export function WorkspaceShellLayout({
  navigation,
  breadcrumb,
  rail,
  engagement,
}: WorkspaceShellLayoutProps) {
  return (
    <div data-workspace-shell="" className="flex min-h-0 min-w-0 flex-1">
      <nav
        aria-label="Workspace navigation"
        data-workspace-shell-navigation=""
        className="w-[207px] shrink-0 border-r border-sidebar-border bg-sidebar"
      >
        {navigation}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {breadcrumb}
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="w-[52px] shrink-0">{rail}</div>
          {engagement}
        </div>
      </div>
    </div>
  );
}
