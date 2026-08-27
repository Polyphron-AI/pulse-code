import * as NodeSocket from "@effect/platform-node/NodeSocket";
import {
  AuthAdministrativeScopes,
  ProjectId,
  WS_METHODS,
  WsRpcGroup,
  type ProjectReportListResult,
} from "@t3tools/contracts";
import * as Console from "effect/Console";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as References from "effect/References";
import * as Schema from "effect/Schema";
import { Command, Flag, GlobalFlag } from "effect/unstable/cli";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerConfig from "../config.ts";
import { readPersistedServerRuntimeState } from "../serverRuntimeState.ts";
import { projectLocationFlags, resolveCliAuthConfig } from "./config.ts";

export interface ProjectActionRequest {
  readonly protocol_version: 1;
  readonly request_id: string;
  readonly action: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

type ProjectActionErrorCode =
  | "capability_unavailable"
  | "invalid_request"
  | "transport_unavailable"
  | "unsupported_action";

export type ProjectActionResponse = {
  readonly protocol_version: 1;
  readonly request_id: string;
  readonly action: string;
  readonly ok: boolean;
} & (
  | { readonly data: unknown }
  | {
      readonly error: {
        readonly code: ProjectActionErrorCode;
        readonly message: string;
        readonly retryable: boolean;
      };
    }
);

class IssuesCliTransportError extends Schema.TaggedErrorClass<IssuesCliTransportError>()(
  "IssuesCliTransportError",
  { cause: Schema.Defect() },
) {}

type ProjectReportRpc = (input: {
  readonly projectId: ProjectId;
  readonly cursor?: string;
  readonly limit?: number;
}) => Effect.Effect<ProjectReportListResult, object>;

const responseBase = (request: Pick<ProjectActionRequest, "request_id" | "action">) => ({
  protocol_version: 1 as const,
  request_id: request.request_id,
  action: request.action,
});

const errorResponse = (
  request: Pick<ProjectActionRequest, "request_id" | "action">,
  code: ProjectActionErrorCode,
  message: string,
  retryable = false,
): ProjectActionResponse => ({
  ...responseBase(request),
  ok: false,
  error: { code, message, retryable },
});

const asObject = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

export const decodeProjectActionRequest = (raw: string): ProjectActionRequest => {
  const parsed = JSON.parse(raw) as unknown;
  const object = asObject(parsed);
  if (
    object?.protocol_version !== 1 ||
    typeof object.request_id !== "string" ||
    object.request_id.trim() === "" ||
    typeof object.action !== "string" ||
    object.action.trim() === "" ||
    (object.params !== undefined && asObject(object.params) === null)
  ) {
    throw new Error("Expected a project-action/v1 request object.");
  }
  return {
    protocol_version: 1,
    request_id: object.request_id,
    action: object.action,
    ...(object.params === undefined
      ? {}
      : { params: object.params as Readonly<Record<string, unknown>> }),
  };
};

export const executeProjectAction = (
  request: ProjectActionRequest,
  listProjectReports: ProjectReportRpc,
): Effect.Effect<ProjectActionResponse> => {
  if (request.action !== "bugs.list") {
    return Effect.succeed(
      errorResponse(
        request,
        "unsupported_action",
        `Pulse Code does not support project action ${request.action}.`,
      ),
    );
  }

  const params = request.params ?? {};
  const project = params.project ?? params.project_id;
  if (typeof project !== "string" || project.trim() === "") {
    return Effect.succeed(
      errorResponse(request, "invalid_request", "bugs.list requires params.project."),
    );
  }
  const limit = params.limit;
  if (
    limit !== undefined &&
    (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
  ) {
    return Effect.succeed(
      errorResponse(request, "invalid_request", "params.limit must be an integer from 1 to 100."),
    );
  }
  const cursor = params.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.trim() === "")) {
    return Effect.succeed(
      errorResponse(request, "invalid_request", "params.cursor must be a non-empty string."),
    );
  }

  return listProjectReports({
    projectId: ProjectId.make(project),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(typeof cursor === "string" ? { cursor } : {}),
  }).pipe(
    Effect.match({
      onFailure: (failure) => {
        const tagged = asObject(failure);
        if (tagged?._tag === "RpcClientError") {
          return errorResponse(
            request,
            "transport_unavailable",
            "The running Pulse Code server could not complete the request.",
            true,
          );
        }
        return errorResponse(
          request,
          "capability_unavailable",
          "The running Pulse Code server cannot list Reports for this project.",
          tagged?.retryable === true,
        );
      },
      onSuccess: (result) => ({
        ...responseBase(request),
        ok: true as const,
        data: { bugs: result.reports, next_cursor: result.nextCursor },
      }),
    }),
  );
};

const readStdin = Effect.callback<string>((resume) => {
  let contents = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    contents += chunk;
  });
  process.stdin.once("end", () => resume(Effect.succeed(contents)));
  process.stdin.once("error", (cause) => resume(Effect.die(cause)));
});

const makeWsRpcClient = RpcClient.make(WsRpcGroup);
type WsRpcClient =
  typeof makeWsRpcClient extends Effect.Effect<infer Client, any, any> ? Client : never;

