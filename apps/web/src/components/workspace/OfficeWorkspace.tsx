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
import { Badge } from "../ui/badge";
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
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Office workspace</h1>
              <Badge variant="outline">Integration preview</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Meetings, calendar and email alongside your coding work.
            </p>
          </div>
          <Card className="gap-2 p-5">
            <h2 className="font-medium">Your office is ready to connect</h2>
            <p className="text-sm text-muted-foreground">
              This workspace uses the existing Pulse interface. Office services are not connected
              yet; no recordings, emails or calendar events have been loaded.
            </p>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card id="office-meetings" className="gap-3 p-5">
              <MicIcon className="size-5 text-muted-foreground" />
              <h2 className="font-semibold">Meetings</h2>
              <p className="text-sm text-muted-foreground">
                Recording and meeting history will be supplied by Pulse Talk. Local voice remains
                optional, with transcription and summaries only on request.
              </p>
              <Badge variant="outline">Not connected</Badge>
            </Card>
            <Card id="office-calendar" className="gap-3 p-5">
              <CalendarDaysIcon className="size-5 text-muted-foreground" />
              <h2 className="font-semibold">Calendar</h2>
              <p className="text-sm text-muted-foreground">
                A combined agenda for selected Google calendars, with reminders and a passive
                meeting board.
              </p>
              <Badge variant="outline">Not connected</Badge>
            </Card>
            <Card id="office-email" className="gap-3 p-5">
              <MailIcon className="size-5 text-muted-foreground" />
              <h2 className="font-semibold">Email</h2>
              <p className="text-sm text-muted-foreground">
                Email belongs in Office. Provider and message-action support are still being
                defined; no mailbox access is requested here.
              </p>
              <Badge variant="outline">Planned</Badge>
            </Card>
            <Card className="gap-3 p-5">
              <h2 className="font-semibold">Shared context</h2>
              <p className="text-sm text-muted-foreground">
                Pulse Online connects chat and bug context across Office and Code. Cross-device chat
                synchronization follows the Windows desktop milestone.
              </p>
              <Badge variant="outline">Sync not available yet</Badge>
            </Card>
          </div>
        </div>
      </main>
    </SidebarInset>
  );
}
