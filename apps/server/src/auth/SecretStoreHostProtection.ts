import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

export const SecretStoreHostProtectionReason = Schema.Literals([
  "isolated",
  "shared_or_untrusted",
  "windows_acl_unverified",
  "unsupported_platform",
  "inspection_failed",
]);
export type SecretStoreHostProtectionReason = typeof SecretStoreHostProtectionReason.Type;

export const SecretStoreHostProtection = Schema.Struct({
  oauthEligible: Schema.Boolean,
  reason: SecretStoreHostProtectionReason,
});
export type SecretStoreHostProtection = typeof SecretStoreHostProtection.Type;

export type SecretStoreProtectionEvidence =
  | { readonly platform: "posix"; readonly directoryMode: number }
  | {
      readonly platform: "windows";
      readonly aclVerified: boolean;
      readonly grantsAccessToUntrustedPrincipal: boolean;
    }
  | { readonly platform: "unsupported" }
  | { readonly platform: "inspection_failed" };

/** Converts private host evidence into a bounded integration capability result. */
export const assessSecretStoreHostProtection = (
  evidence: SecretStoreProtectionEvidence,
): SecretStoreHostProtection => {
  switch (evidence.platform) {
    case "posix":
      return evidence.directoryMode & 0o077
        ? { oauthEligible: false, reason: "shared_or_untrusted" }
        : { oauthEligible: true, reason: "isolated" };
    case "windows":
      if (!evidence.aclVerified) {
        return { oauthEligible: false, reason: "windows_acl_unverified" };
      }
      return evidence.grantsAccessToUntrustedPrincipal
        ? { oauthEligible: false, reason: "shared_or_untrusted" }
        : { oauthEligible: true, reason: "isolated" };
    case "inspection_failed":
      return { oauthEligible: false, reason: "inspection_failed" };
    case "unsupported":
      return { oauthEligible: false, reason: "unsupported_platform" };
  }
};

export const inspectSecretStoreHostProtection = (
  secretDirectory: string,
): Effect.Effect<SecretStoreHostProtection, never, FileSystem.FileSystem> => {
  if (process.platform === "win32") {
    // chmod success is not ACL evidence. OAuth remains disabled until the
    // Windows package supplies an effective ACL inspector.
    return Effect.succeed(
      assessSecretStoreHostProtection({
        platform: "windows",
        aclVerified: false,
        grantsAccessToUntrustedPrincipal: false,
      }),
    );
  }
  if (process.platform !== "linux" && process.platform !== "darwin") {
    return Effect.succeed(assessSecretStoreHostProtection({ platform: "unsupported" }));
  }
  return FileSystem.FileSystem.pipe(
    Effect.flatMap((fileSystem) => fileSystem.stat(secretDirectory)),
    Effect.map((info) =>
      assessSecretStoreHostProtection({ platform: "posix", directoryMode: info.mode }),
    ),
    Effect.orElseSucceed(() => assessSecretStoreHostProtection({ platform: "inspection_failed" })),
  );
};
