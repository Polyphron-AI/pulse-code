import { XIcon } from "lucide-react";
import {
  pullRequestLabelColor,
  type PullRequestAuthorFacet,
  type PullRequestLabelFacet,
} from "./pullRequestList.logic";
import { PullRequestActorAvatar } from "./pullRequestPresentation";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { pullRequestNamedFilters } from "./pullRequestNamedFilters.logic";

const EMPTY_AUTHORS: ReadonlyArray<PullRequestAuthorFacet> = [];
const EMPTY_LABEL_OPTIONS: ReadonlyArray<PullRequestLabelFacet> = [];
const EMPTY_LABELS: ReadonlyArray<string> = [];

export function PullRequestNamedFilters({
  author,
  labels = EMPTY_LABELS,
  onChange,
  onOpenChange,
  authorOptions = EMPTY_AUTHORS,
  labelOptions = EMPTY_LABEL_OPTIONS,
}: {
  onOpenChange?: (open: boolean) => void;
  authorOptions?: ReadonlyArray<PullRequestAuthorFacet>;
  labelOptions?: ReadonlyArray<PullRequestLabelFacet>;
  author: string | undefined;
  labels: ReadonlyArray<string> | undefined;
  onChange: (filters: {
    author: string | undefined;
    labels: ReadonlyArray<string> | undefined;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [authorDraft, setAuthorDraft] = useState(author ?? "");
  const [labelDraft, setLabelDraft] = useState("");
  const [labelSelection, setLabelSelection] = useState(labels);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const authorNeedle = authorDraft === (author ?? "") ? "" : authorDraft.trim().toLowerCase();
  const visibleAuthors = authorOptions
    .filter(
      (option) =>
        option.actor.login.toLowerCase().includes(authorNeedle) ||
        option.actor.name?.toLowerCase().includes(authorNeedle),
    )
    .slice(0, 10);
  const apply = () => {
    const next = pullRequestNamedFilters({ author: authorDraft, labels: labelSelection });
    onChange({ author: next.author, labels: next.labels });
    changeOpen(false);
  };
  const addLabel = () => {
    setLabelSelection(
      pullRequestNamedFilters({ labels: [...labelSelection, labelDraft] }).labels ?? [],
    );
    setLabelDraft("");
  };
  const count = Number(Boolean(author)) + labels.length;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setAuthorDraft(author ?? "");
          setLabelSelection(labels);
          setLabelDraft("");
        }
        changeOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Filter by author and labels">
            Author / labels{count ? ` (${count})` : ""}
          </Button>
        }
      />
      <PopoverPopup align="end" className="w-72 p-3">
        <div className="space-y-3">
          <label className="block space-y-1 text-xs">
            Author
            <Input
              aria-label="Pull request author"
              placeholder="Login or me"
              maxLength={200}
              value={authorDraft}
              onChange={(event) => setAuthorDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  apply();
                }
              }}
            />
          </label>
          {open ? (
            <div aria-label="Suggested authors" className="max-h-40 overflow-y-auto">
              {visibleAuthors.map((option) => (
                <Button
                  key={option.actor.login.toLowerCase()}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  aria-label={`Select author ${option.actor.login}`}
                  onClick={() => setAuthorDraft(option.actor.login)}
                >
                  <PullRequestActorAvatar actor={option.actor} />
                  <span className="min-w-0 flex-1 truncate">{option.actor.login}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.count} loaded, {option.mergedCount} merged
                  </span>
                </Button>
              ))}
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="block text-xs" htmlFor="pr-label-filter">
              Labels (all must match)
            </label>
            <div className="flex gap-1">
              <Input
                id="pr-label-filter"
                aria-label="Pull request label"
                placeholder="Add a label"
                maxLength={200}
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addLabel();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!labelDraft.trim() || labelSelection.length >= 10}
                onClick={addLabel}
              >
                Add
              </Button>
            </div>
            {open ? (
              <div aria-label="Suggested labels" className="max-h-40 overflow-y-auto">
                {labelOptions
                  .filter((option) =>
                    option.name.toLowerCase().includes(labelDraft.trim().toLowerCase()),
                  )
                  .map((option) => {
                    const selected = labelSelection.some(
                      (label) => label.toLowerCase() === option.name.toLowerCase(),
                    );
                    const color = pullRequestLabelColor(option.color);
                    return (
                      <Button
                        key={option.name.toLowerCase()}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        aria-label={`Toggle label ${option.name}`}
                        aria-pressed={selected}
                        disabled={!selected && labelSelection.length >= 10}
                        onClick={() =>
                          setLabelSelection(
                            selected
                              ? labelSelection.filter(
                                  (label) => label.toLowerCase() !== option.name.toLowerCase(),
                                )
                              : [...labelSelection, option.name],
                          )
                        }
                      >
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
                          {...(color ? { style: { backgroundColor: color } } : {})}
                        />
                        <span className="min-w-0 flex-1 truncate">{option.name}</span>
                        <span className="text-xs text-muted-foreground">{option.count} loaded</span>
                      </Button>
                    );
                  })}
              </div>
            ) : null}
            {labelSelection.map((label) => (
              <Button
                key={label}
                variant="ghost"
                size="sm"
                aria-label={`Remove label ${label}`}
                onClick={() => setLabelSelection(labelSelection.filter((held) => held !== label))}
              >
                {label} <XIcon aria-hidden className="size-3" />
              </Button>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ author: undefined, labels: undefined });
                changeOpen(false);
              }}
            >
              Clear
            </Button>
            <Button size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
