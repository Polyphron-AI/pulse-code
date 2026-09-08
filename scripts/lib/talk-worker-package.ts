// @effect-diagnostics nodeBuiltinImport:off -- Build-time package verifier operates on explicit artifact directories.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

export async function stageTalkWorker(source: string, destination: string) {
  const manifest: unknown = JSON.parse(
    (await NodeFSP.readFile(NodePath.join(source, "manifest.json"), "utf8")).replace(/^\uFEFF/, ""),
  );
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !("target" in manifest) ||
    manifest.target !== "x86_64-pc-windows-msvc" ||
    !("artifacts" in manifest) ||
    !Array.isArray(manifest.artifacts)
  )
    throw new Error("Talk worker manifest must describe Windows x64 artifacts.");
  const verified: string[] = [];
  for (const item of manifest.artifacts) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      !/^[a-zA-Z0-9_.-]+$/.test(item.name) ||
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(item.sha256) ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes <= 0
    )
      throw new Error("Invalid Talk artifact manifest entry.");
    const filename = NodePath.join(source, item.name);
    if ((await NodeFSP.stat(filename)).size !== item.bytes)
      throw new Error(`Talk artifact size mismatch: ${item.name}`);
    const bytes = await NodeFSP.readFile(filename);
    if (NodeCrypto.createHash("sha256").update(bytes).digest("hex") !== item.sha256.toLowerCase())
      throw new Error(`Talk artifact checksum mismatch: ${item.name}`);
    if (item.name.endsWith(".exe") && (bytes[0] !== 0x4d || bytes[1] !== 0x5a))
      throw new Error("Talk worker is not a Windows executable.");
    verified.push(item.name);
  }
  if (!verified.includes("pulse-talk-worker.exe"))
    throw new Error("Talk worker executable is missing from its manifest.");
  await NodeFSP.mkdir(destination, { recursive: true });
  for (const name of verified)
    await NodeFSP.copyFile(NodePath.join(source, name), NodePath.join(destination, name));
  await NodeFSP.copyFile(
    NodePath.join(source, "manifest.json"),
    NodePath.join(destination, "manifest.json"),
  );
  return verified;
}
