import { FolderIcon, LinkIcon } from "lucide-react";
import type { Ref } from "react";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

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
  readonly resourcesLabel?: string;
  readonly onResources: () => void;
  readonly resourcesTriggerRef?: Ref<HTMLButtonElement>;
  readonly onLinkedContext?: () => void;
  readonly linkedContextLabel?: string;
  readonly linkedContextOpen?: boolean;
}

export function WorkspaceHeader({
  model,
  resourcesOpen,
  resourcesLabel = "Resources",
  onResources,
  resourcesTriggerRef,
  onLinkedContext,
  linkedContextLabel = "Linked context",
  linkedContextOpen,
}: WorkspaceHeaderProps) {
  return (
    <WorkspacePageHeader variant="workspace" data-workspace-engagement-header="">
      <div data-workspace-header-copy="">
        <h1>{model.title}</h1>
        {model.subtitle ? <p>{model.subtitle}</p> : null}
      </div>
      <div data-workspace-header-controls="">
        {onLinkedContext ? (
          <button
            type="button"
            aria-label={linkedContextLabel}
            aria-expanded={linkedContextOpen}
            onClick={onLinkedContext}
          >
            <LinkIcon />
          </button>
        ) : null}
        <button
          ref={resourcesTriggerRef}
          data-workspace-resources-trigger={resourcesLabel === "Resources" ? "" : undefined}
          type="button"
          aria-expanded={resourcesOpen}
          onClick={onResources}
        >
          <FolderIcon />
          {resourcesLabel}
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
