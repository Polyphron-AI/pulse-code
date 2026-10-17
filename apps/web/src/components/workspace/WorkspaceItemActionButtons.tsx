import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

type WorkspaceActionButtonProps = Pick<
  ComponentProps<typeof Button>,
  "ref" | "disabled" | "onClick"
>;

/** Shared action presentation for real item hosts and Browser fixture commands. */
export function WorkspaceItemActionButtons({
  startThread,
  addToProject,
  startProject,
  startAutomation,
  tooltips,
}: {
  startThread: WorkspaceActionButtonProps;
  addToProject?: WorkspaceActionButtonProps | undefined;
  startProject?: WorkspaceActionButtonProps | undefined;
  startAutomation?: WorkspaceActionButtonProps | undefined;
  tooltips?: Partial<Record<"startThread" | "addToProject" | "startProject", ReactNode>>;
}) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button {...startThread} data-workspace-action="startThread" size="sm" variant="outline">
            Start thread
          </Button>
        </TooltipTrigger>
        <TooltipPopup>{tooltips?.startThread ?? "Start thread"}</TooltipPopup>
      </Tooltip>
      {addToProject ? (
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Button
              {...addToProject}
              data-workspace-action="addToProject"
              size="sm"
              variant="ghost"
            >
              Add to project
            </Button>
          </TooltipTrigger>
          <TooltipPopup>{tooltips?.addToProject ?? "Add to project"}</TooltipPopup>
        </Tooltip>
      ) : null}
      {startProject ? (
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Button
              {...startProject}
              data-workspace-action="startProject"
              size="sm"
              variant="ghost"
            >
              Start project
            </Button>
          </TooltipTrigger>
          <TooltipPopup>{tooltips?.startProject ?? "Start project"}</TooltipPopup>
        </Tooltip>
      ) : null}
      {startAutomation ? (
        <Button
          {...startAutomation}
          data-workspace-action="startAutomation"
          size="sm"
          variant="ghost"
        >
          Start automation
        </Button>
      ) : null}
    </>
  );
}
