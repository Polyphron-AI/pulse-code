import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogPanel } from "../ui/dialog";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import type { WorkspaceNativeRequest } from "./WorkspaceNativeActions.logic";
export {
  workspaceNativeAction,
  workspaceNativeMenu,
  workspaceProjectNativeMenu,
  type WorkspaceNativeRequest,
} from "./WorkspaceNativeActions.logic";
export function WorkspaceNativeActionsDialog({
  request,
  onClose,
}: {
  request: WorkspaceNativeRequest;
  onClose: () => void;
}) {
  const capability = useMailCapabilities(request.environmentId);
  const location = useLocation();
  const initial = useRef(location.href);
  useEffect(() => {
    if (location.href !== initial.current) onClose();
  }, [location.href, onClose]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Workspace actions</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <p className="mb-3 text-sm text-muted-foreground">
            {request.item.title ?? request.item.ref.type}
          </p>
          {capability.workspaceLinks ? (
            <>
              <WorkspaceItemActions
                environmentId={request.environmentId}
                item={request.item}
                initialAction={request.action}
              />{" "}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {capability.ready
                ? "Workspace actions need a newer server."
                : "Reconnect this environment to use workspace actions."}
            </p>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
