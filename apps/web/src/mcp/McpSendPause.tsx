import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

export interface FailedMcpConnection {
  readonly connectionId: string;
  readonly name: string;
  readonly message: string;
}

interface McpSendPauseActions {
  readonly failed: ReadonlyArray<FailedMcpConnection>;
  readonly onRetry: () => void;
  readonly onContinueWithout: (excludedConnectionIds: ReadonlyArray<string>) => void;
  readonly onManage: () => void;
}

export function McpSendPauseContent(props: McpSendPauseActions) {
  const failedIds = props.failed.map((connection) => connection.connectionId);
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>MCP connections are not ready</AlertDialogTitle>
        <AlertDialogDescription>
          Your message has not been sent. Retry the connections, fix them, or continue without the
          failed connections for this turn.
        </AlertDialogDescription>
        <ul className="space-y-2 pt-2 text-left text-sm">
          {props.failed.map((connection) => (
            <li key={connection.connectionId} className="rounded-md bg-muted/55 px-3 py-2">
              <div className="font-medium text-foreground">{connection.name}</div>
              <div className="text-muted-foreground">{connection.message}</div>
            </li>
          ))}
        </ul>
      </AlertDialogHeader>
      <AlertDialogFooter className="sm:flex-wrap">
        <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
        <Button variant="outline" onClick={props.onManage}>
          Manage connections
        </Button>
        <Button variant="outline" onClick={() => props.onContinueWithout(failedIds)}>
          Continue without it
        </Button>
        <Button onClick={props.onRetry}>Retry</Button>
      </AlertDialogFooter>
    </>
  );
}

export function McpSendPause(
  props: McpSendPauseActions & {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
  },
) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogPopup>
        <McpSendPauseContent {...props} />
      </AlertDialogPopup>
    </AlertDialog>
  );
}
