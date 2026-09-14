// @effect-diagnostics nodeBuiltinImport:off - Filesystem boundary tests use disposable directories.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  downloadGitHubSkill,
  ManagedSkillStore,
  resolveGitHubSkillUrl,
  validateSkillFiles,
  validateSkillPath,
  type GitHubRequest,
} from "./ManagedSkillStore.ts";

it("resolves repository URLs to the default ref and safe skill directories", async () => {
  const request: GitHubRequest = async (endpoint) => {
    if (endpoint === "repos/pbakaus/impeccable") return { default_branch: "main" };
    if (endpoint.endsWith("/commits/main")) return { sha: "a".repeat(40) };
    return {
      tree: [
        { type: "blob", path: ".agents/skills/impeccable/SKILL.md" },
        { type: "blob", path: ".claude/skills/impeccable/SKILL.md" },
        { type: "blob", path: "tests/oracle/audit/SKILL.md" },
      ],
    };
  };
  await expect(
    resolveGitHubSkillUrl("https://github.com/pbakaus/impeccable", request),
  ).resolves.toEqual({
    repository: "pbakaus/impeccable",
    ref: "main",
    directories: [".agents/skills/impeccable", ".claude/skills/impeccable"],
  });
});

it("resolves a blob URL to exactly its skill directory", async () => {
  const request: GitHubRequest = async (endpoint) =>
    endpoint.includes("/commits/")
      ? { sha: "b".repeat(40) }
      : endpoint.includes("/git/trees/")
        ? {
            tree: [
              { type: "blob", path: "skills/review/SKILL.md" },
              { type: "blob", path: "skills/other/SKILL.md" },
            ],
          }
        : { default_branch: "main" };
  await expect(
    resolveGitHubSkillUrl("https://github.com/team/repo/blob/main/skills/review/SKILL.md", request),
  ).resolves.toMatchObject({
    repository: "team/repo",
    ref: "main",
    directories: ["skills/review"],
  });
});

function files(body = "Review changes carefully.", metadata = "") {
  return [
    {
      path: "SKILL.md",
      base64: Buffer.from(
        `---\nname: code-review\ndescription: Review code\n${metadata}---\n${body}`,
      ).toString("base64"),
    },
    { path: "references/checklist.md", base64: Buffer.from("Check tests").toString("base64") },
  ];
}

