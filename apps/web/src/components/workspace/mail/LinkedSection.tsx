import {
  workspaceItemKey,
  type EnvironmentId,
  type WorkspaceItemRef,
  type WorkspaceLinkView,
} from "@t3tools/contracts";
import { LinkIcon } from "lucide-react";
import { useId, useMemo, useState, type MouseEvent } from "react";

import { readLocalApi } from "../../../localApi";
import { useAllEnvironmentProjectSnapshotsReady, useProjects } from "../../../state/entities";
import { useEnvironmentQuery } from "../../../state/query";
import { workspaceLinks } from "../../../state/workspaceLinks";
import { Button } from "../../ui/button";
import {
  canOpenLinkedItem,
  linkedItemLabel,
  originText,
  pickedProject,
  projectMenuItems,
  type LinkedItemLabel,
} from "./linkedItems";
import { MailError } from "./MailNotice";
import { linkErrorText, useMailLinks } from "./useMailLinks";
import { useMailCapabilities } from "./useMailCapabilities";

interface LinkedSectionProps {
  readonly environmentId: EnvironmentId;
  readonly item: WorkspaceItemRef;
  readonly title: string;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
}

/** What is linked to one item, with Link to project and Unlink. Hidden when the server has no links. */
export function LinkedSection(props: LinkedSectionProps) {
  const { workspaceLinks: available } = useMailCapabilities();
  return available ? <LinkedList {...props} /> : null;
}

function LinkedList(props: LinkedSectionProps) {
  const headingId = useId();
  const list = useEnvironmentQuery(
    workspaceLinks.list({ environmentId: props.environmentId, input: { item: props.item } }),
  );
  const allProjects = useProjects();
  const projectsReady = useAllEnvironmentProjectSnapshotsReady();
  const projects = useMemo(
    () => allProjects.filter((project) => project.environmentId === props.environmentId),
    [allProjects, props.environmentId],
  );
  const projectTitles = useMemo(
    () => (projectsReady ? new Map(projects.map((project) => [project.id, project.title])) : null),
    [projects, projectsReady],
  );
  const { linkToProject, unlink } = useMailLinks(props.environmentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(linkErrorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const linked = list.data?.linked ?? [];
  const itemKey = workspaceItemKey(props.item);
  const chooseProject = async (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const linkedIds = new Set(
      linked.flatMap((view) => (view.item.ref.type === "project" ? [view.item.ref.projectId] : [])),
    );
    const choice = await readLocalApi()?.contextMenu.show(projectMenuItems(projects, linkedIds), {
      x: rect.left,
      y: rect.bottom,
    });
    const project = pickedProject(projects, choice ?? null);
    if (project !== undefined) {
      await run(() => linkToProject({ ref: props.item, title: props.title }, project));
    }
  };
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="text-sm font-medium">
          Linked
        </h2>
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          onClick={(event) => void chooseProject(event)}
        >
          <LinkIcon />
          Link to project…
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Things you connected to this item. Agents working on it can read them.
      </p>
      {error !== null ? <MailError className="text-xs" message={error} /> : null}
      {list.data !== null && list.error !== null ? (
        <MailError className="text-xs" message={list.error} onRetry={list.refresh} />
      ) : null}
      {list.data === null ? (
        list.error !== null ? (
          <MailError className="text-xs" message={list.error} onRetry={list.refresh} />
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )
      ) : linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing linked yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {linked.map((view) => (
            <LinkedRow
              key={view.id}
              view={view}
              label={linkedItemLabel(view, projectTitles)}
              itemKey={itemKey}
              busy={busy}
              onOpen={props.onOpen}
              onUnlink={() => void run(() => unlink(view.id))}
            />
          ))}
        </ul>
      )}
      {list.data?.truncated ? (
        <p className="text-xs text-muted-foreground">Showing the 200 most recent links.</p>
      ) : null}
    </section>
  );
}

interface LinkedRowProps {
  readonly view: WorkspaceLinkView;
  readonly label: LinkedItemLabel;
  /** The open item's key; an origin pointing back at it is plain text, not a link. */
  readonly itemKey: string;
  readonly busy: boolean;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
  readonly onUnlink: () => void;
}

function LinkedRow({ view, label, itemKey, busy, onOpen, onUnlink }: LinkedRowProps) {
  const origin = originText(view.origin);
  const viewing = view.origin?.viewing;
  const openable = label.unavailable === undefined && canOpenLinkedItem(view.item.ref);
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!openable}
          onClick={() => onOpen(view.item.ref)}
          className="min-w-0 flex-1 truncate text-left enabled:hover:underline disabled:text-muted-foreground"
        >
          {label.title}
        </button>
        <Button size="xs" variant="ghost" disabled={busy} onClick={onUnlink}>
          Unlink
        </Button>
      </div>
      {label.unavailable !== undefined ? (
        <span className="text-xs text-muted-foreground">{label.unavailable}</span>
      ) : null}
      {origin === undefined ? null : viewing !== undefined &&
        workspaceItemKey(viewing.ref) !== itemKey &&
        canOpenLinkedItem(viewing.ref) ? (
        <button
          type="button"
          onClick={() => onOpen(viewing.ref)}
          className="self-start text-left text-xs text-muted-foreground hover:underline"
        >
          {origin}
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">{origin}</span>
      )}
    </li>
  );
}
