import type { ChatMessage } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { FileTextIcon } from "lucide-react";
import { formatEventTime } from "@t3tools/client-runtime/calendar/dates";
import { conversationInitials } from "./communicationsChat";
import "./communications.css";

/** Shared stream row. Document metadata is supplied explicitly, never fetched from body URLs. */
export function ConversationMessage({
  message,
  timeZone,
  selected,
  onSelect,
  onReply,
  document,
  actions,
}: {
  message: ChatMessage;
  timeZone: string;
  selected?: boolean;
  onSelect?: () => void;
  onReply?: (() => void) | undefined;
  document?: { title: string; subtitle: string; onOpen: () => void };
  actions?: ReactNode;
}) {
  return (
    <article
      data-communications-message=""
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) onSelect?.();
      }}
    >
      <span data-communications-avatar="">{conversationInitials(message.author)}</span>
      <div data-communications-message-copy="">
        <div data-communications-author="">
          <strong>{message.author || "Unknown author"}</strong>
          <time dateTime={message.date}>{formatEventTime(message.date, timeZone)}</time>
        </div>
        {message.replyToId ? <p>Reply to message {message.replyToId}</p> : null}
        <p>{message.text || "This message has no text. Open the source app to view its media."}</p>
        {document ? (
          <button
            type="button"
            data-communications-document=""
            onClick={(event) => {
              event.stopPropagation();
              document.onOpen();
            }}
          >
            <FileTextIcon />
            <span>
              <strong>{document.title}</strong>
              <small>{document.subtitle}</small>
            </span>
          </button>
        ) : null}
        {onReply ? (
          <button
            type="button"
            data-communications-reply=""
            onClick={(event) => {
              event.stopPropagation();
              onReply();
            }}
          >
            {message.replyCount !== undefined && message.replyCount > 0
              ? `${message.replyCount} replies`
              : "Reply"}
          </button>
        ) : null}
        {actions}
      </div>
    </article>
  );
}
