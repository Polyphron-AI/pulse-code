import { workspaceItemKey, type EnvironmentId, type MailMessageListItem } from "@t3tools/contracts";
import { useState, type FormEvent } from "react";

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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draft.trim());
  };
  return (
    <div className="flex flex-col">
      <form role="search" onSubmit={submit} className="border-b border-border p-2">
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
      </form>
      <MailPages key={query} {...props} query={query} />
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
  if (props.first && page.data.messages.length === 0) {
    return (
      <MailNotice>{props.query ? "No messages match this search." : "No messages."}</MailNotice>
    );
  }
  const selectedKey = props.selected === null ? null : workspaceItemKey(props.selected);
  const nextCursor = page.data.nextCursor;
  return (
    <>
      {page.data.messages.map((message) => {
        const item = mailItemRef(message);
        return (
          <MailRow
            key={`${message.ref.mailbox}:${message.ref.uidValidity}:${message.ref.uid}`}
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
  readonly message: MailMessageListItem;
  readonly active: boolean;
  readonly onSelect: () => void;
}

function MailRow({ message, active, onSelect }: MailRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left text-sm",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className={cn("min-w-0 flex-1 truncate", !message.seen && "font-semibold")}>
          {message.from ?? "Unknown sender"}
        </span>
        {message.date !== undefined ? (
          <span className="shrink-0 text-xs text-muted-foreground">{shortDate(message.date)}</span>
        ) : null}
      </span>
      <span className="truncate text-muted-foreground">{mailItemTitle(message.subject)}</span>
    </button>
  );
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