async function withStore(
  run: (store: ManagedSkillStore, root: string) => Promise<void>,
  request?: GitHubRequest,
) {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-managed-skills-"));
  try {
    await run(new ManagedSkillStore(NodePath.join(root, "managed-skills"), request), root);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
}

describe("managed skill validation", () => {
  it.each([
    "../escape",
    "/absolute",
    "C:/secret",
    "scripts\\run",
    "NUL.txt",
    "dir/CON",
    "x./y",
    "x/.git/config",
  ])("rejects unsafe archive path %s", (value) => {
    expect(() => validateSkillPath(value)).toThrow();
  });

  it("validates frontmatter, duplicate paths and size limits", () => {
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

  it("retains native invocation restrictions from YAML 1.1 boolean spellings", () => {
    expect(
      validateSkillFiles(files("Body", "disable-model-invocation: yes\nuser-invocable: no\n"))
        .invocation,
    ).toEqual({ userInvocationOnly: true, userInvocable: false });
  });
});

describe("managed skill imports", () => {
  it("stores uploaded revisions immutably and keeps the old revision on replacement", async () => {
    await withStore(async (store) => {
      const first = await store.importUpload("review", files());
      const firstPath = NodePath.join(store.revisionPath(first.revision), "SKILL.md");
      const replacement = await store.importUpload("review", files("New revision"), first);

      expect(replacement.revision).not.toBe(first.revision);
      expect(replacement.updatePolicy).toBe("pinned");
      expect(await NodeFSP.readFile(firstPath, "utf8")).toContain("carefully");
      expect(
        await NodeFSP.readFile(
          NodePath.join(store.revisionPath(replacement.revision), "SKILL.md"),
          "utf8",
        ),
      ).toContain("New revision");
    });
  });

  it("refuses a pre-existing revision directory unless its content matches", async () => {
    await withStore(async (store) => {
      const validated = validateSkillFiles(files());
      const destination = store.revisionPath(validated.revision);
      await NodeFSP.mkdir(destination, { recursive: true });
      await NodeFSP.writeFile(NodePath.join(destination, "SKILL.md"), "tampered");
      await expect(store.importUpload("review", files())).rejects.toThrow(
        /frontmatter|content hash/,
      );
    });
  });

  it("links an upload to GitHub while remaining pinned until the user opts in", async () => {
    await withStore(async (store) => {
      const upload = await store.importUpload("review", files());
      const linked = store.linkGitHub(upload, {
        type: "github",
        repository: "team/private",
        ref: " main ",
        directory: "/skills/review/",
      });
      expect(linked.revision).toBe(upload.revision);
      expect(linked.source).toEqual({
        type: "github",
        repository: "team/private",
        ref: "main",
        directory: "skills/review",
      });
      expect(linked.updatePolicy).toBe("pinned");
      expect(store.setUpdatePolicy(linked, "keep-updated").updatePolicy).toBe("keep-updated");
      expect(() => store.setUpdatePolicy(upload, "keep-updated")).toThrow(/GitHub source/);
      expect(() =>
        store.setUpdatePolicy(
          store.linkGitHub(upload, {
            type: "github",
            repository: "team/private",
            ref: "a".repeat(40),
            directory: "skills/review",
          }),
          "keep-updated",
        ),
      ).toThrow(/fixed Git commit/);
      expect(() =>
        store.linkGitHub(upload, {
          type: "github",
          repository: "team/private",
          ref: "x".repeat(201),
          directory: "skills/review",
        }),
      ).toThrow(/200/);
    });
  });

  it("stores the resolved commit and content hash for GitHub imports", async () => {
    const sha = "a".repeat(40);
    const requests: string[] = [];
    await withStore(
      async (store) => {
        const imported = await store.importGitHub("review", {
          type: "github",
          repository: "team/private",
          ref: "feature/skills",
          directory: "skills/review",
        });
        expect(imported.resolvedCommit).toBe(sha);
        expect(imported.revision).toMatch(/^[a-f0-9]{64}$/);
        expect(imported.updatePolicy).toBe("pinned");
      },
      async (endpoint) => {
        requests.push(endpoint);
        if (endpoint.includes("/commits/")) return { sha };
        if (endpoint.includes("/trees/")) {
          return {
            tree: files().map((file, index) => ({
              path: `skills/review/${file.path}`,
              type: "blob",
              mode: "100644",
              size: Buffer.from(file.base64, "base64").length,
              sha: String(index + 1).repeat(40),
            })),
          };
        }
        const index = endpoint.endsWith("1".repeat(40)) ? 0 : 1;
        return { encoding: "base64", content: files()[index]!.base64 };
      },
    );
    expect(requests[0]).toBe("repos/team/private/commits/feature%2Fskills");
  });

  it("keeps the last valid revision and source after a sync failure", async () => {
    await withStore(
      async (store) => {
        const upload = await store.importUpload("review", files());
        const linked = store.linkGitHub(upload, {
          type: "github",
          repository: "team/private",
          ref: "main",
          directory: "skills/review",
        });
        const previous = store.setUpdatePolicy(linked, "keep-updated");
        const next = await store.syncIfKeepUpdated(previous);
        expect(next.revision).toBe(previous.revision);
        expect(next.source).toEqual(previous.source);
        expect(next.updatePolicy).toBe("keep-updated");
        expect(next.error).toContain("expired");
      },
      async () => {
        throw new Error("GitHub sign-in expired");
      },
    );
  });

  it("skips automatic sync for pinned skills while allowing explicit sync", async () => {
    let requests = 0;
    await withStore(
      async (store) => {
        const upload = await store.importUpload("review", files());
        const pinned = store.linkGitHub(upload, {
          type: "github",
          repository: "team/private",
          ref: "main",
          directory: "skills/review",
        });

        expect(await store.syncIfKeepUpdated(pinned)).toBe(pinned);
        expect(requests).toBe(0);

        const explicit = await store.sync(pinned);
        expect(requests).toBe(1);
        expect(explicit.error).toContain("manual sync failed");
      },
      async () => {
        requests += 1;
        throw new Error("manual sync failed");
      },
    );
  });

  it("rejects oversized stored revisions from metadata before reading file bodies", async () => {
    await withStore(async (store) => {
      const record = await store.importUpload("review", files());
      const revision = store.revisionPath(record.revision);
      for (let index = 0; index < 127; index += 1) {
        await NodeFSP.writeFile(NodePath.join(revision, `extra-${index}.txt`), "");
      }
      await expect(store.catalog([record])).rejects.toThrow(/1 to 128 files/);
    });
  });

  it("rejects stored revisions that exceed per-file or total byte limits", async () => {
    await withStore(async (store) => {
      const record = await store.importUpload("review", files());
      const revision = store.revisionPath(record.revision);
      const oversized = NodePath.join(revision, "oversized.bin");
      await NodeFSP.writeFile(oversized, "");
      await NodeFSP.truncate(oversized, 2 * 1024 * 1024 + 1);
      await expect(store.catalog([record])).rejects.toThrow(/limited/);

      await NodeFSP.rm(oversized);
      for (let index = 0; index < 8; index += 1) {
        const path = NodePath.join(revision, `total-${index}.bin`);
        await NodeFSP.writeFile(path, "");
        await NodeFSP.truncate(path, 1024 * 1024);
      }
      await expect(store.catalog([record])).rejects.toThrow(/limited/);
    });
  });

  it("catalogs only store-derived canonical paths and preserves restrictions", async () => {
    await withStore(async (store) => {
      const record = await store.importUpload(
        "review",
        files("Body", "disable-model-invocation: true\nuser-invocable: false\n"),
      );
      const [descriptor] = await store.catalog([record]);
      expect(descriptor?.skillPath).toBe(
        await NodeFSP.realpath(NodePath.join(store.revisionPath(record.revision), "SKILL.md")),
      );
      expect(descriptor?.invocation).toEqual({ userInvocationOnly: true, userInvocable: false });
    });
  });

  it("rejects a revision symlink that escapes the managed root when supported", async () => {
    await withStore(async (store, temporaryRoot) => {
      const record = await store.importUpload("review", files());
      const outside = NodePath.join(temporaryRoot, "outside");
      await NodeFSP.mkdir(outside);
      await NodeFSP.writeFile(
        NodePath.join(outside, "SKILL.md"),
        Buffer.from(files()[0]!.base64, "base64"),
      );
      const revisionPath = store.revisionPath(record.revision);
      await NodeFSP.rm(revisionPath, { recursive: true });
      try {
        await NodeFSP.symlink(outside, revisionPath, "junction");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") return;
        throw error;
      }
      await expect(store.catalog([record])).rejects.toThrow(/escapes|regular directory/);
    });
  });
});

describe("GitHub import validation", () => {
  it.each(["./repo", "../repo", "team/.", "team/.."])(
    "rejects dot repository segments before making a request: %s",
    async (repository) => {
      let requested = false;
      await expect(
        downloadGitHubSkill(
          { type: "github", repository, ref: "main", directory: "" },
          async () => {
            requested = true;
            return {};
          },
        ),
      ).rejects.toThrow(/owner\/repository/);
      expect(requested).toBe(false);
    },
  );

  it("builds GitHub API endpoints from separately encoded repository segments", async () => {
    const requests: string[] = [];
    await expect(
      downloadGitHubSkill(
        { type: "github", repository: "team.name/repo_name", ref: "main", directory: "" },
        async (endpoint) => {
          requests.push(endpoint);
          return {};
        },
      ),
    ).rejects.toThrow(/commit revision/);
    expect(requests).toEqual(["repos/team.name/repo_name/commits/main"]);
  });

  it("rejects invalid managed ids before making a GitHub request", async () => {
    let requested = false;
    await withStore(
      async (store) => {
        await expect(
          store.importGitHub("../review", {
            type: "github",
            repository: "team/repo",
            ref: "main",
            directory: "",
          }),
        ).rejects.toThrow(/managed skill id/);
        expect(requested).toBe(false);
      },
      async () => {
        requested = true;
        return {};
      },
    );
  });

  it("rejects keep-updated imports pinned to a fixed commit before making a request", async () => {
    let requested = false;
    await withStore(
      async (store) => {
        await expect(
          store.importGitHub(
            "review",
            {
              type: "github",
              repository: "team/repo",
              ref: "a".repeat(40),
              directory: "",
            },
            "keep-updated",
          ),
        ).rejects.toThrow(/fixed Git commit/);
        expect(requested).toBe(false);
      },
      async () => {
        requested = true;
        return {};
      },
    );
  });

  it("rejects linked files and truncated trees before downloading blobs", async () => {
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
});
