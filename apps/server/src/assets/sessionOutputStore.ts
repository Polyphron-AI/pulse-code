// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeStreamPromises from "node:stream/promises";
import { ZipFile } from "yazl";
import { SessionOutputAccessError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 128;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const Metadata = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  threadId: Schema.String,
  messageId: Schema.String,
  turnId: Schema.NullOr(Schema.String),
  sourcePath: Schema.String,
  name: Schema.String,
  createdAt: Schema.String,
  files: Schema.Array(
    Schema.Struct({ path: Schema.String, bytes: Schema.Number, sha256: Schema.String }),
  ),
});
export type SessionOutputMetadata = typeof Metadata.Type;
const isOutputAccessError = Schema.is(SessionOutputAccessError);
const decodeMetadata = Schema.decodeUnknownSync(Schema.fromJsonString(Metadata));

export function outputAccessError(cause: unknown): SessionOutputAccessError {
  if (isOutputAccessError(cause)) return cause;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  if (code === "ENOENT" || code === "ENOTDIR") {
    return new SessionOutputAccessError({
      code: "missing",
      message:
        "This output has no saved copy and its original file is missing. Restore the file on its source environment or generate it again.",
    });
  }
  if (code === "EACCES" || code === "EPERM") {
    return new SessionOutputAccessError({
      code: "denied",
      message:
        "The source environment cannot read or save this output. Check its file permissions before trying again.",
    });
  }
  return new SessionOutputAccessError({
    code: "unavailable",
    message:
      "The source environment could not save or read this output. Check its storage and connection before trying again.",
  });
}

function normalizedSource(filePath: string, cwd: string): string {
  const resolved = NodePath.resolve(cwd, filePath);
  return NodePath.sep === "\\" ? resolved.toLowerCase() : resolved;
}

