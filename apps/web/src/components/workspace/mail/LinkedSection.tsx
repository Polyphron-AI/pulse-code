import {
  workspaceItemKey,
  workspaceItemFromUrl,
  WorkspaceLinkEndpoint,
  type EnvironmentId,
  type WorkspaceItemRef,
  type WorkspaceLinkView,
  type WorkspaceLinkList,
} from "@t3tools/contracts";
import { LinkIcon, InfoIcon } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";

import { Popover, PopoverTrigger, PopoverPopup } from "../../ui/popover";
import { WorkspaceItemMenu } from "../WorkspaceItemActions";
import {
  useAllEnvironmentProjectSnapshotsReady,
  useProjects,
  useThreadShells,
} from "../../../state/entities";
import { useEnvironmentQuery } from "../../../state/query";
import { workspaceLinks } from "../../../state/workspaceLinks";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import {
  canOpenLinkedItem,
  endpointTitle,
  parseWorkspaceItemDrag,
  linkedItemLabel,
  originText,
  type LinkedItemLabel,
} from "./linkedItems";
import { MailError } from "./MailNotice";
import { linkErrorText, useMailLinks } from "./useMailLinks";
import { useMailCapabilities } from "./useMailCapabilities";

interface LinkedSectionProps {
  readonly environmentId: EnvironmentId;
  readonly item: WorkspaceItemRef;
  readonly title: string;
  readonly linkedData?: WorkspaceLinkList;
  readonly additionalLinks?: ReactNode;
  readonly nativeLinkedUrls?: ReadonlySet<string>;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
}

/** What is linked to one item, with Link to project and Unlink. Hidden when the server has no links. */
export function LinkedSection(props: LinkedSectionProps) {
  const { workspaceLinks: available } = useMailCapabilities(props.environmentId);
  return available ? <LinkedList {...props} /> : null;
}

function LinkedList(props: LinkedSectionProps) {
  const headingId = useId();
  const query = useEnvironmentQuery(
    props.linkedData === undefined
      ? workspaceLinks.list({ environmentId: props.environmentId, input: { item: props.item } })
      : null,
  );
  const list =
    props.linkedData === undefined ? query : { ...query, data: props.linkedData, error: null };
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
  const { linkItem, unlink } = useMailLinks(props.environmentId);
  const threads = useThreadShells().filter(
    (thread) => thread.environmentId === props.environmentId,
  );
  const threadTitles = new Map(threads.map((thread) => [thread.id, thread.title]));
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [address, setAddress] = useState("");
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
  const linked = (list.data?.linked ?? []).filter(
    (view) => view.item.ref.type !== "url" || !props.nativeLinkedUrls?.has(view.item.ref.url),
  );
  const itemKey = workspaceItemKey(props.item);
  const candidates = [
    ...projects.map((project) => ({
      ref: { type: "project" as const, projectId: project.id },
      title: project.title,
    })),
    ...threads.map((thread) => ({
      ref: { type: "thread" as const, threadId: thread.id },
      title: thread.title,
    })),
  ]
    .filter(
      (endpoint) =>
        workspaceItemKey(endpoint.ref) !== itemKey &&
        !linked.some(
          (view) => workspaceItemKey(view.item.ref) === workspaceItemKey(endpoint.ref),
        ) &&
        endpoint.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
    )
    .slice(0, 50);
  const linkEndpoint = (endpoint: WorkspaceLinkEndpoint) =>
    run(async () => {
      await linkItem({ ref: props.item, title: endpointTitle(props.title) }, endpoint);
      setPicking(false);
    });
  return (
    <section
      aria-labelledby={headingId}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-pulse-workspace-item"))
          event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const source = parseWorkspaceItemDrag(
          event.dataTransfer.getData("application/x-pulse-workspace-item"),
          props.environmentId,
        );
        if (source === undefined) {
          setError("Drop an item from this environment.");
          return;
        }
        void linkEndpoint(source);
      }}
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="text-sm font-medium">
          Linked
        </h2>
        <Popover open={infoOpen} onOpenChange={setInfoOpen}>
          <PopoverTrigger
            render={<Button size="icon-xs" variant="ghost" aria-label="About linked items" />}
            onMouseEnter={() => setInfoOpen(true)}
            onFocus={() => setInfoOpen(true)}
          >
            <InfoIcon />
          </PopoverTrigger>
          <PopoverPopup>
            Things you connected to this item. Agents working on it can read them.
          </PopoverPopup>
        </Popover>
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          onClick={() => setPicking(!picking)}
        >
          <LinkIcon />
          Link to project…
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Things you connected to this item. Agents working on it can read them.
      </p>
      {picking ? (
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            aria-label="Find an item to link"
            placeholder="Find a project or thread"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <ul className="max-h-60 overflow-y-auto">
            {candidates.map((endpoint) => (
              <li key={workspaceItemKey(endpoint.ref)}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start"
                  disabled={busy}
                  onClick={() => void linkEndpoint(endpoint)}
                >
                  {endpoint.ref.type}: {endpoint.title}
                </Button>
              </li>
            ))}
          </ul>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No matching projects or threads.</p>
          ) : null}
        </div>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const ref = workspaceItemFromUrl(address);
          if (ref === undefined) {
            setError("Enter an http or https link.");
            return;
          }
          void run(async () => {
            await linkItem({ ref: props.item, title: endpointTitle(props.title) }, { ref });
            setAddress("");
          });
        }}
      >
        <Input
          aria-label="Paste a link"
          placeholder="Paste a link"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <Button size="sm" variant="outline" disabled={busy || address.trim() === ""} type="submit">
          Link
        </Button>
      </form>
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
              environmentId={props.environmentId}
              view={view}
              label={linkedItemLabel(view, projectTitles, threadTitles)}
              itemKey={itemKey}
              busy={busy}
              onOpen={props.onOpen}
              onUnlink={() => void run(() => unlink(view.id))}
            />
          ))}
        </ul>
      )}
      {props.additionalLinks}
      {list.data?.truncated ? (
        <p className="text-xs text-muted-foreground">Showing the 200 most recent links.</p>
      ) : null}
    </section>
  );
}

