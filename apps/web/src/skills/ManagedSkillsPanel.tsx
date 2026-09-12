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
import { useId, useState } from "react";

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
  readonly skills: ReadonlyArray<PulseSkillRecord>;
  readonly mutate: (mutation: PulseSkillMutation) => Promise<ReadonlyArray<PulseSkillRecord>>;
  readonly disabled?: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The skill operation failed.";
}

export function ManagedSkillsPanel({ skills, mutate, disabled = false }: ManagedSkillsPanelProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [gitTarget, setGitTarget] = useState<PulseSkillRecord | "new" | null>(null);
  const [removing, setRemoving] = useState<PulseSkillRecord | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = groupManagedSkills(skills);

  const run = async (key: string, mutation: PulseSkillMutation) => {
    setPending(key);
    setError(null);
    try {
      await mutate(mutation);
      return true;
    } catch (cause) {
      setError(message(cause));
      return false;
    } finally {
      setPending(null);
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
            disabled={disabled}
            onClick={() => setUploadOpen(true)}
          >
            <UploadIcon />
            Upload
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => setGitTarget("new")}>
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
                    onLink={() => setGitTarget(skill)}
                    onRemove={() => setRemoving(skill)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <UploadSkillDialog
        open={uploadOpen}
        busy={pending === "upload"}
        onOpenChange={setUploadOpen}
        onImport={(id, files) => run("upload", { operation: "import-upload", id, files })}
      />
      <GitHubSkillDialog
        target={gitTarget}
        busy={pending === "github"}
        onOpenChange={(open) => !open && setGitTarget(null)}
        onImport={(mutation) => run("github", mutation)}
      />
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
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
              disabled={!removing || pending !== null}
              onClick={() => {
                if (!removing) return;
                const skill = removing;
                void run(skill.id, { operation: "remove", id: skill.id }).then((ok) => {
                  if (ok) setRemoving(null);
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
  readonly onRun: (mutation: PulseSkillMutation) => Promise<boolean>;
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
  busy,
  onOpenChange,
  onImport,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImport: (
    id: string,
    files: Array<{ path: string; base64: string }>,
  ) => Promise<boolean>;
}) {
  const fieldId = useId();
  const [id, setId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setId("");
    setFiles([]);
    setError(null);
  };
  const save = async () => {
    try {
      const upload = await readSkillFiles(files);
      if (await onImport(id.trim(), upload)) {
        reset();
        onOpenChange(false);
      }
    } catch (cause) {
      setError(message(cause));
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-md">
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
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || !/^[a-z][a-z0-9-]{0,63}$/.test(id) || files.length === 0}
            onClick={() => void save()}
          >
            {busy ? "Uploading…" : "Upload skill"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function GitHubSkillDialog({
  target,
  busy,
  onOpenChange,
  onImport,
}: {
  readonly target: PulseSkillRecord | "new" | null;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImport: (mutation: PulseSkillMutation) => Promise<boolean>;
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
  const save = async () => {
    if (!target) return;
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
    if (await onImport(mutation)) {
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
        onOpenChange(next);
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
                  onChange={(event) => setRef(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-directory`}>Skill directory</Label>
                <Input
                  id={`${fieldId}-directory`}
                  value={directory}
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
                  onClick={() => setKeepUpdated(false)}
                >
                  Pin version
                </Button>
                <Button
                  type="button"
                  variant={keepUpdated ? "secondary" : "outline"}
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
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !valid} onClick={() => void save()}>
            {busy ? "Validating…" : target === "new" ? "Import skill" : "Link skill"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
