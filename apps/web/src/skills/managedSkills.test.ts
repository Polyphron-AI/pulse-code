import JSZip from "jszip";
import { describe, expect, it } from "vite-plus/test";

import { groupManagedSkills, readSkillFiles, shortRevision } from "./managedSkills";

const record = (id: string, repository?: string) => ({
  id,
  name: id,
  description: `${id} description`,
  revision: "a".repeat(64),
  source: repository
    ? ({ type: "github", repository, ref: "main", directory: id } as const)
    : ({ type: "upload" } as const),
  updatePolicy: "pinned" as const,
  invocation: {},
  updatedAt: "2026-09-12T00:00:00.000Z",
  checkedAt: "2026-09-12T00:00:00.000Z",
});

describe("managed skills client logic", () => {
  it("groups repositories by identity and always places uploads last", () => {
    expect(
      groupManagedSkills([record("upload"), record("zeta", "team/z"), record("alpha", "team/a")]),
    ).toMatchObject([
      { id: "team/a", skills: [{ id: "alpha" }] },
      { id: "team/z", skills: [{ id: "zeta" }] },
      { id: "uploaded", skills: [{ id: "upload" }], uploaded: true },
    ]);
  });

  it("unwraps a single folder from a ZIP and preserves nested skill files", async () => {
    const zip = new JSZip();
    zip.file("review/SKILL.md", "---\nname: Review\ndescription: Review code\n---\n");
    zip.file("review/references/checks.md", "Checks");
    const archive = new File([await zip.generateAsync({ type: "arraybuffer" })], "review.zip");

    await expect(readSkillFiles([archive])).resolves.toMatchObject([
      { path: "SKILL.md" },
      { path: "references/checks.md" },
    ]);
  });

  it("rejects parent paths from archives before upload", async () => {
    const zip = new JSZip();
    zip.file("../SKILL.md", "unsafe");
    const archive = new File([await zip.generateAsync({ type: "arraybuffer" })], "unsafe.zip");
    await expect(readSkillFiles([archive])).rejects.toThrow(/safe relative paths/);
  });

  it("rejects compressed, per-file, total, and file-count limits", async () => {
    const oversizedArchive = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.zip");
    await expect(readSkillFiles([oversizedArchive])).rejects.toThrow(/ZIP archives.*8 MB/);

    const oversizedFile = new File([new Uint8Array(1024 * 1024 + 1)], "SKILL.md");
    await expect(readSkillFiles([oversizedFile])).rejects.toThrow(/1 MB per file/);

    const total = Array.from(
      { length: 9 },
      (_, index) => new File([new Uint8Array(1024 * 1024)], `${index}.txt`),
    );
    await expect(readSkillFiles(total)).rejects.toThrow(/8 MB total/);

    const tooMany = Array.from({ length: 129 }, (_, index) => new File(["x"], `${index}.txt`));
    await expect(readSkillFiles(tooMany)).rejects.toThrow(/1 to 128 files/);
  });

  it("bounds decompressed ZIP entries and rejects case-insensitive collisions", async () => {
    const largeZip = new JSZip();
    largeZip.file("SKILL.md", new Uint8Array(1024 * 1024 + 1));
    const largeArchive = new File(
      [await largeZip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })],
      "large.zip",
    );
    await expect(readSkillFiles([largeArchive])).rejects.toThrow(/1 MB per file/);

    const duplicateZip = new JSZip();
    duplicateZip.file("SKILL.md", "first");
    duplicateZip.file("skill.md", "second");
    const duplicateArchive = new File(
      [await duplicateZip.generateAsync({ type: "arraybuffer" })],
      "duplicate.zip",
    );
    await expect(readSkillFiles([duplicateArchive])).rejects.toThrow(/Duplicate skill file paths/);
  });

  it("rejects exact duplicate ZIP entries hidden by the ZIP library's file map", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", "first");
    zip.file("OTHER.md", "second");
    const archive = new Uint8Array(await zip.generateAsync({ type: "arraybuffer" }));
    const from = new TextEncoder().encode("OTHER.md");
    const to = new TextEncoder().encode("SKILL.md");
    for (let offset = 0; offset <= archive.length - from.length; offset += 1) {
      if (from.every((byte, index) => archive[offset + index] === byte)) archive.set(to, offset);
    }

    await expect(
      readSkillFiles([new File([archive.buffer as ArrayBuffer], "duplicate.zip")]),
    ).rejects.toThrow(/duplicate or normalized file paths/);
  });

  it("stops a cancelled archive before returning files for mutation", async () => {
    const controller = new AbortController();
    const zip = new JSZip();
    zip.file("SKILL.md", "content");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const archive = new File([bytes], "review.zip");
    const originalArrayBuffer = archive.arrayBuffer.bind(archive);
    archive.arrayBuffer = async () => {
      const result = await originalArrayBuffer();
      controller.abort();
      return result;
    };

    let mutationStarted = false;
    await expect(
      readSkillFiles([archive], controller.signal).then(() => {
        mutationStarted = true;
      }),
    ).rejects.toThrow(/abort/i);
    expect(mutationStarted).toBe(false);
  });

  it("renders a compact immutable revision", () => {
    expect(shortRevision("1234567890abcdef")).toBe("1234567890");
  });
});