const withWsClient = <A, E>(wsUrl: string, run: (client: WsRpcClient) => Effect.Effect<A, E>) => {
  const constructorLayer = Layer.succeed(
    Socket.WebSocketConstructor,
    (url, protocols) =>
      new NodeSocket.NodeWS.WebSocket(url, protocols) as unknown as globalThis.WebSocket,
  );
  const protocolLayer = RpcClient.layerProtocolSocket().pipe(
    Layer.provide(Socket.layerWebSocket(wsUrl).pipe(Layer.provide(constructorLayer))),
    Layer.provide(RpcSerialization.layerJson),
  );
  return makeWsRpcClient.pipe(Effect.flatMap(run), Effect.provide(protocolLayer), Effect.scoped);
};

const withSession = <A, E>(
  auth: EnvironmentAuth.EnvironmentAuth["Service"],
  run: (token: string) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(
    auth.issueSession({ scopes: AuthAdministrativeScopes, label: "pulse issues cli" }),
    (session) => run(session.token),
    (session) => auth.revokeSession(session.sessionId).pipe(Effect.ignore({ log: true })),
  );

const actionInputFlag = Flag.string("input").pipe(
  Flag.withDescription("Read one project-action/v1 JSON request from this file, or - for stdin."),
  Flag.withDefault("-"),
);

const runAction = (flags: { readonly baseDir: Option.Option<string>; readonly input: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = flags.input === "-" ? yield* readStdin : yield* fs.readFileString(flags.input);
    let request: ProjectActionRequest;
    try {
      request = decodeProjectActionRequest(raw);
    } catch {
      yield* Console.log(
        // @effect-diagnostics-next-line preferSchemaOverJson:off - Stable fallback is emitted when decoding itself failed.
        JSON.stringify(
          errorResponse(
            { request_id: "unknown", action: "unknown" },
            "invalid_request",
            "Input is not a valid project-action/v1 request.",
          ),
        ),
      );
      return;
    }
    const logLevel = yield* GlobalFlag.LogLevel;
    const config = yield* resolveCliAuthConfig(flags, logLevel);
    const result = yield* Effect.gen(function* () {
      const runtime = yield* readPersistedServerRuntimeState(config.serverRuntimeStatePath);
      if (Option.isNone(runtime)) {
        return errorResponse(
          request,
          "transport_unavailable",
          "No running Pulse Code server was found.",
          true,
        );
      }
      const auth = yield* EnvironmentAuth.EnvironmentAuth;
      return yield* withSession(auth, (token) =>
        Effect.tryPromise({
          try: async () => {
            // @effect-diagnostics-next-line globalFetchInEffect:off - One bounded bootstrap request precedes the typed WS RPC channel.
            const response = await fetch(`${runtime.value.origin}/api/auth/websocket-ticket`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new IssuesCliTransportError({ cause: response.status });
            const body = (await response.json()) as { readonly ticket?: unknown };
            if (typeof body.ticket !== "string") {
              throw new IssuesCliTransportError({ cause: "ticket missing" });
            }
            return body.ticket;
          },
          catch: (cause) => new IssuesCliTransportError({ cause }),
        }).pipe(
          Effect.flatMap((ticket) => {
            const wsUrl = new URL(runtime.value.origin);
            wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
            wsUrl.pathname = "/ws";
            wsUrl.searchParams.set("wsTicket", ticket);
            return withWsClient(wsUrl.toString(), (client) =>
              client[WS_METHODS.serverGetConfig]({}).pipe(
                Effect.flatMap((server) =>
                  server.environment.capabilities.issuesProjectActions === true
                    ? executeProjectAction(request, (input) =>
                        client[WS_METHODS.issuesListProjectReports](input),
                      )
                    : Effect.succeed(
                        errorResponse(
                          request,
                          "capability_unavailable",
                          "The running Pulse Code server does not advertise project actions.",
                        ),
                      ),
                ),
              ),
            );
          }),
          Effect.timeout(Duration.seconds(5)),
          Effect.catch(() =>
            Effect.succeed(
              errorResponse(
                request,
                "transport_unavailable",
                "The running Pulse Code server could not be reached.",
                true,
              ),
            ),
          ),
        ),
      );
    }).pipe(
      Effect.provide(
        EnvironmentAuth.runtimeLayer.pipe(
          Layer.provide(ServerConfig.layer(config)),
          Layer.provide(Layer.succeed(References.MinimumLogLevel, config.logLevel)),
        ),
      ),
    );
    // @effect-diagnostics-next-line preferSchemaOverJson:off - CLI transport emits its already validated response DTO.
    yield* Console.log(JSON.stringify(result));
  });

const issuesActionCommand = Command.make("action", {
  ...projectLocationFlags,
  input: actionInputFlag,
}).pipe(
  Command.withDescription("Execute one project-action/v1 request through the running server."),
  Command.withHandler(runAction),
);

export const issuesCommand = Command.make("issues").pipe(
  Command.withDescription("Use Pulse Issues through the running Pulse Code server."),
  Command.withSubcommands([issuesActionCommand]),
);
