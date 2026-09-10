// @effect-diagnostics nodeBuiltinImport:off - Session handoff files share the environment's protected secret directory.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as Schema from "effect/Schema";

export class WardenCliIdentityError extends Schema.TaggedErrorClass<WardenCliIdentityError>()(
  "WardenCliIdentityError",
  {},
) {
  override get message() {
    return "Warden CLI identity could not be prepared.";
  }
}

/** Windows deployments must protect the parent secret directory with an owner-only ACL. */
export async function writeWardenCliIdentity(
  secretsDir: string,
  identity: { readonly endpoint: string; readonly authorizationHeader: string },
): Promise<string> {
  const directory = NodePath.join(secretsDir, "warden-cli");
  const filename = NodePath.join(directory, `${NodeCrypto.randomUUID()}.json`);
  const temporary = `${filename}.tmp`;
  try {
    await NodeFSP.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await NodeFSP.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid directory");
    await NodeFSP.chmod(directory, 0o700);
    await NodeFSP.writeFile(
      temporary,
      JSON.stringify({
        endpoint: identity.endpoint,
        authorizationHeader: identity.authorizationHeader,
      }),
      { mode: 0o600, flag: "wx" },
    );
    await NodeFSP.rename(temporary, filename);
    return filename;
  } catch {
    await NodeFSP.rm(temporary, { force: true }).catch(() => undefined);
    throw new WardenCliIdentityError({});
  }
}

export async function removeWardenCliIdentity(filename: string | undefined): Promise<void> {
  if (filename) await NodeFSP.rm(filename, { force: true });
}
