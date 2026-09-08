// @effect-diagnostics nodeBuiltinImport:off -- Native app registration metadata is read from one packaged resource before the Office service starts.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { OfficeOAuthConfiguration } from "./OfficeOAuth.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const fields = {
  googleClientId: "PULSE_GOOGLE_CLIENT_ID",
  googleClientSecret: "PULSE_GOOGLE_CLIENT_SECRET",
  microsoftClientId: "PULSE_MICROSOFT_CLIENT_ID",
  microsoftTenant: "PULSE_MICROSOFT_TENANT",
} as const;
type ConfigurationField = keyof typeof fields;
const invalidConfiguration = () =>
  new Error(
    "Office OAuth registration configuration is invalid. Check the packaged office-oauth.json file or PULSE OAuth settings.",
  );

function parseConfiguration(value: unknown): OfficeOAuthConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalidConfiguration();
  const result: OfficeOAuthConfiguration = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!Object.hasOwn(fields, key) || typeof entry !== "string" || entry.length > 4096)
      throw invalidConfiguration();
    const normalized = entry.trim();
    if (!normalized) continue;
    if (key === "microsoftTenant" && !/^[a-zA-Z0-9.-]+$/.test(normalized))
      throw invalidConfiguration();
    result[key as ConfigurationField] = normalized;
  }
  return result;
}

/** Only public native-client registration metadata is selected; unrelated environment values are ignored. */
export function officeOAuthConfigurationFromEnvironment(
  env: Environment,
): OfficeOAuthConfiguration {
  const selected: Record<string, string> = {};
  for (const [field, variable] of Object.entries(fields)) {
    const value = env[variable];
    if (value !== undefined) selected[field] = value;
  }
  return parseConfiguration(selected);
}

/** Account tokens and credentials are never loaded here. The optional file contains app registration metadata. */
export async function loadOfficeOAuthConfiguration(options: {
  resourcesDirectory: string;
  env?: Environment;
}): Promise<OfficeOAuthConfiguration> {
  const environment = officeOAuthConfigurationFromEnvironment(options.env ?? process.env);
  const path = NodePath.join(NodePath.resolve(options.resourcesDirectory), "office-oauth.json");
  let content: string;
  try {
    const metadata = await NodeFSP.lstat(path);
    if (!metadata.isFile() || metadata.size > 65536) throw invalidConfiguration();
    content = await NodeFSP.readFile(path, "utf8");
    if (Buffer.byteLength(content, "utf8") > 65536) throw invalidConfiguration();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return environment;
    // oxlint-disable-next-line preserve-caught-error -- Raw filesystem errors may disclose registration metadata or paths through host logging.
    throw new Error(
      "Office OAuth registration configuration could not be read. Check the packaged office-oauth.json file.",
    );
  }
  let bundled: OfficeOAuthConfiguration;
  try {
    bundled = parseConfiguration(JSON.parse(content));
  } catch {
    throw invalidConfiguration();
  }
  return { ...bundled, ...environment };
}
