import { describe, expect, it } from "@effect/vitest";

import { assessSecretStoreHostProtection } from "./SecretStoreHostProtection.ts";

describe("assessSecretStoreHostProtection", () => {
  it("accepts isolated POSIX permissions", () => {
    expect(assessSecretStoreHostProtection({ platform: "posix", directoryMode: 0o700 })).toEqual({
      oauthEligible: true,
      reason: "isolated",
    });
  });

  it("rejects permissions shared with a group or other users", () => {
    expect(assessSecretStoreHostProtection({ platform: "posix", directoryMode: 0o750 })).toEqual({
      oauthEligible: false,
      reason: "shared_or_untrusted",
    });
  });

  it("requires verified effective Windows ACL evidence", () => {
    expect(
      assessSecretStoreHostProtection({
        platform: "windows",
        aclVerified: false,
        grantsAccessToUntrustedPrincipal: false,
      }),
    ).toEqual({ oauthEligible: false, reason: "windows_acl_unverified" });
  });

  it("rejects a verified Windows ACL with an untrusted grant", () => {
    expect(
      assessSecretStoreHostProtection({
        platform: "windows",
        aclVerified: true,
        grantsAccessToUntrustedPrincipal: true,
      }),
    ).toEqual({ oauthEligible: false, reason: "shared_or_untrusted" });
  });

  it("fails closed when inspection fails", () => {
    expect(assessSecretStoreHostProtection({ platform: "inspection_failed" })).toEqual({
      oauthEligible: false,
      reason: "inspection_failed",
    });
  });
});
