// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Promise boundary for immutable skill files and GitHub CLI imports.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { parse } from "yaml";

const execute = NodeUtil.promisify(NodeChildProcess.execFile);
const MAX_FILES = 128;
const MAX_FAMILY_FILES = 384;
const MAX_UPLOAD_FILE_BYTES = 1024 * 1024;
const MAX_GITHUB_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const REVISION_PATTERN = /^[a-f0-9]{64}$/;
const MANAGED_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export interface SkillUploadFile {
  readonly path: string;
  readonly base64: string;
}

export interface UploadSkillSource {
  readonly type: "upload";
}

export interface GitHubSkillSource {
  readonly type: "github";
  readonly repository: string;
  readonly ref: string;
  readonly directory: string;
  readonly variants?: readonly string[] | undefined;
}

export type ManagedSkillSource = UploadSkillSource | GitHubSkillSource;
export type ManagedSkillUpdatePolicy = "pinned" | "keep-updated";

export interface ManagedSkillInvocationRestrictions {
  readonly userInvocationOnly?: true;
  readonly userInvocable?: false;
}

export interface ManagedSkillRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly revision: string;
  readonly source: ManagedSkillSource;
  readonly updatePolicy: ManagedSkillUpdatePolicy;
  readonly resolvedCommit?: string;
  readonly invocation: ManagedSkillInvocationRestrictions;
  readonly updatedAt: string;
  readonly checkedAt: string;
  readonly error?: string;
}

export interface ManagedSkillCatalogDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly revision: string;
  readonly skillPath: string;
  readonly variantSkillPaths?: Readonly<
    Partial<Record<"codex" | "claudeAgent" | "opencode", string>>
  >;
  readonly skillFamily?: true;
  readonly genericFallback?: true;
  readonly source: ManagedSkillSource;
  readonly resolvedCommit?: string;
  readonly invocation: ManagedSkillInvocationRestrictions;
}

interface ValidatedSkillFiles {
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: Buffer }>;
  readonly name: string;
  readonly description: string;
  readonly invocation: ManagedSkillInvocationRestrictions;
  readonly revision: string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GitHub returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

function frontmatterBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLowerCase()) {
    case "true":
    case "yes":
    case "on":
    case "y":
      return true;
    case "false":
    case "no":
    case "off":
    case "n":
      return false;
    default:
      return undefined;
  }
}

function validateManagedId(id: string): string {
  if (!MANAGED_ID_PATTERN.test(id)) throw new Error("Invalid managed skill id.");
  return id;
}

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

