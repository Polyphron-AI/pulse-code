import { useEffect } from "react";
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
  parseWorkspaceSearch,
  rememberCodeLocation,
  workspaceDestinations,
  workspaceDestinationSearch,
  type WorkspaceSearch,
} from "./workspaceNavigation";

const workspaceLocations = new Map<EnvironmentId, WorkspaceSearch>();

export function useOfficeSpace() {
  return useLocation({
    select: (location) =>
      location.pathname === "/workspace" &&
      location.search.space !== "mail" &&
      location.search.space !== "projects",
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
  const navigate = useNavigate();
  const location = useLocation();
  const target = useParams({ strict: false, select: resolveThreadRouteTarget });
  const draftEnvironmentId = useComposerDraftStore((store) =>
    target?.kind === "draft"
      ? store.getDraftThread(target.draftId as DraftId)?.environmentId
      : undefined,
  );
  const workspace = location.pathname === "/workspace";
  const codeEnvironmentId =
    target?.kind === "server" ? target.threadRef.environmentId : draftEnvironmentId;
  const explicitEnvironmentId =
    workspace && location.search.environment
      ? EnvironmentId.make(location.search.environment)
      : codeEnvironmentId;
  const { mailRead, environmentId } = useMailCapabilities(explicitEnvironmentId);
  const { isMobile, setOpenMobile } = useSidebar();
  const inCode = !workspace && (location.pathname === "/" || target !== null);
  useEffect(() => {
    if (!environmentId) return;
    if (inCode) rememberCodeLocation(environmentId, location.href);
    if (workspace)
      workspaceLocations.set(environmentId, {
        ...parseWorkspaceSearch(location.search),
        environment: environmentId,
      });
  }, [environmentId, inCode, workspace, location.href, location.search]);
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
          search:
            (environmentId ? workspaceLocations.get(environmentId) : undefined) ??
            workspaceDestinationSearch("projects", environmentId),
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
          active: workspace && location.search.space === id,
          disabled: id === "mail" && !mailRead && location.search.space !== "mail",
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
