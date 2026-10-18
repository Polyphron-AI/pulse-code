import type { ProjectId, WorkspaceProjectOverview } from "@t3tools/contracts";
import { useId, type ReactNode, type Ref } from "react";
import { Button } from "../ui/button";
import {
  ChevronRightIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import "./projectsOverview.css";

const providerLabels: Readonly<Record<string, string>> = {
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
};

export interface ProjectsOverviewViewProps {
  readonly projects: readonly WorkspaceProjectOverview[];
  readonly selectedProjectId: ProjectId | null;
  readonly query: string;
  readonly driveFilter: "all" | "linked" | "unlinked";
  readonly pending: boolean;
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly roster: readonly { initials: string; name: string; roleLabel: string }[];
  readonly onQueryChange: (value: string) => void;
  readonly onSearch: () => void;
  readonly onDriveFilterChange: (value: "all" | "linked" | "unlinked") => void;
  readonly onSelect: (projectId: ProjectId) => void;
  readonly onCreate: () => void;
  readonly onMore: () => void;
  readonly onRetry: () => void;
  readonly appliedQuery?: string;
  readonly titleSearchOnly?: boolean;
  readonly createButtonRef: Ref<HTMLButtonElement>;
  readonly driveAvailable?: boolean;
  readonly retryable?: boolean;
  readonly onReset?: () => void;
  readonly renderProjectActions?: (projectId: ProjectId, row: ReactNode) => ReactNode;
}

/** Pure project cards, shared by the workspace and the isolated design recipe. */
export function ProjectsOverviewView({ createButtonRef, ...props }: ProjectsOverviewViewProps) {
  const descriptionId = useId();
  const filtered = (props.appliedQuery ?? props.query).trim() !== "" || props.driveFilter !== "all";
  const driveUnavailable = props.driveAvailable === false && props.driveFilter !== "all";
  const selected = props.projects.find((project) => project.projectId === props.selectedProjectId);
  return (
    <section data-projects-overview aria-label="Your projects" aria-busy={props.pending}>
      <div data-projects-overview-heading>
        <div>
          <h2>Your projects</h2>
          <p>
            {props.roster.length
              ? "Connections, people and work in one place."
              : "Connections and work in one place."}
          </p>
        </div>
        <Button
          ref={createButtonRef}
          size="xs"
          data-projects-overview-create
          aria-label="New project"
          onClick={props.onCreate}
        >
          <PlusIcon aria-hidden="true" />
          New project
        </Button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSearch();
        }}
      >
        <label data-projects-overview-search htmlFor={`${descriptionId}-search`}>
          <SearchIcon aria-hidden="true" />
          <input
            id={`${descriptionId}-search`}
            aria-label="Find a project"
            placeholder="Find a project"
            maxLength={256}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
          <span data-projects-overview-filter>
            <SlidersHorizontalIcon aria-hidden="true" />
            <select
              aria-label="Filter projects"
              value={props.driveFilter}
              onChange={(event) =>
                props.onDriveFilterChange(
                  event.target.value as ProjectsOverviewViewProps["driveFilter"],
                )
              }
            >
              <option value="all">All projects</option>
              <option value="linked">
                {props.driveAvailable === false ? "Drive linked (unavailable)" : "Drive linked"}
              </option>
              <option value="unlinked">
                {props.driveAvailable === false ? "No Drive root (unavailable)" : "No Drive root"}
              </option>
            </select>
          </span>
        </label>
      </form>
      {props.driveFilter !== "all" ? (
        <p data-projects-overview-status>
          Filter: {props.driveFilter === "linked" ? "Drive linked" : "No Drive root"}
        </p>
      ) : null}
      {(props.query.trim() || props.driveFilter !== "all" || props.error) && props.onReset ? (
        <button type="button" data-projects-overview-reset onClick={props.onReset}>
          Reset search and filters
        </button>
      ) : null}
      {props.error ? (
        <div role="alert" data-projects-overview-status>
          <p>{props.error}</p>
          {props.retryable !== false ? (
            <Button size="xs" variant="outline" disabled={props.pending} onClick={props.onRetry}>
              Retry
            </Button>
          ) : (
            <p>Change the search or filters to choose a smaller result set.</p>
          )}
        </div>
      ) : null}
      {props.titleSearchOnly ? (
        <p role="status" data-projects-overview-status>
          Searching titles only on this server.
        </p>
      ) : null}
      {driveUnavailable ? (
        <p role="status" data-projects-overview-status>
          Drive status unavailable on this server
        </p>
      ) : !props.pending && !props.error && props.projects.length === 0 ? (
        <p role="status" data-projects-overview-status>
          {filtered ? "No matching projects." : "No projects yet."}
        </p>
      ) : null}
      {props.pending ? (
        <p data-projects-overview-status role="status">
          {props.projects.length ? "Updating projects..." : "Loading projects..."}
        </p>
      ) : null}
      <ul data-projects-overview-cards>
        {props.projects.map((project, index) => {
          const detailsId = `${descriptionId}-${index}`;
          const row = (
            <button
              type="button"
              data-projects-overview-card-select
              aria-label={`Select ${project.title}`}
              aria-describedby={detailsId}
              aria-pressed={props.selectedProjectId === project.projectId}
              onClick={() => props.onSelect(project.projectId)}
            >
              <FolderIcon data-projects-overview-folder aria-hidden="true" />
              <span data-projects-overview-card-content>
                <strong>{project.title}</strong>
                <span id={detailsId} data-projects-overview-details>
                  {project.description ? (
                    <span data-projects-overview-description>{project.description}</span>
                  ) : null}
                  <span data-projects-overview-metadata>
                    <span>
                      {project.driveRoot === "linked"
                        ? "Drive linked"
                        : project.driveRoot === "none"
                          ? "No Drive root"
                          : "Drive status unavailable"}
                    </span>
                    {project.channels.providers.map((provider) => (
                      <span key={providerLabels[provider.provider] ?? provider.provider}>
                        {providerLabels[provider.provider] ?? provider.provider} ·{" "}
                        {provider.complete
                          ? `${provider.count} ${provider.count === 1 ? "channel" : "channels"}`
                          : provider.count === 0
                            ? "count unknown"
                            : `${provider.count}+ channels`}
                      </span>
                    ))}
                    {project.channels.providers.length === 0 ? (
                      <span>
                        {project.channels.complete && project.channels.count !== null
                          ? `${project.channels.count} ${project.channels.count === 1 ? "channel" : "channels"}`
                          : "Channel count unknown"}
                      </span>
                    ) : null}
                    {project.members?.complete &&
                    project.members.source.trim() &&
                    Number.isFinite(Date.parse(project.members.observedAt)) ? (
                      <span>
                        {project.members.count} {project.members.count === 1 ? "member" : "members"}
                        <span className="sr-only">
                          , {project.members.source}, as of {project.members.observedAt}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </span>
              <ChevronRightIcon data-projects-overview-chevron aria-hidden="true" />
            </button>
          );
          return (
            <li
              key={project.projectId}
              data-projects-overview-card
              data-selected={props.selectedProjectId === project.projectId}
            >
              {props.renderProjectActions
                ? props.renderProjectActions(project.projectId, row)
                : row}
            </li>
          );
        })}
      </ul>
      {props.hasMore && !driveUnavailable && !props.error ? (
        <button
          type="button"
          data-projects-overview-more
          disabled={props.pending}
          onClick={props.onMore}
        >
          More projects
        </button>
      ) : null}
      {props.roster.length && selected ? (
        <section data-projects-overview-roster aria-label="Project members">
          <h3>{selected.title} members</h3>
          <ul>
            {props.roster.map((person) => (
              <li key={person.name}>
                <span data-projects-overview-avatar>{person.initials}</span>
                <span>{person.name}</span>
                <span data-projects-overview-role>{person.roleLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
