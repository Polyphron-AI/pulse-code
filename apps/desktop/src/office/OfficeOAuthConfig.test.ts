// @effect-diagnostics nodeBuiltinImport:off -- Tests read only synthetic registration metadata in owned temporary directories.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  loadOfficeOAuthConfiguration,
  officeOAuthConfigurationFromEnvironment,
} from "./OfficeOAuthConfig.ts";

const directories: string[] = [];
async function resources(content?: string) {
  const directory = await NodeFSP.mkdtemp(
    NodePath.join(NodeOS.tmpdir(), "pulse-office-oauth-test-"),
  );
  directories.push(directory);
  if (content !== undefined)
    await NodeFSP.writeFile(NodePath.join(directory, "office-oauth.json"), content);
  return directory;
}
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const resolved = NodePath.resolve(directory);
    if (
      NodePath.dirname(resolved) !== NodePath.resolve(NodeOS.tmpdir()) ||
      !NodePath.basename(resolved).startsWith("pulse-office-oauth-test-")
    )
      throw new Error("Invalid test cleanup path");
    await NodeFSP.rm(resolved, { recursive: true, force: true });
  }
});

describe("Office OAuth packaged configuration", () => {
  it("allows missing registration metadata without reading other files", async () => {
    const directory = await resources();
    await NodeFSP.writeFile(
      NodePath.join(directory, "credentials.json"),
      "not registration metadata",
    );
    expect(await loadOfficeOAuthConfiguration({ resourcesDirectory: directory, env: {} })).toEqual(
      {},
    );
    expect(
      await loadOfficeOAuthConfiguration({
        resourcesDirectory: directory,
        env: { PULSE_GOOGLE_CLIENT_ID: "google" },
      }),
    ).toEqual({ googleClientId: "google" });
  });

  it("loads bundled native-client metadata and applies explicit environment overrides", async () => {
    const directory = await resources(
      JSON.stringify({
        googleClientId: "bundled-google",
        googleClientSecret: "native-metadata",
        microsoftClientId: "bundled-microsoft",
        microsoftTenant: "common",
      }),
    );
    expect(
      await loadOfficeOAuthConfiguration({
        resourcesDirectory: directory,
        env: {
          PULSE_GOOGLE_CLIENT_ID: " environment-google ",
          PULSE_MICROSOFT_TENANT: "organizations",
        },
      }),
    ).toEqual({
      googleClientId: "environment-google",
      googleClientSecret: "native-metadata",
      microsoftClientId: "bundled-microsoft",
      microsoftTenant: "organizations",
    });
  });

  it("provides a pure packaging helper that includes only supported nonblank values", () => {
    expect(
      officeOAuthConfigurationFromEnvironment({
        PULSE_GOOGLE_CLIENT_ID: " google ",
        PULSE_GOOGLE_CLIENT_SECRET: "  ",
        PULSE_MICROSOFT_CLIENT_ID: undefined,
        UNRELATED_CREDENTIAL: "never include",
      }),
    ).toEqual({ googleClientId: "google" });
  });

  it.each([
    '{"googleClientId":',
    '{"googleClientId":123}',
    '{"unknownToken":"sensitive-marker"}',
    '{"microsoftTenant":"../sensitive-marker"}',
    '"sensitive-marker"',
    "null",
    "[]",
  ])("rejects malformed configuration without exposing contents (%#)", async (content) => {
    const directory = await resources(content);
    const loading = loadOfficeOAuthConfiguration({ resourcesDirectory: directory, env: {} });
    await expect(loading).rejects.toThrow("configuration is invalid");
    await expect(loading).rejects.not.toThrow("sensitive-marker");
  });

  it("rejects an oversized registration file with a bounded generic error", async () => {
    const directory = await resources("sensitive-marker".repeat(5000));
    await expect(
      loadOfficeOAuthConfiguration({ resourcesDirectory: directory, env: {} }),
    ).rejects.toThrow("configuration could not be read");
  });

  it("rejects malformed environment overrides without exposing their values", () => {
    expect(() =>
      officeOAuthConfigurationFromEnvironment({
        PULSE_MICROSOFT_TENANT: "https://sensitive-marker",
      }),
    ).toThrow("configuration is invalid");
    expect(() =>
      officeOAuthConfigurationFromEnvironment({
        PULSE_GOOGLE_CLIENT_ID: "sensitive-marker".repeat(500),
      }),
    ).toThrow("configuration is invalid");
  });
});
