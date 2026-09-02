import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ServerConfig } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { AlertTriangleIcon, BotIcon, KeyRoundIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePrepareOmpThread } from "../../hooks/usePrepareOmpThread";
import { usePrimaryEnvironmentId } from "../../state/environments";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { buildSeniorCrewPrompt, type WorkspaceThreadRow } from "./OrcaWorkspace.logic";
import { deriveDispatchReadyOmpEntries } from "./OmpThreadDialog.logic";

function scopedProjectKey(project: EnvironmentProject): string {
  return `${project.environmentId}:${project.id}`;
}

function discoveredModels(entry: ProviderInstanceEntry | null) {
  return entry?.models ?? [];
}

function preferredDiscoveredModel(entry: ProviderInstanceEntry | null): string | null {
  const models = discoveredModels(entry);
  return models.find((model) => model.isDefault)?.slug ?? models[0]?.slug ?? null;
}

function defaultTask(sourceThreadTitle: string | null): string {
  return sourceThreadTitle
    ? `Start a separate OMP review for the repository work described by “${sourceThreadTitle}”. Inspect the target project’s current code and repository state, identify what remains, then implement and verify the next coherent step.`
    : "";
}

export function OmpThreadDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly serverConfigs: ReadonlyMap<EnvironmentId, ServerConfig>;
  readonly environmentLabelById: ReadonlyMap<EnvironmentId, string>;
  readonly connectedEnvironmentIds: ReadonlySet<EnvironmentId>;
  readonly sourceThread: WorkspaceThreadRow | null;
  readonly finalFocus: () => HTMLElement | null;
}) {
  const prepareOmpThread = usePrepareOmpThread();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedDialogKeyRef = useRef<string | null>(null);
  const prepareLockRef = useRef(false);

  const orderedProjects = useMemo(
    () =>
      [...props.projects].sort((left, right) => {
        const titleDelta = left.title.localeCompare(right.title);
        return titleDelta !== 0
          ? titleDelta
          : left.environmentId.localeCompare(right.environmentId);
      }),
    [props.projects],
  );
  const selectedProject =
    orderedProjects.find((project) => scopedProjectKey(project) === selectedProjectKey) ?? null;
  const selectedServerConfig = selectedProject
    ? props.serverConfigs.get(selectedProject.environmentId)
    : undefined;
  const isSelectedEnvironmentConnected =
    selectedProject !== null && props.connectedEnvironmentIds.has(selectedProject.environmentId);
  const readyOmpEntries = useMemo(
    () => deriveDispatchReadyOmpEntries(selectedServerConfig, isSelectedEnvironmentConnected),
    [isSelectedEnvironmentConnected, selectedServerConfig],
  );
  const selectedEntry =
    readyOmpEntries.find((entry) => entry.instanceId === selectedInstanceId) ?? null;
  const models = discoveredModels(selectedEntry);

  const sourceThreadKey = props.sourceThread?.key ?? null;
  const sourceThreadTitle = props.sourceThread?.title ?? null;
  const sourceProjectKey = props.sourceThread
    ? `${props.sourceThread.environmentId}:${props.sourceThread.projectId}`
    : null;

  useEffect(() => {
    if (!props.open) {
      initializedDialogKeyRef.current = null;
      return;
    }

    const dialogKey = sourceThreadKey ?? "new-omp-thread";
    const preferredProjectKey = orderedProjects.some(
      (project) => scopedProjectKey(project) === sourceProjectKey,
    )
      ? sourceProjectKey
      : orderedProjects[0]
        ? scopedProjectKey(orderedProjects[0])
        : null;

    if (initializedDialogKeyRef.current !== dialogKey) {
      initializedDialogKeyRef.current = dialogKey;
      setSelectedProjectKey(preferredProjectKey);
      setTask(defaultTask(sourceThreadTitle));
      setError(null);
      setIsPreparing(false);
      return;
    }

    // Environment catalogs can arrive after the dialog opens. Adopt a valid
    // project without resetting a task the user has already edited.
    setSelectedProjectKey((current) =>
      current && orderedProjects.some((project) => scopedProjectKey(project) === current)
        ? current
        : preferredProjectKey,
    );
  }, [orderedProjects, props.open, sourceProjectKey, sourceThreadKey, sourceThreadTitle]);

  useEffect(() => {
    const currentStillReady = readyOmpEntries.some(
      (entry) => entry.instanceId === selectedInstanceId,
    );
    if (!currentStillReady) {
      setSelectedInstanceId(readyOmpEntries[0]?.instanceId ?? null);
    }
  }, [readyOmpEntries, selectedInstanceId]);

  useEffect(() => {
    const currentStillDiscovered = models.some((model) => model.slug === selectedModel);
    if (!currentStillDiscovered) {
      setSelectedModel(preferredDiscoveredModel(selectedEntry));
    }
  }, [models, selectedEntry, selectedModel]);

  const canPrepare =
    selectedProject !== null &&
    selectedEntry !== null &&
    selectedModel !== null &&
    task.trim().length > 0 &&
    isSelectedEnvironmentConnected &&
    !isPreparing;

  const handlePrepare = async () => {
    if (
      prepareLockRef.current ||
      !canPrepare ||
      !selectedProject ||
      !selectedEntry ||
      !selectedModel
    ) {
      return;
    }
    prepareLockRef.current = true;
    setIsPreparing(true);
    setError(null);
    try {
      const opened = await prepareOmpThread({
        projectRef: scopeProjectRef(selectedProject.environmentId, selectedProject.id),
        modelSelection: {
          instanceId: selectedEntry.instanceId,
          model: selectedModel,
        },
        prompt: buildSeniorCrewPrompt({
          task,
          ...(props.sourceThread
            ? {
                sourceThread: {
                  title: props.sourceThread.title,
                  environmentId: props.sourceThread.environmentId,
                  threadId: props.sourceThread.threadId,
                },
              }
            : {}),
        }),
      });
      if (opened === null) {
        setError("Another draft opened first. Try again from the workspace.");
        return;
      }
      toastManager.add({
        type: "success",
        title: "OMP draft ready",
        description: "Review the prompt and send it to start the OMP session.",
      });
    } catch (cause) {
      console.error("Could not prepare OMP draft.", cause);
      setError("The OMP draft could not be prepared. Check the environment and try again.");
    } finally {
      prepareLockRef.current = false;
      setIsPreparing(false);
    }
  };

  const selectedEnvironmentLabel = selectedProject
    ? (props.environmentLabelById.get(selectedProject.environmentId) ?? "Unknown environment")
    : null;
  const canOpenLocalProviderSettings =
    selectedProject !== null && selectedProject.environmentId === primaryEnvironmentId;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && prepareLockRef.current) return;
        props.onOpenChange(open);
      }}
    >
      <DialogPopup
        className="w-full sm:max-w-xl"
        finalFocus={props.finalFocus}
        showCloseButton={!isPreparing}
      >
        <DialogHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground">
            <BotIcon className="size-4.5" />
          </div>
          <DialogTitle>
            {props.sourceThread ? "Prepare separate OMP thread" : "Prepare OMP thread"}
          </DialogTitle>
          <DialogDescription>
            Choose the exact Pulse environment, enabled OMP instance, and discovered model. The
            draft opens for review before any provider session starts.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="orca-workspace-project">
              Project and environment
            </label>
            <Select
              disabled={isPreparing}
              value={selectedProjectKey}
              onValueChange={(value) => {
                if (!value) return;
                setSelectedProjectKey(value);
                setError(null);
              }}
            >
              <SelectTrigger id="orca-workspace-project">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectPopup>
                {orderedProjects.map((project) => (
                  <SelectItem key={scopedProjectKey(project)} value={scopedProjectKey(project)}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{project.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {props.environmentLabelById.get(project.environmentId) ??
                          project.environmentId}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="orca-workspace-instance">
              OMP instance
            </label>
            {!isSelectedEnvironmentConnected && selectedProject ? (
              <div className="rounded-xl border border-warning/25 bg-warning/6 p-3 text-sm">
                <p className="font-medium text-foreground">
                  {selectedEnvironmentLabel ?? "This environment"} is disconnected.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Pulse may show its last-known catalog, but OMP preparation is disabled until the
                  environment reconnects.
                </p>
              </div>
            ) : readyOmpEntries.length > 0 ? (
              <Select
                disabled={isPreparing}
                value={selectedInstanceId}
                onValueChange={(value) => value && setSelectedInstanceId(value)}
              >
                <SelectTrigger id="orca-workspace-instance">
                  <SelectValue placeholder="Choose an OMP instance" />
                </SelectTrigger>
                <SelectPopup>
                  {readyOmpEntries.map((entry) => (
                    <SelectItem key={entry.instanceId} value={entry.instanceId}>
                      <span className="flex min-w-0 items-center gap-2">
                        <ProviderInstanceIcon
                          driverKind={entry.driverKind}
                          displayName={entry.displayName}
                          accentColor={entry.accentColor}
                          className="size-4"
                          iconClassName="size-4"
                        />
                        <span className="truncate">{entry.displayName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {entry.models.length} {entry.models.length === 1 ? "model" : "models"}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            ) : (
              <div className="rounded-xl border border-warning/25 bg-warning/6 p-3 text-sm">
                <p className="font-medium text-foreground">
                  OMP is not ready
                  {selectedEnvironmentLabel ? ` on ${selectedEnvironmentLabel}` : ""}.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Enable an Oh My Pi instance and refresh its discovered model list.
                </p>
                {canOpenLocalProviderSettings ? (
                  <Button
                    className="mt-3"
                    render={<Link to="/settings/providers" />}
                    size="xs"
                    variant="outline"
                  >
                    Configure Oh My Pi
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="orca-workspace-model">
              Discovered model
            </label>
            <Select
              value={selectedModel}
              disabled={selectedEntry === null || isPreparing}
              onValueChange={(value) => value && setSelectedModel(value)}
            >
              <SelectTrigger id="orca-workspace-model">
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectPopup>
                {models.map((model) => (
                  <SelectItem key={model.slug} value={model.slug}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{model.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {model.slug}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="orca-workspace-task">
              Task brief
            </label>
            <Textarea
              disabled={isPreparing}
              id="orca-workspace-task"
              value={task}
              onChange={(event) => {
                setTask(event.currentTarget.value);
                setError(null);
              }}
              placeholder="Describe the outcome, constraints, and evidence you expect."
              rows={5}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Pulse adds human UX, efficiency, and effectiveness review instructions. Delegation
              depends on the selected OMP runtime.
            </p>
          </div>

          {props.sourceThread ? (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              This creates a separate draft. Pulse adds the source thread title and reference to the
              prompt; it does not copy its transcript, branch, worktree, or uncommitted changes, and
              it does not create a durable parent-child link.
            </div>
          ) : null}

          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0" />
              <p>
                OMP receives the Pulse server process environment plus this instance’s configured
                overrides. Pulse never displays those stored values or copies ChatGPT, Codex,
                Claude, or other provider login or subscription sessions into OMP.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Readiness verifies the executable and model catalog, not authentication. The first
                send may still fail if credentials are missing or expired.
              </p>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter className="max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button variant="ghost" disabled={isPreparing} onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canPrepare} onClick={() => void handlePrepare()}>
            {isPreparing
              ? "Preparing…"
              : props.sourceThread
                ? "Prepare separate OMP thread"
                : "Prepare OMP thread"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
