import type { ProjectId } from "@t3tools/contracts";
import { FolderIcon, ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Combobox,
  ComboboxTrigger,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "../ui/combobox";

export interface WorkspaceProjectOption {
  readonly id: ProjectId;
  readonly title: string;
  readonly icon?: ReactNode;
}
export interface ProjectPickerViewProps {
  readonly projects: readonly WorkspaceProjectOption[];
  readonly selectedProjectId: ProjectId | null;
  readonly allowAll?: boolean;
  readonly onChooseProject: (id: ProjectId | null) => void;
  readonly renderProjectActions?: (id: ProjectId, row: ReactNode) => ReactNode;
}

/** Shared searchable picker. Only the live caller supplies navigation or item menus. */
export function ProjectPickerView({
  projects,
  selectedProjectId,
  allowAll = false,
  onChooseProject,
  renderProjectActions,
}: ProjectPickerViewProps): ReactNode {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const items: {
    readonly id: ProjectId | null;
    readonly title: string;
    readonly icon?: ReactNode;
  }[] = [
    ...(allowAll ? [{ id: null, title: "All projects", icon: <FolderIcon /> }] : []),
    ...projects,
  ];
  const selected = items.find((item) => item.id === selectedProjectId) ?? null;
  return (
    <Combobox
      items={items}
      filteredItems={items.filter((item) =>
        item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      )}
      autoHighlight
      itemToStringLabel={(item) => item.title}
      isItemEqualToValue={(a, b) => a.id === b.id}
      value={selected}
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
      onValueChange={(item) => {
        if (!item || (item.id === null && !allowAll)) return;
        onChooseProject(item.id);
        setOpen(false);
        setQuery("");
      }}
    >
      <ComboboxTrigger aria-label="Choose project" data-workspace-project-picker="">
        {selected?.icon ?? <FolderIcon />}
        <span>
          {selected?.title ??
            (selectedProjectId === null ? "Choose a project" : "Unavailable project")}
        </span>
        <ChevronDownIcon />
      </ComboboxTrigger>
      <ComboboxPopup
        align="start"
        className="max-w-[min(18rem,var(--available-width))] overflow-hidden"
      >
        <ComboboxSearchInput
          aria-label="Search projects"
          placeholder="Search projects..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ComboboxEmpty>No matching projects.</ComboboxEmpty>
        <ComboboxList>
          {(item: (typeof items)[number]) => {
            const row = (
              <ComboboxItem
                key={item.id ?? "all"}
                value={item}
                hideIndicator
                className="min-w-0 flex-1"
              >
                {item.icon ?? <FolderIcon />}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              </ComboboxItem>
            );
            return item.id !== null && renderProjectActions ? (
              <div key={item.id}>{renderProjectActions(item.id, row)}</div>
            ) : (
              row
            );
          }}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
