import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useSidebar } from "../ui/sidebar";
import { WorkspaceModeSwitch } from "./WorkspaceNavigationView";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceEnvironment } from "./useWorkspaceEnvironment";
import {
  codeReturnHref,
  parseWorkspaceSearch,
  rememberCodeLocation,
  rememberWorkspaceLocation,
  workspaceReturnSearch,
  workspaceDestinationSearch,
  type WorkspaceDestination,
} from "./workspaceNavigation";

/** Shared route scope and return memory for the live sidebar and mode switch. */
export function useWorkspaceNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = location.pathname === "/workspace";
  const search = useMemo(
    () => (workspace ? parseWorkspaceSearch(location.search) : undefined),
    [workspace, location.search],
  );
  const explicitEnvironmentId = useWorkspaceEnvironment(search);
  const { mailRead, environmentId } = useMailCapabilities(explicitEnvironmentId);
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const inCode = !workspace && !location.pathname.startsWith("/settings");
  const leave = () => {
    if (inCode && environmentId) rememberCodeLocation(environmentId, location.href);
    if (isMobile) setOpenMobile(false);
  };
  return {
    environmentId,
    search,
    workspace,
    mode: workspace ? ("workspace" as const) : inCode ? ("code" as const) : undefined,
    ...(!mailRead && search?.space !== "mail"
      ? { unavailableDestinations: { mail: "Email is unavailable on this server." } }
      : {}),
    onModeChange: (mode: "workspace" | "code") => {
      leave();
      if (mode === "workspace")
        void navigate({ to: "/workspace", search: workspaceReturnSearch(environmentId) });
      else if (!inCode)
        void navigate({ href: environmentId ? codeReturnHref(environmentId) : "/" });
    },
    onNavigate: (destination: WorkspaceDestination) => {
      leave();
      void navigate({
        to: "/workspace",
        search: workspaceDestinationSearch(destination, environmentId, search),
      });
    },
    onSettings: () => {
      leave();
      void navigate({ to: "/settings" });
    },
    onToggleSidebar: toggleSidebar,
  };
}

/** Keeps return memory current even when a compact Code sidebar is unmounted. */
export function WorkspaceNavigationTracker() {
  const { environmentId, search } = useWorkspaceNavigation();
  const location = useLocation();
  useEffect(() => {
    if (!environmentId) return;
    if (search) rememberWorkspaceLocation(environmentId, search);
    else if (!location.pathname.startsWith("/settings"))
      rememberCodeLocation(environmentId, location.href);
  }, [environmentId, search, location.href, location.pathname]);
  return null;
}

/** Code uses a compact two-mode switch; Workspace keeps its destination navigation. */
export function WorkspaceSpaceSelector() {
  const navigation = useWorkspaceNavigation();
  return (
    <div className="relative z-[1] px-2 pb-1">
      <WorkspaceModeSwitch mode={navigation.mode} onModeChange={navigation.onModeChange} />
    </div>
  );
}
