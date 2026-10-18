import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { useNewProject } from "../../hooks/useNewProject";

/** Keep recovery local to Projects so other creation callers retain callback rejection. */
export function useProjectCreation(
  environmentId: EnvironmentId | null,
  openCreated: (ref: ScopedProjectRef) => Promise<void>,
  onOpenChange: (open: boolean) => void,
) {
  const create = useNewProject();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<ScopedProjectRef | null>(null);
  const submitting = useRef(false);
  const createdRef = useRef<ScopedProjectRef | null>(null);
  const clearCreated = () => {
    setName("");
    createdRef.current = null;
    setCreatedProject(null);
    setError(null);
  };
  const changeOpen = (open: boolean) => {
    if (submitting.current) return;
    if (!open && createdRef.current) clearCreated();
    setError(null);
    onOpenChange(open);
  };
  const submit = async () => {
    if (environmentId === null || submitting.current || createdRef.current || !name.trim()) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    let selectionFailed = false;
    try {
      const created = await create({
        environmentId,
        name: name.trim(),
        github: null,
        openThread: false,
        onCreated: async (ref) => {
          createdRef.current = ref;
          setCreatedProject(ref);
          try {
            await openCreated(ref);
          } catch {
            selectionFailed = true;
          }
        },
      });
      if (created && !selectionFailed) {
        clearCreated();
        onOpenChange(false);
      } else if (!created && !createdRef.current) {
        setError("Could not create the project. Try again.");
      }
    } catch (failure) {
      if (!createdRef.current)
        setError(failure instanceof Error ? failure.message : "Could not create the project.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const retryOpen = async () => {
    if (submitting.current || !createdRef.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await openCreated(createdRef.current);
      clearCreated();
      onOpenChange(false);
    } catch {
      setError("Could not open the project. Try Open project again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return {
    name,
    busy,
    error,
    created: createdProject !== null,
    onNameChange: setName,
    onSubmit: submit,
    onCancel: () => changeOpen(false),
    onOpenCreated: retryOpen,
    onOpenChange: changeOpen,
  };
}
