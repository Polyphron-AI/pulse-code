import type { WorkspaceLinkView } from "@t3tools/contracts";
import { linkSourceText, originText } from "./linkedItems";

/** Shared link history shown before a menu's reverse and work actions. */
export function WorkspaceLinkProvenance({
  origin,
  source,
}: Pick<WorkspaceLinkView, "origin" | "source">) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground sm:text-xs">
      <p className="max-w-56 px-1.75">{originText(origin) ?? "Linked by you"}</p>
      {source.type !== "user" ? <p className="max-w-56 px-1.75">{linkSourceText(source)}</p> : null}
    </div>
  );
}
