import type { ComponentProps } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";

export interface ProjectCreateDialogViewProps {
  readonly open: boolean;
  readonly finalFocus: NonNullable<ComponentProps<typeof DialogPopup>["finalFocus"]>;
  readonly name: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly created: boolean;
  readonly onNameChange: (name: string) => void;
  readonly onSubmit: () => void | Promise<void>;
  readonly onCancel: () => void;
  readonly onOpenCreated: () => void | Promise<void>;
  readonly onOpenChange: (open: boolean) => void;
}

/** One creation form for the live workspace and its isolated capture recipe. */
export function ProjectCreateDialogView(props: ProjectCreateDialogViewProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup showCloseButton={!props.busy} finalFocus={props.finalFocus}>
        <div className="p-4">
          <DialogTitle>New project</DialogTitle>
          {props.created ? (
            <div className="mt-3 space-y-3 text-sm">
              <p role="status">Project created. Open project to continue.</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={props.busy} onClick={props.onOpenCreated}>
                  Open project
                </Button>
                <Button
                  variant="outline"
                  disabled={props.busy}
                  onClick={() => props.onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <form
              aria-label="Create project"
              className="mt-3 flex flex-col gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                await props.onSubmit();
              }}
            >
              <Input
                aria-label="Project name"
                placeholder="Project name"
                className="pointer-coarse:[&_input]:min-h-11"
                value={props.name}
                readOnly={props.busy}
                onChange={(event) => props.onNameChange(event.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={props.busy || !props.name.trim()}>
                  Create project
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={props.busy}
                  onClick={props.onCancel}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {props.error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {props.error}
            </p>
          ) : null}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
