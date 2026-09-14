import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { ProjectId, PulseMcpPreparationId, ThreadId } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import { ProviderSessionStartInput } from "./provider.ts";

const ConnectionId = Schema.String.check(Schema.isPattern(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/));
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const Value = Schema.String.check(Schema.isMaxLength(24_000));
const Values = Schema.Record(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  Schema.Union([
    Schema.Struct({ type: Schema.Literal("literal"), value: Value }),
    Schema.Struct({ type: Schema.Literal("secret"), value: Value }),
    Schema.Struct({ type: Schema.Literal("retain-secret") }),
  ]),
).check(Schema.isMaxProperties(128));

export const PulseMcpConnectionInput = Schema.Struct({
  id: ConnectionId,
  name: Label,
  createOnly: Schema.optionalKey(Schema.Boolean),
  config: Schema.Union([
    Schema.Struct({
      transport: Schema.Literal("http"),
      url: Schema.String.check(Schema.isMaxLength(2_048)),
      headers: Schema.optionalKey(Values),
    }),
    Schema.Struct({
      transport: Schema.Literal("stdio"),
      command: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
      args: Schema.optionalKey(
        Schema.Array(Schema.String.check(Schema.isMaxLength(8_192))).check(Schema.isMaxLength(128)),
      ),
      cwd: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2_048))),
      env: Schema.optionalKey(Values),
    }),
  ]),
});
export type PulseMcpConnectionInput = typeof PulseMcpConnectionInput.Type;

const PublicValue = Schema.Union([
  Schema.Struct({ type: Schema.Literal("literal"), value: Value }),
  Schema.Struct({ type: Schema.Literal("secret"), configured: Schema.Literal(true) }),
]);
const PublicValues = Schema.Record(Schema.String, PublicValue);

export const PulseMcpConnection = Schema.Struct({
  id: ConnectionId,
  name: Label,
  config: Schema.Union([
    Schema.Struct({ transport: Schema.Literal("http"), url: Schema.String, headers: PublicValues }),
    Schema.Struct({
      transport: Schema.Literal("stdio"),
      command: Schema.String,
      args: Schema.Array(Schema.String),
      cwd: Schema.optionalKey(Schema.String),
      env: PublicValues,
    }),
  ]),
});
export type PulseMcpConnection = typeof PulseMcpConnection.Type;

export const PulseMcpDiscoverySource = Schema.Literals(["claude", "codex", "opencode"]);
export const PulseMcpDiscoveryCandidate = Schema.Struct({
  id: ConnectionId,
  name: Label,
  source: PulseMcpDiscoverySource,
  transport: Schema.Literals(["stdio", "http", "unsupported"]),
  importable: Schema.Boolean,
  reason: Schema.optionalKey(Schema.String),
  following: Schema.optionalKey(Schema.Boolean),
});
export type PulseMcpDiscoveryCandidate = typeof PulseMcpDiscoveryCandidate.Type;

const ConnectionIds = Schema.Array(ConnectionId).check(Schema.isMaxLength(128));
const Connections = Schema.Array(PulseMcpConnection).check(Schema.isMaxLength(128));

export class PulseMcpError extends Schema.TaggedError<PulseMcpError>()("PulseMcpError", {
  message: Schema.String,
}) {}

const errors = Schema.Union([PulseMcpError, EnvironmentAuthorizationError]);
export const PULSE_MCP_METHODS = {
  list: "pulse.mcp.list",
  upsert: "pulse.mcp.upsert",
  remove: "pulse.mcp.remove",
  getProviderDefault: "pulse.mcp.getProviderDefault",
  setProviderDefault: "pulse.mcp.setProviderDefault",
  getProjectDefault: "pulse.mcp.getProjectDefault",
  setProjectDefault: "pulse.mcp.setProjectDefault",
  resetProjectDefault: "pulse.mcp.resetProjectDefault",
  getThreadOverride: "pulse.mcp.getThreadOverride",
  setThreadOverride: "pulse.mcp.setThreadOverride",
  resetThreadOverride: "pulse.mcp.resetThreadOverride",
  prepareTurn: "pulse.mcp.prepareTurn",
  discover: "pulse.mcp.discover",
  importDiscovered: "pulse.mcp.importDiscovered",
  nativeInventory: "pulse.mcp.nativeInventory",
  setDiscoveryFollow: "pulse.mcp.setDiscoveryFollow",
} as const;

