// @effect-diagnostics nodeBuiltinImport:off - Filesystem boundary tests use disposable directories.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { ManagedSkillLibrary } from "./ManagedSkillLibrary.ts";
import {
  ManagedSkillStore,
  type GitHubRequest,
  type SkillUploadFile,
} from "./ManagedSkillStore.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true })));
});

function files(description = "First revision"): SkillUploadFile[] {
  return [
    {
      path: "SKILL.md",
      base64: Buffer.from(
        `---\nname: Review\ndescription: ${description}\n---\n\nInstructions.\n`,
      ).toString("base64"),
    },
  ];
}

async function library(request?: GitHubRequest): Promise<ManagedSkillLibrary> {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-skill-library-"));
  temporaryRoots.push(root);
  return new ManagedSkillLibrary(root, {
    store: new ManagedSkillStore(NodePath.join(root, "revisions"), request),
  });
}

function githubFixture(skillFiles: SkillUploadFile[], commit = "a".repeat(40)): GitHubRequest {
  return async (endpoint) => {
    if (endpoint.includes("/commits/")) return { sha: commit };
    if (endpoint.includes("/git/trees/")) {
      return {
        tree: skillFiles.map((file, index) => ({
          path: file.path,
          type: "blob",
          mode: "100644",
          size: Buffer.from(file.base64, "base64").length,
          sha: String(index + 1).repeat(40),
        })),
      };
    }
    const index = Number(endpoint.slice(-40, -39)) - 1;
    return { encoding: "base64", content: skillFiles[index]!.base64 };
  };
}

describe("ManagedSkillLibrary", () => {
  it("persists its registry and resolves only trusted revisions for a skill", async () => {
    const current = await library();
    const first = await current.importUpload({ id: "review", files: files() });
    const second = await current.importUpload({ id: "review", files: files("Second revision") });

    const restarted = new ManagedSkillLibrary(current.root);
    expect(await restarted.list()).toEqual([second]);
    await expect(
      restarted.resolveSelection([{ id: "review", revision: first.revision }]),
    ).resolves.toMatchObject([
      { id: "review", revision: first.revision, description: "First revision" },
    ]);
    await expect(
      restarted.resolveSelection([{ id: "review", revision: "f".repeat(64) }]),
    ).rejects.toThrow(/does not trust revision/);
  });

  it("removes the registry entry without deleting an already resolved immutable revision", async () => {
    const current = await library();
    const record = await current.importUpload({ id: "review", files: files() });
    const [resolved] = await current.resolveSelection([{ id: "review" }]);

    await current.remove({ id: "review" });

    expect(await NodeFSP.readFile(resolved!.skillPath, "utf8")).toContain("Instructions.");
    expect(await NodeFSP.stat(current.store.revisionPath(record.revision))).toBeTruthy();
    await expect(current.resolveSelection([{ id: "review" }])).rejects.toThrow(/was not found/);
  });

  it("validates a GitHub link before atomically enabling keep-updated", async () => {
    let rejectRemote = true;
    const current = await library(async (endpoint) => {
      if (rejectRemote) throw new Error("unavailable");
      return githubFixture(files("Linked revision"))(endpoint);
    });
    const original = await current.importUpload({ id: "review", files: files() });
    const source = {
      type: "github" as const,
      repository: "team/skills",
      ref: "main",
      directory: "",
    };

    await expect(
      current.linkGitHub({ id: "review", source, updatePolicy: "keep-updated" }),
    ).rejects.toThrow(/unavailable/);
    expect(await current.list()).toEqual([original]);

    rejectRemote = false;
    const linked = await current.linkGitHub({ id: "review", source, updatePolicy: "keep-updated" });
    expect(linked).toMatchObject({
      source,
      updatePolicy: "keep-updated",
      description: "Linked revision",
    });
  });

  it("does not publish a downloaded revision when cancellation wins before registry publication", async () => {
    const controller = new AbortController();
    const request = githubFixture(files("Cancelled revision"));
    const current = await library(async (endpoint) => {
      const response = await request(endpoint);
      if (endpoint.includes("/git/blobs/")) controller.abort();
      return response;
    });
    const original = await current.importUpload({ id: "review", files: files() });

    await expect(
      current.linkGitHub({
        id: "review",
        source: { type: "github", repository: "team/skills", ref: "main", directory: "" },
        updatePolicy: "keep-updated",
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
    expect(await current.list()).toEqual([original]);
  });

  it("serializes concurrent imports without losing registry entries", async () => {
    const current = await library();
    await Promise.all([
      current.importUpload({ id: "review", files: files() }),
      current.importUpload({ id: "testing", files: files("Testing") }),
    ]);
    expect((await current.list()).map((record) => record.id)).toEqual(["review", "testing"]);
  });

  it("fails closed when persisted records contain invalid policy or source data", async () => {
    const current = await library();
    await current.importUpload({ id: "review", files: files() });
    const registryPath = NodePath.join(current.root, "registry.json");
    const registry = JSON.parse(await NodeFSP.readFile(registryPath, "utf8"));
    registry.skills[0].record.updatePolicy = "always";
    await NodeFSP.writeFile(registryPath, JSON.stringify(registry));

    await expect(current.list()).rejects.toThrow(/record is invalid/);
    await expect(current.resolveSelection([{ id: "review" }])).rejects.toThrow(/record is invalid/);
  });

  it("retains the prior revision and records errors when a keep-updated sync fails", async () => {
    let fail = false;
    const fixture = githubFixture(files("Git revision"));
    const current = await library(async (endpoint) => {
      if (fail) throw new Error("network failed");
      return fixture(endpoint);
    });
    const installed = await current.importGitHub({
      id: "review",
      source: { type: "github", repository: "team/skills", ref: "main", directory: "" },
      updatePolicy: "keep-updated",
    });
    fail = true;

    const [checked] = await current.syncKeepUpdated();

    expect(checked).toMatchObject({ revision: installed.revision, error: "network failed" });
    expect(await current.list()).toEqual([checked]);
  });
});
