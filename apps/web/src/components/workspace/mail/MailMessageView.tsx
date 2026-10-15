import type { EnvironmentId } from "@t3tools/contracts";
import { ArrowLeftIcon, PaperclipIcon } from "lucide-react";
import { useState } from "react";

import { pulseMailMessage } from "../../../mail/mailReadState";
import { useEnvironmentQuery } from "../../../state/query";
import { Button } from "../../ui/button";
import { mailItemTitle, mailLinkMayBreak, mailReadInput, type MailItemRef } from "./mailItemRef";
import { MailError } from "./MailNotice";

interface MailMessageViewProps {
  readonly environmentId: EnvironmentId;
  readonly item: MailItemRef;
  readonly onBack: () => void;
}

/** The reader. It reads by the item's ref, so a linked message opens even after it moved. */
export function MailMessageView(props: MailMessageViewProps) {
  const message = useEnvironmentQuery(
    pulseMailMessage({ environmentId: props.environmentId, input: mailReadInput(props.item) }),
  );
  const data = message.data;
  return (
    <article className="flex flex-col gap-4 p-5 sm:p-8">
      <Button size="sm" variant="ghost" className="self-start md:hidden" onClick={props.onBack}>
        <ArrowLeftIcon />
        Messages
      </Button>
      {data === null ? (
        message.error !== null ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">This message is unavailable.</p>
            <MailError message={message.error} onRetry={message.refresh} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold">{mailItemTitle(data.subject)}</h1>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <MailField label="From" value={data.from} />
              <MailField label="To" value={data.to} />
              <MailField label="Cc" value={data.cc} />
              <MailField
                label="Date"
                value={data.date === undefined ? undefined : new Date(data.date).toLocaleString()}
              />
            </dl>
          </header>
          {mailLinkMayBreak(props.item) ? (
            <p className="text-xs text-muted-foreground">
              This message has no Message-ID, so a link to it may break if it moves.
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">{data.body.text}</pre>
          {data.body.nextOffset !== undefined ? (
            <MailBodyMore
              environmentId={props.environmentId}
              item={props.item}
              offset={data.body.nextOffset}
            />
          ) : null}
          {data.sourceTruncated ? (
            <p className="text-xs text-muted-foreground">
              This message is too large to show in full.
            </p>
          ) : null}
          {data.attachments.length > 0 ? (
            <ul aria-label="Attachments" className="flex flex-col gap-1 text-sm">
              {data.attachments.map((attachment) => (
                <li key={attachment.partId} className="flex items-center gap-2">
                  <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{attachment.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatSize(attachment.size)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </article>
  );
}

interface MailBodyChunkProps {
  readonly environmentId: EnvironmentId;
  readonly item: MailItemRef;
  readonly offset: number;
}

/** "Show more" for a long body. Each chunk is its own query; the last one offers the next. */
function MailBodyMore(props: MailBodyChunkProps) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        Show more
      </Button>
    );
  }
  return <MailBodyChunk {...props} />;
}

function MailBodyChunk(props: MailBodyChunkProps) {
  const chunk = useEnvironmentQuery(
    pulseMailMessage({
      environmentId: props.environmentId,
      input: mailReadInput(props.item, props.offset),
    }),
  );
  if (chunk.data === null) {
    return chunk.error !== null ? (
      <MailError message={chunk.error} onRetry={chunk.refresh} />
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }
  return (
    <>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm">
        {chunk.data.body.text}
      </pre>
      {chunk.data.body.nextOffset !== undefined ? (
        <MailBodyMore
          environmentId={props.environmentId}
          item={props.item}
          offset={chunk.data.body.nextOffset}
        />
      ) : null}
    </>
  );
}

function MailField(props: { readonly label: string; readonly value: string | undefined }) {
  if (props.value === undefined) return null;
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 break-words">{props.value}</dd>
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
