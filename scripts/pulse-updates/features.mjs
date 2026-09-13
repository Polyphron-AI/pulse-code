import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git, writeJson } from "./pipeline.mjs";

export const featureSuites = [
  { id: "managed-skills", file: "apps/server/src/skills/ManagedSkillStore.test.ts" },
  { id: "mcp-preflight", file: "apps/server/src/mcp/PulseMcpPreflight.test.ts" },
  { id: "mcp-connections", file: "apps/server/src/mcp/PulseMcpConfigService.test.ts" },
  { id: "dictation-lifecycle", file: "apps/web/src/voice/pulseDictation.test.ts" },
  { id: "dictation-capture", file: "apps/web/src/voice/mediaRecorderCapture.test.ts" },
  { id: "dictation-groq", file: "apps/server/src/voice/groqTranscription.test.ts" },
  { id: "dictation-parakeet", file: "apps/web/src/voice/parakeetTranscription.test.ts" },
  { id: "managed-skills-library", file: "apps/server/src/skills/ManagedSkillLibrary.test.ts" },
  { id: "managed-skills-import", file: "apps/web/src/skills/managedSkills.test.ts" },
  { id: "managed-skills-panel", file: "apps/web/src/skills/ManagedSkillsPanel.test.tsx" },
  { id: "managed-skills-rpc", file: "apps/server/src/skills/ManagedSkillRpc.test.ts" },
  { id: "managed-skills-contracts", file: "packages/contracts/src/pulseSkills.test.ts" },
  { id: "managed-skills-settings", file: "apps/web/src/skills/ManagedSkillsSettings.test.tsx" },
  { id: "mcp-contracts", file: "packages/contracts/src/pulseMcp.test.ts" },
  { id: "mcp-rpc", file: "apps/server/src/mcp/PulseMcpRpc.test.ts" },
  { id: "mcp-form", file: "apps/web/src/mcp/mcpForm.test.ts" },
  { id: "mcp-panel", file: "apps/web/src/mcp/McpConnectionsPanel.test.tsx" },
  { id: "mcp-settings", file: "apps/web/src/mcp/McpConnectionsSettings.test.tsx" },
  { id: "dictation-http", file: "apps/server/src/voice/http.test.ts" },
  {
    id: "dictation-client",
    file: "packages/client-runtime/src/voice-input/pulseDictation.test.ts",
  },
  {
    id: "environment-http-auth",
    file: "packages/client-runtime/src/state/environmentHttpAuth.test.ts",
  },
  { id: "rpc-authorization", file: "apps/server/src/auth/RpcAuthorization.test.ts" },
  {
    id: "managed-skills-websocket",
    file: "apps/server/src/server.test.ts",
    testNamePattern: "managed skill|Pulse MCP|Pulse dictation",
  },
];

export function featureTestArgs(root, suite) {
  // Prepared upstream candidates live under .t3 and must not enter the host test run.
  return [
    join(root, "node_modules/vite-plus/bin/vp"),
    "test",
    "run",
    suite.file,
    ...(suite.testNamePattern ? ["-t", suite.testNamePattern] : []),
    "--exclude",
    "**/.t3/**",
  ];
}

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
      "Skills provider invocation and composer integration",
      "MCP provider and composer integration",
      "Dictation settings and composer integration",
      "Packaged-app and Windows verification",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const directory = join(root, ".t3", "upstream-updates", "features");
  mkdirSync(directory, { recursive: true });
  const report = runFeatureSuites(root, (suite) => {
    const result = spawnSync(process.execPath, featureTestArgs(root, suite), {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, CI: "true" },
    });
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
