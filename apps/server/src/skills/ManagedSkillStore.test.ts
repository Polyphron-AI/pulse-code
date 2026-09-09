// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, it, expect } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId } from "@t3tools/contracts";
import {
  ManagedSkillStore,
  downloadGitHubSkill,
  validateSkillFiles,
  validateSkillPath,
} from "./ManagedSkillStore.ts";

const files = (body = "Review changes carefully.") => [
  {
    path: "SKILL.md",
    base64: Buffer.from(`---\nname: code-review\ndescription: Review code\n---\n${body}`).toString(
      "base64",
    ),
  },
];
describe("managed skill imports", () => {
  it.each([
    "../escape",
    "/absolute",
    "C:/secret",
    "scripts\\run",
    "NUL.txt",
    "dir/CON",
    "x./y",
    "x/.git/config",
  ])("rejects unsafe path %s", (value) => {
    expect(() => validateSkillPath(value)).toThrow();
  });
  it("rejects invalid frontmatter, duplicate paths and oversized files", () => {
    expect(() =>
      validateSkillFiles([{ path: "SKILL.md", base64: Buffer.from("hello").toString("base64") }]),
    ).toThrow(/frontmatter/);
    expect(() => validateSkillFiles([...files(), { ...files()[0]!, path: "skill.md" }])).toThrow(
      /Duplicate/,
    );
    expect(() =>
      validateSkillFiles([
        ...files(),
        { path: "large.bin", base64: Buffer.alloc(1024 * 1024 + 1).toString("base64") },
      ]),
    ).toThrow(/limited/);
  });
  it("resolves GitHub files against one immutable commit", async () => {
    const sha = "a".repeat(40);
    const requests: string[] = [];
    const result = await downloadGitHubSkill(
      {
        type: "github",
        repository: "team/private",
        ref: "feature/skills",
        directory: "skills/review",
      },
      async (endpoint) => {
        requests.push(endpoint);
        if (endpoint.includes("/commits/")) return { sha };
        if (endpoint.includes("/trees/"))
          return {
            tree: [{ path: "skills/review/SKILL.md", type: "blob", mode: "100644", size: 80, sha }],
          };
        return { encoding: "base64", content: files()[0]!.base64 };
      },
    );
    expect(requests).toEqual([
      "repos/team/private/commits/feature%2Fskills",
      `repos/team/private/git/trees/${sha}?recursive=1`,
      `repos/team/private/git/blobs/${sha}`,
    ]);
    expect(result.files[0]?.path).toBe("SKILL.md");
  });
  it("rejects linked files and truncated GitHub trees", async () => {
    for (const tree of [
      { truncated: true, tree: [] },
      { tree: [{ path: "SKILL.md", type: "blob", mode: "120000", size: 50, sha: "a".repeat(40) }] },
    ]) {
      await expect(
        downloadGitHubSkill(
          { type: "github", repository: "team/repo", ref: "", directory: "" },
          async (endpoint) => (endpoint.includes("commits") ? { sha: "a".repeat(40) } : tree),
        ),
      ).rejects.toThrow();
    }
  });
  it("retains old revisions and isolates thread defaults, overrides and removal", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-skills-test-"));
    try {
      const store = new ManagedSkillStore(NodePath.join(root, "settings.json"));
      let settings = await store.apply(DEFAULT_SERVER_SETTINGS, [
        { type: "import", id: "review", source: { type: "upload" }, files: files() },
      ]);
      settings = await store.apply(settings, [
        {
          type: "configure",
          id: "review",
          defaultProviders: [ProviderInstanceId.make("codex")],
          autoUpdate: false,
        },
      ]);
      const old = await store.turnInstructions(settings, "codex", "one");
      settings = { ...settings, threadSkillOverrides: { two: { review: false } } };
      expect(await store.turnInstructions(settings, "codex", "two")).not.toContain('"id":"review"');
      expect(await store.turnInstructions(settings, "claude", "one")).not.toContain(
        '"id":"review"',
      );
      const oldRevision = settings.managedSkills.review!.revision;
      settings = await store.apply(settings, [
        { type: "import", id: "review", source: { type: "upload" }, files: files("New revision") },
      ]);
      expect(settings.managedSkills.review!.revision).not.toBe(oldRevision);
      expect(old).toContain(oldRevision);
      expect(
        await NodeFSP.readFile(NodePath.join(store.revisionPath(oldRevision), "SKILL.md"), "utf8"),
      ).toContain("carefully");
      settings = await store.apply(settings, [{ type: "remove", id: "review" }]);
      expect(settings.managedSkills).toEqual({});
      expect(settings.threadSkillOverrides.two).toEqual({});
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
  it("keeps the last working revision after an authentication failure", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-skills-test-"));
    try {
      const store = new ManagedSkillStore(NodePath.join(root, "settings.json"), async () => {
        throw new Error("GitHub sign-in expired");
      });
      let settings = await store.apply(DEFAULT_SERVER_SETTINGS, [
        { type: "import", id: "review", source: { type: "upload" }, files: files() },
      ]);
      const previous = settings.managedSkills.review!;
      settings = {
        ...settings,
        managedSkills: {
          review: {
            ...previous,
            source: { type: "github", repository: "team/private", ref: "", directory: "" },
          },
        },
      };
      const next = await store.apply(settings, [{ type: "sync", id: "review" }]);
      expect(next.managedSkills.review?.revision).toBe(previous.revision);
      expect(next.managedSkills.review?.error).toContain("expired");
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
});
