import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git, writeJson } from "./pipeline.mjs";

export const featureSuites = [
  {
    id: "mail-linked-task-navigation",
    file: "apps/web/src/components/workspace/mail/MailSpace.test.tsx",
  },
  { id: "workspace-basic-tasks", file: "apps/server/src/workspace/WorkspaceTools.test.ts" },
  {
    id: "workspace-automation-binding",
    file: "apps/server/src/workspace/WorkspaceAutomation.test.ts",
  },
  {
    id: "workspace-automation-real-launch",
    file: "apps/server/src/orchestration-v2/ThreadLaunchService.test.ts",
    testNamePattern: "workspace automation idle",
  },
  { id: "workspace-task-client", file: "apps/web/src/components/workspace/ProjectTasks.test.tsx" },
  {
    id: "workspace-tools-client",
    file: "apps/web/src/components/workspace/WorkspaceToolsPanel.test.tsx",
  },
  {
    id: "workspace-code-native-menu",
    file: "apps/web/src/components/workspace/WorkspaceNativeActions.test.ts",
  },
  {
    id: "workspace-tools-remote-refresh",
    file: "packages/client-runtime/src/state/workspaceTools.test.ts",
  },
  { id: "drive-picker-client", file: "apps/web/src/components/workspace/DriveFiles.test.tsx" },
  { id: "drive-reader-lifecycle", file: "apps/server/src/drive/DriveService.test.ts" },
  { id: "drive-settings-client", file: "apps/web/src/components/settings/DriveSettings.test.tsx" },
  { id: "drive-remote-binding", file: "packages/client-runtime/src/state/drive.test.ts" },
  {
    id: "drive-confirmed-mcp",
    file: "apps/server/src/mcp/toolkits/workspace/handlers.test.ts",
    testNamePattern: "Drive",
  },
  {
    id: "workspace-suggestion-selected-model",
    file: "apps/server/src/textGeneration/TextGeneration.test.ts",
    testNamePattern: "workspace suggestions",
  },
  {
    id: "workspace-suggestion-structured-cli",
    file: "apps/server/src/textGeneration/CodexTextGeneration.test.ts",
    testNamePattern: "workspace suggestions",
  },
  {
    id: "workspace-suggestion-remote-decision",
    file: "packages/client-runtime/src/state/workspaceLinks.test.ts",
    testNamePattern: "model suggestion",
  },
  { id: "workspace-suggestions", file: "apps/server/src/workspace/WorkspaceSuggestions.test.ts" },
  {
    id: "workspace-suggestion-discovery",
    file: "apps/server/src/workspace/WorkspaceSuggestionCandidates.test.ts",
  },
  {
    id: "workspace-suggestion-lifecycle",
    file: "apps/server/src/workspace/WorkspaceLinks.test.ts",
    testNamePattern: "suggestion",
  },
  {
    id: "workspace-suggestion-client",
    file: "apps/web/src/components/workspace/SuggestedSection.test.tsx",
  },
  { id: "telegram-api-boundary", file: "apps/server/src/telegram/TelegramBotApi.test.ts" },
  {
    id: "telegram-reader-client",
    file: "apps/web/src/components/workspace/TelegramWorkspace.test.tsx",
  },
  {
    id: "telegram-settings-client",
    file: "apps/web/src/components/settings/TelegramSettings.test.tsx",
  },
  { id: "telegram-received-cache", file: "apps/server/src/telegram/TelegramService.test.ts" },
  {
    id: "telegram-linked-read",
    file: "apps/server/src/mcp/toolkits/workspace/handlers.test.ts",
    testNamePattern: "Telegram",
  },
  { id: "telegram-remote-refresh", file: "packages/client-runtime/src/state/telegram.test.ts" },
  {
    id: "telegram-personal-retirement",
    file: "apps/desktop/src/communications/ChatService.test.ts",
    testNamePattern: "retires personal Telegram",
  },
  {
    id: "mail-approval-recovery-client",
    file: "packages/client-runtime/src/mail/mailApprovals.test.ts",
  },
  {
    id: "mail-reply-client",
    file: "apps/web/src/components/workspace/mail/MailDraftReply.test.tsx",
  },
  {
    id: "mail-conversation-client",
    file: "apps/web/src/components/workspace/mail/MailConversationList.test.tsx",
  },
  {
    id: "mail-conversations",
    file: "apps/server/src/mail/MailImapRead.test.ts",
    testNamePattern: "conversations",
  },
  { id: "mail-reply-readiness", file: "apps/server/src/mail/MailReply.test.ts" },
  {
    id: "mail-accepted-reply-links",
    file: "apps/server/src/mail/MailSendService.test.ts",
    testNamePattern: "accepted reply links",
  },
  {
    id: "workspace-item-actions",
    file: "apps/web/src/components/workspace/WorkspaceItemActions.test.tsx",
  },
  {
    id: "workspace-shared-rail",
    file: "apps/web/src/components/workspace/WorkspaceSpaceSelector.test.tsx",
  },
  {
    id: "workspace-live-link-labels",
    file: "apps/web/src/components/workspace/mail/linkedItems.test.ts",
  },
  {
    id: "workspace-item-send",
    file: "apps/server/src/workspace/linkedItemsTurn.integration.test.ts",
  },
  {
    id: "workspace-project-hub",
    file: "apps/server/src/workspace/WorkspaceLinks.test.ts",
    testNamePattern: "one hop",
  },
  {
    id: "workspace-drive-paste",
    file: "packages/contracts/src/pulseLinks.test.ts",
    testNamePattern: "pasted workspace URLs",
  },
  { id: "managed-skills", file: "apps/server/src/skills/ManagedSkillStore.test.ts" },
  { id: "mcp-preflight", file: "apps/server/src/mcp/PulseMcpPreflight.test.ts" },
  { id: "mcp-connections", file: "apps/server/src/mcp/PulseMcpConfigService.test.ts" },
  { id: "bundled-voice-packaging", file: "scripts/lib/bundled-parakeet.test.ts" },
  { id: "dictation-lifecycle", file: "apps/web/src/voice/pulseDictation.test.ts" },
  { id: "dictation-capture", file: "apps/web/src/voice/mediaRecorderCapture.test.ts" },
  { id: "dictation-settings", file: "apps/web/src/voice/DictationSettings.test.tsx" },
  { id: "dictation-preferences", file: "apps/web/src/voice/dictationPreferences.test.ts" },
  { id: "dictation-composer", file: "apps/web/src/voice/composerDictationLogic.test.ts" },
  { id: "dictation-groq", file: "apps/server/src/voice/groqTranscription.test.ts" },
  { id: "dictation-parakeet", file: "apps/web/src/voice/parakeetTranscription.test.ts" },
  { id: "managed-skills-library", file: "apps/server/src/skills/ManagedSkillLibrary.test.ts" },
  { id: "managed-skills-import", file: "apps/web/src/skills/managedSkills.test.ts" },
  { id: "managed-skills-panel", file: "apps/web/src/skills/ManagedSkillsPanel.test.tsx" },
  { id: "managed-skills-rpc", file: "apps/server/src/skills/ManagedSkillRpc.test.ts" },
  { id: "managed-skills-contracts", file: "packages/contracts/src/pulseSkills.test.ts" },
  { id: "managed-skills-settings", file: "apps/web/src/skills/ManagedSkillsSettings.test.tsx" },
  { id: "managed-skills-drafts", file: "apps/web/src/composerDraftStore.test.ts" },
  {
    id: "pulse-queued-messages",
    file: "apps/server/src/orchestration-v2/Orchestrator.control-reads.test.ts",
    testNamePattern: "persists Pulse selections",
  },
  { id: "managed-skills-picker", file: "apps/web/src/skills/managedSkillPicker.test.ts" },
  {
    id: "managed-skills-subprocess",
    file: "apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.test.ts",
    testNamePattern: "sends currency-sigil skill mentions to Codex",
  },
  {
    id: "managed-skills-events",
    file: "apps/server/src/orchestration-v2/Orchestrator.control-reads.test.ts",
    testNamePattern: "persists Pulse selections",
  },
  {
    id: "managed-skills-provider",
    file: "apps/server/src/orchestration-v2/ProviderTurnStartService.test.ts",
    testNamePattern: "rejects unavailable managed skills before opening the provider",
  },
  {
    id: "managed-skills-adapter",
    file: "apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.test.ts",
    testNamePattern: "skill mentions",
  },
  {
    id: "managed-skills-native-input",
    file: "apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts",
    testNamePattern: "managed.*skill",
  },
  { id: "mcp-contracts", file: "packages/contracts/src/pulseMcp.test.ts" },
  { id: "mcp-rpc", file: "apps/server/src/mcp/PulseMcpRpc.test.ts" },
  { id: "mcp-form", file: "apps/web/src/mcp/mcpForm.test.ts" },
  { id: "mcp-panel", file: "apps/web/src/mcp/McpConnectionsPanel.test.tsx" },
  { id: "mcp-settings", file: "apps/web/src/mcp/McpConnectionsSettings.test.tsx" },
  { id: "mcp-picker", file: "apps/web/src/mcp/managedMcpPickerLogic.test.ts" },
  { id: "mcp-send-pause", file: "apps/web/src/mcp/McpSendPause.test.tsx" },
  { id: "mcp-draft-boundary", file: "apps/web/src/mcp/prepareMcpSubmission.test.ts" },
  {
    id: "thread-handoff-context",
    file: "apps/server/src/orchestration-v2/threadHandoffContext.test.ts",
  },
  {
    id: "thread-handoff-service",
    file: "apps/server/src/orchestration-v2/ThreadHandoffService.test.ts",
  },
  { id: "mcp-pinned-submission", file: "apps/web/src/mcp/preparePinnedMcpSubmission.test.ts" },
  { id: "mcp-composer-lifecycle", file: "apps/web/src/mcp/useManagedMcpComposer.test.tsx" },
  { id: "mcp-preparation", file: "apps/server/src/mcp/PulseMcpPreparation.test.ts" },
  {
    id: "mcp-provider-admission",
    file: "apps/server/src/mcp/PulseProviderService.test.ts",
    testNamePattern: "Pulse provider MCP admission",
  },
  {
    id: "mcp-queued-admission",
    file: "apps/server/src/orchestration-v2/ProviderTurnStartService.test.ts",
    testNamePattern: "rejects unavailable queued MCP selections before opening the provider",
  },
  {
    id: "mcp-provider-configuration",
    file: "apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.test.ts",
    testNamePattern: "managed MCP",
  },
  {
    id: "mcp-claude-provider-configuration",
    file: "apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts",
    testNamePattern: "managed MCP",
  },
  {
    id: "mcp-opencode-provider-configuration",
    file: "apps/server/src/orchestration-v2/Adapters/OpenCodeAdapterV2.test.ts",
    testNamePattern: "confirms managed MCP readiness only for an owned connected server",
  },
  {
    id: "mcp-native-readiness",
    file: "apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts",
    testNamePattern: "managed MCP preflight",
  },
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
    id: "websocket-protocol",
    file: "apps/server/src/ws.test.ts",
    testNamePattern: "accepts only the current orchestration protocol before websocket RPC setup",
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
    "--reporter=json",
    "--outputFile",
    join(root, ".t3", "upstream-updates", "features", `${suite.id}.tests.json`),
    "--exclude",
    "**/.t3/**",
  ];
}

