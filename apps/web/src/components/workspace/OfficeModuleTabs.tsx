import { BotIcon, FileTextIcon, FolderIcon, GlobeIcon, ListTodoIcon } from "lucide-react";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { cn } from "../../lib/utils";

const modules = ["Files", "Browser", "Agents", "Tasks", "Docs", "PRs"] as const;
const icons = {
  Files: FolderIcon,
  Browser: GlobeIcon,
  Agents: BotIcon,
  Tasks: ListTodoIcon,
  Docs: FileTextIcon,
  PRs: PullRequestGlyph.pullRequest,
};

export function OfficeModuleTabs({
  value,
  onChange,
  items = modules,
}: {
  value: string;
  onChange: (value: string) => void;
  items?: readonly string[];
}) {
  return (
    <nav
      aria-label="Workspace modules"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-2 py-2"
    >
      {items.map((name) => {
        const Icon = icons[name as keyof typeof icons] ?? FolderIcon;
        return (
          <button
            key={name}
            type="button"
            aria-pressed={value === name}
            onClick={() => onChange(name)}
            className={cn(
              "flex min-w-14 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
              value === name && "bg-primary/15 text-primary",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {name}
          </button>
        );
      })}
    </nav>
  );
}
