import type { ProviderInstanceEnvironment } from "@t3tools/contracts";

export function mergeProviderInstanceEnvironment(
  environment: ProviderInstanceEnvironment | undefined,
  platform: NodeJS.Platform,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!environment || environment.length === 0) {
    return baseEnv;
  }

  const next: NodeJS.ProcessEnv = { ...baseEnv };
  for (const variable of environment) {
    if (platform === "win32") {
      const normalizedName = variable.name.toUpperCase();
      for (const inheritedName of Object.keys(next)) {
        if (inheritedName.toUpperCase() === normalizedName) {
          delete next[inheritedName];
        }
      }
    }
    next[variable.name] = variable.value;
  }
  return next;
}