export function validateSkillFiles(
  files: ReadonlyArray<SkillUploadFile>,
  maxFileBytes = MAX_UPLOAD_FILE_BYTES,
  maxFiles = MAX_FILES,
): ValidatedSkillFiles {
  if (!files.length || files.length > maxFiles) {
    throw new Error(`A skill must contain 1 to ${maxFiles} files.`);
  }
  const names = new Set<string>();
  let bytes = 0;
  const decoded = files
    .map((file) => {
      const path = validateSkillPath(file.path);
      if (names.has(path.toLowerCase()))
        throw new Error("Duplicate skill file paths are not allowed.");
      names.add(path.toLowerCase());
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) {
        throw new Error("Invalid file encoding.");
      }
      const content = Buffer.from(file.base64, "base64");
      bytes += content.length;
      if (content.length > maxFileBytes || bytes > MAX_TOTAL_BYTES) {
        throw new Error("Skills are limited to 8 MB total and 1 MB per file.");
      }
      return { path, content };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const markdown = decoded.find((file) => file.path === "SKILL.md")?.content.toString("utf8");
  if (!markdown || markdown.length > 64_000) {
    throw new Error("Include a root SKILL.md of at most 64,000 characters.");
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!frontmatter) throw new Error("SKILL.md needs YAML frontmatter with a name and description.");

  let metadata: unknown;
  try {
    metadata = parse(frontmatter[1]!, { maxAliasCount: 0 });
  } catch {
    throw new Error("SKILL.md contains invalid YAML frontmatter.");
  }
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
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
  const record = metadata as Record<string, unknown>;
  const invocation: ManagedSkillInvocationRestrictions = {
    ...(frontmatterBoolean(record["disable-model-invocation"]) === true
      ? { userInvocationOnly: true as const }
      : {}),
    ...(frontmatterBoolean(record["user-invocable"]) === false
      ? { userInvocable: false as const }
      : {}),
  };
  const hash = NodeCrypto.createHash("sha256");
  for (const file of decoded)
    hash.update(JSON.stringify([file.path, file.content.toString("base64")]));
  return {
    files: decoded,
    name: metadata.name.trim(),
    description: metadata.description.trim(),
    invocation,
    revision: hash.digest("hex"),
  };
}

export type GitHubRequest = (endpoint: string) => Promise<unknown>;
export class GitHubNotFoundError extends Error {}

export interface GitHubSkillResolution {
  readonly repository: string;
  readonly ref: string;
  readonly directories: readonly string[];
}

export async function resolveGitHubSkillUrl(
  urlValue: string,
  request: GitHubRequest,
): Promise<GitHubSkillResolution> {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("Use a GitHub repository, tree or SKILL.md URL.");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com")
    throw new Error("Only https://github.com skill URLs are supported.");
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length < 2) throw new Error("Use a GitHub owner/repository URL.");
  const repository = `${segments[0]}/${segments[1]!.replace(/\.git$/, "")}`;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error("Use a GitHub owner/repository URL.");
  const base = `repos/${encodeURIComponent(segments[0]!)}/${encodeURIComponent(segments[1]!.replace(/\.git$/, ""))}`;
  const repositoryInfo = object(await request(base));
  const defaultRef = repositoryInfo.default_branch;
  if (typeof defaultRef !== "string" || !defaultRef)
    throw new Error("GitHub did not return the default branch.");
  let ref = defaultRef;
  let requestedDirectory: string | undefined;
  let commitSha: unknown;
  if (segments[2] === "tree" || segments[2] === "blob") {
    if (!segments[3]) throw new Error("GitHub tree and blob URLs must include a branch or ref.");
    const remainder = segments.slice(3);
    let refLength = 0;
    const maxRefSegments = Math.min(remainder.length, 8);
    for (let length = maxRefSegments; length > 0; length -= 1) {
      const candidate = remainder.slice(0, length).join("/");
      try {
        const sha = object(await request(`${base}/commits/${encodeURIComponent(candidate)}`)).sha;
        if (typeof sha === "string" && /^[a-f0-9]{40}$/.test(sha)) {
          ref = candidate;
          commitSha = sha;
          refLength = length;
          break;
        }
      } catch (error) {
        if (!(error instanceof GitHubNotFoundError)) throw error;
        // A ref may itself contain slashes; keep shortening until GitHub resolves one.
      }
    }
    if (!refLength) throw new Error("GitHub did not return a commit revision.");
    const tail = remainder.slice(refLength);
    if (segments[2] === "blob" && tail.at(-1)?.toLowerCase() === "skill.md") tail.pop();
    requestedDirectory = tail.join("/");
  } else if (segments.length > 2) throw new Error("Unsupported GitHub URL path.");
  const commit =
    commitSha ?? object(await request(`${base}/commits/${encodeURIComponent(ref)}`)).sha;
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit))
    throw new Error("GitHub did not return a commit revision.");
  const tree = object(await request(`${base}/git/trees/${commit}?recursive=1`));
  if (tree.truncated || !Array.isArray(tree.tree))
    throw new Error("Repository tree is too large to inspect safely.");
  const directories = tree.tree.map(object).flatMap((entry) => {
    if (
      entry.type !== "blob" ||
      typeof entry.path !== "string" ||
      !/(^|\/)SKILL\.md$/i.test(entry.path)
    )
      return [];
    const directory = entry.path.replace(/\/?SKILL\.md$/i, "");
    if (
      requestedDirectory !== undefined &&
      directory !== requestedDirectory &&
      !directory.startsWith(`${requestedDirectory}/`)
    )
      return [];
    if (/(^|\/)(test|tests|fixture|fixtures)(\/|$)/i.test(directory)) return [];
    return [directory];
  });
  if (directories.length === 0) throw new Error("No SKILL.md was found at this GitHub location.");
  return { repository, ref, directories: [...new Set(directories)].sort() };
}

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
  } catch (cause) {
    const stderr =
      typeof cause === "object" && cause !== null && "stderr" in cause ? String(cause.stderr) : "";
    if (/\bHTTP\s+404\b|\bNot Found\b/i.test(stderr)) throw new GitHubNotFoundError();
    throw new Error(
      "GitHub sync failed. Check GitHub sign-in on this environment, repository access, revision and API rate limits.",
    );
  }
};

