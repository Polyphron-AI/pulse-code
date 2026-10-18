import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface WorkspaceDocsReadingViewProps {
  readonly title: string;
  readonly caption: string;
  readonly content: ReactNode;
  readonly overflowAction?: ReactNode;
  readonly comments?: ReactNode;
}

/** The reading card shared by live documents and the notes capture adapter. */
export function WorkspaceDocsReadingView(props: WorkspaceDocsReadingViewProps) {
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex min-h-[23px] items-center gap-2 pointer-coarse:min-h-11">
        <FileTextIcon aria-hidden className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 break-words text-xs font-semibold">{props.title}</p>
        {props.overflowAction}
      </div>
      <article className="min-w-0 rounded-lg border border-border bg-background p-4">
        <p className="mb-4 break-words text-2xs text-muted-foreground">{props.caption}</p>
        <h1 className="mb-2 break-words text-base leading-6 font-semibold">{props.title}</h1>
        {props.content}
      </article>
      {props.comments ? (
        <section aria-label="Document comments" className="mt-3 border-t border-border pt-3">
          {props.comments}
        </section>
      ) : null}
    </div>
  );
}
