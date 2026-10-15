import type { EnvironmentId, MailConversation } from "@t3tools/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { pulseMailConversations } from "../../../mail/mailReadState";
import { useEnvironmentQuery } from "../../../state/query";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { MailRow } from "./MailMessageList";
import { MailError, MailNotice } from "./MailNotice";

interface Props {
  environmentId: EnvironmentId;
  accountId: string;
  folder: string;
  selectedId: string | undefined;
  onSelect: (conversation: MailConversation) => void;
  onUpdate?: (conversation: MailConversation) => void;
}
export function MailConversationList(props: Props) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const firstPage = useEnvironmentQuery(
    pulseMailConversations({
      environmentId: props.environmentId,
      input: { accountId: props.accountId, mailbox: props.folder, ...(query ? { query } : {}) },
    }),
  );
  const refresh = () => {
    firstPage.refresh();
    setRevision((value) => value + 1);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim() === query) refresh();
    else {
      setQuery(draft.trim());
      setRevision((value) => value + 1);
    }
  };
  return (
    <div>
      <form
        role="search"
        onSubmit={submit}
        className="flex min-w-0 flex-wrap gap-1 border-b border-border p-2"
      >
        <Input
          className="basis-full"
          size="sm"
          type="search"
          aria-label="Search conversations in this folder"
          placeholder="Search this folder"
          maxLength={200}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <Button size="sm" variant="ghost" type="submit">
          Search
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          disabled={firstPage.isPending}
          onClick={refresh}
        >
          Refresh
        </Button>
      </form>
      <ConversationPages key={`${query}:${revision}`} {...props} query={query} />
    </div>
  );
}
function ConversationPages(props: Props & { query: string }) {
  const [cursors, setCursors] = useState<ReadonlyArray<string | undefined>>([undefined]);
  return cursors.map((cursor, index) => (
    <ConversationPage
      key={cursor ?? "first"}
      {...props}
      cursor={cursor}
      last={index === cursors.length - 1}
      onMore={(next) =>
        setCursors((current) => (current.includes(next) ? current : [...current, next]))
      }
    />
  ));
}
function ConversationPage(
  props: Props & {
    query: string;
    cursor: string | undefined;
    last: boolean;
    onMore: (cursor: string) => void;
  },
) {
  const page = useEnvironmentQuery(
    pulseMailConversations({
      environmentId: props.environmentId,
      input: {
        accountId: props.accountId,
        mailbox: props.folder,
        ...(props.query ? { query: props.query } : {}),
        ...(props.cursor ? { cursor: props.cursor } : {}),
      },
    }),
  );
  const { data, isPending } = page;
  const { selectedId, onUpdate } = props;
  useEffect(() => {
    const latest = data?.conversations.find((conversation) => conversation.id === selectedId);
    if (latest && !isPending) onUpdate?.(latest);
  }, [data, isPending, selectedId, onUpdate]);
  if (page.data === null)
    return page.error ? (
      <MailError message={page.error} onRetry={page.refresh} />
    ) : (
      <MailNotice>Loading conversations...</MailNotice>
    );
  return (
    <>
      {page.error ? <MailError message={page.error} onRetry={page.refresh} /> : null}
      {props.cursor === undefined && page.data.incomplete ? (
        <p className="p-3 text-xs text-muted-foreground">
          Showing conversations from the newest {page.data.scannedMessages} matching messages. Older
          messages and conversation members may be missing. Narrow the search or use Messages.
        </p>
      ) : null}
      {page.data.conversations.length === 0 ? <MailNotice>No conversations.</MailNotice> : null}
      {page.data.conversations.map((conversation) => (
        <div key={conversation.id}>
          <MailRow
            environmentId={props.environmentId}
            message={conversation.newest}
            active={props.selectedId === conversation.id}
            onSelect={() => props.onSelect(conversation)}
          />
          <p className="px-3 pb-1 text-xs text-muted-foreground">
            {conversation.messages.length}{" "}
            {conversation.messages.length === 1 ? "message" : "messages"}
          </p>
        </div>
      ))}
      {props.last && page.data.nextCursor ? (
        <Button
          size="sm"
          variant="ghost"
          className="m-2"
          onClick={() => props.onMore(page.data!.nextCursor!)}
        >
          Load more
        </Button>
      ) : null}
    </>
  );
}
