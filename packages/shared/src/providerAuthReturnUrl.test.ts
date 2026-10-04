import { describe, expect, it } from "vite-plus/test";
import { providerAuthReturnUrl } from "./providerAuthReturnUrl.ts";
import { DESKTOP_URL_SCHEME, DESKTOP_DEVELOPMENT_URL_SCHEME } from "./productIdentity.ts";

describe("provider auth return destinations", () => {
  it.each(["t3code", "t3code-dev", DESKTOP_URL_SCHEME, DESKTOP_DEVELOPMENT_URL_SCHEME])(
    "returns to %s Welcome and the selected settings instance",
    (scheme) => {
      expect(providerAuthReturnUrl(`${scheme}://app/welcome?code=secret#agents:machine-id`)).toBe(
        `${scheme}://app/welcome#agents:machine-id`,
      );
      expect(
        providerAuthReturnUrl(`${scheme}://app/settings/providers?instanceId=work&code=secret`),
      ).toBe(`${scheme}://app/settings/providers?instanceId=work`);
    },
  );
  it.each([
    `${DESKTOP_URL_SCHEME}://attacker/welcome`,
    `${DESKTOP_DEVELOPMENT_URL_SCHEME}://app/auth/callback`,
    "t3code://attacker/welcome",
    "t3code://app:123/welcome",
    "t3code://app/auth/callback",
    "t3code://user@ app/welcome",
    "t3code://app/welcome/../evil",
    "https://attacker.example/welcome",
    "file:///welcome",
    "javascript:alert(1)",
  ])("rejects %s", (url) => expect(providerAuthReturnUrl(url)).toBeUndefined());
});
