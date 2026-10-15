import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import { BriefcaseBusinessIcon, Code2Icon, MailIcon } from "lucide-react";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
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
export function useProjectsSpace() {
  return useLocation({
    select: (location) =>
      location.pathname === "/workspace" && location.search.space === "projects",
  });
}

/** Desktop keeps the rail across every space; compact clients use the navigation menu. */
export function WorkspaceSpaceSelector({ rail = false }: { readonly rail?: boolean }) {
  const projects = useProjectsSpace();
  const office = useOfficeSpace();
  const mail = useMailSpace();
  const navigate = useNavigate();
  const location = useLocation();
  const environment = location.pathname === "/workspace" ? location.search.environment : undefined;
  const mailAvailable = useMailCapabilities(
    environment ? EnvironmentId.make(environment) : undefined,
  ).mailRead;
  const { isMobile, setOpenMobile } = useSidebar();
  const settings = location.pathname.startsWith("/settings");
  const inCode = !office && !mail && !projects && !settings;
  useEffect(() => {
    if (inCode && location.pathname !== "/") lastCodeHref = location.href;
  }, [inCode, location.pathname, location.href]);
  const leave = () => {
    if (inCode && location.pathname !== "/") lastCodeHref = location.href;
    if (isMobile) setOpenMobile(false);
  };
  const spaces = [
    {
      id: "mail",
      label: "Mail",
      Icon: MailIcon,
      active: mail,
      disabled: !mailAvailable && !mail,
      run: () => {
        leave();
        if (!mail)
          void navigate({
            to: "/workspace",
            search: { space: "mail", ...(environment === undefined ? {} : { environment }) },
          });
      },
    },
    {
      id: "projects",
      label: "Projects",
      Icon: BriefcaseBusinessIcon,
      active: projects,
      disabled: false,
      run: () => {
        leave();
        if (!projects)
          void navigate({
            to: "/workspace",
            search: { space: "projects", ...(environment === undefined ? {} : { environment }) },
          });
      },
    },
    {
      id: "code",
      label: "Code",
      Icon: Code2Icon,
      active: inCode,
      disabled: false,
      run: () => {
        leave();
        if (!inCode) void navigate({ href: lastCodeHref });
      },
    },
  ];
  if (rail)
    return (
      <nav
        aria-label="Workspace spaces"
        className="relative z-[1] flex w-16 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar px-1 pt-12 text-sidebar-foreground"
      >
        {spaces.map(({ id, label, Icon, active, disabled, run }) => (
          <Tooltip key={id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  aria-disabled={disabled}
                  onClick={() => {
                    if (!disabled) run();
                  }}
                  className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover focus-visible:outline-2 focus-visible:outline-ring aria-disabled:cursor-default aria-disabled:opacity-50 aria-[current=page]:bg-sidebar-row-active aria-[current=page]:text-sidebar-foreground"
                />
              }
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </TooltipTrigger>
            <TooltipPopup>
              {disabled ? `${label} is unavailable on this server` : label}
            </TooltipPopup>
          </Tooltip>
        ))}
      </nav>
    );
  return (
    <div className="relative z-[1] px-2 pb-1 md:hidden">
      <div
        role="group"
        aria-label="Workspace space"
        className="flex gap-1 rounded-lg border border-sidebar-border p-1"
      >
        {spaces.map(({ id, label, Icon, active, disabled, run }) => (
          <Button
            key={id}
            size="xs"
            variant={active ? "secondary" : "ghost"}
            aria-pressed={active}
            disabled={disabled}
            className="min-w-0 flex-1"
            onClick={run}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
