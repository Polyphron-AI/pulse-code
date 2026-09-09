import { describe, expect, it } from "vite-plus/test";
import JSZip from "jszip";
import { readSkillUpload } from "./ManagedSkillsPanel";

describe("skill uploads", () => {
  it("preserves UTF-8 markdown", async () => {
    const [file] = await readSkillUpload(
      new File(["---\nname: test\ndescription: café\n---"], "SKILL.md"),
    );
    expect(Buffer.from(file!.base64, "base64").toString("utf8")).toContain("café");
  });
  it("imports one ZIP folder and its supporting files", async () => {
    const zip = new JSZip()
      .file("review/SKILL.md", "instructions")
      .file("review/references/checklist.md", "checklist");
    const result = await readSkillUpload(
      new File([await zip.generateAsync({ type: "arraybuffer" })], "review.zip"),
    );
    expect(result.map((file) => file.path)).toEqual(["SKILL.md", "references/checklist.md"]);
    expect(Buffer.from(result[1]!.base64, "base64").toString("utf8")).toBe("checklist");
  });
  it("rejects archives with multiple skills", async () => {
    const zip = new JSZip().file("one/SKILL.md", "one").file("two/SKILL.md", "two");
    await expect(
      readSkillUpload(new File([await zip.generateAsync({ type: "arraybuffer" })], "skills.zip")),
    ).rejects.toThrow(/exactly one/);
  });
  it("stops expansion when a compressed file exceeds the per-file limit", async () => {
    const zip = new JSZip()
      .file("SKILL.md", "instructions")
      .file("large.txt", "a".repeat(1_200_000));
    await expect(
      readSkillUpload(
        new File(
          [await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })],
          "large.zip",
        ),
      ),
    ).rejects.toThrow(/limit/);
  });
});