function validateGitHubSource(source: GitHubSkillSource): GitHubSkillSource {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository)) {
    throw new Error("Use a GitHub owner/repository.");
  }
  const [owner, repository] = source.repository.split("/");
  if (owner === "." || owner === ".." || repository === "." || repository === "..") {
    throw new Error("Use a GitHub owner/repository.");
  }
  if (source.ref.length > 200) throw new Error("GitHub refs are limited to 200 characters.");
  const directory = source.directory.trim().replace(/^\/+|\/+$/g, "");
  if (directory) validateSkillPath(directory);
  const supportedProviderDirectory = /^\.(agents|claude|opencode)\/skills\/[^/]+$/i.test(directory);
  const providerLikeDirectory = /^(?:plugin|\.[^/]+|[^/]+-plugin)\/skills\//i.test(directory);
  if (providerLikeDirectory && !supportedProviderDirectory)
    throw new Error("This provider-specific skill layout is not runnable in Pulse.");
  const variants = [
    ...new Set((source.variants ?? []).map((value) => value.trim().replace(/^\/+|\/+$/g, ""))),
  ];
  for (const variant of variants) validateSkillPath(variant);
  if (variants.length > 0) {
    const family = directory.split("/").at(-1)?.toLowerCase();
    const runnable = /^\.(agents|claude|opencode)\/skills\/([^/]+)$/i.exec(directory);
    if (!runnable || runnable[2]?.toLowerCase() !== family)
      throw new Error(
        "Skill families require an exact .agents, .claude or .opencode skill directory.",
      );
    for (const variant of variants) {
      const match = /^\.(agents|claude|opencode)\/skills\/([^/]+)$/i.exec(variant);
      if (match && match[2]?.toLowerCase() !== family)
        throw new Error("Runnable skill variants must use the same family directory name.");
    }
  }
  return { ...source, ref: source.ref.trim(), directory, ...(variants.length ? { variants } : {}) };
}

function validateUpdatePolicy(
  source: ManagedSkillSource,
  updatePolicy: ManagedSkillUpdatePolicy,
): void {
  if (updatePolicy !== "keep-updated") return;
  if (source.type !== "github") {
    throw new Error("Keep-updated skills need a valid GitHub source.");
  }
  if (/^[a-f0-9]{40}$/i.test(source.ref)) {
    throw new Error("Keep-updated skills cannot use a fixed Git commit.");
  }
}

