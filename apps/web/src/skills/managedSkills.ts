import type { PulseSkillRecord } from "@t3tools/contracts";
import JSZip from "jszip";

const MAX_FILES = 128;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

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

function centralDirectoryEntryCount(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const first = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const disk = view.getUint16(offset + 4, true);
    const directoryDisk = view.getUint16(offset + 6, true);
    const diskEntries = view.getUint16(offset + 8, true);
    const totalEntries = view.getUint16(offset + 10, true);
    if (
      disk !== 0 ||
      directoryDisk !== 0 ||
      diskEntries !== totalEntries ||
      totalEntries === 0xffff
    ) {
      throw new Error("Multi-disk and ZIP64 skill archives are not supported.");
    }
    return totalEntries;
  }
  throw new Error("ZIP archive has no readable central directory.");
}

function readZipEntry(
  entry: JSZip.JSZipObject,
  remainingBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    type ZipStream = {
      pause: () => void;
      resume: () => void;
      on: {
        (event: "data", listener: (chunk: Uint8Array) => void): ZipStream;
        (event: "error", listener: (cause: unknown) => void): ZipStream;
        (event: "end", listener: () => void): ZipStream;
      };
    };
    const stream = (
      entry as unknown as { internalStream: (type: "uint8array") => ZipStream }
    ).internalStream("uint8array");
    const fail = (cause: unknown) => {
      stream.pause();
      reject(cause);
    };
    stream
      .on("data", (chunk) => {
        if (signal?.aborted) {
          fail(signal.reason);
          return;
        }
        size += chunk.length;
        if (size > MAX_FILE_BYTES || size > remainingBytes) {
          fail(new Error("Skills are limited to 8 MB total and 1 MB per file."));
          return;
        }
        chunks.push(chunk);
      })
      .on("error", reject)
      .on("end", () => {
        try {
          signal?.throwIfAborted();
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(bytes);
        } catch (cause) {
          reject(cause);
        }
      })
      .resume();
  });
}

export async function readSkillFiles(
  selected: ReadonlyArray<File>,
  signal?: AbortSignal,
): Promise<Array<{ readonly path: string; readonly base64: string }>> {
  signal?.throwIfAborted();
  if (selected.length === 0) throw new Error("Choose skill files or a ZIP archive.");
  if (selected.length === 1 && selected[0]!.name.toLowerCase().endsWith(".zip")) {
    if (selected[0]!.size > MAX_TOTAL_BYTES) {
      throw new Error("ZIP archives are limited to 8 MB.");
    }
    const archiveBytes = new Uint8Array(await selected[0]!.arrayBuffer());
    const declaredEntries = centralDirectoryEntryCount(archiveBytes);
    const zip = await JSZip.loadAsync(archiveBytes);
    signal?.throwIfAborted();
    if (Object.keys(zip.files).length !== declaredEntries) {
      throw new Error("ZIP archives cannot contain duplicate or normalized file paths.");
    }
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (entries.length === 0 || entries.length > MAX_FILES) {
      throw new Error(`A skill must contain 1 to ${MAX_FILES} files.`);
    }
    let declaredTotal = 0;
    for (const entry of entries) {
      const declaredSize = (
        entry as typeof entry & { _data?: { readonly uncompressedSize?: number } }
      )._data?.uncompressedSize;
      if (typeof declaredSize !== "number" || declaredSize < 0) {
        throw new Error("ZIP archive contains an invalid file size.");
      }
      declaredTotal += declaredSize;
      if (declaredSize > MAX_FILE_BYTES || declaredTotal > MAX_TOTAL_BYTES) {
        throw new Error("Skills are limited to 8 MB total and 1 MB per file.");
      }
    }
    const paths = entries.map((entry) =>
      safePath(
        (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name,
      ),
    );
    const hasRootManifest = paths.includes("SKILL.md");
    const firstSegments = new Set(paths.map((path) => path.split("/")[0]));
    const stripPrefix =
      !hasRootManifest && firstSegments.size === 1 ? `${[...firstSegments][0]}/` : "";
    const files: Array<{ path: string; base64: string }> = [];
    const names = new Set<string>();
    let totalBytes = 0;
    for (const [index, entry] of entries.entries()) {
      signal?.throwIfAborted();
      const path = safePath(paths[index]!.slice(stripPrefix.length));
      if (names.has(path.toLowerCase())) {
        throw new Error("Duplicate skill file paths are not allowed.");
      }
      names.add(path.toLowerCase());
      const bytes = await readZipEntry(entry, MAX_TOTAL_BYTES - totalBytes, signal);
      signal?.throwIfAborted();
      totalBytes += bytes.length;
      if (bytes.length > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("Skills are limited to 8 MB total and 1 MB per file.");
      }
      files.push({ path, base64: base64(bytes) });
    }
    return files;
  }
  if (selected.some((file) => file.name.toLowerCase().endsWith(".zip"))) {
    throw new Error("Import one ZIP archive at a time.");
  }
  if (selected.length > MAX_FILES) throw new Error(`A skill must contain 1 to ${MAX_FILES} files.`);
  const files: Array<{ path: string; base64: string }> = [];
  const names = new Set<string>();
  let totalBytes = 0;
  for (const file of selected) {
    signal?.throwIfAborted();
    const path = safePath(file.webkitRelativePath || file.name);
    if (names.has(path.toLowerCase())) {
      throw new Error("Duplicate skill file paths are not allowed.");
    }
    names.add(path.toLowerCase());
    totalBytes += file.size;
    if (file.size > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Skills are limited to 8 MB total and 1 MB per file.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
    files.push({ path, base64: base64(bytes) });
  }
  return files;
}

export function shortRevision(revision: string): string {
  return revision.slice(0, 10);
}
