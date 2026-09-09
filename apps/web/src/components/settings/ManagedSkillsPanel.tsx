import type JSZipTypes from "jszip";
import { useState } from "react";
import type {
  EnvironmentId,
  ManagedSkillOperation,
  ProviderInstanceId,
  SkillUploadFile,
} from "@t3tools/contracts";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { SettingsSection } from "./settingsLayout";

type InspectableSkillZipEntry = JSZipTypes.JSZipObject & {
  internalStream?: (type: "uint8array") => JSZipTypes.JSZipStreamHelper<Uint8Array>;
};

export async function readSkillUpload(file: File): Promise<SkillUploadFile[]> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose a file smaller than 8 MB.");
  if (file.name.toLowerCase() === "skill.md") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 64_000) throw new Error("SKILL.md must be at most 64,000 bytes.");
    return [
      {
        path: "SKILL.md",
        base64: btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")),
      },
    ];
  }
  if (!file.name.toLowerCase().endsWith(".zip"))
    throw new Error("Choose SKILL.md or a ZIP skill folder.");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = (Object.values(zip.files) as InspectableSkillZipEntry[]).filter(
    (entry) => !entry.dir,
  );
  if (entries.length > 128) throw new Error("A skill can contain at most 128 files.");
  const roots = entries.filter((entry) => /(^|\/)SKILL\.md$/.test(entry.name));
  if (roots.length !== 1) throw new Error("The ZIP must contain exactly one SKILL.md.");
  const prefix = roots[0]!.name.slice(0, -"SKILL.md".length);
  let total = 0;
  const files: SkillUploadFile[] = [];
  for (const entry of entries) {
    if (
      !entry.name.startsWith(prefix) ||
      (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) ||
      (Number(entry.unixPermissions) & 0o170000) === 0o120000
    )
      throw new Error("The ZIP must contain one skill folder without links or unsafe paths.");
    if (!entry.internalStream) throw new Error("The ZIP entry could not be read.");
    const content = await new Promise<string>((resolve, reject) => {
      const chunks: string[] = [];
      let size = 0;
      const stream = entry.internalStream!("uint8array");
      stream
        .on("data", (chunk: Uint8Array) => {
          size += chunk.length;
          if (size > 1024 * 1024 || total + Math.ceil(size / 3) * 4 > 11_200_000) {
            stream.pause();
            reject(new Error("The expanded ZIP exceeds the skill size limit."));
            return;
          }
          chunks.push(Array.from(chunk, (byte) => String.fromCharCode(byte)).join(""));
        })
        .on("error", reject)
        .on("end", () => resolve(btoa(chunks.join(""))))
        .resume();
    });
    total += content.length;
    if (content.length > 1_400_000 || total > 11_200_000)
      throw new Error("The expanded ZIP exceeds the skill size limit.");
    files.push({ path: entry.name.slice(prefix.length), base64: content });
  }
  return files;
}

