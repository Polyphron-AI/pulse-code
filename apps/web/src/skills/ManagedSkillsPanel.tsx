import type { PulseSkillMutation, PulseSkillRecord } from "@t3tools/contracts";
import {
  AlertCircleIcon,
  FileArchiveIcon,
  GithubIcon,
  LinkIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { groupManagedSkills, readSkillFiles, shortRevision } from "./managedSkills";

export interface ManagedSkillsPanelProps {
  readonly environmentKey: string;
  readonly skills: ReadonlyArray<PulseSkillRecord>;
  readonly mutate: (
    environmentKey: string,
    mutation: PulseSkillMutation,
  ) => Promise<ReadonlyArray<PulseSkillRecord>>;
  readonly disabled?: boolean;
}

type MutationResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The skill operation failed.";
}

export function ManagedSkillsPanel({
  environmentKey,
  skills,
  mutate,
  disabled = false,
}: ManagedSkillsPanelProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [gitTarget, setGitTarget] = useState<PulseSkillRecord | "new" | null>(null);
  const [removing, setRemoving] = useState<PulseSkillRecord | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const environmentRef = useRef(environmentKey);
  const disabledRef = useRef(disabled);
  const generationRef = useRef(0);
  if (environmentRef.current !== environmentKey) {
    environmentRef.current = environmentKey;
    generationRef.current += 1;
  }
  disabledRef.current = disabled;
  const groups = groupManagedSkills(skills);

  useEffect(() => {
    generationRef.current += 1;
    setUploadOpen(false);
    setGitTarget(null);
    setRemoving(null);
    setPending(null);
    setError(null);
  }, [disabled, environmentKey]);

  const run = async (pendingKey: string, mutation: PulseSkillMutation): Promise<MutationResult> => {
    if (disabledRef.current) return { ok: false, error: "Managed skills are read-only." };
    const key = environmentKey;
    const generation = generationRef.current;
    setPending(pendingKey);
    setError(null);
    try {
      await mutate(key, mutation);
      if (
        generation !== generationRef.current ||
        key !== environmentRef.current ||
        disabledRef.current
      ) {
        return { ok: false, error: "The environment changed before this operation finished." };
      }
      return { ok: true };
    } catch (cause) {
      const operationError = message(cause);
      if (generation === generationRef.current && key === environmentRef.current) {
        setError(operationError);
      }
      return { ok: false, error: operationError };
    } finally {
      if (generation === generationRef.current && key === environmentRef.current) setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <h2 className="text-base font-semibold tracking-[-0.01em]">Managed skills</h2>
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Import skills into this environment. Provider-native and workspace skills remain
            available separately.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || pending !== null}
            onClick={() => {
              if (!disabled && pending === null) setUploadOpen(true);
            }}
          >
            <UploadIcon />
            Upload
          </Button>
          <Button
            size="sm"
            disabled={disabled || pending !== null}
            onClick={() => {
              if (!disabled && pending === null) setGitTarget("new");
            }}
          >
            <GithubIcon />
            Import from GitHub
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="error">
          <AlertCircleIcon />
          <AlertTitle>Skill change failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
          <FileArchiveIcon className="mx-auto mb-3 size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No managed skills yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
            Upload a skill folder or ZIP, or import a skill directory from GitHub.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <section
              key={group.id}
              className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  {group.uploaded ? (
                    <UploadIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <GithubIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <h3 className="truncate text-sm font-medium">{group.label}</h3>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {group.skills.length} {group.skills.length === 1 ? "skill" : "skills"}
                </span>
              </header>
              <div className="divide-y divide-border/50">
                {group.skills.map((skill) => (
                  <SkillRow
                    key={skill.id}
                    skill={skill}
                    disabled={disabled || pending !== null}
                    pending={pending === skill.id}
                    onRun={(mutation) => run(skill.id, mutation)}
                    onLink={() => {
                      if (!disabled) setGitTarget(skill);
                    }}
                    onRemove={() => {
                      if (!disabled) setRemoving(skill);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <UploadSkillDialog
        open={!disabled && uploadOpen}
        disabled={disabled}
        onOpenChange={setUploadOpen}
        onImport={(id, files) => run("upload", { operation: "import-upload", id, files })}
      />
      <GitHubSkillDialog
        target={disabled ? null : gitTarget}
        busy={pending === "github"}
        disabled={disabled}
        onOpenChange={(open) => !open && setGitTarget(null)}
        onImport={(mutation) => run("github", mutation)}
      />
      <AlertDialog
        open={!disabled && removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be available for new turns. A turn that already started keeps its
              selected revision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              disabled={disabled || !removing || pending !== null}
              onClick={() => {
                if (disabled || !removing) return;
                const skill = removing;
                void run(skill.id, { operation: "remove", id: skill.id }).then((result) => {
                  if (result.ok) setRemoving(null);
                });
              }}
            >
              Remove skill
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

function SkillRow({
  skill,
  disabled,
  pending,
  onRun,
  onLink,
  onRemove,
}: {
  readonly skill: PulseSkillRecord;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onRun: (mutation: PulseSkillMutation) => Promise<MutationResult>;
  readonly onLink: () => void;
  readonly onRemove: () => void;
}) {
  const github = skill.source.type === "github" ? skill.source : null;
  const keepUpdated = skill.updatePolicy === "keep-updated";
  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{skill.name}</h4>
            <Badge variant={keepUpdated ? "info" : "outline"}>
              {keepUpdated ? "Keep updated" : "Pinned"}
            </Badge>
            {skill.error ? <Badge variant="error">Update failed</Badge> : null}
          </div>
          <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
            {skill.description}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {github ? (
              <span className="break-all">
                {github.ref || "HEAD"}
                {github.directory ? ` / ${github.directory}` : ""}
              </span>
            ) : (
              <span>Uploaded content</span>
            )}
            <span title={skill.revision}>Revision {shortRevision(skill.revision)}</span>
            {skill.resolvedCommit ? (
              <span title={skill.resolvedCommit}>Commit {skill.resolvedCommit.slice(0, 10)}</span>
            ) : null}
          </div>
          {skill.error ? <p className="text-xs text-error-foreground">{skill.error}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {pending ? (
            <LoaderCircleIcon
              className="mr-1 size-3.5 animate-spin motion-reduce:animate-none"
              aria-label="Saving"
            />
          ) : null}
          {github ? (
            <>
              <Button
                size="xs"
                variant="outline"
                disabled={disabled}
                onClick={() => void onRun({ operation: "sync", id: skill.id })}
              >
                <RefreshCwIcon />
                Check now
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  void onRun({
                    operation: "set-policy",
                    id: skill.id,
                    policy: keepUpdated ? "pinned" : "keep-updated",
                  })
                }
              >
                {keepUpdated ? "Pin version" : "Keep updated"}
              </Button>
              <Button size="xs" variant="ghost" disabled={disabled} onClick={onLink}>
                Source
              </Button>
            </>
          ) : (
            <Button size="xs" variant="outline" disabled={disabled} onClick={onLink}>
              <LinkIcon />
              Link GitHub
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost-muted"
            disabled={disabled}
            aria-label={`Remove ${skill.name}`}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    </div>
  );
}

function UploadSkillDialog({
  open,
  disabled,
  onOpenChange,
  onImport,
}: {
  readonly open: boolean;
  readonly disabled: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImport: (
    id: string,
    files: Array<{ path: string; base64: string }>,
  ) => Promise<MutationResult>;
}) {
  const fieldId = useId();
  const [id, setId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "mutating">("idle");
  const controllerRef = useRef<AbortController | null>(null);
  const reset = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setId("");
    setFiles([]);
    setError(null);
    setPhase("idle");
  };
  useEffect(() => {
    if (!open || disabled) reset();
  }, [disabled, open]);
  const save = async () => {
    if (disabled || phase !== "idle") return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setPhase("reading");
    setError(null);
    try {
      const upload = await readSkillFiles(files, controller.signal);
      controller.signal.throwIfAborted();
      setPhase("mutating");
      const result = await onImport(id.trim(), upload);
      controller.signal.throwIfAborted();
      if (result.ok) {
        reset();
        onOpenChange(false);
      } else setError(result.error);
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setPhase("idle");
      }
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && phase === "mutating" && !disabled) return;
        if (!next) reset();
        onOpenChange(disabled ? false : next);
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={phase !== "mutating"}>
        <DialogHeader>
          <DialogTitle>Upload a skill</DialogTitle>
          <DialogDescription>
            Choose a ZIP archive or the files from one skill folder.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-id`}>Skill ID</Label>
              <Input
                id={`${fieldId}-id`}
                value={id}
                disabled={disabled || phase !== "idle"}
                placeholder="code-review"
                onChange={(event) => setId(event.target.value.toLowerCase())}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and dashes.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-files`}>Skill files</Label>
              <Input
                id={`${fieldId}-files`}
                nativeInput
                type="file"
                accept=".zip,.md,.txt,.json,.yaml,.yml"
                multiple
                disabled={disabled || phase !== "idle"}
                onChange={(event) => setFiles([...(event.currentTarget.files ?? [])])}
              />
              {files.length ? (
                <p className="text-xs text-muted-foreground">
                  {files.length} {files.length === 1 ? "file" : "files"} selected
                </p>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-sm text-error-foreground">
                {error}
              </p>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button
            variant="outline"
            disabled={disabled || phase === "mutating"}
            onClick={() => {
              if (disabled || phase === "mutating") return;
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={
              disabled ||
              phase !== "idle" ||
              !/^[a-z][a-z0-9-]{0,63}$/.test(id) ||
              files.length === 0
            }
            onClick={() => void save()}
          >
            {phase === "reading"
              ? "Reading archive…"
              : phase === "mutating"
                ? "Saving skill…"
                : "Upload skill"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function GitHubSkillDialog({
  target,
  busy,
  disabled,
  onOpenChange,
  onImport,
}: {
  readonly target: PulseSkillRecord | "new" | null;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImport: (mutation: PulseSkillMutation) => Promise<MutationResult>;
}) {
  const fieldId = useId();
  const [id, setId] = useState("");
  const [repository, setRepository] = useState("");
  const [ref, setRef] = useState("main");
  const [directory, setDirectory] = useState("");
  const [keepUpdated, setKeepUpdated] = useState(false);
  const reset = () => {
    setId("");
    setRepository("");
    setRef("main");
    setDirectory("");
    setKeepUpdated(false);
  };
  useEffect(() => {
    if (!target || disabled) {
      reset();
      return;
    }
    if (target === "new" || target.source.type !== "github") return;
    setRepository(target.source.repository);
    setRef(target.source.ref);
    setDirectory(target.source.directory);
    setKeepUpdated(target.updatePolicy === "keep-updated");
  }, [disabled, target]);
  const save = async () => {
    if (disabled || !target) return;
    const source = {
      type: "github" as const,
      repository: repository.trim(),
      ref: ref.trim(),
      directory: directory.trim().replace(/^\/+|\/+$/g, ""),
    };
    const mutation: PulseSkillMutation =
      target === "new"
        ? {
            operation: "import-github",
            id: id.trim(),
            source,
            updatePolicy: keepUpdated ? "keep-updated" : "pinned",
          }
        : {
            operation: "link-github",
            id: target.id,
            source,
            updatePolicy: keepUpdated ? "keep-updated" : "pinned",
          };
    if ((await onImport(mutation)).ok) {
      reset();
      onOpenChange(false);
    }
  };
  const valid =
    target !== null &&
    (target !== "new" || /^[a-z][a-z0-9-]{0,63}$/.test(id)) &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.trim()) &&
    ref.trim().length > 0;
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(disabled ? false : next);
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target === "new" ? "Import from GitHub" : `Link ${target?.name ?? "skill"} to GitHub`}
          </DialogTitle>
          <DialogDescription>
            Pulse validates the selected directory before changing the installed skill.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-4">
            {target === "new" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-git-id`}>Skill ID</Label>
                <Input
                  id={`${fieldId}-git-id`}
                  value={id}
                  disabled={disabled || busy}
                  placeholder="code-review"
                  onChange={(event) => setId(event.target.value.toLowerCase())}
                  autoFocus
                />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-repository`}>Repository</Label>
              <Input
                id={`${fieldId}-repository`}
                value={repository}
                disabled={disabled || busy}
                placeholder="owner/repository"
                onChange={(event) => setRepository(event.target.value)}
                autoFocus={target !== "new"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-ref`}>Branch or ref</Label>
                <Input
                  id={`${fieldId}-ref`}
                  value={ref}
                  disabled={disabled || busy}
                  onChange={(event) => setRef(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-directory`}>Skill directory</Label>
                <Input
                  id={`${fieldId}-directory`}
                  value={directory}
                  disabled={disabled || busy}
                  placeholder="skills/review"
                  onChange={(event) => setDirectory(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Update policy</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={!keepUpdated ? "secondary" : "outline"}
                  disabled={disabled || busy}
                  onClick={() => setKeepUpdated(false)}
                >
                  Pin version
                </Button>
                <Button
                  type="button"
                  variant={keepUpdated ? "secondary" : "outline"}

                  disabled={disabled || busy}
                  onClick={() => setKeepUpdated(true)}
                >
                  Keep updated
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {keepUpdated
                  ? "Track this branch or ref for validated updates."
                  : "Keep the resolved commit until you change it."}
              </p>
            </div>
          </div>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" disabled={disabled || busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={disabled || busy || !valid} onClick={() => void save()}>
            {busy ? "Validating…" : target === "new" ? "Import skill" : "Link skill"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