export async function downloadGitHubSkill(source: GitHubSkillSource, request: GitHubRequest) {
  const validatedSource = validateGitHubSource(source);
  const directory = validatedSource.directory;
  const [owner, repository] = validatedSource.repository.split("/");
  const base = `repos/${encodeURIComponent(owner!)}/${encodeURIComponent(repository!)}`;
  const commit = object(
    await request(`${base}/commits/${encodeURIComponent(validatedSource.ref || "HEAD")}`),
  ).sha;
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error("GitHub did not return a commit revision.");
  }
  const tree = object(await request(`${base}/git/trees/${commit}?recursive=1`));
  if (tree.truncated || !Array.isArray(tree.tree)) {
    throw new Error("Repository tree is too large to import safely.");
  }
  const variantKind = (value: string) =>
    /^\.claude\/skills\/[^/]+$/i.test(value)
      ? "claudeAgent"
      : /^\.opencode\/skills\/[^/]+$/i.test(value)
        ? "opencode"
        : /^\.agents\/skills\/[^/]+$/i.test(value)
          ? "codex"
          : undefined;
  const canonicalKind = variantKind(directory);
  const usedKinds = new Set<string>(canonicalKind ? [canonicalKind] : []);
  const variantPrefixes = (validatedSource.variants ?? [])
    .filter((value) => value !== directory)
    .flatMap((value) => {
      const kind = variantKind(value);
      if (!kind) return [];
      if (kind && usedKinds.has(kind))
        throw new Error(`Skill family contains multiple ${kind} variants.`);
      if (kind) usedKinds.add(kind);
      return [{ directory: value, storageKey: kind }];
    });
  const selectedPrefixes = [{ directory, storageKey: undefined }, ...variantPrefixes];
  const entries = tree.tree.map(object).flatMap((entry) =>
    selectedPrefixes.flatMap((selected) => {
      const selectedPrefix = selected.directory ? `${selected.directory}/` : "";
      return typeof entry.path === "string" &&
        entry.path.startsWith(selectedPrefix) &&
        entry.type !== "tree"
        ? [{ entry, selectedPrefix, storageKey: selected.storageKey }]
        : [];
    }),
  );
  if (!entries.length || entries.length > MAX_FAMILY_FILES) {
    throw new Error(`Choose a skill family containing at most ${MAX_FAMILY_FILES} files.`);
  }
  let total = 0;
  for (const { entry } of entries) {
    if (entry.type !== "blob" || !["100644", "100755"].includes(String(entry.mode))) {
      throw new Error("Skill directories cannot contain symbolic links or submodules.");
    }
    if (
      typeof entry.size !== "number" ||
      entry.size > MAX_GITHUB_FILE_BYTES ||
      (total += entry.size) > MAX_TOTAL_BYTES
    ) {
      throw new Error("Skill directory exceeds the upload size limits.");
    }
    if (typeof entry.sha !== "string" || !/^[a-f0-9]{40}$/.test(entry.sha)) {
      throw new Error("Invalid GitHub blob revision.");
    }
  }
  const files: SkillUploadFile[] = [];
  for (const { entry, selectedPrefix, storageKey } of entries) {
    const blob = object(await request(`${base}/git/blobs/${entry.sha}`));
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new Error("GitHub could not return the skill file.");
    }
    files.push({
      path: `${storageKey ? `.pulse-variants/${storageKey}/` : ""}${String(entry.path).slice(selectedPrefix.length)}`,
      base64: blob.content.replace(/\s/g, ""),
    });
  }
  return { files, commit };
}

function validateSkillFamilyFiles(files: ReadonlyArray<SkillUploadFile>): ValidatedSkillFiles {
  const canonical = validateSkillFiles(files, MAX_GITHUB_FILE_BYTES, MAX_FAMILY_FILES);
  const restrictions = { ...canonical.invocation };
  for (const provider of ["codex", "claudeAgent", "opencode"] as const) {
    const prefix = `.pulse-variants/${provider}/`;
    const variantFiles = files
      .filter((file) => file.path.startsWith(prefix))
      .map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
    if (!variantFiles.length) continue;
    const variant = validateSkillFiles(variantFiles, MAX_GITHUB_FILE_BYTES, MAX_FILES);
    if (variant.invocation.userInvocationOnly) restrictions.userInvocationOnly = true;
    if (variant.invocation.userInvocable === false) restrictions.userInvocable = false;
  }
  return { ...canonical, invocation: restrictions };
}

async function pathExists(path: string): Promise<boolean> {
  return NodeFSP.lstat(path).then(
    () => true,
    () => false,
  );
}

export class ManagedSkillStore {
  readonly root: string;
  readonly request: GitHubRequest;

  constructor(root: string, request: GitHubRequest = githubRequest) {
    this.root = NodePath.resolve(root);
    this.request = request;
  }

  revisionPath(revision: string): string {
    if (!REVISION_PATTERN.test(revision)) throw new Error("Invalid managed skill revision.");
    return NodePath.join(this.root, revision);
  }

  async importUpload(
    id: string,
    files: ReadonlyArray<SkillUploadFile>,
    previous?: ManagedSkillRecord,
  ): Promise<ManagedSkillRecord> {
    return this.persist(
      validateManagedId(id),
      validateSkillFiles(files),
      { type: "upload" },
      previous,
    );
  }

