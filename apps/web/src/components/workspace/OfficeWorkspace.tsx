import { Link } from "@tanstack/react-router";
import {
  BriefcaseBusinessIcon,
  CalendarDaysIcon,
  MailIcon,
  MicIcon,
  SettingsIcon,
} from "lucide-react";
import { isElectron } from "../../env";
import { SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { OfficePanel } from "./office/OfficePanel";
import { TalkPanel } from "./office/TalkPanel";
import { Card } from "../ui/card";
import { SidebarContent, SidebarGroup, SidebarInset, useSidebar } from "../ui/sidebar";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { cn } from "../../lib/utils";

export function OfficeSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent>
        <SidebarGroup className="gap-1 p-[var(--sidebar-content-inset)]">
          <Link
            onClick={closeMobileSidebar}
            to="/workspace"
            search={{ space: "office" }}
            aria-current="page"
            className="flex h-8 items-center gap-2 rounded-md bg-sidebar-row-active px-2 text-sm font-medium"
          >
            <BriefcaseBusinessIcon className="size-4" />
            Workspace
          </Link>
          <span className="px-2 pt-4 pb-1 text-xs text-sidebar-muted-foreground">Office</span>
          <a
            onClick={closeMobileSidebar}
            href="#office-meetings"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover"
          >
            <MicIcon className="size-4" />
            Meetings
          </a>
          <a
            onClick={closeMobileSidebar}
            href="#office-calendar"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover"
          >
            <CalendarDaysIcon className="size-4" />
            Calendar
          </a>
          <a
            onClick={closeMobileSidebar}
            href="#office-email"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover"
          >
            <MailIcon className="size-4" />
            Email
          </a>
        </SidebarGroup>
        <div className="mt-auto p-[var(--sidebar-content-inset)]">
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
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Office workspace</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Meetings, calendar and email alongside your coding work.
            </p>
          </div>
          {window.desktopBridge?.talkInvoke ? (
            <TalkPanel />
          ) : (
            <Card id="office-meetings" className="gap-2 p-5">
              <h2 className="font-semibold">Pulse Talk</h2>
              <p className="text-sm text-muted-foreground">
                Open Pulse on Windows to enable local recording and transcription.
              </p>
            </Card>
          )}
          {window.desktopBridge?.officeInvoke ? (
            <OfficePanel />
          ) : (
            <Card id="office-calendar" className="gap-2 p-5">
              <h2 id="office-email" className="font-semibold">
                Calendar and email
              </h2>
              <p className="text-sm text-muted-foreground">
                Connect your accounts in the Pulse Windows desktop app. Office accounts are stored
                on that computer and are not available through remote web connections.
              </p>
            </Card>
          )}
        </div>
      </main>
    </SidebarInset>
  );
}