interface LinkedRowProps {
  readonly environmentId: EnvironmentId;
  readonly view: WorkspaceLinkView;
  readonly label: LinkedItemLabel;
  /** The open item's key; an origin pointing back at it is plain text, not a link. */
  readonly itemKey: string;
  readonly busy: boolean;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
  readonly onUnlink: () => void;
}

function LinkedRow({
  environmentId,
  view,
  label,
  itemKey,
  busy,
  onOpen,
  onUnlink,
}: LinkedRowProps) {
  const origin = originText(view.origin);
  const viewing = view.origin?.viewing;
  const openable = label.unavailable === undefined && canOpenLinkedItem(view.item.ref);
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      <WorkspaceItemMenu
        environmentId={environmentId}
        item={view.item}
        provenance={
          <button
            type="button"
            disabled={
              viewing === undefined ||
              workspaceItemKey(viewing.ref) === itemKey ||
              !canOpenLinkedItem(viewing.ref)
            }
            onClick={() => {
              if (viewing !== undefined) onOpen(viewing.ref);
            }}
            className="mb-3 text-left text-xs text-muted-foreground enabled:hover:underline"
          >
            {origin ?? "Linked by you"}
          </button>
        }
      >
        <button
          type="button"
          disabled={!openable}
          onClick={() => onOpen(view.item.ref)}
          className="min-w-0 flex-1 truncate text-left enabled:hover:underline disabled:text-muted-foreground"
        >
          {view.item.ref.type}: {label.title}
        </button>
        <Button size="xs" variant="ghost" disabled={busy} onClick={onUnlink}>
          Unlink
        </Button>
      </WorkspaceItemMenu>
      {label.unavailable !== undefined ? (
        <span className="text-xs text-muted-foreground">{label.unavailable}</span>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {view.source.type === "model"
          ? `Accepted suggestion from ${view.source.model}: ${view.source.reason}`
          : view.source.type === "action"
            ? `From ${view.source.action.replaceAll("-", " ")}`
            : "Linked by you"}
      </span>
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
