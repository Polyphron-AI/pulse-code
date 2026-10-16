import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import { BriefcaseBusinessIcon, Code2Icon } from "lucide-react";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { Button } from "../ui/button";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { type DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { resolveThreadRouteTarget } from "../../threadRoutes";
import {
  codeReturnHref,
  getLastCodeEnvironmentId,
  parseWorkspaceSearch,
  rememberCodeLocation,
  rememberWorkspaceLocation,
  workspaceReturnSearch,
  workspaceDestinations,
  workspaceDestinationSearch,
  type WorkspaceSearch,
} from "./workspaceNavigation";

export function useOfficeSpace() {
  return useLocation({
    select: (location) => {
      const search = parseWorkspaceSearch(location.search);
      return (
        location.pathname === "/workspace" && search.space !== "mail" && search.space !== "projects"
      );
    },
  });
}
export function useMailSpace() {
  return useLocation({
    select: (location) =>
      location.pathname === "/workspace" && parseWorkspaceSearch(location.search).space === "mail",
  });
}
export function useProjectsSpace() {
  return useLocation({
    select: (location) =>
      location.pathname === "/workspace" &&
      parseWorkspaceSearch(location.search).space === "projects",
  });
}

/** Resolves explicit Workspace, thread and draft scope before session return scope. */
export function useWorkspaceEnvironment(search?: WorkspaceSearch) {
  const target = useParams({ strict: false, select: resolveThreadRouteTarget });
  const draftEnvironmentId = useComposerDraftStore((store) =>
    target?.kind === "draft"
      ? store.getDraftThread(target.draftId as DraftId)?.environmentId
      : undefined,
  );
  return search?.environment
    ? EnvironmentId.make(search.environment)
    : ((target?.kind === "server" ? target.threadRef.environmentId : draftEnvironmentId) ??
        getLastCodeEnvironmentId());
}

/** Desktop keeps the rail across every space; compact clients use the navigation menu. */
export function WorkspaceSpaceSelector({ rail = false }: { readonly rail?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = location.pathname === "/workspace";
  const workspaceSearch = useMemo(
    () => (workspace ? parseWorkspaceSearch(location.search) : undefined),
    [workspace, location.search],
  );
  const explicitEnvironmentId = useWorkspaceEnvironment(workspaceSearch);
  const { mailRead, environmentId } = useMailCapabilities(explicitEnvironmentId);
  const { isMobile, setOpenMobile } = useSidebar();
  const inCode = !workspace && !location.pathname.startsWith("/settings");
  useEffect(() => {
    if (!environmentId) return;
    if (inCode) rememberCodeLocation(environmentId, location.href);
    if (workspaceSearch) rememberWorkspaceLocation(environmentId, workspaceSearch);
  }, [environmentId, inCode, location.href, workspaceSearch]);
  const leave = () => {
    if (inCode && environmentId) rememberCodeLocation(environmentId, location.href);
    if (isMobile) setOpenMobile(false);
  };
  const modeSpaces = [
    {
      id: "workspace",
      label: "Workspace",
      Icon: BriefcaseBusinessIcon,
      active: false,
      disabled: false,
      run: () => {
        leave();
        void navigate({
          to: "/workspace",
          search: workspaceReturnSearch(environmentId),
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
        if (!inCode) void navigate({ href: environmentId ? codeReturnHref(environmentId) : "/" });
      },
    },
  ];
  const spaces = inCode
    ? modeSpaces
    : [
        ...workspaceDestinations.map(({ id, label, Icon }) => ({
          id,
          label,
          Icon,
          active: workspaceSearch?.space === id,
          disabled: id === "mail" && !mailRead && workspaceSearch?.space !== "mail",
          run: () => {
            leave();
            void navigate({
              to: "/workspace",
              search: workspaceDestinationSearch(id, environmentId),
            });
          },
        })),
        modeSpaces[1]!,
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
