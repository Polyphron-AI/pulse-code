import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { BriefcaseBusinessIcon, Code2Icon, MailIcon } from "lucide-react";
import { useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";
import { useMailCapabilities } from "./mail/useMailCapabilities";

let lastCodeHref = "/";

export function useOfficeSpace() {
  return useLocation({
    select: (location) => location.pathname === "/workspace" && location.search.space === "office",
  });
}

export function useMailSpace() {
  return useLocation({
    select: (location) => location.pathname === "/workspace" && location.search.space === "mail",
  });
}

export function WorkspaceSpaceSelector() {
  const office = useOfficeSpace();
  const mail = useMailSpace();
  const mailAvailable = useMailCapabilities().mailRead;
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const settings = location.pathname.startsWith("/settings");
  const inCode = !office && !mail && !settings;
  useEffect(() => {
    if (inCode && location.pathname !== "/") lastCodeHref = location.href;
  }, [inCode, location.pathname, location.href]);
  // Only a Code location is worth returning to; Office and Mail are one click away.
  const leave = () => {
    if (inCode && location.pathname !== "/") lastCodeHref = location.href;
    if (isMobile) setOpenMobile(false);
  };
  return (
    <div className="relative z-[1] px-2 pb-1">
      <div
        className="flex gap-1 rounded-lg border border-sidebar-border p-1"
        role="group"
        aria-label="Workspace space"
      >
        <Button
          size="xs"
          variant={office ? "secondary" : "ghost"}
          aria-pressed={office}
          className="min-w-0 flex-1"
          onClick={() => {
            leave();
            void navigate({ to: "/workspace", search: { space: "office" } });
          }}
        >
          <BriefcaseBusinessIcon className="size-3.5" />
          Office
        </Button>
        {mailAvailable || mail ? (
          <Button
            size="xs"
            variant={mail ? "secondary" : "ghost"}
            aria-pressed={mail}
            className="min-w-0 flex-1"
            onClick={() => {
              leave();
              if (!mail) void navigate({ to: "/workspace", search: { space: "mail" } });
            }}
          >
            <MailIcon className="size-3.5" />
            Mail
          </Button>
        ) : null}
        <Button
          size="xs"
          variant={inCode ? "secondary" : "ghost"}
          aria-pressed={inCode}
          className="min-w-0 flex-1"
          onClick={() => {
            leave();
            if (!inCode) void navigate({ href: lastCodeHref });
          }}
        >
          <Code2Icon className="size-3.5" />
          Code
        </Button>
      </div>
    </div>
  );
}
