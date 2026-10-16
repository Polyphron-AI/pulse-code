import { EnvironmentId } from "@t3tools/contracts";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { FolderIcon } from "lucide-react";
import { useProjects } from "../../state/entities";
import { isElectron } from "../../env";
import { Button } from "../ui/button";
import { ProjectFavicon } from "../ProjectFavicon";
import { SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { SidebarContent, SidebarGroup, useSidebar } from "../ui/sidebar";
import {
  Combobox,
  ComboboxTrigger,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "../ui/combobox";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";

export function ProjectsNav() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const items = [
    { value: "all", label: "All projects" },
    ...projects.map((project) => ({ value: project.id as string, label: project.title })),
  ];
  const selected = items.find((item) => item.value === search.project) ?? items[0]!;
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent>
        <SidebarGroup>
          <Combobox
            items={items}
            filteredItems={items.filter((item) =>
              item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            )}
            autoHighlight
            itemToStringLabel={(item) => item.label}
            isItemEqualToValue={(a, b) => a.value === b.value}
            value={selected}
            open={open}
            onOpenChange={(value) => {
              setOpen(value);
              if (!value) setQuery("");
            }}
            onValueChange={(item) => {
              if (!item) return;
              void navigate({
                to: "/workspace",
                search: {
                  space: "projects",
                  ...(environmentId === null ? {} : { environment: environmentId }),
                  ...(item.value === "all" ? {} : { project: item.value }),
                },
              });
              setOpen(false);
              setQuery("");
              setOpenMobile(false);
            }}
          >
            <ComboboxTrigger
              render={<Button variant="outline" className="w-full justify-start" />}
              aria-label="Choose project"
            >
              <FolderIcon className="size-4 shrink-0" />
              <span className="truncate">{selected.label}</span>
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
                  const project = projects.find((project) => project.id === item.value);
                  const row = (
                    <ComboboxItem
                      key={item.value}
                      value={item}
                      hideIndicator
                      className="min-w-0 flex-1"
                    >
                      {project ? (
                        <ProjectFavicon project={project} className="size-4 shrink-0" />
                      ) : (
                        <FolderIcon className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                    </ComboboxItem>
                  );
                  return project && environmentId !== null ? (
                    <WorkspaceItemMenu
                      key={item.value}
                      environmentId={environmentId}
                      item={{
                        ref: { type: "project", projectId: project.id },
                        title: project.title,
                      }}
                    >
                      {row}
                    </WorkspaceItemMenu>
                  ) : (
                    row
                  );
                }}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>
          <Link
            to="/workspace"
            search={{ space: "office", officeView: "communications" }}
            className="mt-4 p-2 text-sm text-sidebar-muted-foreground"
          >
            Slack and Discord
          </Link>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
