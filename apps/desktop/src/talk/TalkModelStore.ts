// @effect-diagnostics nodeBuiltinImport:off globalTimers:off -- Standalone streaming model storage owns its filesystem operations and download inactivity timer.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export interface TalkModelFile {
  name: string;
  size: number;
  hashMethod: "sha256" | "git-blob-sha1";
  expectedHash: string;
}
export interface TalkModelManifest {
  modelId: string;
  revision: string;
  license: string;
  sourceUrl: string;
  downloadBaseUrl: string;
  files: readonly TalkModelFile[];
}
export const PARAKEET_MODEL: TalkModelManifest = {
  modelId: "istupakov/parakeet-tdt-0.6b-v3-onnx",
  revision: "8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce",
  license: "cc-by-4.0",
  sourceUrl: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3",
  downloadBaseUrl:
    "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/",
  files: [
    {
      name: "encoder-model.int8.onnx",
      size: 652183999,
      hashMethod: "sha256",
      expectedHash: "6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09",
    },
    {
      name: "decoder_joint-model.int8.onnx",
      size: 18202004,
      hashMethod: "sha256",
      expectedHash: "eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70",
    },
    {
      name: "nemo128.onnx",
      size: 139764,
      hashMethod: "sha256",
      expectedHash: "a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f",
    },
    {
      name: "vocab.txt",
      size: 93939,
      hashMethod: "git-blob-sha1",
      expectedHash: "fc43e1c723e262df60b70e1919614417162d1fe2",
    },
  ],
};
export interface TalkModelStatus {
  state: "not_installed" | "downloading" | "installed" | "cancelled" | "error";
  modelId: string;
  revision: string;
  license: string;
  sourceUrl: string;
  totalBytes: number;
  downloadedBytes: number;
  progress: number;
  currentFile: string | null;
  error: string | null;
  directory: string | null;
  memory: { totalBytes: number; freeBytes: number };
  disk: { freeBytes: number | null };
  files: readonly TalkModelFile[];
}
interface Receipt {
  version: 1;
  modelId: string;
  revision: string;
  license: string;
  sourceUrl: string;
  files: (TalkModelFile & { sha256: string })[];
}
export interface TalkModelStoreOptions {
  directory: string;
  fetch?: typeof globalThis.fetch;
  /** Test fixtures may supply tiny immutable manifests. Production uses PARAKEET_MODEL. */
  manifest?: TalkModelManifest;
  diskFreeBytes?: (path: string) => Promise<number | null>;
}
const receiptName = "verified-model.json";

function code(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}
async function availableDisk(path: string): Promise<number | null> {
  let candidate = path;
  for (;;) {
    try {
      const info = await NodeFSP.statfs(candidate, { bigint: true });
      return Number(info.bavail * info.bsize);
    } catch (error) {
      if (code(error) !== "ENOENT") return null;
      const parent = NodePath.dirname(candidate);
      if (parent === candidate) return null;
      candidate = parent;
    }
  }
}
function hashers(file: TalkModelFile) {
  const sha256 = NodeCrypto.createHash("sha256");
  const expected =
    file.hashMethod === "sha256"
      ? sha256
      : NodeCrypto.createHash("sha1").update(`blob ${file.size}\0`);
  return {
    update(chunk: Uint8Array) {
      sha256.update(chunk);
      if (expected !== sha256) expected.update(chunk);
    },
    finish() {
      const sha = sha256.digest("hex");
      return { sha256: sha, expected: expected === sha256 ? sha : expected.digest("hex") };
    },
  };
}

/** Installs model bytes only. This class never starts inference, recording, or a worker. */
export class TalkModelStore {
  private readonly options: TalkModelStoreOptions;
  private readonly manifest: TalkModelManifest;
  private readonly root: string;
  private readonly target: string;
  private state: TalkModelStatus["state"] = "not_installed";
  private downloadedBytes = 0;
  private currentFile: string | null = null;
  private error: string | null = null;
  private initialized: Promise<void> | undefined;
  private job: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private closed = false;
  private removing = false;

