import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  readonly wardenCliConfigFile?: string;
}

const sessionsByThread = new Map<ThreadId, McpProviderSessionConfig>();

export function setMcpProviderSession(config: McpProviderSessionConfig): void {
  sessionsByThread.set(config.threadId, config);
}

export function readMcpProviderSession(threadId: ThreadId): McpProviderSessionConfig | undefined {
  return sessionsByThread.get(threadId);
}

export function clearMcpProviderSession(threadId: ThreadId): void {
  sessionsByThread.delete(threadId);
}

export function clearAllMcpProviderSessions(): void {
  sessionsByThread.clear();
}

/** Only the file path crosses the child environment; no broker or manager credential does. */
export function withWardenCliEnvironment(
  environment: NodeJS.ProcessEnv,
  session: McpProviderSessionConfig | undefined,
): NodeJS.ProcessEnv {
  const { PULSE_WARDEN_IDENTITY_FILE: _inherited, ...clean } = environment;
  return session?.wardenCliConfigFile
    ? { ...clean, PULSE_WARDEN_IDENTITY_FILE: session.wardenCliConfigFile }
    : { ...clean, PULSE_WARDEN_IDENTITY_FILE: undefined };
}
export function listMcpProviderSessions(): ReadonlyArray<McpProviderSessionConfig> {
  return Array.from(sessionsByThread.values());
}
