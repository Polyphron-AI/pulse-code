import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const McpServerId = TrimmedNonEmptyString.check(
  Schema.isPattern(/^(?!t3-code$)[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
);
export const McpConnection = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("stdio"),
    command: TrimmedNonEmptyString,
    args: Schema.optionalKey(Schema.Array(Schema.String)),
    env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal("http"),
    url: TrimmedNonEmptyString.check(Schema.isPattern(/^https?:\/\/[^\s]+$/)),
    headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
]);
export type McpConnection = typeof McpConnection.Type;

export const McpServer = Schema.Struct({
  name: TrimmedNonEmptyString,
  // Empty means opt-in only. Defaults are specific to a provider instance.
  defaultProviders: Schema.Array(ProviderInstanceId),
  connection: Schema.optionalKey(McpConnection),
  connectionRedacted: Schema.optionalKey(Schema.Boolean),
});
export type McpServer = typeof McpServer.Type;
export const McpServers = Schema.Record(McpServerId, McpServer);
export type McpServers = typeof McpServers.Type;
export const ThreadMcpOverrides = Schema.Record(
  Schema.String,
  Schema.Record(McpServerId, Schema.NullOr(Schema.Boolean)),
);
export type ThreadMcpOverrides = typeof ThreadMcpOverrides.Type;

export function isMcpEnabled(server: McpServer, providerId: string, override?: boolean | null) {
  return override ?? server.defaultProviders.some((id) => id === providerId);
}

export function supportsThreadMcp(driver: string): boolean {
  return ["codex", "claudeAgent", "cursor", "grok"].includes(driver);
}