export function ManagedSkillsPanel({
  environmentId,
  readOnly = false,
}: {
  environmentId: EnvironmentId;
  readOnly?: boolean;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const persist = useAtomCommand(serverEnvironment.updateSettings);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"upload" | "github">("upload");
  const [id, setId] = useState("");
  const [repository, setRepository] = useState("");
  const [ref, setRef] = useState("");
  const [directory, setDirectory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers: Record<string, { displayName?: string | undefined }> = {
    ...Object.fromEntries(
      Object.keys(settings.providers).map((driver) => [
        driver,
        { displayName: driver === "claudeAgent" ? "Claude" : driver },
      ]),
    ),
    ...settings.providerInstances,
  };
  async function run(operation: ManagedSkillOperation) {
    setBusy(true);
    setError(null);
    try {
      const result = await persist({
        environmentId,
        input: { patch: { skillOperations: [operation] } },
      });
      if (result._tag === "Failure")
        throw new Error(
          "Could not save the skill. Check the environment connection, valid SKILL.md frontmatter, source and file limits.",
        );
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save skill.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function importSkill() {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) {
      setError(
        "Use a skill ID starting with a letter, followed by lowercase letters, numbers or dashes.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const success =
        kind === "upload"
          ? file
            ? await run({
                type: "import",
                id,
                source: { type: "upload" },
                files: await readSkillUpload(file),
              })
            : (setError("Choose a skill file."), false)
          : await run({
              type: "import",
              id,
              source: {
                type: "github",
                repository: repository
                  .trim()
                  .replace(/^https:\/\/github\.com\//, "")
                  .replace(/\.git\/?$|\/$/g, ""),
                ref: ref.trim(),
                directory: directory.trim(),
              },
            });
      if (success) setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not read upload.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsSection
      title="Managed skills"
      headerAction={
        <Button
          size="sm"
          variant="outline"
          disabled={readOnly || busy}
          onClick={() => {
            setId("");
            setFile(null);
            setError(null);
            setOpen(true);
          }}
        >
          Add skill
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Upload a skill or link a GitHub repository. Enable it by default for a provider, or choose
        it from a thread's Skills menu. Native provider and workspace skills remain in the existing
        skill picker.
      </p>
      {error && !open && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}
      {!Object.keys(settings.managedSkills).length && (
        <p className="py-3 text-sm text-muted-foreground">No managed skills yet.</p>
      )}
      <div className="divide-y divide-border">
        {Object.entries(settings.managedSkills).map(([key, skill]) => (
          <article key={key} className="space-y-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-medium">{skill.name}</h3>
                <p className="text-xs text-muted-foreground">{skill.description}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={readOnly || busy}
                onClick={() => void run({ type: "remove", id: key })}
              >
                Remove
              </Button>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              {skill.source.type === "github"
                ? `${skill.source.repository} / ${skill.source.directory || "."} · ${skill.source.ref || "Default branch"} · ${skill.commit?.slice(0, 8) ?? skill.revision.slice(0, 8)}`
                : `Uploaded · ${skill.revision.slice(0, 8)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Updated {new Date(skill.updatedAt).toLocaleString()} · Checked{" "}
              {new Date(skill.checkedAt).toLocaleString()}
            </p>
            {skill.error && (
              <p role="alert" className="text-xs text-destructive-foreground">
                {skill.error} The previous revision is still available.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {skill.source.type === "github" ? (
                <>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      disabled={readOnly || busy}
                      checked={skill.autoUpdate}
                      onCheckedChange={(autoUpdate) =>
                        void run({
                          type: "configure",
                          id: key,
                          autoUpdate,
                          defaultProviders: skill.defaultProviders,
                        })
                      }
                    />
                    Update automatically
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={readOnly || busy}
                    onClick={() => void run({ type: "sync", id: key })}
                  >
                    Sync now
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={readOnly || busy}
                  onClick={() => {
                    setId(key);
                    setKind("upload");
                    setFile(null);
                    setError(null);
                    setOpen(true);
                  }}
                >
                  Replace upload
                </Button>
              )}
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs text-muted-foreground">Always available for</legend>
              <div className="flex flex-wrap gap-4">
                {Object.entries(providers).map(([providerId, provider]) => (
                  <label key={providerId} className="flex items-center gap-2 text-xs">
                    <Switch
                      disabled={readOnly || busy}
                      checked={skill.defaultProviders.includes(providerId as ProviderInstanceId)}
                      onCheckedChange={(enabled) =>
                        void run({
                          type: "configure",
                          id: key,
                          autoUpdate: skill.autoUpdate,
                          defaultProviders: enabled
                            ? [...skill.defaultProviders, providerId as ProviderInstanceId]
                            : skill.defaultProviders.filter((value) => value !== providerId),
                        })
                      }
                    />
                    {provider.displayName ?? providerId}
                  </label>
                ))}
              </div>
            </fieldset>
          </article>
        ))}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogTitle>Add or replace a skill</DialogTitle>
          <DialogDescription>
            Import one skill directory. Reusing an ID replaces its source for future turns.
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <label className="block space-y-1 text-sm">
              Skill ID
              <Input
                value={id}
                onChange={(event) => setId(event.target.value)}
                placeholder="code-review"
                disabled={busy}
              />
            </label>
            <div className="flex gap-2">
              <Button
                variant={kind === "upload" ? "default" : "outline"}
                disabled={busy}
                onClick={() => setKind("upload")}
              >
                Upload
              </Button>
              <Button
                variant={kind === "github" ? "default" : "outline"}
                disabled={busy}
                onClick={() => setKind("github")}
              >
                GitHub
              </Button>
            </div>
            {kind === "upload" ? (
              <label className="block space-y-2 text-sm">
                SKILL.md or ZIP folder
                <input
                  type="file"
                  accept=".md,.zip"
                  disabled={busy}
                  className="block w-full text-sm"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <span className="block text-xs text-muted-foreground">
                  Include name and description in SKILL.md frontmatter. Up to 128 files, 1 MB each
                  and 8 MB total.
                </span>
              </label>
            ) : (
              <>
                <label className="block space-y-1 text-sm">
                  GitHub repository
                  <Input
                    value={repository}
                    onChange={(event) => setRepository(event.target.value)}
                    placeholder="owner/repository"
                    disabled={busy}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  Branch, tag or commit
                  <Input
                    value={ref}
                    onChange={(event) => setRef(event.target.value)}
                    placeholder="Default branch"
                    disabled={busy}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  Skill directory
                  <Input
                    value={directory}
                    onChange={(event) => setDirectory(event.target.value)}
                    placeholder="skills/code-review"
                    disabled={busy}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Uses the GitHub account signed in on this environment. Private repositories
                  require that account's access. Automatic checks run hourly while Pulse is running.
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy || readOnly} onClick={() => void importSkill()}>
                {busy ? "Importing…" : "Import skill"}
              </Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </SettingsSection>
  );
}
