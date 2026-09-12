import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git, writeJson } from "./pipeline.mjs";

export const featureSuites = [
  { id: "managed-skills", file: "apps/server/src/skills/ManagedSkillStore.test.ts" },
  { id: "mcp-preflight", file: "apps/server/src/mcp/PulseMcpPreflight.test.ts" },
  { id: "dictation-lifecycle", file: "apps/web/src/voice/pulseDictation.test.ts" },
];

export function runFeatureSuites(root, run, exists = existsSync) {
  const suites = featureSuites.map((suite) => {
    if (!exists(join(root, suite.file))) return { ...suite, state: "missing" };
    try {
      const result = run(suite);
      return { ...suite, state: result.status === 0 ? "passed" : "failed" };
    } catch (error) {
      return { ...suite, state: "failed", error: error.message };
    }
  });
  return {
    scope: "Pulse module foundations only; not UI/provider or packaged-app acceptance",
    state: suites.every((suite) => suite.state === "passed") ? "foundations-passed" : "blocked",
    releaseEligible: false,
    suites,
    remaining: [
      "Skills invocation and management integration",
      "MCP provider and composer integration",
      "Dictation capture and backend integration",
      "Packaged-app and Windows verification",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const directory = join(root, ".t3", "upstream-updates", "features");
  mkdirSync(directory, { recursive: true });
  const report = runFeatureSuites(root, (suite) => {
    const result = spawnSync(
      process.execPath,
      [join(root, "node_modules/vite-plus/bin/vp"), "test", "run", suite.file],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, CI: "true" },
      },
    );
    writeFileSync(
      join(directory, `${suite.id}.log`),
      `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
    );
    return result;
  });
  Object.assign(report, {
    checkedAt: new Date().toISOString(),
    platform: process.platform,
    pulseSha: git(root, ["rev-parse", "HEAD"]),
    dirty: Boolean(git(root, ["status", "--porcelain"])),
  });
  writeJson(join(directory, "result.json"), report);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.state === "foundations-passed" ? 0 : 1;
}
