import type { MouseEvent } from "react";
import { useState } from "react";
import type {
  ProjectPullRequestEntry,
  ProjectPullRequestProvenance,
} from "@t3tools/client-runtime/projectPullRequests";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import { MoreHorizontalIcon } from "lucide-react";
import { PULL_REQUEST_STATE_PRESENTATION, PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export interface WorkspacePullRequestsPanelViewProps {
  readonly chosen: boolean;
  readonly entries: readonly ProjectPullRequestEntry[];
  readonly incomplete: boolean;
  readonly unavailableSources: readonly { readonly id: string; readonly title: string }[];
  readonly pending: boolean;
  readonly error: string | null;
  readonly busy: boolean;
  readonly canOperate: boolean;
  readonly initialUrl?: string;
  readonly canOpenInCode: (entry: ProjectPullRequestEntry) => boolean;
  readonly onOpenInCode: (event: MouseEvent<HTMLElement>, entry: ProjectPullRequestEntry) => void;
  readonly onOpenOnHost?: (
    event: MouseEvent<HTMLAnchorElement>,
    entry: ProjectPullRequestEntry,
  ) => void;
  readonly onUnlink: (edge: ProjectPullRequestProvenance) => void;
  readonly onLink: (url: string) => void;
  readonly onRetry: () => void;
}

/** Read-only rows until an explicit link, source unlink or Code handoff is chosen. */
export function WorkspacePullRequestsPanelView(props: WorkspacePullRequestsPanelViewProps) {
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState(props.initialUrl ?? "");
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <section aria-label="Project pull requests" className="min-w-0 text-xs">
      <h2 className="text-xs font-semibold leading-4">Project pull requests</h2>
      <p className="mt-1 text-3xs leading-4 text-muted-foreground">
        Confirmed project links and source threads
        {props.incomplete ? " · Showing loaded links" : ""}
      </p>
      {!props.chosen ? (
        <p className="mt-4 text-muted-foreground">Choose a project to see pull requests</p>
      ) : (
        <>
          <div className="my-2">
            <Button
              size="xs"
              variant="ghost"
              disabled={!props.canOperate || props.busy}
              onClick={() => setLinking(!linking)}
            >
              Link pull request
            </Button>
          </div>
          {linking ? (
            <form
              aria-label="Link pull request"
              className="mb-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                props.onLink(url);
              }}
            >
              <Input
                aria-label="Pull request URL"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/owner/repo/pull/42"
              />
              <div className="flex gap-2">
                <Button
                  size="xs"
                  type="submit"
                  disabled={
                    !props.canOperate || props.busy || parseChangeRequestUrl(url.trim()) === null
                  }
                >
                  Link
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setLinking(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
          {props.pending ? (
            <p role="status" className="my-3 text-muted-foreground">
              Loading linked pull requests...
            </p>
          ) : null}
          {props.error ? (
            <div role="alert" className="my-3 text-destructive">
              <p>{props.error}</p>
              <Button size="xs" variant="ghost" onClick={props.onRetry}>
                Retry
              </Button>
            </div>
          ) : null}
          {!props.pending &&
          !props.error &&
          !props.incomplete &&
          props.entries.length === 0 &&
          props.unavailableSources.length === 0 ? (
            <p className="my-3 text-muted-foreground">No linked pull requests</p>
          ) : null}
          <ul className="divide-y divide-border">
            {props.entries.map((entry) => {
              const parsed = parseChangeRequestUrl(entry.url);
              const snapshot = entry.reference?.snapshot;
              const state = snapshot
                ? PULL_REQUEST_STATE_PRESENTATION[
                    snapshot.state === "open" && snapshot.isDraft ? "draft" : snapshot.state
                  ]
                : null;
              const Icon = state?.Icon ?? PullRequestGlyph.pullRequest;
              const label = `${parsed?.repository ?? entry.reference?.repository ?? entry.key} #${parsed?.number ?? entry.reference?.number ?? ""}`;
              return (
                <li key={entry.key} className="min-h-14 py-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon
                      aria-hidden="true"
                      className={`mt-0.5 size-3.5 shrink-0 ${state?.toneClassName ?? "text-muted-foreground"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium leading-4">
                        {snapshot?.title ??
                          `Pull request #${parsed?.number ?? entry.reference?.number}`}
                      </p>
                      <p className="mt-0.5 break-words text-3xs leading-4 text-muted-foreground">
                        {label}
                      </p>
                      <p
                        className={`text-3xs leading-4 ${state?.toneClassName ?? "text-muted-foreground"}`}
                      >
                        {state?.label ?? "Status unavailable"}
                      </p>
                      <p className="break-words text-3xs leading-4 text-muted-foreground">
                        Via{" "}
                        {entry.provenance
                          .map((edge) => (edge.type === "thread" ? edge.title : "Project link"))
                          .join(" · ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Sources for ${label}`}
                      aria-expanded={menu === entry.key}
                      onClick={() => setMenu(menu === entry.key ? null : entry.key)}
                      className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
                    >
                      <MoreHorizontalIcon aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-3xs">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!props.canOpenInCode(entry)}
                      onClick={(event) => props.onOpenInCode(event, entry)}
                    >
                      Open in Code
                    </Button>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => props.onOpenOnHost?.(event, entry)}
                      className="py-1 text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:py-3"
                    >
                      Open on host
                    </a>
                  </div>
                  {menu === entry.key ? (
                    <div
                      role="group"
                      aria-label={`Unlink sources for ${label}`}
                      className="mt-2 flex flex-col items-start gap-1 pl-5"
                    >
                      {entry.provenance.map((edge) => (
                        <Button
                          key={
                            edge.type === "thread" ? `${edge.threadId}:${edge.url}` : edge.linkId
                          }
                          size="xs"
                          variant="ghost"
                          disabled={!props.canOperate || props.busy}
                          onClick={() => props.onUnlink(edge)}
                        >
                          {edge.type === "thread"
                            ? `Unlink from ${edge.title}`
                            : `Unlink from project link${entry.provenance.filter((source) => source.type === "project-link").length > 1 ? ` ${edge.linkId}` : ""}`}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {props.unavailableSources.map((source) => (
            <p
              key={source.id}
              className="my-3 break-words text-3xs leading-4 text-muted-foreground"
            >
              {source.title} · Source thread unavailable. Its project link has been kept.
            </p>
          ))}
        </>
      )}
    </section>
  );
}
