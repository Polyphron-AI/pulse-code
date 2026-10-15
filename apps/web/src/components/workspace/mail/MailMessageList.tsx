import { workspaceItemKey, type EnvironmentId, type MailMessageListItem } from "@t3tools/contracts";
import { useState, type FormEvent } from "react";
import { RefreshCwIcon } from "lucide-react";

import { WorkspaceItemMenu } from "../WorkspaceItemActions";
import { cn } from "../../../lib/utils";
import { pulseMailMessages } from "../../../mail/mailReadState";
import { useEnvironmentQuery } from "../../../state/query";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { MailError, MailNotice } from "./MailNotice";
import { mailItemRef, mailItemTitle, mailMessagesInput, type MailItemRef } from "./mailItemRef";

interface MailListProps {
  readonly environmentId: EnvironmentId;
  readonly accountId: string;
  readonly folder: string;
  readonly selected: MailItemRef | null;
  readonly onSelect: (item: MailItemRef) => void;
}

/** A folder's messages, newest first, with search and Load more. */
export function MailMessageList(props: MailListProps) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const firstPage = useEnvironmentQuery(
    pulseMailMessages({
      environmentId: props.environmentId,
      input: mailMessagesInput({ accountId: props.accountId, mailbox: props.folder, query }),
    }),
  );
  const refresh = () => {
    setRevision((current) => current + 1);
    firstPage.refresh();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next === query) refresh();
    else setQuery(next);
  };
  return (
    <div className="flex flex-col">
      <form
        role="search"
        onSubmit={submit}
        className="flex items-center gap-1 border-b border-border p-2"
      >
        <Input
          type="search"
          size="sm"
          maxLength={200}
          value={draft}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDraft(value);
            // Clearing the box clears the search without another Enter.
            if (value === "") setQuery("");
          }}
          placeholder="Search this folder"
          aria-label="Search this folder"
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh"
          disabled={firstPage.isPending}
          onClick={refresh}
        >
          <RefreshCwIcon />
        </Button>
      </form>
      <MailPages key={`${query}:${revision}`} {...props} query={query} />
    </div>
  );
}

function MailPages(props: MailListProps & { readonly query: string }) {
  const [cursors, setCursors] = useState<ReadonlyArray<string | undefined>>([undefined]);
  return (
    <div className="flex flex-col">
      {cursors.map((cursor, index) => (
        <MailPage
          key={cursor ?? ""}
          {...props}
          cursor={cursor}
          first={index === 0}
          last={index === cursors.length - 1}
          onMore={(next) =>
            setCursors((current) => (current.includes(next) ? current : [...current, next]))
          }
        />
      ))}
    </div>
  );
}

interface MailPageProps extends MailListProps {
  readonly query: string;
  readonly cursor: string | undefined;
  readonly first: boolean;
  readonly last: boolean;
  readonly onMore: (cursor: string) => void;
}

function MailPage(props: MailPageProps) {
  const page = useEnvironmentQuery(
    pulseMailMessages({
      environmentId: props.environmentId,
      input: mailMessagesInput({
        accountId: props.accountId,
        mailbox: props.folder,
        query: props.query,
        cursor: props.cursor,
      }),
    }),
  );
  if (page.data === null) {
    return page.error !== null ? (
      <MailError className="p-3" message={page.error} onRetry={page.refresh} />
    ) : (
      <MailNotice>Loading…</MailNotice>
    );
  }
  const selectedKey = props.selected === null ? null : workspaceItemKey(props.selected);
  const nextCursor = page.data.nextCursor;
  return (
    <>
      {page.error !== null ? (
        <MailError className="p-3" message={page.error} onRetry={page.refresh} />
      ) : null}
      {props.first && page.data.messages.length === 0 ? (
        <MailNotice>{props.query ? "No messages match this search." : "No messages."}</MailNotice>
      ) : null}
      {page.data.messages.map((message) => {
        const item = mailItemRef(message);
        return (
          <MailRow
            key={`${message.ref.mailbox}:${message.ref.uidValidity}:${message.ref.uid}`}
            environmentId={props.environmentId}
            message={message}
            active={workspaceItemKey(item) === selectedKey}
            onSelect={() => props.onSelect(item)}
          />
        );
      })}
      {props.last && nextCursor !== undefined ? (
        <div className="p-2">
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => props.onMore(nextCursor)}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}

interface MailRowProps {
  readonly environmentId: EnvironmentId;
  readonly message: MailMessageListItem;
  readonly active: boolean;
  readonly onSelect: () => void;
}

export function MailRow({ environmentId, message, active, onSelect }: MailRowProps) {
  return (
    <div className="border-b border-border">
      <WorkspaceItemMenu
        environmentId={environmentId}
        item={{ ref: mailItemRef(message), title: mailItemTitle(message.subject) }}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left text-sm",
            active ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate", !message.seen && "font-semibold")}>
              {message.from ?? "Unknown sender"}
            </span>
            {message.date !== undefined ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {shortDate(message.date)}
              </span>
            ) : null}
          </span>
          <span className="truncate text-muted-foreground">{mailItemTitle(message.subject)}</span>
        </button>
      </WorkspaceItemMenu>
    </div>
  );
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
