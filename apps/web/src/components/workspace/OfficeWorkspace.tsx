import { SidebarInset } from "../ui/sidebar";
import { OfficePanel } from "./office/OfficePanel";
import { TalkPanel } from "./office/TalkPanel";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { cn } from "../../lib/utils";

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
