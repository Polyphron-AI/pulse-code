import { useState } from "react";
import type { ProjectOffice } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { randomUUID } from "../../lib/utils";

export function ProjectTaskColumns({
  office,
  onSave,
}: {
  office: ProjectOffice;
  onSave: (office: ProjectOffice) => Promise<boolean>;
}) {
  const [columns, setColumns] = useState([...(office.taskColumns ?? [])]);
  const [baseline, setBaseline] = useState(() => JSON.stringify(office.taskColumns ?? []));
  const changedElsewhere = JSON.stringify(office.taskColumns ?? []) !== baseline;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || changedElsewhere) return;
        setBusy(true);
        setNotice("");
        const savedColumns = columns.map((column) => ({ ...column, name: column.name.trim() }));
        void onSave({
          ...office,
          taskColumns: savedColumns,
        })
          .then((ok) => {
            if (ok) {
              setColumns(savedColumns);
              setBaseline(JSON.stringify(savedColumns));
            }
            setNotice(
              ok
                ? "Task columns saved."
                : "Columns could not be saved. Your changes are still here.",
            );
          })
          .catch(() => setNotice("Columns could not be saved. Try again."))
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="font-semibold">Task columns</h2>
      <p className="text-sm text-muted-foreground">
        Add project columns under the shared To do, In progress, Review and Done statuses. Tasks
        remain available when a column is removed.
      </p>
      {changedElsewhere && (
        <div className="space-y-2" role="status">
          <p className="text-sm">
            Saved task columns changed elsewhere. Your edits are still here. Reload the saved
            columns before making further changes.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setColumns([...(office.taskColumns ?? [])]);
              setBaseline(JSON.stringify(office.taskColumns ?? []));
              setNotice("");
            }}
          >
            Replace editor with saved columns
          </Button>
        </div>
      )}
      {columns.map((column, index) => (
        <fieldset key={column.id} disabled={busy} className="space-y-2 border-b pb-3">
          <label className="block text-xs">
            Column name
            <Input
              aria-label={`Column ${index + 1} name`}
              required
              maxLength={60}
              value={column.name}
              onChange={(event) =>
                setColumns((previous) =>
                  previous.map((item) =>
                    item.id === column.id ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <div className="flex items-center gap-2">
            <label className="flex-1 text-xs">
              Shared status
              <select
                aria-label={`Column ${index + 1} status`}
                className="mt-1 w-full rounded border bg-background p-2"
                value={column.status}
                onChange={(event) =>
                  setColumns((previous) =>
                    previous.map((item) =>
                      item.id === column.id
                        ? { ...item, status: event.target.value as typeof column.status }
                        : item,
                    ),
                  )
                }
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setColumns((previous) => previous.filter((item) => item.id !== column.id))
              }
            >
              Remove
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || columns.length >= 20}
          onClick={() =>
            setColumns((previous) => [...previous, { id: randomUUID(), name: "", status: "todo" }])
          }
        >
          Add column
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy || changedElsewhere || columns.some((column) => !column.name.trim())}
        >
          Save columns
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </form>
  );
}