  async importGitHub(
    id: string,
    source: GitHubSkillSource,
    updatePolicy: ManagedSkillUpdatePolicy = "pinned",
    previous?: ManagedSkillRecord,
  ): Promise<ManagedSkillRecord> {
    const validatedId = validateManagedId(id);
    const validatedSource = validateGitHubSource(source);
    validateUpdatePolicy(validatedSource, updatePolicy);
    const downloaded = await downloadGitHubSkill(validatedSource, this.request);
    return this.persist(
      validatedId,
      validatedSource.variants?.length
        ? validateSkillFamilyFiles(downloaded.files)
        : validateSkillFiles(downloaded.files, MAX_GITHUB_FILE_BYTES),
      validatedSource,
      previous,
      updatePolicy,
      downloaded.commit,
    );
  }

  linkGitHub(record: ManagedSkillRecord, source: GitHubSkillSource): ManagedSkillRecord {
    validateManagedId(record.id);
    const validatedSource = validateGitHubSource(source);
    const { error: _error, resolvedCommit: _resolvedCommit, ...current } = record;
    return { ...current, source: validatedSource, updatePolicy: "pinned" };
  }

  setUpdatePolicy(
    record: ManagedSkillRecord,
    updatePolicy: ManagedSkillUpdatePolicy,
  ): ManagedSkillRecord {
    validateUpdatePolicy(record.source, updatePolicy);
    return { ...record, updatePolicy };
  }

  async sync(record: ManagedSkillRecord): Promise<ManagedSkillRecord> {
    if (record.source.type !== "github") {
      throw new Error("Only skills linked to GitHub can be synced.");
    }
    try {
      return await this.importGitHub(record.id, record.source, record.updatePolicy, record);
    } catch (error) {
      return {
        ...record,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Skill sync failed.",
      };
    }
  }

  async syncIfKeepUpdated(record: ManagedSkillRecord): Promise<ManagedSkillRecord> {
    if (record.updatePolicy !== "keep-updated") return record;
    return this.sync(record);
  }

  async catalog(
    records: ReadonlyArray<ManagedSkillRecord>,
  ): Promise<ManagedSkillCatalogDescriptor[]> {
    await NodeFSP.mkdir(this.root, { recursive: true });
    const realRoot = await NodeFSP.realpath(this.root);
    return Promise.all(
      records.map(async (record) => {
        validateManagedId(record.id);
        const revisionDirectory = this.revisionPath(record.revision);
        const skillPath = NodePath.join(revisionDirectory, "SKILL.md");
        const family = record.source.type === "github" && (record.source.variants?.length ?? 0) > 0;
        await this.verifyRevision(
          revisionDirectory,
          record.revision,
          family ? MAX_FAMILY_FILES : MAX_FILES,
        );
        const [realDirectory, realSkillPath] = await Promise.all([
          NodeFSP.realpath(revisionDirectory),
          NodeFSP.realpath(skillPath),
        ]);
        this.assertContained(realRoot, realDirectory);
        this.assertContained(realDirectory, realSkillPath);
        const skillEntry = await NodeFSP.lstat(skillPath);
        if (!skillEntry.isFile() || skillEntry.isSymbolicLink()) {
          throw new Error("Managed skill entry point must be a regular file.");
        }
        const variantSkillPaths = Object.fromEntries(
          (
            await Promise.all(
              (["codex", "claudeAgent", "opencode"] as const).map(async (provider) => {
                const candidate = NodePath.join(
                  revisionDirectory,
                  ".pulse-variants",
                  provider,
                  "SKILL.md",
                );
                if (!(await pathExists(candidate))) return undefined;
                const realCandidate = await NodeFSP.realpath(candidate);
                this.assertContained(realDirectory, realCandidate);
                return [provider, realCandidate] as const;
              }),
            )
          ).filter((entry) => entry !== undefined),
        );
        if (record.source.type === "github") {
          const canonicalKind = /^\.claude\/skills\/[^/]+$/i.test(record.source.directory)
            ? "claudeAgent"
            : /^\.opencode\/skills\/[^/]+$/i.test(record.source.directory)
              ? "opencode"
              : /^\.agents\/skills\/[^/]+$/i.test(record.source.directory)
                ? "codex"
                : undefined;
          if (canonicalKind) variantSkillPaths[canonicalKind] = realSkillPath;
        }
        return {
          id: record.id,
          name: record.name,
          description: record.description,
          revision: record.revision,
          skillPath: realSkillPath,
          ...(Object.keys(variantSkillPaths).length ? { variantSkillPaths } : {}),
          ...(record.source.type === "github" &&
          /^\.(?:agents|claude|opencode)\/skills\/[^/]+$/i.test(record.source.directory)
            ? {
                skillFamily: true as const,
                ...(/^\.agents\/skills\/[^/]+$/i.test(record.source.directory)
                  ? { genericFallback: true as const }
                  : {}),
              }
            : {}),
          source: record.source,
          ...(record.resolvedCommit ? { resolvedCommit: record.resolvedCommit } : {}),
          invocation: record.invocation,
        };
      }),
    );
  }

