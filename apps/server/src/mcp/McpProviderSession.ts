import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type { ProviderManagedMcpServer } from "../provider/Services/ProviderAdapter.ts";

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  readonly managedServers?: ReadonlyArray<ProviderManagedMcpServer>;
  /** Capabilities the credential grants ("preview", "device"). */
  readonly capabilities: ReadonlySet<string>;
  /**
   * Set when the session may drive devices. Adapters spread this into the
   * provider subprocess environment so the `agent-device` CLI is on PATH and
   * already pointed at the server's daemon; the agent never handles a token.
   */
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
}

/** Provider env with the device variables applied over `base`, or `base` untouched. */
export function withAgentDeviceEnvironment(
  base: NodeJS.ProcessEnv,
  config: Pick<McpProviderSessionConfig, "agentDeviceEnvironment"> | undefined,
): NodeJS.ProcessEnv {
  const extra = config?.agentDeviceEnvironment;
  if (!extra) return base;
  const separator = extra.PATH_SEPARATOR ?? ":";
  const basePath = base.PATH ?? base.Path;
  const { PATH: shimDir, PATH_SEPARATOR: _separator, ...rest } = extra;
  return {
    ...base,
    ...rest,
    ...(shimDir ? { PATH: basePath ? `${shimDir}${separator}${basePath}` : shimDir } : {}),
  };
}

const sessionsByThread = new Map<ThreadId, McpProviderSessionConfig>();
const managedServersByThread = new Map<ThreadId, ReadonlyArray<ProviderManagedMcpServer>>();

export function setMcpProviderSession(config: McpProviderSessionConfig): void {
  const current = sessionsByThread.get(config.threadId);
  sessionsByThread.set(config.threadId, {
    ...config,
    ...(current?.managedServers ? { managedServers: current.managedServers } : {}),
  });
}

export function setManagedMcpServers(
  threadId: ThreadId,
  servers: ReadonlyArray<ProviderManagedMcpServer>,
): void {
  managedServersByThread.set(threadId, servers);
}

export function readManagedMcpServers(threadId: ThreadId): ReadonlyArray<ProviderManagedMcpServer> {
  return managedServersByThread.get(threadId) ?? [];
}

export function readMcpProviderSession(threadId: ThreadId): McpProviderSessionConfig | undefined {
  return sessionsByThread.get(threadId);
}

export function clearMcpProviderSession(threadId: ThreadId): void {
  sessionsByThread.delete(threadId);
  managedServersByThread.delete(threadId);
}

export function clearMcpBrowserSession(threadId: ThreadId): void {
  sessionsByThread.delete(threadId);
}

export function clearAllMcpProviderSessions(): void {
  sessionsByThread.clear();
  managedServersByThread.clear();
}
