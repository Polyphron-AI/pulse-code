import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type WorkspaceItemRef,
  type WorkspaceLinkEndpoint,
  type WorkspaceSuggestionState,
} from "@t3tools/contracts";
import { InfoIcon } from "lucide-react";
import { useId, useState } from "react";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentSessionState } from "../../state/session";
import { Button } from "../ui/button";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { canOpenLinkedItem, workspaceEndpointTitle } from "./mail/linkedItems";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

export function SuggestedSection(props: {
  readonly environmentId: EnvironmentId;
  readonly item: WorkspaceLinkEndpoint;
  readonly model?: string | undefined;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
}) {
  const id = useId();
  const query = useEnvironmentQuery(
    workspaceLinks.suggestions({ environmentId: props.environmentId, input: { item: props.item } }),
  );
  const list = useEnvironmentQuery(
    workspaceLinks.list({ environmentId: props.environmentId, input: { item: props.item.ref } }),
  );
  const refresh = useAtomCommand(workspaceLinks.refreshSuggestions, { reportFailure: false });
  const accept = useAtomCommand(workspaceLinks.acceptSuggestion, { reportFailure: false });
  const dismiss = useAtomCommand(workspaceLinks.dismissSuggestion, { reportFailure: false });
  const session = useEnvironmentSessionState(props.environmentId);
  const canOperate =
    !session.isPending &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const [manual, setManual] = useState<WorkspaceSuggestionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const state = manual ?? query.data;
  const fail = (result: {
    readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
  }) => {
    const cause = squashAtomCommandFailure(result);
    setError(
      cause instanceof Error ? cause.message : "The suggestion could not be updated. Try again.",
    );
  };
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <div className="flex items-center gap-2">
        <h2 id={id} className="text-sm font-medium">
          Suggested
        </h2>
        <Popover open={info} onOpenChange={setInfo}>
          <PopoverTrigger
            render={<Button size="icon-xs" variant="ghost" aria-label="About suggested items" />}
            onMouseEnter={() => setInfo(true)}
            onFocus={() => setInfo(true)}
          >
            <InfoIcon />
          </PopoverTrigger>
          <PopoverPopup>
            AI thinks these may be related. Nothing is linked until you accept. Dismissed
            suggestions do not come back.
          </PopoverPopup>
        </Popover>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          className="ml-auto"
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await refresh({
              environmentId: props.environmentId,
              input: { item: props.item, refresh: true },
            });
            setBusy(false);
            if (result._tag === "Success") setManual(result.value);
            else fail(result);
          }}
        >
          Refresh suggestions
        </Button>
      </div>
      {state?.model || props.model ? (
        <p className="text-xs text-muted-foreground">Using {state?.model ?? props.model}</p>
      ) : null}
      {query.error || error ? (
        <p role="alert" className="text-xs text-error-foreground">
          {error ?? query.error}
        </p>
      ) : null}
      {state?.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
      {!state && !query.error ? (
        <p className="text-xs text-muted-foreground">Finding related items...</p>
      ) : state?.status === "ready" && (list.data?.suggested.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">No suggestions for this item.</p>
      ) : null}
      {state?.status === "ready" ? (
        <ul className="flex flex-col gap-3">
          {(list.data?.suggested ?? []).slice(0, 3).map((view) => (
            <li key={view.id} className="space-y-1 text-sm">
              <Button
                variant="ghost"
                size="xs"
                className="max-w-full justify-start"
                disabled={!canOpenLinkedItem(view.item.ref)}
                onClick={() => props.onOpen(view.item.ref)}
              >
                {workspaceEndpointTitle(view.item)}
              </Button>
              {view.source.type === "model" ? (
                <p className="text-xs text-muted-foreground">{view.source.reason}</p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || !canOperate}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    const result = await accept({
                      environmentId: props.environmentId,
                      input: { id: view.id, viewing: props.item },
                    });
                    setBusy(false);
                    if (result._tag === "Failure") fail(result);
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy || !canOperate}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    const result = await dismiss({
                      environmentId: props.environmentId,
                      input: { id: view.id },
                    });
                    setBusy(false);
                    if (result._tag === "Failure") fail(result);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
