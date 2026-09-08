// @effect-diagnostics nodeBuiltinImport:off -- Exercises the storage adapter against disposable filesystem paths.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { encryptedOfficeStorage } from "./EncryptedOfficeStorage.ts";

describe("Office credential persistence", () => {
  it("writes only cipher output and reads it across store instances", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-office-store-"));
    const path = NodePath.join(root, "account.bin");
    const cipher = {
      available: () => true,
      encrypt: () => Buffer.from("ciphertext"),
      decrypt: () => "secret account",
    };
    try {
      const store = encryptedOfficeStorage(path, cipher);
      expect(await store.read()).toBeNull();
      await store.write("secret account");
      expect(await NodeFSP.readFile(path, "utf8")).toBe("ciphertext");
      expect(await encryptedOfficeStorage(path, cipher).read()).toBe("secret account");
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
  it("refuses plaintext fallback when native encryption is unavailable", async () => {
    const store = encryptedOfficeStorage("unused", {
      available: () => false,
      encrypt: () => {
        throw new Error("must not call");
      },
      decrypt: () => "",
    });
    await expect(store.write("token")).rejects.toThrow("Secure credential storage");
  });
});
