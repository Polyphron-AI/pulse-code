import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

type WorkspaceActionButtonProps = Pick<
  ComponentProps<typeof Button>,
  "ref" | "disabled" | "onClick"
>;

/** Shared action presentation for real item hosts and Browser fixture commands. */
export function WorkspaceItemActionButtons({
  layout = "toolbar",
  startThread,
  addToProject,
  startProject,
  startAutomation,
  tooltips,
}: {
  layout?: "toolbar" | "menu" | undefined;
  startThread: WorkspaceActionButtonProps;
  addToProject?: WorkspaceActionButtonProps | undefined;
  startProject?: WorkspaceActionButtonProps | undefined;
  startAutomation?: WorkspaceActionButtonProps | undefined;
  tooltips?: Partial<Record<"startThread" | "addToProject" | "startProject", ReactNode>>;
}) {
  const size = layout === "menu" ? "xs" : "sm";
  const actions = (
    <>
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button
            {...startThread}
            data-workspace-action="startThread"
            size={size}
            variant={layout === "menu" ? "ghost" : "outline"}
          >
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
              size={size}
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
              size={size}
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
          size={size}
          variant="ghost"
        >
          Start automation
        </Button>
      ) : null}
    </>
  );
  return layout === "menu" ? (
    <div className="flex flex-col items-start gap-1 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11">
      {actions}
    </div>
  ) : (
    actions
  );
}
