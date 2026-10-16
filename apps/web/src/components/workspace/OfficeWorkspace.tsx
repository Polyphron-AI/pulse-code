import { Link, useSearch } from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import { BriefcaseBusinessIcon, SettingsIcon } from "lucide-react";
import { workspaceDestinations, workspaceDestinationSearch } from "./workspaceNavigation";
import { isElectron } from "../../env";
import { SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { OfficePanel } from "./office/OfficePanel";
import { TalkPanel } from "./office/TalkPanel";
import { SidebarContent, SidebarGroup, SidebarInset, useSidebar } from "../ui/sidebar";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { cn } from "../../lib/utils";

export function OfficeSidebar() {
  const search = useSearch({ strict: false });
  const environmentId = search.environment ? EnvironmentId.make(search.environment) : undefined;
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent>
        <SidebarGroup>
          <div className="flex flex-col gap-1">
            {workspaceDestinations.map(({ id, label, Icon }) => (
              <Link
                key={id}
                onClick={closeMobileSidebar}
                to="/workspace"
                search={workspaceDestinationSearch(id, environmentId)}
                aria-current={search.space === id ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-sm",
                  search.space === id
                    ? "bg-sidebar-row-active font-medium"
                    : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
            <Link
              onClick={closeMobileSidebar}
              to="/workspace"
              search={{ space: "office" }}
              aria-current={search.space === "office" ? "page" : undefined}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover"
            >
              <BriefcaseBusinessIcon className="size-4" />
              Local Office tools
            </Link>
          </div>
        </SidebarGroup>
        <div className="mt-auto p-2">
          <Link
            onClick={closeMobileSidebar}
            to="/settings"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover"
          >
            <SettingsIcon className="size-4" />
            Settings
          </Link>
        </div>
      </SidebarContent>
    </>
  );
}

export function OfficeWorkspace() {
  return (
    <SidebarInset className="min-w-0">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center border-b border-border px-4 text-sm text-muted-foreground",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
      >
        Workspace / Office
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Office</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your meetings, messages and week ahead.
            </p>
          </div>
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              {window.desktopBridge?.talkInvoke ? (
                <TalkPanel />
              ) : (
                <section
                  id="office-meetings"
                  className="flex flex-col gap-2 rounded-xl border bg-background p-5"
                >
                  <h2 className="font-semibold">Pulse Talk</h2>
                  <p className="text-sm text-muted-foreground">
                    Open Pulse on Windows to enable local recording and transcription.
                  </p>
                </section>
              )}
            </div>
            <div className="min-w-0 space-y-6">
              {window.desktopBridge?.officeInvoke ? (
                <OfficePanel />
              ) : (
                <section
                  id="office-calendar"
                  className="flex flex-col gap-2 rounded-xl border bg-background p-5"
                >
                  <h2 id="office-email" className="font-semibold">
                    Calendar and email
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Connect your accounts in the Pulse Windows desktop app. Office accounts are
                    stored on that computer and are not available through remote web connections.
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      </main>
    </SidebarInset>
  );
}
