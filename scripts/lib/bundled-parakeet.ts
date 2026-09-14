// @effect-diagnostics nodeBuiltinImport:off, globalFetch:off -- Packaging runs in Node before the Effect runtime is staged.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";

const REVISION = "962d0fc27f08a65629d6a2723e09bca36e331eb7";
const REPOSITORY = "https://huggingface.co/ysdede/parakeet-tdt-0.6b-v3-onnx";

const files = [
  {
    name: "encoder-model.int8.onnx",
    size: 652_183_999,
    sha256: "6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09",
  },
  {
    name: "decoder_joint-model.int8.onnx",
    size: 18_202_004,
    sha256: "eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70",
  },
  {
    name: "vocab.txt",
    size: 93_939,
    sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
  },
] as const;

async function digest(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function valid(file: string, expected: (typeof files)[number]): Promise<boolean> {
  try {
    return (await fs.stat(file)).size === expected.size && (await digest(file)) === expected.sha256;
  } catch {
    return false;
  }
}

async function download(target: string, expected: (typeof files)[number]): Promise<void> {
  const temporary = `${target}.partial-${process.pid}`;
  let output: fs.FileHandle | undefined;
  try {
    // @effect-diagnostics-next-line globalFetch:off -- This standalone packager streams a fixed, checksum-pinned artifact.
    const response = await fetch(`${REPOSITORY}/resolve/${REVISION}/${expected.name}`);
    if (!response.ok || !response.body)
      throw new Error(`HTTP ${response.status} downloading ${expected.name}`);
    output = await fs.open(temporary, "w");
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await output.write(value);
    }
    await output.close();
    output = undefined;
    if (!(await valid(temporary, expected)))
      throw new Error(`Checksum mismatch for ${expected.name}`);
    await fs.rename(temporary, target);
  } finally {
    await output?.close();
    await fs.rm(temporary, { force: true });
  }
}

export function isPulseNextVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-pulse\.\d+$/.test(version);
}

export async function stageBundledParakeet(repoRoot: string, clientDir: string): Promise<void> {
  const cacheDir = path.join(repoRoot, ".t3", "build-cache", "parakeet", REVISION);
  const destinationDir = path.join(clientDir, "parakeet-model");
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(destinationDir, { recursive: true });

  for (const expected of files) {
    const cached = path.join(cacheDir, expected.name);
    if (!(await valid(cached, expected))) await download(cached, expected);
    await fs.copyFile(cached, path.join(destinationDir, expected.name));
  }

  await fs.writeFile(
    path.join(destinationDir, "ATTRIBUTION.txt"),
    `NVIDIA Parakeet TDT 0.6B v3\nONNX files: ${REPOSITORY}/tree/${REVISION}\nLicense: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/\n`,
  );
}
