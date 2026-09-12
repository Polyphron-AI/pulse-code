import type { PulseSkillRecord } from "@t3tools/contracts";
import JSZip from "jszip";

export interface ManagedSkillGroup {
  readonly id: string;
  readonly label: string;
  readonly skills: ReadonlyArray<PulseSkillRecord>;
  readonly uploaded: boolean;
}

export function groupManagedSkills(
  skills: ReadonlyArray<PulseSkillRecord>,
): ReadonlyArray<ManagedSkillGroup> {
  const repositories = new Map<string, PulseSkillRecord[]>();
  const uploaded: PulseSkillRecord[] = [];
  for (const skill of skills) {
    if (skill.source.type === "upload") uploaded.push(skill);
    else {
      const group = repositories.get(skill.source.repository) ?? [];
      group.push(skill);
      repositories.set(skill.source.repository, group);
    }
  }
  const byName = (left: PulseSkillRecord, right: PulseSkillRecord) =>
    left.name.localeCompare(right.name);
  return [
    ...[...repositories.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([repository, entries]) => ({
        id: repository,
        label: repository,
        skills: entries.sort(byName),
        uploaded: false,
      })),
    ...(uploaded.length
      ? [
          {
            id: "uploaded",
            label: "Uploaded skills",
            skills: uploaded.sort(byName),
            uploaded: true,
          },
        ]
      : []),
  ];
}

function safePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("Skill files must use safe relative paths.");
  }
  return normalized;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export async function readSkillFiles(
  selected: ReadonlyArray<File>,
): Promise<Array<{ readonly path: string; readonly base64: string }>> {
  if (selected.length === 0) throw new Error("Choose skill files or a ZIP archive.");
  if (selected.length === 1 && selected[0]!.name.toLowerCase().endsWith(".zip")) {
    const zip = await JSZip.loadAsync(await selected[0]!.arrayBuffer());
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    const paths = entries.map((entry) =>
      safePath(
        (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name,
      ),
    );
    const hasRootManifest = paths.includes("SKILL.md");
    const firstSegments = new Set(paths.map((path) => path.split("/")[0]));
    const stripPrefix =
      !hasRootManifest && firstSegments.size === 1 ? `${[...firstSegments][0]}/` : "";
    return Promise.all(
      entries.map(async (entry, index) => ({
        path: safePath(paths[index]!.slice(stripPrefix.length)),
        base64: base64(await entry.async("uint8array")),
      })),
    );
  }
  if (selected.some((file) => file.name.toLowerCase().endsWith(".zip"))) {
    throw new Error("Import one ZIP archive at a time.");
  }
  return Promise.all(
    selected.map(async (file) => ({
      path: safePath(file.webkitRelativePath || file.name),
      base64: base64(new Uint8Array(await file.arrayBuffer())),
    })),
  );
}

export function shortRevision(revision: string): string {
  return revision.slice(0, 10);
}
