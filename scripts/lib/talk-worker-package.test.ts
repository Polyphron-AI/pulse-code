// @effect-diagnostics nodeBuiltinImport:off -- Uses disposable fixture package directories.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeCrypto from "node:crypto";
import { it, expect } from "vite-plus/test";
import { stageTalkWorker } from "./talk-worker-package.ts";

it("stages only checksum-verified worker files and rejects tampering", async () => {
  const source = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-talk-package-"));
  const destination = NodePath.join(source, "staged");
  const binary = Buffer.from("MZfixture");
  try {
    await NodeFSP.writeFile(NodePath.join(source, "pulse-talk-worker.exe"), binary);
    await NodeFSP.writeFile(
      NodePath.join(source, "manifest.json"),
      "\uFEFF" +
        JSON.stringify({
          target: "x86_64-pc-windows-msvc",
          artifacts: [
            {
              name: "pulse-talk-worker.exe",
              bytes: binary.length,
              sha256: NodeCrypto.createHash("sha256").update(binary).digest("hex"),
            },
          ],
        }),
    );
    expect(await stageTalkWorker(source, destination)).toEqual(["pulse-talk-worker.exe"]);
    expect(await NodeFSP.readFile(NodePath.join(destination, "pulse-talk-worker.exe"))).toEqual(
      binary,
    );
    await NodeFSP.writeFile(
      NodePath.join(source, "pulse-talk-worker.exe"),
      Buffer.from("MZchanged"),
    );
    await expect(stageTalkWorker(source, destination)).rejects.toThrow("checksum mismatch");
  } finally {
    await NodeFSP.rm(source, { recursive: true, force: true });
  }
});

it("rejects traversal before copying files", async () => {
  const source = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-talk-package-"));
  try {
    await NodeFSP.writeFile(
      NodePath.join(source, "manifest.json"),
      JSON.stringify({
        target: "x86_64-pc-windows-msvc",
        artifacts: [{ name: "../escape.exe", bytes: 1, sha256: "0".repeat(64) }],
      }),
    );
    await expect(stageTalkWorker(source, NodePath.join(source, "out"))).rejects.toThrow(
      "Invalid Talk artifact",
    );
  } finally {
    await NodeFSP.rm(source, { recursive: true, force: true });
  }
});