const Selection = Schema.Struct({ connectionIds: ConnectionIds });
const OptionalSelection = Schema.Struct({ connectionIds: Schema.optionalKey(ConnectionIds) });
const PreparedConnectionBase = {
  connectionId: ConnectionId,
  name: Label,
} as const;
const PreparedConnection = Schema.Union([
  Schema.Struct({ ...PreparedConnectionBase, status: Schema.Literal("ready") }),
  Schema.Struct({ ...PreparedConnectionBase, status: Schema.Literal("unknown") }),
  Schema.Struct({
    ...PreparedConnectionBase,
    status: Schema.Literal("failed"),
    message: Schema.String,
  }),
]);

export const PulseMcpPrepareTurnInput = Schema.Struct({
  threadId: ThreadId,
  providerSession: ProviderSessionStartInput,
  /** Required for first drafts so project-scoped server tools resolve before projection exists. */
  projectId: Schema.optionalKey(ProjectId),
  /** Omitted resolves the thread override or provider default. Empty selects no managed servers. */
  connectionIds: Schema.optionalKey(ConnectionIds),
  /** One-turn exclusions. They never update the saved thread or provider selection. */
  excludedConnectionIds: Schema.optionalKey(ConnectionIds),
  /** Forces a fresh native startup attempt after a failed preparation. */
  retry: Schema.optionalKey(Schema.Boolean),
});
export type PulseMcpPrepareTurnInput = typeof PulseMcpPrepareTurnInput.Type;

export const PulseMcpPrepareTurnResult = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("ready"),
    preparationId: PulseMcpPreparationId,
    selectedConnectionIds: ConnectionIds,
    connections: Schema.Array(PreparedConnection),
  }),
  Schema.Struct({
    status: Schema.Literal("failed"),
    selectedConnectionIds: ConnectionIds,
    connections: Schema.Array(PreparedConnection),
  }),
  Schema.Struct({
    status: Schema.Literal("unsupported-provider"),
    selectedConnectionIds: ConnectionIds,
  }),
  Schema.Struct({ status: Schema.Literal("active-turn") }),
]);
export type PulseMcpPrepareTurnResult = typeof PulseMcpPrepareTurnResult.Type;

export const PulseMcpRpcs = [
  Rpc.make(PULSE_MCP_METHODS.list, {
    payload: Schema.Struct({}),
    success: Connections,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.upsert, {
    payload: PulseMcpConnectionInput,
    success: PulseMcpConnection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.remove, {
    payload: Schema.Struct({ id: ConnectionId }),
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.discover, {
    payload: Schema.Struct({}),
    success: Schema.Array(PulseMcpDiscoveryCandidate),
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.importDiscovered, {
    payload: Schema.Struct({ source: PulseMcpDiscoverySource, name: Label }),
    success: PulseMcpConnection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.nativeInventory, {
    payload: Schema.Struct({ threadId: ThreadId, providerInstanceId: ProviderInstanceId }),
    success: Schema.Union([
      Schema.Struct({ status: Schema.Literal("unavailable") }),
      Schema.Struct({
        status: Schema.Literal("available"),
        servers: Schema.Array(
          Schema.Struct({
            name: Label,
            status: Schema.Literals(["ready", "unknown", "failed", "auth-required"]),
          }),
        ),
      }),
    ]),
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.setDiscoveryFollow, {
    payload: Schema.Struct({ source: PulseMcpDiscoverySource, followNew: Schema.Boolean }),
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.getProviderDefault, {
    payload: Schema.Struct({ providerInstanceId: ProviderInstanceId }),
    success: OptionalSelection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.setProviderDefault, {
    payload: Schema.Struct({
      providerInstanceId: ProviderInstanceId,
      connectionIds: ConnectionIds,
    }),
    success: Selection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.getProjectDefault, {
    payload: Schema.Struct({ projectId: ProjectId, providerInstanceId: ProviderInstanceId }),
    success: OptionalSelection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.setProjectDefault, {
    payload: Schema.Struct({
      projectId: ProjectId,
      providerInstanceId: ProviderInstanceId,
      connectionIds: ConnectionIds,
    }),
    success: Selection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.resetProjectDefault, {
    payload: Schema.Struct({ projectId: ProjectId, providerInstanceId: ProviderInstanceId }),
    success: OptionalSelection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.getThreadOverride, {
    payload: Schema.Struct({ threadId: ThreadId }),
    success: OptionalSelection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.setThreadOverride, {
    payload: Schema.Struct({ threadId: ThreadId, connectionIds: ConnectionIds }),
    success: Selection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.resetThreadOverride, {
    payload: Schema.Struct({ threadId: ThreadId }),
    success: OptionalSelection,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.prepareTurn, {
    payload: PulseMcpPrepareTurnInput,
    success: PulseMcpPrepareTurnResult,
    error: errors,
  }),
] as const;
