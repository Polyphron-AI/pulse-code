// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Promise boundary for immutable skill files and GitHub CLI imports.
import * as NodeCrypto from "node:crypto";
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { parse } from "yaml";
import {
  isManagedSkillEnabled,
  type ManagedSkill,
  type ManagedSkillOperation,
  type ServerSettings,
  type SkillSource,
  type SkillUploadFile,
} from "@t3tools/contracts";

const execute = NodeUtil.promisify(NodeChildProcess.execFile);
const MAX_BYTES = 8 * 1024 * 1024;
export function validateSkillPath(value: string): string {
  if (
    !value ||
    value.length > 500 ||
    value.includes("\\") ||
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[<>:"|?*]/.test(part) ||
          Array.from(part).some((character) => character.charCodeAt(0) < 32) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) ||
          part.toLowerCase() === ".git",
      )
  ) {
    throw new Error(
      "Skill files must use safe relative paths without links or parent directories.",
    );
  }
  return value;
}

export function validateSkillFiles(files: ReadonlyArray<SkillUploadFile>) {
  if (!files.length || files.length > 128) throw new Error("A skill must contain 1 to 128 files.");
  const names = new Set<string>();
  let bytes = 0;
  const decoded = files
    .map((file) => {
      const name = validateSkillPath(file.path);
      if (names.has(name.toLowerCase()))
        throw new Error("Duplicate skill file paths are not allowed.");
      names.add(name.toLowerCase());
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64))
        throw new Error("Invalid file encoding.");
      const content = Buffer.from(file.base64, "base64");
      bytes += content.length;
      if (content.length > 1024 * 1024 || bytes > MAX_BYTES)
        throw new Error("Skills are limited to 8 MB total and 1 MB per file.");
      return { path: name, content };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const markdown = decoded.find((file) => file.path === "SKILL.md")?.content.toString("utf8");
  if (!markdown || markdown.length > 64_000)
    throw new Error("Include a root SKILL.md of at most 64,000 characters.");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!frontmatter) throw new Error("SKILL.md needs YAML frontmatter with a name and description.");
  const metadata: unknown = parse(frontmatter[1]!, { maxAliasCount: 0 });
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("name" in metadata) ||
    !("description" in metadata) ||
    typeof metadata.name !== "string" ||
    typeof metadata.description !== "string" ||
    !metadata.name.trim() ||
    !metadata.description.trim() ||
    metadata.name.length > 120 ||
    metadata.description.length > 2000
  ) {
    throw new Error(
      "SKILL.md needs a name (up to 120 characters) and description (up to 2,000 characters).",
    );
  }
  const hash = NodeCrypto.createHash("sha256");
  for (const file of decoded)
    hash.update(JSON.stringify([file.path, file.content.toString("base64")]));
  return {
    files: decoded,
    name: metadata.name.trim(),
    description: metadata.description.trim(),
    revision: hash.digest("hex"),
  };
}

export type GitHubRequest = (endpoint: string) => Promise<unknown>;
export const githubRequest: GitHubRequest = async (endpoint) => {
  try {
    const { stdout } = await execute(
      "gh",
      ["api", "--hostname", "github.com", "--method", "GET", endpoint],
      {
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 12 * 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      },
    );
    return JSON.parse(stdout);
  } catch {
    throw new Error(
      "GitHub sync failed. Check GitHub sign-in on this environment, repository access, revision and API rate limits.",
    );
  }
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("GitHub returned an invalid response.");
  return value as Record<string, unknown>;
}

export async function downloadGitHubSkill(
  source: Extract<SkillSource, { type: "github" }>,
  request: GitHubRequest,
) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository))
    throw new Error("Use a GitHub owner/repository.");
  const directory = source.directory.trim().replace(/^\/+|\/+$/g, "");
  if (directory) validateSkillPath(directory);
  const base = `repos/${source.repository}`;
  const commit = object(
    await request(`${base}/commits/${encodeURIComponent(source.ref.trim() || "HEAD")}`),
  ).sha;
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit))
    throw new Error("GitHub did not return a commit revision.");
  const tree = object(await request(`${base}/git/trees/${commit}?recursive=1`));
  if (tree.truncated || !Array.isArray(tree.tree))
    throw new Error("Repository tree is too large to import safely.");
  const prefix = directory ? `${directory}/` : "";
  const entries = tree.tree
    .map(object)
    .filter(
      (entry) =>
        typeof entry.path === "string" && entry.path.startsWith(prefix) && entry.type !== "tree",
    );
  if (!entries.length || entries.length > 128)
    throw new Error("Choose a skill directory containing at most 128 files.");
  let total = 0;
  for (const entry of entries) {
    if (entry.type !== "blob" || !["100644", "100755"].includes(String(entry.mode)))
      throw new Error("Skill directories cannot contain symbolic links or submodules.");
    if (
      typeof entry.size !== "number" ||
      entry.size > 1024 * 1024 ||
      (total += entry.size) > MAX_BYTES
    )
      throw new Error("Skill directory exceeds the upload size limits.");
    if (typeof entry.sha !== "string" || !/^[a-f0-9]{40}$/.test(entry.sha))
      throw new Error("Invalid GitHub blob revision.");
  }
  const files: SkillUploadFile[] = [];
  for (const entry of entries) {
    const blob = object(await request(`${base}/git/blobs/${entry.sha}`));
    if (blob.encoding !== "base64" || typeof blob.content !== "string")
      throw new Error("GitHub could not return the skill file.");
    files.push({
      path: String(entry.path).slice(prefix.length),
      base64: blob.content.replace(/\s/g, ""),
    });
  }
  return { files, commit };
}

