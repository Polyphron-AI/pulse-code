import { FolderIcon, LinkIcon, EllipsisIcon } from "lucide-react";
import type { Ref } from "react";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export interface WorkspaceHeaderModel {
  readonly title: string;
  readonly subtitle?: string;
  readonly environmentLabel: string;
  readonly spaceLabel: string;
  readonly owner?: { readonly name: string; readonly initials: string };
  readonly sample?: boolean;
}
export interface WorkspaceHeaderProps {
  readonly model: WorkspaceHeaderModel;
  readonly resourcesOpen: boolean;
  readonly onResources: () => void;
  readonly resourcesTriggerRef?: Ref<HTMLButtonElement>;
  readonly onLinkedContext?: (() => void) | undefined;
  readonly linkedContextTriggerRef?: Ref<HTMLButtonElement>;
  readonly linkedContextOpen?: boolean;
}

export function WorkspaceHeader({
  model,
  resourcesOpen,
  onResources,
  resourcesTriggerRef,
  onLinkedContext,
  linkedContextTriggerRef,
  linkedContextOpen,
}: WorkspaceHeaderProps) {
  const inlineContext = useMediaQuery("md");
  return (
    <WorkspacePageHeader variant="workspace" data-workspace-engagement-header="">
      <div data-workspace-header-copy="">
        <h1>{model.title}</h1>
        {model.subtitle ? <p>{model.subtitle}</p> : null}
      </div>
      <div data-workspace-header-controls="">
        {onLinkedContext ? (
          inlineContext ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    ref={linkedContextTriggerRef}
                    data-workspace-linked-context-trigger=""
                    data-workspace-action="linkedContext"
                    type="button"
                    aria-label="Linked context"
                    aria-expanded={linkedContextOpen}
                    onClick={onLinkedContext}
                  />
                }
              >
                <LinkIcon />
              </TooltipTrigger>
              <TooltipPopup>Linked context</TooltipPopup>
            </Tooltip>
          ) : (
            <>
              <button
                hidden
                type="button"
                data-workspace-action="linkedContext"
                onClick={onLinkedContext}
              />
              <Menu>
                <MenuTrigger
                  ref={linkedContextTriggerRef}
                  data-workspace-actions-trigger=""
                  aria-label="Workspace actions"
                >
                  <EllipsisIcon />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={onLinkedContext}>
                    <LinkIcon />
                    Linked context
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </>
          )
        ) : null}
        <button
          ref={resourcesTriggerRef}
          data-workspace-resources-trigger=""
          data-workspace-action="resources"
          type="button"
          aria-expanded={resourcesOpen}
          onClick={onResources}
        >
          <FolderIcon />
          Resources
        </button>
        {model.owner ? (
          <span data-workspace-owner="" role="img" aria-label={model.owner.name}>
            {model.owner.initials}
          </span>
        ) : null}
      </div>
    </WorkspacePageHeader>
  );
}
