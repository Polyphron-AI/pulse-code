// @effect-diagnostics nodeBuiltinImport:off -- Model storage tests use small synthetic files in test-owned temporary directories.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { PARAKEET_MODEL, TalkModelStore, type TalkModelManifest } from "./TalkModelStore.ts";

const fixtures = {
  "model.onnx": Buffer.from("synthetic model bytes"),
  "vocab.txt": Buffer.from("one\ntwo\n"),
};
const manifest: TalkModelManifest = {
  modelId: "test/synthetic",
  revision: "fixture-revision",
  license: "test-license",
  sourceUrl: "https://example.invalid/source",
  downloadBaseUrl: "https://example.invalid/fixture-revision/",
  files: [
    {
      name: "model.onnx",
      size: fixtures["model.onnx"].length,
      hashMethod: "sha256",
      expectedHash: NodeCrypto.createHash("sha256").update(fixtures["model.onnx"]).digest("hex"),
    },
    {
      name: "vocab.txt",
      size: fixtures["vocab.txt"].length,
      hashMethod: "git-blob-sha1",
      expectedHash: NodeCrypto.createHash("sha1")
        .update(`blob ${fixtures["vocab.txt"].length}\0`)
        .update(fixtures["vocab.txt"])
        .digest("hex"),
    },
  ],
};
const directories: string[] = [];
const stores: TalkModelStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const directory of directories.splice(0)) {
    const resolved = NodePath.resolve(directory);
    if (
      NodePath.dirname(resolved) !== NodePath.resolve(NodeOS.tmpdir()) ||
      !NodePath.basename(resolved).startsWith("pulse-talk-model-test-")
    )
      throw new Error("Invalid test cleanup path");
    await NodeFSP.rm(resolved, { recursive: true, force: true });
  }
});
async function setup(fetcher?: typeof fetch, freeBytes = 1_000_000) {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-talk-model-test-"));
  directories.push(directory);
  const fetch: typeof globalThis.fetch =
    fetcher ??
    (async (url) => {
      const name = NodePath.basename(new URL(String(url)).pathname) as keyof typeof fixtures;
      const data = fixtures[name];
      return new Response(data, { headers: { "content-length": String(data.length) } });
    });
  const store = new TalkModelStore({
    directory,
    manifest,
    fetch,
    diskFreeBytes: async () => freeBytes,
  });
  stores.push(store);
  return { directory, store, fetch };
}

