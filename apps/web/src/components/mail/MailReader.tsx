import type {
  EnvironmentId,
  MailLink,
  MailDraft,
  MailMessage,
  MailMessageActionInput,
  MailMessageDetail,
  MailMessageRef,
} from "@t3tools/contracts";
import {
  DownloadIcon,
  ChevronDownIcon,
  LinkIcon,
  PaperclipIcon,
  ReplyAllIcon,
  ReplyIcon,
  ForwardIcon,
  ArchiveIcon,
  FlagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { mailEnvironment } from "../../state/mail";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  downloadMailAttachment,
  formatMailDate,
  formatMailSize,
  safeMailHtml,
  extractMailLinks,
} from "./mailPresentation";
import { mailFailure, mailInputClass } from "./MailSetup";
import { randomUUID } from "../../lib/utils";
import { cn } from "../../lib/utils";
import { ensureLocalApi } from "../../localApi";
import { MailPeoplePanel } from "./MailPeoplePanel";

export function MailReader({
  environmentId,
  reference,
  onReply,
  onBack,
  onChanged,
  onMessageAction,
}: {
  environmentId: EnvironmentId;
  reference: MailMessageRef;
  onReply: (
    detail: MailMessageDetail,
    mode: "reply" | "replyAll" | "forward",
    attachments?: MailDraft["content"]["attachments"],
  ) => void;
  onBack: () => void;
  onChanged: () => void;
  onMessageAction: (
    action: MailMessageActionInput["action"],
    message: MailMessage,
  ) => Promise<void>;
}) {
  const query = useEnvironmentQuery(
    mailEnvironment.readMessage({ environmentId, input: reference }),
  );
  const download = useAtomCommand(mailEnvironment.downloadAttachment, { reportFailure: false });
  const original = useAtomCommand(mailEnvironment.downloadOriginal, { reportFailure: false });
  const save = useAtomCommand(mailEnvironment.saveMetadata, { reportFailure: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState(false);
  const [editingContext, setEditingContext] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const contextId = useId();
  const [forwarding, setForwarding] = useState(false);
  const [forwardAttachments, setForwardAttachments] = useState<string[]>([]);
  const source = useMemo(
    () => (query.data?.html && html ? safeMailHtml(query.data.html) : ""),
    [query.data?.html, html],
  );
  const detail = query.data;
  const sourceLinks = useMemo(
    () => (query.data ? extractMailLinks(query.data.html, query.data.text) : []),
    [query.data],
  );
  const updateMetadata = async (tags: readonly string[], links: readonly MailLink[]) => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    const result = await save({
      environmentId,
      input: { ref: reference, revision: detail.message.metadata.revision, tags, links },
    });
    setBusy(false);
    if (result._tag === "Failure") setError(mailFailure(result));
    else {
      query.refresh();
      onChanged();
    }
  };
  return (
    <article className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border p-2">
        <Button size="sm" variant="ghost" className="lg:hidden" onClick={onBack}>
          Back
        </Button>
        {(["reply", "replyAll", "forward"] as const).map((mode) => (
          <Button
            key={mode}
            variant="ghost"
            size="sm"
            disabled={!detail || busy}
            onClick={() => {
              if (!detail) return;
              if (mode === "forward" && detail.attachments.length) {
                setForwarding(true);
                setForwardAttachments(detail.attachments.map((attachment) => attachment.id));
              } else onReply(detail, mode);
            }}
          >
            {mode === "reply" ? (
              <ReplyIcon />
            ) : mode === "replyAll" ? (
              <ReplyAllIcon />
            ) : (
              <ForwardIcon />
            )}
            {mode === "replyAll" ? "Reply all" : mode === "reply" ? "Reply" : "Forward"}
          </Button>
        ))}
        <Button
          className="ml-auto"
          variant="ghost"
          size="icon-sm"
          aria-label="Download original email"
          disabled={!detail || busy}
          onClick={async () => {
            setBusy(true);
            const result = await original({ environmentId, input: reference });
            setBusy(false);
            if (result._tag === "Failure") setError(mailFailure(result));
            else
              downloadMailAttachment(
                result.value.base64,
                result.value.filename,
                result.value.contentType,
              );
          }}
        >
          <DownloadIcon />
        </Button>
      </header>
      {detail && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
          {(
            [
              {
                action: detail.message.flags.includes("\\Seen") ? "unread" : "read",
                label: detail.message.flags.includes("\\Seen") ? "Mark unread" : "Mark read",
                icon: null,
              },
              {
                action: detail.message.flags.includes("\\Flagged") ? "unflag" : "flag",
                label: detail.message.flags.includes("\\Flagged") ? "Unflag" : "Flag",
                icon: <FlagIcon />,
              },
              { action: "archive", label: "Archive", icon: <ArchiveIcon /> },
              { action: "trash", label: "Trash", icon: <Trash2Icon /> },
            ] satisfies Array<{
              action: MailMessageActionInput["action"];
              label: string;
              icon: React.ReactNode;
            }>
          ).map((item) => (
            <Button
              key={item.action}
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onMessageAction(item.action, detail.message);
                setBusy(false);
                query.refresh();
              }}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>
      )}
      {forwarding && detail && (
        <div className="space-y-2 border-b border-border p-4 text-sm">
          <p className="font-medium">Include attachments in the forward</p>
          {detail.attachments.map((attachment) => (
            <label key={attachment.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={forwardAttachments.includes(attachment.id)}
                onChange={(event) =>
                  setForwardAttachments(
                    event.target.checked
                      ? [...forwardAttachments, attachment.id]
                      : forwardAttachments.filter((id) => id !== attachment.id),
                  )
                }
              />
              <span className="truncate">{attachment.filename}</span>
              <span className="text-muted-foreground">{formatMailSize(attachment.size)}</span>
            </label>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const attachments: Array<MailDraft["content"]["attachments"][number]> = [];
                for (const attachmentId of forwardAttachments) {
                  const result = await download({
                    environmentId,
                    input: { ref: reference, attachmentId },
                  });
                  if (result._tag === "Failure") {
                    setBusy(false);
                    setError(mailFailure(result));
                    return;
                  }
                  attachments.push({
                    id: randomUUID(),
                    filename: result.value.filename,
                    contentType: result.value.contentType,
                    base64: result.value.base64,
                  });
                }
                setBusy(false);
                onReply(detail, "forward", attachments);
              }}
            >
              {busy
                ? "Loading attachments…"
                : forwardAttachments.length
                  ? "Forward with selected files"
                  : "Forward without files"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setForwarding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {query.isPending && !detail && (
        <p className="p-5 text-sm text-muted-foreground" role="status">
          Loading message…
        </p>
      )}
      {(query.error || error) && (
        <div role="alert" className="border-b border-border p-4 text-sm text-destructive">
          {query.error || error}
          <Button size="sm" variant="outline" className="ml-2" onClick={query.refresh}>
            Reload
          </Button>
        </div>
      )}
      {detail && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2 p-5">
            <h2 className="break-words text-xl font-semibold leading-tight">
              {detail.message.subject || "(No subject)"}
            </h2>
            <p className="break-words text-sm font-medium">{detail.message.from}</p>
            <p className="break-words text-xs text-muted-foreground">
              To {detail.message.to.join(", ")}
              {detail.message.cc.length ? ` · Cc ${detail.message.cc.join(", ")}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{formatMailDate(detail.message.date)}</p>
          </div>
          <div className="mx-5 mb-4">
            <MailPeoplePanel
              environmentId={environmentId}
              accountId={reference.accountId}
              reference={reference}
            />
          </div>
          <section
            aria-label="Tags and linked context"
            className="mx-5 mb-5 border-y border-border bg-muted/20 px-3 py-3"
          >
            <button
              className="flex w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              aria-expanded={contextExpanded}
              aria-controls={contextId}
              onClick={() => setContextExpanded(!contextExpanded)}
            >
              <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">
                <span className="block text-sm font-medium">Linked context</span>
                <span className="text-xs text-muted-foreground">
                  {detail.message.metadata.tags.length} tags ·{" "}
                  {detail.message.metadata.links.length} links
                  {" · "}
                  {detail.message.metadata.links.filter((link) => link.inferred).length} suggested
                </span>
              </span>
              <ChevronDownIcon className={cn("size-4", contextExpanded && "rotate-180")} />
            </button>
            <div
              id={contextId}
              className={cn("md:block", contextExpanded ? "mt-3 md:mt-0" : "hidden")}
            >
              <div className="flex items-center gap-2">
                <LinkIcon className="size-3.5 text-muted-foreground" />
                <h3 className="flex-1 text-sm font-medium">Linked context</h3>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditingContext(!editingContext)}
                >
                  {editingContext ? "Close" : "Add tags or link"}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.message.metadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs"
                  >
                    {tag}
                    <Button
                      size="icon-micro"
                      variant="ghost"
                      aria-label={`Remove tag ${tag}`}
                      disabled={busy}
                      onClick={() =>
                        void updateMetadata(
                          detail.message.metadata.tags.filter((item) => item !== tag),
                          detail.message.metadata.links,
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                  </span>
                ))}
                {detail.message.metadata.links.map((link) => (
                  <span
                    key={link.id}
                    className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-2 py-1 text-xs"
                  >
                    <span className="text-muted-foreground">{link.type}</span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="truncate" tabIndex={0}>
                            {link.label}
                          </span>
                        }
                      />
                      <TooltipPopup>{link.target}</TooltipPopup>
                    </Tooltip>
                    {link.inferred && <span className="text-muted-foreground">Suggested</span>}
                    <Button
                      size="icon-micro"
                      variant="ghost"
                      aria-label={`Remove link ${link.label}`}
                      disabled={busy}
                      onClick={() =>
                        void updateMetadata(
                          detail.message.metadata.tags,
                          detail.message.metadata.links.filter((item) => item.id !== link.id),
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                  </span>
                ))}
                {!detail.message.metadata.tags.length && !detail.message.metadata.links.length && (
                  <p className="text-xs text-muted-foreground">
                    Add a customer, project, or department to keep this message connected to your
                    work.
                  </p>
                )}
              </div>
              {detail.message.metadata.links.some((link) => link.inferred) && (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Suggested links stay here unless you edit or remove them.
                </p>
              )}
              {editingContext && (
                <div className="mt-3 space-y-3">
                  <form
                    className="flex gap-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const tag = String(new FormData(form).get("tag") ?? "").trim();
                      if (!tag) return;
                      await updateMetadata(
                        [...new Set([...detail.message.metadata.tags, tag])],
                        detail.message.metadata.links,
                      );
                      form.reset();
                    }}
                  >
                    <Input
                      nativeInput
                      name="tag"
                      aria-label="New tag"
                      placeholder="Add a tag"
                      required
                      maxLength={500}
                    />
                    <Button variant="outline" size="sm" disabled={busy}>
                      Add tag
                    </Button>
                  </form>
                  <form
                    className="space-y-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const values = new FormData(form);
                      const type = String(values.get("type")) as MailLink["type"];
                      const target = String(values.get("target") ?? "").trim();
                      const label = String(values.get("label") ?? "").trim();
                      if (!target || !label) return;
                      await updateMetadata(detail.message.metadata.tags, [
                        ...detail.message.metadata.links,
                        { id: randomUUID(), type, target, label, inferred: false },
                      ]);
                      form.reset();
                    }}
                  >
                    <select className={mailInputClass} name="type" aria-label="Link type">
                      <option value="project">Project reference</option>
                      <option value="customer">Customer</option>
                      <option value="department">Department</option>
                      <option value="sop">SOP reference</option>
                      <option value="file">File reference</option>
                      <option value="url">URL</option>
                    </select>
                    <Input
                      nativeInput
                      name="label"
                      aria-label="Link label"
                      placeholder="Label"
                      required
                      maxLength={500}
                    />
                    <Input
                      nativeInput
                      name="target"
                      aria-label="Link target"
                      placeholder="Reference, path, or URL"
                      required
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      Links add reference context. They do not create tasks or start coding work.
                    </p>
                    <Button variant="outline" size="sm" disabled={busy}>
                      Add link
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </section>
          {!!detail.attachments.length && (
            <div className="mx-5 mb-4 flex flex-wrap gap-2">
              {detail.attachments.map((attachment) => (
                <Button
                  key={attachment.id}
                  variant="outline"
                  size="sm"
                  className="max-w-full"
                  disabled={busy}
                  title={`${attachment.filename} (${formatMailSize(attachment.size)})`}
                  onClick={async () => {
                    setBusy(true);
                    const result = await download({
                      environmentId,
                      input: { ref: reference, attachmentId: attachment.id },
                    });
                    setBusy(false);
                    if (result._tag === "Failure") setError(mailFailure(result));
                    else
                      downloadMailAttachment(
                        result.value.base64,
                        result.value.filename,
                        result.value.contentType,
                      );
                  }}
                >
                  <PaperclipIcon />
                  <span className="truncate">{attachment.filename}</span>
                  <span className="text-muted-foreground">{formatMailSize(attachment.size)}</span>
                </Button>
              ))}
            </div>
          )}
          {detail.html && (
            <div className="mx-5 flex items-center gap-2 text-xs text-muted-foreground">
              <Button size="xs" variant="outline" onClick={() => setHtml(!html)}>
                {html ? "Plain text" : "Formatted message"}
              </Button>
              <span>Remote content is blocked. Open links from the list below.</span>
            </div>
          )}
          {sourceLinks.length > 0 && (
            <details className="mx-5 mt-3 rounded-md border border-border p-3 text-xs">
              <summary className="cursor-pointer">
                Links in this message ({sourceLinks.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {sourceLinks.map((url) => (
                  <li key={url}>
                    <button
                      className="break-all text-left text-primary underline underline-offset-2"
                      onClick={async () => {
                        try {
                          await ensureLocalApi().shell.openExternal(url);
                        } catch {
                          setError("This link could not be opened.");
                        }
                      }}
                    >
                      {url}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {html && source ? (
            <iframe
              title="Formatted email"
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={source}
              className="min-h-[28rem] w-full border-0"
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words p-5 font-sans text-sm leading-relaxed">
              {detail.text ||
                "This message has no plain-text body. Use Formatted message to read the HTML version."}
            </pre>
          )}
        </div>
      )}
    </article>
  );
}
