import { useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { resolveEnvironmentOptionLabel } from "../BranchToolbar.logic";
import { ListTodoIcon, CircleIcon, CircleCheckIcon, ArchiveIcon } from "lucide-react";
import { OfficeSubnav } from "./OfficeSubnav";
import { TasksPanel } from "./TasksPanel";

export function TasksWorkspace() {
  const { environments, isReady } = useEnvironments();
  const primary = usePrimaryEnvironmentId();
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const environmentId =
    environments.find((environment) => environment.environmentId === selected)?.environmentId ??
    environments.find((environment) => environment.environmentId === primary)?.environmentId ??
    environments[0]?.environmentId;
  return (
    <div className="flex h-full min-h-0">
      <OfficeSubnav
        label="Task views"
        items={[
          { id: "all", label: "All tasks", icon: ListTodoIcon },
          { id: "open", label: "Open", icon: CircleIcon },
          { id: "done", label: "Done", icon: CircleCheckIcon },
          { id: "archived", label: "Archived", icon: ArchiveIcon },
        ]}
        value={status}
        onChange={setStatus}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {environments.length > 1 && (
          <label className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs">
            Environment
            <select
              aria-label="Tasks environment"
              className="rounded border border-input bg-background p-1"
              value={environmentId}
              onChange={(event) =>
                setSelected(
                  environments.find(
                    (environment) => environment.environmentId === event.target.value,
                  )?.environmentId ?? null,
                )
              }
            >
              {environments.map((environment) => (
                <option key={environment.environmentId} value={environment.environmentId}>
                  {resolveEnvironmentOptionLabel({
                    environmentId: environment.environmentId,
                    isPrimary: environment.environmentId === primary,
                    savedLabel: environment.label,
                  })}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="min-h-0 flex-1">
          {isReady && environmentId ? (
            <TasksPanel
              environmentId={environmentId}
              statusFilter={status}
              onStatusFilterChange={setStatus}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              {isReady ? "Connect an environment to use shared tasks." : "Loading environments?"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
