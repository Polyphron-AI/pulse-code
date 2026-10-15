import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";

/** One quiet line in a Mail pane: loading, empty, or why Mail cannot open. */
export function MailNotice({ children }: { readonly children: ReactNode }) {
  return <p className="p-5 text-sm text-muted-foreground sm:p-8">{children}</p>;
}

/**
 * A failed read in a Mail pane, with Try again when the read can be repeated. Matches the
 * Email settings page's `ErrorLine`.
 */
export function MailError(props: {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm", props.className)}>
      <p className="text-error-foreground">{props.message}</p>
      {props.onRetry ? (
        <Button variant="outline" size="compact" onClick={props.onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
