import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { BriefcaseBusinessIcon, Code2Icon } from "lucide-react";
import { useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";

let lastCodeHref = "/workspace";

export function useOfficeSpace() {
  return useLocation({
    select: (location) => location.pathname === "/workspace" && location.search.space === "office",
  });
}

export function WorkspaceSpaceSelector() {
  const office = useOfficeSpace();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const settings = location.pathname.startsWith("/settings");
  useEffect(() => {
    if (!office && !settings && location.pathname !== "/") lastCodeHref = location.href;
  }, [office, settings, location.pathname, location.href]);
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <div className="relative z-[1] px-[var(--sidebar-content-inset)] pb-1">
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
            if (!office && !location.pathname.startsWith("/settings") && location.pathname !== "/")
              lastCodeHref = location.href;
            closeMobileSidebar();
            void navigate({ to: "/workspace", search: { space: "office" } });
          }}
        >
          <BriefcaseBusinessIcon className="size-3.5" />
          Office
        </Button>
        <Button
          size="xs"
          variant={!office && !settings ? "secondary" : "ghost"}
          aria-pressed={!office && !settings}
          className="min-w-0 flex-1"
          onClick={() => {
            closeMobileSidebar();
            if (office || settings) void navigate({ href: lastCodeHref });
          }}
        >
          <Code2Icon className="size-3.5" />
          Code
        </Button>
      </div>
    </div>
  );
}