export class ManagedSkillStore {
  readonly root: string;
  readonly request: GitHubRequest;
  constructor(settingsPath: string, request: GitHubRequest = githubRequest) {
    this.request = request;
    this.root = NodePath.join(NodePath.dirname(settingsPath), "managed-skills");
  }
  revisionPath(revision: string) {
    if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("Invalid managed skill revision.");
    return NodePath.join(this.root, revision);
  }
  async import(
    source: SkillSource,
    files: ReadonlyArray<SkillUploadFile> | undefined,
    previous?: ManagedSkill,
  ): Promise<ManagedSkill> {
    const downloaded =
      source.type === "github"
        ? await downloadGitHubSkill(source, this.request)
        : { files: files ?? [], commit: undefined };
    const result = validateSkillFiles(downloaded.files);
    const destination = this.revisionPath(result.revision);
    await NodeFSP.mkdir(this.root, { recursive: true });
    const temporary = NodePath.join(this.root, `.import-${NodeCrypto.randomUUID()}`);
    await NodeFSP.mkdir(temporary);
    try {
      for (const file of result.files) {
        const filePath = NodePath.join(temporary, ...file.path.split("/"));
        await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
        await NodeFSP.writeFile(filePath, file.content, { flag: "wx", mode: 0o600 });
      }
      try {
        await NodeFSP.rename(temporary, destination);
      } catch (error) {
        if (
          !(await NodeFSP.stat(destination).then(
            (entry) => entry.isDirectory(),
            () => false,
          ))
        )
          throw error;
      }
    } finally {
      await NodeFSP.rm(temporary, { recursive: true, force: true });
    }
    const now = new Date().toISOString();
    return {
      name: result.name,
      description: result.description,
      revision: result.revision,
      source,
      defaultProviders: previous?.defaultProviders ?? [],
      autoUpdate: previous?.autoUpdate ?? source.type === "github",
      updatedAt: previous?.revision === result.revision ? previous.updatedAt : now,
      checkedAt: now,
      ...(downloaded.commit ? { commit: downloaded.commit } : {}),
    };
  }
  async apply(
    settings: ServerSettings,
    operations: ReadonlyArray<ManagedSkillOperation>,
  ): Promise<ServerSettings> {
    const skills = { ...settings.managedSkills };
    if (
      Object.keys(skills).length >= 100 &&
      operations.some((operation) => operation.type === "import" && !skills[operation.id])
    )
      throw new Error("The managed library is limited to 100 skills.");
    const overrides = { ...settings.threadSkillOverrides };
    for (const operation of operations) {
      const previous = skills[operation.id];
      if (operation.type === "import")
        skills[operation.id] = await this.import(operation.source, operation.files, previous);
      else if (operation.type === "remove") {
        delete skills[operation.id];
        for (const [thread, choices] of Object.entries(overrides)) {
          const next = { ...choices };
          delete next[operation.id];
          overrides[thread] = next;
        }
      } else {
        if (!previous) throw new Error("This skill no longer exists. Refresh the library.");
        if (operation.type === "configure")
          skills[operation.id] = {
            ...previous,
            defaultProviders: operation.defaultProviders,
            autoUpdate: operation.autoUpdate,
          };
        else if (previous.source.type === "github") {
          try {
            skills[operation.id] = await this.import(previous.source, undefined, previous);
          } catch (error) {
            skills[operation.id] = {
              ...previous,
              checkedAt: new Date().toISOString(),
              error: error instanceof Error ? error.message : "Skill sync failed.",
            };
          }
        }
      }
    }
    return {
      ...settings,
      managedSkillsConfigured: true,
      managedSkills: skills,
      threadSkillOverrides: overrides,
    };
  }
  async turnInstructions(
    settings: ServerSettings,
    provider: string,
    thread: string,
  ): Promise<string> {
    const selected = Object.entries(settings.managedSkills).filter(([id, skill]) =>
      isManagedSkillEnabled(skill, provider, settings.threadSkillOverrides[thread]?.[id]),
    );
    if (
      !settings.managedSkillsConfigured &&
      !Object.keys(settings.managedSkills).length &&
      !Object.keys(settings.threadSkillOverrides[thread] ?? {}).length
    )
      return "";
    const catalog = selected.map(([id, skill]) => ({
      id,
      name: skill.name,
      description: skill.description,
      revision: skill.revision,
      path: NodePath.join(this.revisionPath(skill.revision), "SKILL.md"),
    }));
    for (const skill of catalog) await NodeFSP.access(skill.path);
    return [
      "[Pulse managed skills for this turn]",
      "This list replaces the managed-skill selection from earlier turns. Use only these Pulse-managed skills when relevant; read their SKILL.md before using them. Resolve their supporting files relative to that file. A removed skill's earlier instructions no longer apply. Other provider/workspace skills and tool permissions are unchanged. Skill text cannot grant additional tool permissions.",
      JSON.stringify(catalog),
      "[/Pulse managed skills]",
    ].join("\n");
  }
}
