import {
  workspaceItemKey,
  type EnvironmentId,
  type ProjectId,
  type WorkspaceLinkId,
} from "@t3tools/contracts";

import { useState } from "react";

import { cn } from "../../../lib/utils";
import { useEnvironmentQuery } from "../../../state/query";
import { workspaceLinks } from "../../../state/workspaceLinks";
import { Button } from "../../ui/button";
import { linkErrorText, useMailLinks } from "./useMailLinks";
import { MailError, MailNotice } from "./MailNotice";
import { originText, projectItemRef } from "./linkedItems";
import { canonicalMailRef, mailItemTitle, mailLinkMayBreak, type MailItemRef } from "./mailItemRef";

interface ProjectMailListProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly selected: MailItemRef | null;
  readonly onSelect: (item: MailItemRef) => void;
}

/** The messages linked to a project, most recent first. Each opens wherever it now lives. */
export function ProjectMailList(props: ProjectMailListProps) {
  const list = useEnvironmentQuery(
    workspaceLinks.list({
      environmentId: props.environmentId,
      input: { item: projectItemRef(props.projectId) },
    }),
  );
  const { unlink } = useMailLinks(props.environmentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlinkMessage = async (id: WorkspaceLinkId) => {
    setBusy(true);
    setError(null);
    try {
      await unlink(id);
    } catch (cause) {
      setError(linkErrorText(cause));
    } finally {
      setBusy(false);
    }
  };
  if (list.data === null) {
    return list.error !== null ? (
      <MailError className="p-3" message={list.error} onRetry={list.refresh} />
    ) : (
      <MailNotice>Loading…</MailNotice>
    );
  }
  const messages = list.data.linked.flatMap((view) => {
    const ref = view.item.ref;
    return ref.type === "mail" ? [{ view, item: canonicalMailRef(ref) }] : [];
  });
  const selectedKey = props.selected === null ? null : workspaceItemKey(props.selected);
  return (
    <div className="flex flex-col">
      {list.error !== null ? (
        <MailError className="p-3" message={list.error} onRetry={list.refresh} />
      ) : null}
      {error !== null ? <MailError className="p-3" message={error} /> : null}
      {messages.length === 0 ? (
        <MailNotice>
          No messages are linked to this project yet. Open a message and choose Link to project.
        </MailNotice>
      ) : null}
      {messages.map(({ view, item }) => {
        const active = workspaceItemKey(item) === selectedKey;
        const origin = originText(view.origin);
        return (
          <div key={view.id} className="flex items-center border-b border-border">
            <button
              type="button"
              onClick={() => props.onSelect(item)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left text-sm",
                active ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span className="truncate">{mailItemTitle(view.item.title)}</span>
              {origin !== undefined ? (
                <span className="truncate text-xs text-muted-foreground">{origin}</span>
              ) : null}
              {mailLinkMayBreak(item) ? (
                <span className="text-xs text-muted-foreground">
                  May break if the message moves
                </span>
              ) : null}
            </button>
            <div className="pr-2">
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => void unlinkMessage(view.id)}
              >
                Unlink
              </Button>
            </div>
          </div>
        );
      })}
      {list.data.truncated ? <MailNotice>Showing the 200 most recent links.</MailNotice> : null}
    </div>
  );
}