  constructor(options: TalkModelStoreOptions) {
    this.options = options;
    this.manifest = options.manifest ?? PARAKEET_MODEL;
    this.root = NodePath.resolve(options.directory);
    if (
      !/^[a-zA-Z0-9_-]+$/.test(this.manifest.revision) ||
      this.manifest.files.length === 0 ||
      this.manifest.files.length > 20
    )
      throw new Error("Invalid model manifest.");
    const names = new Set<string>();
    for (const file of this.manifest.files) {
      if (
        !/^[a-zA-Z0-9_.-]+$/.test(file.name) ||
        file.name === "." ||
        file.name === ".." ||
        file.name === receiptName ||
        names.has(file.name) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 1 ||
        !new RegExp(`^[a-f0-9]{${file.hashMethod === "sha256" ? 64 : 40}}$`).test(file.expectedHash)
      )
        throw new Error("Invalid model file manifest.");
      names.add(file.name);
    }
    const origin = new URL(this.manifest.downloadBaseUrl);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash
    )
      throw new Error("Model downloads require an HTTPS source.");
    this.target = this.child(this.manifest.revision);
  }
  private total() {
    return this.manifest.files.reduce((sum, file) => sum + file.size, 0);
  }
  private child(name: string) {
    const path = NodePath.resolve(this.root, name);
    if (NodePath.dirname(path) !== this.root)
      throw new Error("Model path is outside its data directory.");
    return path;
  }
  private initialize(): Promise<void> {
    this.initialized ??= this.checkInstallation();
    return this.initialized;
  }
  private async checkInstallation() {
    let foundReceipt = false;
    try {
      const receiptPath = NodePath.join(this.target, receiptName);
      const receiptStat = await NodeFSP.lstat(receiptPath);
      foundReceipt = true;
      if (!receiptStat.isFile() || receiptStat.size > 65536)
        throw new Error("Invalid model receipt.");
      const receipt: unknown = JSON.parse(await NodeFSP.readFile(receiptPath, "utf8"));
      if (!this.validReceipt(receipt)) throw new Error("Invalid model receipt.");
      const directory = await NodeFSP.lstat(this.target);
      if (!directory.isDirectory() || directory.isSymbolicLink())
        throw new Error("Invalid model directory.");
      for (const file of this.manifest.files) {
        const checked = await this.verifyFile(NodePath.join(this.target, file.name), file);
        if (receipt.files.find((entry) => entry.name === file.name)?.sha256 !== checked)
          throw new Error("The model receipt does not match its files.");
      }
      this.state = "installed";
      this.downloadedBytes = this.total();
    } catch (error) {
      if (foundReceipt || code(error) !== "ENOENT") {
        this.state = "error";
        this.error =
          "The saved model failed integrity verification. Remove it and download a verified copy.";
      }
    }
  }
  private validReceipt(value: unknown): value is Receipt {
    if (typeof value !== "object" || value === null) return false;
    const receipt = value as Partial<Receipt>;
    return (
      receipt.version === 1 &&
      receipt.modelId === this.manifest.modelId &&
      receipt.revision === this.manifest.revision &&
      Array.isArray(receipt.files) &&
      receipt.files.length === this.manifest.files.length &&
      this.manifest.files.every((file) =>
        receipt.files?.some(
          (entry) =>
            entry.name === file.name &&
            entry.size === file.size &&
            entry.hashMethod === file.hashMethod &&
            entry.expectedHash === file.expectedHash &&
            typeof entry.sha256 === "string" &&
            /^[a-f0-9]{64}$/.test(entry.sha256),
        ),
      )
    );
  }
  private async verifyFile(path: string, file: TalkModelFile) {
    const stat = await NodeFSP.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size)
      throw new Error("Model file size is invalid.");
    const hashes = hashers(file);
    const handle = await NodeFSP.open(path, "r");
    try {
      const chunk = Buffer.alloc(256 * 1024);
      let read: number;
      do {
        const result = await handle.read(chunk);
        read = result.bytesRead;
        if (read) hashes.update(chunk.subarray(0, read));
      } while (read);
    } finally {
      await handle.close();
    }
    const digest = hashes.finish();
    if (digest.expected !== file.expectedHash) throw new Error("Model file checksum is invalid.");
    return digest.sha256;
  }
  async status(): Promise<TalkModelStatus> {
    await this.initialize();
    if (this.state === "installed") {
      try {
        for (const file of this.manifest.files) {
          const stat = await NodeFSP.lstat(NodePath.join(this.target, file.name));
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size)
            throw new Error("Invalid model file.");
        }
      } catch {
        this.state = "error";
        this.error =
          "The installed model is missing files or has changed. Remove it and download a verified copy.";
      }
    }
    const freeBytes = await (this.options.diskFreeBytes ?? availableDisk)(this.root);
    return {
      state: this.state,
      modelId: this.manifest.modelId,
      revision: this.manifest.revision,
      license: this.manifest.license,
      sourceUrl: this.manifest.sourceUrl,
      totalBytes: this.total(),
      downloadedBytes: this.downloadedBytes,
      progress: this.downloadedBytes / this.total(),
      currentFile: this.currentFile,
      error: this.error,
      directory: this.state === "installed" ? this.target : null,
      memory: { totalBytes: NodeOS.totalmem(), freeBytes: NodeOS.freemem() },
      disk: { freeBytes },
      files: this.manifest.files.map((file) => ({ ...file })),
    };
  }
  async startDownload(input: { consent: true }): Promise<TalkModelStatus> {
    if (input?.consent !== true)
      throw new Error("Explicit consent is required before downloading the model.");
    if (this.closed || this.removing) throw new Error("The model store is not available.");
    await this.initialize();
    if (this.closed || this.removing) throw new Error("The model store is not available.");
    if (this.job || this.state === "installed") return this.status();
    this.state = "downloading";
    this.downloadedBytes = 0;
    this.error = null;
    this.controller = new AbortController();
    this.job = this.download(this.controller.signal).finally(() => {
      this.job = undefined;
      this.controller = undefined;
    });
    return this.status();
  }
  private async download(signal: AbortSignal) {
    const staging = this.child(`.download-${NodeCrypto.randomUUID()}`);
    try {
      const free = await (this.options.diskFreeBytes ?? availableDisk)(this.root);
      if (free === null)
        throw new Error(
          "Free disk space could not be measured. Check the model data directory and try again.",
        );
      if (free < this.total() + 65536)
        throw new Error(
          "There is not enough free disk space for the model files and their verification receipt.",
        );
      signal.throwIfAborted();
      await NodeFSP.mkdir(this.root, { recursive: true });
      await NodeFSP.mkdir(staging);
      const files: Receipt["files"] = [];
      for (const file of this.manifest.files) {
        signal.throwIfAborted();
        this.currentFile = file.name;
        const sha256 = await this.downloadFile(staging, file, signal);
        files.push({ ...file, sha256 });
      }
      signal.throwIfAborted();
      const receipt: Receipt = {
        version: 1,
        modelId: this.manifest.modelId,
        revision: this.manifest.revision,
        license: this.manifest.license,
        sourceUrl: this.manifest.sourceUrl,
        files,
      };
      const handle = await NodeFSP.open(NodePath.join(staging, receiptName), "wx");
      try {
        await handle.writeFile(JSON.stringify(receipt, null, 2));
        await handle.sync();
      } finally {
        await handle.close();
      }
      signal.throwIfAborted();
      // Never replace an existing directory automatically, including an invalid installation.
      const exists = await NodeFSP.lstat(this.target).then(
        () => true,
        (error: unknown) => {
          if (code(error) === "ENOENT") return false;
          throw error;
        },
      );
      if (exists) throw new Error("The model directory already exists.");
      await NodeFSP.rename(staging, this.target);
      this.state = "installed";
      this.downloadedBytes = this.total();
    } catch (error) {
      this.state = signal.aborted ? "cancelled" : "error";
      this.error = signal.aborted
        ? null
        : error instanceof Error && error.message.startsWith("There is not enough")
          ? error.message
          : error instanceof Error && error.message.startsWith("Free disk space")
            ? error.message
            : "The model download or verification failed. Check the connection and disk space, then retry. Remove any invalid installed model first.";
    } finally {
      this.currentFile = null;
      // Only the unique staging path allocated above is eligible for cleanup.
      if (
        NodePath.dirname(staging) === this.root &&
        NodePath.basename(staging).startsWith(".download-")
      )
        await NodeFSP.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }
  private async downloadFile(
    staging: string,
    file: TalkModelFile,
    signal: AbortSignal,
  ): Promise<string> {
    const timeout = new AbortController();
    let timer = setTimeout(() => timeout.abort(), 60_000);
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => timeout.abort(), 60_000);
    };
    const combined = AbortSignal.any([signal, timeout.signal]);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const abortReader = () => {
      void reader?.cancel().catch(() => {});
    };
    let handle: NodeFSP.FileHandle | undefined;
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(
        new URL(file.name, this.manifest.downloadBaseUrl),
        { signal: combined, headers: { "Accept-Encoding": "identity" } },
      );
      if (!response.ok || !response.body) throw new Error("Model download failed.");
      const sizeHeader = response.headers.get("content-length");
      if (sizeHeader !== null && Number(sizeHeader) !== file.size)
        throw new Error("Unexpected model content length.");
      reader = response.body.getReader();
      combined.addEventListener("abort", abortReader, { once: true });
      handle = await NodeFSP.open(NodePath.join(staging, file.name), "wx");
      const hashes = hashers(file);
      let written = 0;
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        resetTimer();
        if (written + value.byteLength > file.size)
          throw new Error("Model exceeded its pinned size.");
        hashes.update(value);
        // FileHandle.write may write fewer bytes than requested.
        let offset = 0;
        while (offset < value.byteLength) {
          const result = await handle.write(value, offset, value.byteLength - offset);
          if (!result.bytesWritten) throw new Error("Model write made no progress.");
          offset += result.bytesWritten;
        }
        written += value.byteLength;
        this.downloadedBytes += value.byteLength;
      }
      if (written !== file.size) throw new Error("The model download was truncated.");
      const result = hashes.finish();
      if (result.expected !== file.expectedHash) throw new Error("Model checksum mismatch.");
      await handle.sync();
      return result.sha256;
    } finally {
      clearTimeout(timer);
      combined.removeEventListener("abort", abortReader);
      await reader?.cancel().catch(() => {});
      await handle?.close();
    }
  }
  async cancel(): Promise<void> {
    this.controller?.abort();
    await this.job;
  }
  /** Waits for the currently owned download/cleanup without starting or cancelling work. */
  async waitForIdle(): Promise<void> {
    await this.job;
  }
  async remove(): Promise<void> {
    if (this.closed) throw new Error("The model store has stopped.");
    this.removing = true;
    try {
      await this.initialize();
      await this.cancel();
      if (
        NodePath.dirname(this.target) !== this.root ||
        NodePath.basename(this.target) !== this.manifest.revision
      )
        throw new Error("Invalid model removal path.");
      await NodeFSP.rm(this.target, { recursive: true, force: true });
      this.state = "not_installed";
      this.downloadedBytes = 0;
      this.currentFile = null;
      this.error = null;
    } finally {
      this.removing = false;
    }
  }
  async installedPath(): Promise<string | null> {
    await this.initialize();
    if (this.state !== "installed") return null;
    try {
      for (const file of this.manifest.files)
        await this.verifyFile(NodePath.join(this.target, file.name), file);
      return this.target;
    } catch {
      this.state = "error";
      this.error =
        "The installed model failed integrity verification. Remove it and download a verified copy.";
      return null;
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.initialized;
    await this.cancel();
  }
}
