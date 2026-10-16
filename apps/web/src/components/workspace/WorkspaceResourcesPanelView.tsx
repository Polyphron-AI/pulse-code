import { BotIcon, FileTextIcon, FolderIcon, GlobeIcon, ListTodoIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import type { ProjectId } from "@t3tools/contracts";
import { ProjectPickerView, type WorkspaceProjectOption } from "./ProjectPickerView";
import type { WorkspaceResourceTab } from "./workspaceResourceState";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";

export interface WorkspaceResourcesPanelViewProps {
  readonly projects: readonly WorkspaceProjectOption[];
  readonly selectedProjectId: ProjectId | null;
  readonly status: "loading" | "choose" | "selected" | "unavailable";
  readonly tab: WorkspaceResourceTab;
  readonly onTabChange: (tab: WorkspaceResourceTab) => void;
  readonly onChooseProject: (id: ProjectId) => void;
  readonly body: ReactNode;
  readonly footer: ReactNode;
  readonly onClose: () => void;
}
const resourceTabs = [
  { id: "files", label: "Files", icon: FolderIcon },
  { id: "browser", label: "Browser", icon: GlobeIcon },
  { id: "agents", label: "Agents", icon: BotIcon },
  { id: "tasks", label: "Tasks", icon: ListTodoIcon },
  { id: "docs", label: "Docs", icon: FileTextIcon },
  { id: "prs", label: "PRs", icon: PullRequestGlyph.pullRequest },
] as const;

/** Dev-safe chrome. The caller supplies exactly one live or fixture body. */
export function WorkspaceResourcesPanelView(props: WorkspaceResourcesPanelViewProps): ReactNode {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = useState<WorkspaceResourceTab>(props.tab);
  const [selected, setSelected] = useState(props.tab);
  if (selected !== props.tab) {
    setSelected(props.tab);
    setFocused(props.tab);
  }
  return (
    <div data-workspace-resource-frame="" data-resource-status={props.status}>
      <header data-workspace-resource-project="">
        <ProjectPickerView
          projects={props.projects}
          selectedProjectId={props.selectedProjectId}
          onChooseProject={(projectId) => {
            if (projectId !== null) props.onChooseProject(projectId);
          }}
        />
        <button type="button" aria-label="Close resources" onClick={props.onClose}>
          <XIcon />
        </button>
      </header>
      <div role="tablist" aria-label="Project resources" data-workspace-resource-tabs="">
        {resourceTabs.map(({ id: tab, label, icon: Icon }, index) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`${id}-${tab}`}
            aria-selected={props.tab === tab}
            aria-controls={`${id}-body`}
            tabIndex={focused === tab ? 0 : -1}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            onFocus={() => setFocused(tab)}
            onClick={() => props.onTabChange(tab)}
            onKeyDown={(event) => {
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? resourceTabs.length - 1
                    : event.key === "ArrowRight"
                      ? (index + 1) % resourceTabs.length
                      : event.key === "ArrowLeft"
                        ? (index - 1 + resourceTabs.length) % resourceTabs.length
                        : null;
              if (next !== null) {
                event.preventDefault();
                buttons.current[next]?.focus();
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                props.onTabChange(tab);
              }
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-body`}
        aria-labelledby={`${id}-${props.tab}`}
        tabIndex={0}
        data-workspace-resource-body=""
      >
        {props.body}
      </div>
      <footer data-workspace-resource-footer="">{props.footer}</footer>
    </div>
  );
}