/** Only explicit file links and standalone file paths in inline code are deliverables. */
export function sessionOutputLinks(
  text: string,
  cwd: string,
): Array<{ path: string; reference: string }> {
  const withoutFences = text.replace(/```[^]*?```|~~~[^]*?~~~/g, "");
  const candidates = [
    ...Array.from(
      withoutFences.matchAll(
        /\[[^\]\r\n]*\]\(\s*(<[^>\r\n]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g,
      ),
      (match) => ({ value: match[1]!, explicit: true }),
    ),
    ...Array.from(withoutFences.matchAll(/`([^`\r\n]+)`/g), (match) => ({
      value: match[1]!,
      explicit: false,
    })),
  ];
  const results = new Map<string, { path: string; reference: string }>();
  for (const entry of candidates) {
    let candidate = entry.value.replace(/^<|>$/g, "");
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      continue;
    }
    if (candidate.startsWith("file:///"))
      candidate = candidate.slice(NodePath.sep === "\\" ? 8 : 7);
    if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^[a-z]:[\\/]/i.test(candidate)) continue;
    candidate = candidate.replace(/#L\d+(?:C\d+)?$/i, "").replace(/:\d+(?::\d+)?$/, "");
    if (
      !candidate ||
      candidate.includes("\0") ||
      candidate.includes("?") ||
      candidate.includes("#")
    )
      continue;
    if (!/\.[a-z\d_-]+$/i.test(candidate)) continue;
    if (
      !entry.explicit &&
      !NodePath.isAbsolute(candidate) &&
      /\s/.test(candidate) &&
      !candidate.includes("/")
    )
      continue;
    const sourcePath = normalizedSource(candidate, cwd);
    const reference =
      NodePath.sep === "\\" ? candidate.replaceAll("\\", "/").toLowerCase() : candidate;
    if (!results.has(sourcePath)) results.set(sourcePath, { path: sourcePath, reference });
    if (results.size >= 32) break;
  }
  return [...results.values()];
}

export function sessionOutputPaths(text: string, cwd: string): string[] {
  return sessionOutputLinks(text, cwd).map((link) => link.path);
}

export function sessionOutputId(threadId: string, messageId: string, sourcePath: string): string {
  return NodeCrypto.createHash("sha256")
    .update(JSON.stringify([threadId, messageId, sourcePath]))
    .digest("hex");
}

function outputDirectory(storeRoot: string, id: string): string {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new SessionOutputAccessError({
      code: "missing",
      message: "Invalid saved output reference.",
    });
  return NodePath.join(storeRoot, id);
}

export async function readSessionOutput(
  storeRoot: string,
  id: string,
): Promise<SessionOutputMetadata> {
  const result = decodeMetadata(
    await NodeFSP.readFile(NodePath.join(outputDirectory(storeRoot, id), "metadata.json"), "utf8"),
  );
  if (result.id !== id) throw new Error("Saved output identity mismatch");
  return result;
}

/** A persisted preview can still carry the original absolute path after a worktree switch. */
export async function findSavedSessionOutput(input: {
  storeRoot: string;
  threadId: string;
  messageId: string;
  requestedPath: string;
  links: ReadonlyArray<{ path: string; reference: string }>;
}): Promise<SessionOutputMetadata | null> {
  for (const link of input.links) {
    const id = sessionOutputId(input.threadId, input.messageId, link.reference);
    try {
      const saved = await readSessionOutput(input.storeRoot, id);
      if (saved.sourcePath === input.requestedPath) return saved;
    } catch (cause) {
      if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT"))
        throw cause;
    }
  }
  return null;
}

async function checksum(filePath: string): Promise<string> {
  const hash = NodeCrypto.createHash("sha256");
  for await (const chunk of NodeFS.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function dependencyPaths(text: string): string[] {
  return [
    ...Array.from(
      text.matchAll(/(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi),
      (match) => match[1]!,
    ),
    ...Array.from(text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi), (match) => match[1]!),
    ...Array.from(text.matchAll(/@import\s+["']([^"']+)["']/gi), (match) => match[1]!),
  ];
}

/** The first complete snapshot wins. Temporary directories never appear as saved outputs. */
export async function saveSessionOutput(input: {
  storeRoot: string;
  threadId: string;
  messageId: string;
  turnId: string | null;
  sourcePath: string;
  cwd: string;
  reference?: string;
  budget?: { remainingBytes: number };
}): Promise<SessionOutputMetadata> {
  const sourcePath = normalizedSource(input.sourcePath, input.cwd);
  const id = sessionOutputId(input.threadId, input.messageId, input.reference ?? sourcePath);
  try {
    return await readSessionOutput(input.storeRoot, id);
  } catch (cause) {
    if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT"))
      throw cause;
  }
  await NodeFSP.mkdir(input.storeRoot, { recursive: true });
  const destination = outputDirectory(input.storeRoot, id);
  const temporary = NodePath.join(input.storeRoot, `.pending-${NodeCrypto.randomUUID()}`);
  await NodeFSP.mkdir(NodePath.join(temporary, "files"), { recursive: true });
  try {
    const root = await NodeFSP.realpath(NodePath.dirname(sourcePath));
    const queue = [NodePath.basename(sourcePath)];
    const seen = new Set<string>();
    const files: Array<{ path: string; bytes: number; sha256: string }> = [];
    let totalBytes = 0;
    for (let index = 0; index < queue.length; index++) {
      const relative = queue[index]!;
      if (seen.has(relative)) continue;
      seen.add(relative);
      if (seen.size > MAX_FILES)
        throw new SessionOutputAccessError({
          code: "too-large",
          message:
            "This output references more than 128 files. Export a self-contained report or archive instead.",
        });
      const source = await NodeFSP.realpath(NodePath.join(root, relative));
      const realRelative = NodePath.relative(root, source);
      if (realRelative.startsWith("..") || NodePath.isAbsolute(realRelative))
        throw new SessionOutputAccessError({
          code: "denied",
          message:
            "This report references a file outside its output folder. Export its supporting files into the same folder.",
        });
      const before = await NodeFSP.stat(source);
      if (!before.isFile())
        throw new SessionOutputAccessError({
          code: "unsupported",
          message: "This output is a folder. Create an archive to download it.",
        });
      totalBytes += before.size;
      if (
        before.size > MAX_FILE_BYTES ||
        totalBytes > MAX_BUNDLE_BYTES ||
        (input.budget && before.size > input.budget.remainingBytes)
      )
        throw new SessionOutputAccessError({
          code: "too-large",
          message:
            "Saved outputs support files up to 64 MB and 128 MB per message. Split this output into smaller files or messages.",
        });
      if (input.budget) input.budget.remainingBytes -= before.size;
      const target = NodePath.join(temporary, "files", relative);
      await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
      await NodeFSP.copyFile(source, target);
      const after = await NodeFSP.stat(source);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
        throw new SessionOutputAccessError({
          code: "unavailable",
          message:
            "This output changed while it was being saved. Wait for the file to finish writing, then try again.",
        });
      files.push({
        path: relative.replaceAll("\\", "/"),
        bytes: before.size,
        sha256: await checksum(target),
      });
      if (/\.(?:html?|css)$/i.test(relative) && before.size <= MAX_TEXT_BYTES) {
        for (let dependency of dependencyPaths(await NodeFSP.readFile(target, "utf8"))) {
          if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(dependency)) continue;
          dependency = decodeURIComponent(dependency.split(/[?#]/, 1)[0]!).replaceAll("\\", "/");
          if (!dependency) continue;
          // Page navigation is not a supporting asset and must not copy unrelated files.
          if (!/\.(?:css|js|mjs|png|jpe?g|gif|webp|svg|ico|avif|woff2?|ttf|otf)$/i.test(dependency))
            continue;
          const next = NodePath.normalize(NodePath.join(NodePath.dirname(relative), dependency));
          if (
            NodePath.isAbsolute(dependency) ||
            next.startsWith("..") ||
            next.split(/[\\/]/).some((part) => part.startsWith("."))
          )
            throw new SessionOutputAccessError({
              code: "denied",
              message:
                "This report references files outside its output folder. Export a self-contained report instead.",
            });
          if (!seen.has(next)) queue.push(next);
        }
      }
    }
    const metadata: SessionOutputMetadata = {
      version: 1,
      id,
      threadId: input.threadId,
      messageId: input.messageId,
      turnId: input.turnId,
      sourcePath,
      name: NodePath.basename(sourcePath),
      createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
      files,
    };
    if (files.length > 1) {
      const archive = new ZipFile();
      archive.on("error", (error: Error) => archive.outputStream.emit("error", error));
      for (const file of files)
        archive.addFile(NodePath.join(temporary, "files", file.path), file.path);
      archive.end();
      await NodeStreamPromises.pipeline(
        archive.outputStream,
        NodeFS.createWriteStream(NodePath.join(temporary, "download.zip"), { flags: "wx" }),
      );
    }
    await NodeFSP.writeFile(NodePath.join(temporary, "metadata.json"), JSON.stringify(metadata), {
      flag: "wx",
    });
    try {
      await NodeFSP.rename(temporary, destination);
    } catch (cause) {
      // Concurrent capture/open requests use the first committed snapshot.
      try {
        return await readSessionOutput(input.storeRoot, id);
      } catch {
        throw cause;
      }
    }
    return metadata;
  } finally {
    await NodeFSP.rm(temporary, { recursive: true, force: true });
  }
}

export function sessionOutputDownloadName(metadata: SessionOutputMetadata): string {
  return metadata.files.length > 1 ? `${metadata.name}.zip` : metadata.name;
}

export async function resolveSessionOutputFile(
  storeRoot: string,
  id: string,
  relative: string,
  download = false,
) {
  const metadata = await readSessionOutput(storeRoot, id);
  if (download) {
    if (relative !== sessionOutputDownloadName(metadata)) return null;
    const filePath = NodePath.join(
      outputDirectory(storeRoot, id),
      metadata.files.length > 1 ? "download.zip" : NodePath.join("files", metadata.name),
    );
    return { filePath, name: sessionOutputDownloadName(metadata) };
  }
  const normalized = relative.replaceAll("\\", "/");
  if (
    normalized.split("/").some((part) => part === ".." || part === ".") ||
    NodePath.isAbsolute(normalized)
  )
    return null;
  if (!metadata.files.some((file) => file.path === normalized)) return null;
  const filePath = NodePath.join(outputDirectory(storeRoot, id), "files", normalized);
  const info = await NodeFSP.stat(filePath);
  return info.isFile() ? { filePath, name: metadata.name } : null;
}
