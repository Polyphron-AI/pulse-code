import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { pullRequestNamedFilters } from "./pullRequestNamedFilters.logic";

const EMPTY_LABELS: ReadonlyArray<string> = [];

export function PullRequestNamedFilters({
  author,
  labels = EMPTY_LABELS,
  onChange,
}: {
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
  const apply = () => {
    const next = pullRequestNamedFilters({ author: authorDraft, labels: labelSelection });
    onChange({ author: next.author, labels: next.labels });
    setOpen(false);
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
        setOpen(next);
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
            {labelSelection.map((label) => (
              <Button
                key={label}
                variant="ghost"
                size="sm"
                aria-label={`Remove label ${label}`}
                onClick={() => setLabelSelection(labelSelection.filter((held) => held !== label))}
              >
                {label} ?
              </Button>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ author: undefined, labels: undefined });
                setOpen(false);
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