export function runFeatureSuites(root, run, exists = existsSync) {
  const suites = featureSuites.map((suite) => {
    if (!exists(join(root, suite.file))) return { ...suite, state: "missing" };
    try {
      const result = run(suite);
      if (result.status !== 0) return { ...suite, state: "failed" };
      const report = result.testReport ?? JSON.parse(result.stdout);
      const passedTests = report.numPassedTests;
      return {
        ...suite,
        state: passedTests > 0 ? "passed" : "uncovered",
        passedTests,
      };
    } catch (error) {
      return { ...suite, state: "failed", error: error.message };
    }
  });
  return {
    scope:
      "Pulse modules, managed-skills invocation, Codex MCP preparation and dictation integration; not packaged-app acceptance",
    state: suites.every((suite) => suite.state === "passed") ? "foundations-passed" : "blocked",
    releaseEligible: false,
    suites,
    remaining: [
      "V2 websocket-integrated managed skills, Pulse MCP and dictation acceptance",
      "Managed skills release acceptance on packaged desktop",
      "MCP real-provider and packaged acceptance; new-worktree preparation",
      "Dictation real-model and physical-device acceptance",
      "Packaged-app and Windows verification",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const directory = join(root, ".t3", "upstream-updates", "features");
  mkdirSync(directory, { recursive: true });
  const report = runFeatureSuites(root, (suite) => {
    const testReportFile = join(directory, `${suite.id}.tests.json`);
    rmSync(testReportFile, { force: true });
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
    if (existsSync(testReportFile)) {
      result.testReport = JSON.parse(readFileSync(testReportFile, "utf8"));
    }
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