describe("TalkModelStore", () => {
  it("pins production identities accurately without fetching real model files", () => {
    expect(PARAKEET_MODEL.revision).toBe("8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce");
    expect(PARAKEET_MODEL.files).toHaveLength(4);
    expect(PARAKEET_MODEL.files.find((file) => file.name === "vocab.txt")).toMatchObject({
      hashMethod: "git-blob-sha1",
      expectedHash: "fc43e1c723e262df60b70e1919614417162d1fe2",
    });
  });

  it("does not fetch until explicitly consented and reports measured resources", async () => {
    let requests = 0;
    const { store } = await setup(async () => {
      requests++;
      throw new Error("Unexpected fetch");
    });
    const status = await store.status();
    expect(status).toMatchObject({
      state: "not_installed",
      downloadedBytes: 0,
      progress: 0,
      disk: { freeBytes: 1_000_000 },
    });
    expect(status.memory.totalBytes).toBeGreaterThan(0);
    expect(status.memory.freeBytes).toBeGreaterThan(0);
    // @ts-expect-error Runtime callers must not bypass explicit consent.
    await expect(store.startDownload({ consent: false })).rejects.toThrow("consent");
    expect(await store.installedPath()).toBeNull();
    expect(requests).toBe(0);
  });

  it("streams and verifies every file before publishing a receipt and reuses it offline", async () => {
    const { store, directory } = await setup();
    await store.startDownload({ consent: true });
    await store.waitForIdle();
    const status = await store.status();
    expect(status).toMatchObject({
      state: "installed",
      progress: 1,
      currentFile: null,
      error: null,
    });
    const installed = await store.installedPath();
    expect(installed).toBe(NodePath.join(directory, manifest.revision));
    const receipt = JSON.parse(
      await NodeFSP.readFile(NodePath.join(installed!, "verified-model.json"), "utf8"),
    );
    expect(receipt.files[1]).toMatchObject({
      hashMethod: "git-blob-sha1",
      expectedHash: manifest.files[1]?.expectedHash,
      sha256: NodeCrypto.createHash("sha256").update(fixtures["vocab.txt"]).digest("hex"),
    });
    expect(receipt).toMatchObject({ revision: manifest.revision, modelId: manifest.modelId });
    const offline = new TalkModelStore({
      directory,
      manifest,
      fetch: async () => {
        throw new Error("Offline");
      },
    });
    stores.push(offline);
    expect((await offline.status()).state).toBe("installed");
    expect(await offline.installedPath()).toBe(installed);
    expect((await offline.startDownload({ consent: true })).state).toBe("installed");
  });

  it("returns promptly while streaming, cancels partial bytes and can retry", async () => {
    let requested: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      requested = resolve;
    });
    let block = true;
    const { store, directory } = await setup(async (url) => {
      const name = NodePath.basename(new URL(String(url)).pathname) as keyof typeof fixtures;
      if (block) {
        requested();
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(fixtures[name].subarray(0, 2));
            },
          }),
        );
      }
      return new Response(fixtures[name]);
    });
    expect((await store.startDownload({ consent: true })).state).toBe("downloading");
    await ready;
    expect(await store.installedPath()).toBeNull();
    await store.cancel();
    expect((await store.status()).state).toBe("cancelled");
    expect(await NodeFSP.readdir(directory)).toEqual([]);
    block = false;
    await store.startDownload({ consent: true });
    await store.waitForIdle();
    expect((await store.status()).state).toBe("installed");
  });

  it.each(["wrong hash", "truncated", "oversized", "wrong length header", "network error"])(
    "never publishes %s bytes",
    async (kind) => {
      const { store, directory } = await setup(async () => {
        if (kind === "network error") throw new Error("sensitive provider response");
        const data =
          kind === "wrong hash"
            ? Buffer.alloc(fixtures["model.onnx"].length, 120)
            : kind === "truncated"
              ? Buffer.from("short")
              : kind === "oversized"
                ? Buffer.alloc(fixtures["model.onnx"].length + 1)
                : fixtures["model.onnx"];
        return new Response(
          data,
          kind === "wrong length header" ? { headers: { "content-length": "999" } } : {},
        );
      });
      await store.startDownload({ consent: true });
      await store.waitForIdle();
      expect((await store.status()).state).toBe("error");
      expect(await store.installedPath()).toBeNull();
      expect(await NodeFSP.readdir(directory)).toEqual([]);
      expect((await store.status()).error).not.toContain("sensitive");
    },
  );

  it("checks disk space before any request and preserves unrelated data during removal", async () => {
    let requests = 0;
    const { store, directory } = await setup(async () => {
      requests++;
      throw new Error("unexpected");
    }, 1);
    const unrelated = NodePath.join(directory, "keep.txt");
    await NodeFSP.writeFile(unrelated, "keep");
    await store.startDownload({ consent: true });
    await store.waitForIdle();
    expect(requests).toBe(0);
    expect((await store.status()).error).toContain("not enough free disk space");
    await store.remove();
    expect(await NodeFSP.readFile(unrelated, "utf8")).toBe("keep");
    expect((await store.status()).state).toBe("not_installed");
  });

  it("detects same-size tampering when reopening an installation", async () => {
    const { store, directory } = await setup();
    await store.startDownload({ consent: true });
    await store.waitForIdle();
    await NodeFSP.writeFile(
      NodePath.join(directory, manifest.revision, "model.onnx"),
      Buffer.alloc(fixtures["model.onnx"].length),
    );
    const reopened = new TalkModelStore({ directory, manifest });
    stores.push(reopened);
    expect((await reopened.status()).state).toBe("error");
    expect(await reopened.installedPath()).toBeNull();
    await reopened.remove();
    expect(await NodeFSP.readdir(directory)).toEqual([]);
  });

  it("rejects path traversal in fixture or future model manifests", async () => {
    const { directory } = await setup();
    expect(
      () => new TalkModelStore({ directory, manifest: { ...manifest, revision: "../outside" } }),
    ).toThrow("manifest");
    expect(
      () =>
        new TalkModelStore({
          directory,
          manifest: { ...manifest, files: [{ ...manifest.files[0]!, name: "../outside" }] },
        }),
    ).toThrow("manifest");
  });
});
