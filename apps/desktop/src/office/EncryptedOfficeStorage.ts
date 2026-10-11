// @effect-diagnostics nodeBuiltinImport:off -- Promise storage adapter implements atomic encrypted writes for the isolated Office service.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";

export function encryptedOfficeStorage(
  path: string,
  cipher: {
    available(): boolean;
    encrypt(value: string): Uint8Array;
    decrypt(value: Uint8Array): string;
  },
) {
  let writes: Promise<void> = Promise.resolve();
  return {
    async read(): Promise<string | null> {
      let bytes: Buffer;
      try {
        bytes = await NodeFSP.readFile(path);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        // oxlint-disable-next-line preserve-caught-error -- Do not expose storage paths or decryption details.
        throw new Error("Office data could not be read.");
      }
      if (!cipher.available())
        throw new Error("Secure credential storage is unavailable on this computer.");
      try {
        return cipher.decrypt(bytes);
      } catch {
        throw new Error("Office data could not be unlocked on this computer.");
      }
    },
    write(value: string): Promise<void> {
      const action = writes
        .catch(() => undefined)
        .then(async () => {
          if (!cipher.available())
            throw new Error("Secure credential storage is unavailable on this computer.");
          const encrypted = cipher.encrypt(value);
          await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true });
          const temporary = `${path}.${NodeCrypto.randomUUID()}.tmp`;
          await NodeFSP.writeFile(temporary, encrypted, { flag: "wx", mode: 0o600 });
          await NodeFSP.rename(temporary, path);
        });
      writes = action;
      return action;
    },
  };
}