  private assertContained(parent: string, child: string): void {
    const relative = NodePath.relative(parent, child);
    if (!relative || relative.startsWith("..") || NodePath.isAbsolute(relative)) {
      if (relative) throw new Error("Managed skill path escapes its immutable revision.");
    }
  }

  private async persist(
    id: string,
    result: ValidatedSkillFiles,
    source: ManagedSkillSource,
    previous?: ManagedSkillRecord,
    updatePolicy: ManagedSkillUpdatePolicy = "pinned",
    resolvedCommit?: string,
  ): Promise<ManagedSkillRecord> {
    await NodeFSP.mkdir(this.root, { recursive: true });
    const destination = this.revisionPath(result.revision);
    if (await pathExists(destination)) {
      await this.verifyRevision(destination, result.revision);
    } else {
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
          if (!(await pathExists(destination))) throw error;
          await this.verifyRevision(destination, result.revision);
        }
      } finally {
        await NodeFSP.rm(temporary, { recursive: true, force: true });
      }
    }
    const now = new Date().toISOString();
    return {
      id,
      name: result.name,
      description: result.description,
      revision: result.revision,
      source,
      updatePolicy,
      ...(resolvedCommit ? { resolvedCommit } : {}),
      invocation: result.invocation,
      updatedAt: previous?.revision === result.revision ? previous.updatedAt : now,
      checkedAt: now,
    };
  }

  private async verifyRevision(
    destination: string,
    expectedRevision: string,
    maxFiles = MAX_FILES,
  ): Promise<void> {
    const entry = await NodeFSP.lstat(destination);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error("Managed skill revision path is not a regular directory.");
    }
    const discovered: Array<{ readonly path: string; readonly filePath: string }> = [];
    let totalBytes = 0;
    const visit = async (directory: string, prefix = ""): Promise<void> => {
      for (const child of await NodeFSP.readdir(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${child.name}` : child.name;
        validateSkillPath(relative);
        const path = NodePath.join(directory, child.name);
        if (child.isSymbolicLink())
          throw new Error("Managed skill revisions cannot contain links.");
        if (child.isDirectory()) await visit(path, relative);
        else if (child.isFile()) {
          const size = (await NodeFSP.stat(path)).size;
          discovered.push({ path: relative, filePath: path });
          totalBytes += size;
          if (discovered.length > maxFiles) {
            throw new Error(`A skill must contain 1 to ${maxFiles} files.`);
          }
          if (size > MAX_GITHUB_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
            throw new Error("Stored skills are limited to 8 MB total and 2 MB per file.");
          }
        } else throw new Error("Managed skill revisions can contain only files and directories.");
      }
    };
    await visit(destination);
    const actual = validateSkillFiles(
      await Promise.all(
        discovered.map(async (file) => ({
          path: file.path,
          base64: (await NodeFSP.readFile(file.filePath)).toString("base64"),
        })),
      ),
      MAX_GITHUB_FILE_BYTES,
      maxFiles,
    );
    if (actual.revision !== expectedRevision) {
      throw new Error("Existing managed skill revision does not match its content hash.");
    }
  }
}
