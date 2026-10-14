import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface OfficeSubnavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface OfficeSubnavProps {
  label: string;
  items: readonly OfficeSubnavItem[];
  value: string;
  onChange: (id: string) => void;
}

export function OfficeSubnav({ label, items, value, onChange }: OfficeSubnavProps) {
  return (
    <nav
      aria-label={label}
      className="flex w-16 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-sidebar px-1 py-3"
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-current={value === id ? "page" : undefined}
          className={cn(
            "group flex min-h-14 w-full flex-col items-center gap-1 rounded-lg py-1 text-3xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            value === id && "text-foreground",
          )}
          onClick={() => onChange(id)}
        >
          <span
            className={cn(
              "grid h-8 w-11 place-items-center rounded-xl group-hover:bg-accent",
              value === id && "bg-primary/15 text-primary group-hover:bg-primary/20",
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
          <span className="w-full break-words text-center leading-tight">{label}</span>
        </button>
      ))}
    </nav>
  );
}
