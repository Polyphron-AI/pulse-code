import { Link } from "@tanstack/react-router";
import { BriefcaseBusinessIcon, Code2Icon, MailIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function OfficeHeader({
  active,
  children,
  environmentId,
}: {
  active: "office" | "mail";
  children?: ReactNode;
  environmentId?: string | undefined;
}) {
  const linkClass =
    "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <header className="drag-region flex min-h-[var(--workspace-topbar-height)] shrink-0 flex-wrap items-center gap-1 border-b border-border py-2 pl-[var(--workspace-controls-left)] pr-[var(--workspace-controls-right)]">
      <nav aria-label="Workspace" className="flex items-center gap-1">
        <Link
          to="/office"
          search={{ environment: environmentId }}
          aria-current={active === "office" ? "page" : undefined}
          className={cn(
            linkClass,
            active === "office" ? "bg-accent font-medium" : "text-muted-foreground",
          )}
        >
          <BriefcaseBusinessIcon className="size-4" />
          Office
        </Link>
        <Link
          to="/mail"
          search={{ environment: environmentId }}
          aria-current={active === "mail" ? "page" : undefined}
          className={cn(
            linkClass,
            active === "mail" ? "bg-accent font-medium" : "text-muted-foreground",
          )}
        >
          <MailIcon className="size-4" />
          Mail
        </Link>
        <Link to="/" className={cn(linkClass, "text-muted-foreground")}>
          <Code2Icon className="size-4" />
          Code
        </Link>
      </nav>
      <span className="ml-1 text-xs text-muted-foreground">Alpha</span>
      <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
    </header>
  );
}
