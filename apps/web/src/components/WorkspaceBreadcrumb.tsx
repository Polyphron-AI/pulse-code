import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/utils";

interface LegacyWorkspaceBreadcrumbProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export type WorkspaceBreadcrumbProps =
  | LegacyWorkspaceBreadcrumbProps
  | {
      readonly variant: "workspace";
      readonly environmentLabel: string;
      readonly spaceLabel: string;
      readonly sample?: boolean;
      readonly onOpenWorkspace: () => void;
    };

export function WorkspaceBreadcrumb(props: WorkspaceBreadcrumbProps) {
  if ("variant" in props)
    return (
      <nav aria-label="Workspace breadcrumb" data-workspace-breadcrumb="">
        <ol>
          <li data-workspace-breadcrumb-environment="">
            <button type="button" onClick={props.onOpenWorkspace}>
              {props.environmentLabel}
            </button>
          </li>
          <li aria-hidden="true">/</li>
          <li data-workspace-breadcrumb-space="">
            <span>{props.spaceLabel}</span>
          </li>
        </ol>
        {props.sample ? (
          <span data-workspace-sample-marker="">Design preview · sample data</span>
        ) : null}
      </nav>
    );
  return (
    <nav aria-label={props.ariaLabel} className={cn("min-w-0", props.className)}>
      <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0 text-sm sm:gap-3">
        {props.children}
      </ol>
    </nav>
  );
}

interface WorkspaceBreadcrumbItemProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly current?: boolean;
}

export function WorkspaceBreadcrumbText({ children, className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="workspace-breadcrumb-text"
      // Center the capital letters with adjacent icons, not the font's leading.
      // Padding preserves accents and descenders when a label is truncated.
      className={cn(
        "block min-w-0 truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1.5",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function WorkspaceBreadcrumbItem({
  children,
  className,
  current = false,
}: WorkspaceBreadcrumbItemProps) {
  return (
    <li
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center font-medium",
        current ? "text-foreground" : "shrink-0 text-muted-foreground",
        className,
      )}
    >
      {children}
    </li>
  );
}

export function WorkspaceBreadcrumbSeparator({
  className,
  children = "/",
}: {
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <li aria-hidden="true" className={cn("flex shrink-0 items-center text-icon-muted", className)}>
      {children}
    </li>
  );
}
