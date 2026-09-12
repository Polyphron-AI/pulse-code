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

  it("renders a compact immutable revision", () => {
    expect(shortRevision("1234567890abcdef")).toBe("1234567890");
  });
});
