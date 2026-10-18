import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Tools from "../workspace/WorkspaceTools.ts";
import { ServerEnvironmentIdentity } from "../environment/ServerEnvironment.ts";
import {
  EnvironmentId,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  ProjectId,
  DEFAULT_SERVER_SETTINGS,
  PulseCommunicationsRpcs,
  RpcScopeAuthorization,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcTest from "effect/unstable/rpc/RpcTest";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
  RPC_REQUIRED_SCOPES,
  requiredScopeForRpcMethod,
  requiredScopeForDeviceList,
  rpcScopeAuthorizationLayer,
} from "./RpcAuthorization.ts";

describe("RPC authorization scopes", () => {
  it("requires read for Slack lists and operate for explicit connection changes", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.slackListConnections)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.slackConnect)).toBe(AuthOrchestrationOperateScope);
    expect(requiredScopeForRpcMethod(WS_METHODS.slackDisconnect)).toBe(
      AuthOrchestrationOperateScope,
    );
  });
  it("allows user-side suggestion discovery with read access and requires operate access for confirmation", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.pulseLinksSuggest)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pulseLinksAcceptSuggestion)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pulseLinksDismissSuggestion)).toBe(
      AuthOrchestrationOperateScope,
    );
  });
  it("requires operate access for Telegram connection and pairing changes, read access for content", () => {
    for (const method of [
      WS_METHODS.telegramConnect,
      WS_METHODS.telegramDisconnect,
      WS_METHODS.telegramStartPairing,
      WS_METHODS.telegramCancelPairing,
      WS_METHODS.telegramRemoveChat,
    ])
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
    for (const method of [
      WS_METHODS.telegramListConnections,
      WS_METHODS.telegramListChats,
      WS_METHODS.telegramListMessages,
      WS_METHODS.telegramReadMessage,
      WS_METHODS.telegramSubscribeChanges,
    ])
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationReadScope);
  });
  it("requires operate access to change managed skills and read access to list them", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.pulseSkillsList)).toBe(AuthOrchestrationReadScope);
    expect(requiredScopeForRpcMethod(WS_METHODS.pulseSkillsMutate)).toBe(
      AuthOrchestrationOperateScope,
    );
  });
  it("declares exactly one scope for every RPC in the server group", () => {
    expect(new Set(Object.keys(RPC_REQUIRED_SCOPES))).toEqual(new Set(WsRpcGroup.requests.keys()));
  });

  it("authorizes background policy reporting and observation deliberately", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.serverReportClientActivity)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverReportHostPowerState)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverGetBackgroundPolicy)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.subscribeBackgroundPolicy)).toBe(
      AuthOrchestrationReadScope,
    );
  });

  it("allows relay status reads without granting relay installation access", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.cloudGetRelayClientStatus)).toBe(
      AuthRelayReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.cloudInstallRelayClient)).toBe(AuthRelayWriteScope);
  });

  it("requires permission to operate on a thread before uploading feedback", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.providerUploadFeedback)).toBe(
      AuthOrchestrationOperateScope,
    );
  });

  it("requires write access to import agent session history", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.agentSessionsScan)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.agentSessionsImport)).toBe(
      AuthOrchestrationOperateScope,
    );
  });

  it("separates ACP Registry discovery from provisioning", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.serverSearchAcpRegistry)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverPrepareAcpRegistryAgent)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverUninstallAcpRegistryManagedBinary)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverAcceptAcpRegistryUrlAuth)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverListAcpRegistrySessions)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverImportAcpRegistrySession)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverLogoutAcpRegistry)).toBe(
      AuthOrchestrationOperateScope,
    );
  });

  it("reads the reviewer menu under the same scope as the pull request it belongs to", () => {
    // The candidate list is a read like the detail beside it, and asking somebody for a review is
    // a write like every other pull request operation.
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsChecks)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsReviewerCandidates)).toBe(
      requiredScopeForRpcMethod(WS_METHODS.pullRequestsDetail),
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsRequestReviewers)).toBe(
      requiredScopeForRpcMethod(WS_METHODS.pullRequestsComment),
    );
  });

  it("rejects unknown RPC method names", () => {
    for (const method of ["server.notRegistered", "toString", "constructor"]) {
      expect(() => requiredScopeForRpcMethod(method)).toThrow(
        `RPC method ${method} has no declared authorization scope.`,
      );
    }
  });
});

it.effect("denies Slack connection mutations before invoking handlers in a read-only session", () =>
  Effect.gen(function* () {
    const group = RpcGroup.make(...PulseCommunicationsRpcs).middleware(RpcScopeAuthorization);
    const calls: string[] = [];
    const account = {
      id: "slack_test",
      provider: "slack" as const,
      identity: "Asha",
      label: "Team",
      connected: true,
      generation: 1,
    };
    const handlers = group.toLayer({
      [WS_METHODS.slackConnect]: () =>
        Effect.sync(() => {
          calls.push("connect");
          return account;
        }),
      [WS_METHODS.slackListConnections]: () =>
        Effect.sync(() => {
          calls.push("list");
          return [account];
        }),
      [WS_METHODS.slackDisconnect]: () =>
        Effect.sync(() => {
          calls.push("disconnect");
        }),
    });
    const read = yield* RpcTest.makeClient(group).pipe(
      Effect.provide(
        Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthOrchestrationReadScope])),
      ),
    );
    expect(
      yield* read[WS_METHODS.slackConnect]({ token: "synthetic" }).pipe(Effect.flip),
    ).toMatchObject({ requiredScope: AuthOrchestrationOperateScope });
    expect(
      yield* read[WS_METHODS.slackDisconnect]({ connectionId: account.id }).pipe(Effect.flip),
    ).toMatchObject({ requiredScope: AuthOrchestrationOperateScope });
    expect(yield* read[WS_METHODS.slackListConnections]({})).toEqual([account]);
    expect(calls).toEqual(["list"]);
    const operate = yield* RpcTest.makeClient(group).pipe(
      Effect.provide(
        Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthOrchestrationOperateScope])),
      ),
    );
    yield* operate[WS_METHODS.slackConnect]({ token: "synthetic" });
    yield* operate[WS_METHODS.slackDisconnect]({ connectionId: account.id });
    expect(yield* operate[WS_METHODS.slackListConnections]({}).pipe(Effect.flip)).toMatchObject({
      requiredScope: AuthOrchestrationReadScope,
    });
    expect(calls).toEqual(["list", "connect", "disconnect"]);
  }).pipe(Effect.scoped),
);

it("requires operate permission for host retry while preserving read-only listing", () => {
  expect(requiredScopeForDeviceList({})).toBe(AuthOrchestrationReadScope);
  expect(requiredScopeForDeviceList({ retryHostId: "remote-host" })).toBe(
    AuthOrchestrationOperateScope,
  );
});

it("requires operate permission for tool updates even alongside a read-only check", () => {
  expect(requiredScopeForDeviceList({ updateTool: "agent", inspectOnly: true })).toBe(
    AuthOrchestrationOperateScope,
  );
  expect(requiredScopeForDeviceList({ updateTool: "hub" })).toBe(AuthOrchestrationOperateScope);
});

describe("RPC scope middleware", () => {
  const tested = [WS_METHODS.serverProbe, WS_METHODS.serverRetryResourceTelemetry] as const;
  const group = WsRpcGroup.omit(
    ...[...WsRpcGroup.requests.keys()].filter(
      (tag): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, (typeof tested)[number]> =>
        !(tested as ReadonlyArray<string>).includes(tag),
    ),
  );

  it.effect("checks each RPC's declared scope before its handler runs", () =>
    Effect.gen(function* () {
      const handled: Array<string> = [];
      const client = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.mergeAll(
            group.toLayerHandler(WS_METHODS.serverProbe, () => Effect.succeed({})),
            group.toLayerHandler(WS_METHODS.serverRetryResourceTelemetry, () =>
              Effect.sync(() => handled.push("retry")).pipe(Effect.andThen(Effect.never)),
            ),
            rpcScopeAuthorizationLayer([AuthOrchestrationReadScope]),
          ),
        ),
      );

      expect(yield* client[WS_METHODS.serverProbe]({})).toEqual({});
      expect(
        yield* client[WS_METHODS.serverRetryResourceTelemetry]({}).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "EnvironmentAuthorizationError",
        requiredScope: AuthOrchestrationOperateScope,
      });
      expect(handled).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

it("requires explicit read or operate scopes for every Drive action", () => {
  for (const method of [
    WS_METHODS.driveListConnections,
    WS_METHODS.driveSearch,
    WS_METHODS.driveGetBinding,
    WS_METHODS.driveGetBindings,
    WS_METHODS.driveListChildren,
    WS_METHODS.driveGetProjectRoot,
    WS_METHODS.driveReadFile,
    WS_METHODS.driveSubscribeChanges,
  ])
    expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationReadScope);
  for (const method of [
    WS_METHODS.driveUpsertConnection,
    WS_METHODS.driveDisconnectConnection,
    WS_METHODS.driveRemoveConnection,
    WS_METHODS.driveStartOAuth,
    WS_METHODS.driveCompleteOAuth,
    WS_METHODS.driveCancelOAuth,
    WS_METHODS.driveBindFile,
    WS_METHODS.driveSetProjectRoot,
  ])
    expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
});

it("separates workspace settings and task writes from reads", () => {
  for (const method of [
    WS_METHODS.workspaceGetProjectConfig,
    WS_METHODS.workspaceListTasks,
    WS_METHODS.workspaceGetTask,
    WS_METHODS.workspaceSubscribeChanges,
  ])
    expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationReadScope);
  for (const method of [
    WS_METHODS.workspaceSaveProjectConfig,
    WS_METHODS.workspaceUpsertTask,
    WS_METHODS.workspaceTransitionTask,
    WS_METHODS.workspaceDeleteTask,
    WS_METHODS.workspaceSaveAutomation,
  ])
    expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
});

it.effect("authorizes task transitions and revision-aware settings through operate scope", () =>
  Effect.gen(function* () {
    const tested = [
      WS_METHODS.workspaceTransitionTask,
      WS_METHODS.workspaceSaveProjectConfig,
    ] as const;
    const group = WsRpcGroup.omit(
      ...[...WsRpcGroup.requests.keys()].filter(
        (tag): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, (typeof tested)[number]> =>
          !(tested as readonly string[]).includes(tag),
      ),
    );
    const config = {
      projectId: ProjectId.make("project"),
      taskColumns: ["To do", "Done"],
      browserThreadId: null,
      completedColumn: "Done",
      revision: 1,
    };
    const task = {
      id: "wskt_00000000-0000-0000-0000-000000000001",
      projectId: config.projectId,
      title: "Task",
      column: "Done",
      revision: 1,
      done: true,
    };
    const handled: string[] = [];
    for (const scope of [AuthOrchestrationReadScope, AuthOrchestrationOperateScope]) {
      const client = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.mergeAll(
            group.toLayerHandler(WS_METHODS.workspaceTransitionTask, () =>
              Effect.sync(() => {
                handled.push("transition");
                return task;
              }),
            ),
            group.toLayerHandler(WS_METHODS.workspaceSaveProjectConfig, () =>
              Effect.sync(() => {
                handled.push("config");
                return config;
              }),
            ),
            rpcScopeAuthorizationLayer([scope]),
          ),
        ),
      );
      const move = client[WS_METHODS.workspaceTransitionTask]({
        id: task.id,
        expectedRevision: 0,
        change: { type: "completion", completed: true },
      });
      const save = client[WS_METHODS.workspaceSaveProjectConfig]({
        ...config,
        expectedRevision: 0,
      });
      if (scope === AuthOrchestrationReadScope) {
        expect(yield* move.pipe(Effect.flip)).toMatchObject({
          requiredScope: AuthOrchestrationOperateScope,
        });
        expect(yield* save.pipe(Effect.flip)).toMatchObject({
          requiredScope: AuthOrchestrationOperateScope,
        });
        expect(handled).toEqual([]);
      } else {
        expect(yield* move).toEqual(task);
        expect(yield* save).toEqual(config);
        expect(handled).toEqual(["transition", "config"]);
      }
    }
  }).pipe(Effect.scoped),
);

it.effect(
  "denies task metadata and owner patches to read sessions and permits operate sessions",
  () =>
    Effect.gen(function* () {
      const method = WS_METHODS.workspacePatchTask;
      const group = WsRpcGroup.omit(
        ...[...WsRpcGroup.requests.keys()].filter(
          (tag): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, typeof method> => tag !== method,
        ),
      );
      const task = {
        id: "wskt_00000000-0000-0000-0000-000000000001",
        projectId: ProjectId.make("project"),
        title: "Task",
        column: "To do",
        revision: 1,
        dueOn: "2026-10-16",
        areaLabel: null,
        owner: null,
      };
      const handled: string[] = [];
      for (const scope of [AuthOrchestrationReadScope, AuthOrchestrationOperateScope]) {
        const client = yield* RpcTest.makeClient(group).pipe(
          Effect.provide(
            Layer.mergeAll(
              group.toLayerHandler(method, () =>
                Effect.sync(() => {
                  handled.push("patch");
                  return task;
                }),
              ),
              rpcScopeAuthorizationLayer([scope]),
            ),
          ),
        );
        const patch = client[method]({
          id: task.id,
          expectedRevision: 0,
          dueOn: "2026-10-16",
          owner: null,
        });
        if (scope === AuthOrchestrationReadScope) {
          expect(yield* patch.pipe(Effect.flip)).toMatchObject({
            requiredScope: AuthOrchestrationOperateScope,
          });
          expect(handled).toEqual([]);
        } else {
          expect(yield* patch).toEqual(task);
          expect(handled).toEqual(["patch"]);
        }
      }
    }).pipe(Effect.scoped),
);

it.effect(
  "requires operate scope for environment timezone and owner profile writes through existing settings RPC",
  () =>
    Effect.gen(function* () {
      const method = WS_METHODS.serverUpdateSettings;
      const group = WsRpcGroup.omit(
        ...[...WsRpcGroup.requests.keys()].filter(
          (tag): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, typeof method> => tag !== method,
        ),
      );
      let handled = 0;
      for (const scope of [AuthOrchestrationReadScope, AuthOrchestrationOperateScope]) {
        const client = yield* RpcTest.makeClient(group).pipe(
          Effect.provide(
            Layer.mergeAll(
              group.toLayerHandler(method, ({ patch }) =>
                Effect.sync(() => {
                  handled++;
                  return {
                    ...DEFAULT_SERVER_SETTINGS,
                    workspaceOwnerProfile: patch.workspaceOwnerProfile ?? null,
                    workspaceDisplayTimeZone: patch.workspaceDisplayTimeZone ?? "UTC",
                  };
                }),
              ),
              rpcScopeAuthorizationLayer([scope]),
            ),
          ),
        );
        const save = client[method]({
          patch: {
            workspaceDisplayTimeZone: "Africa/Johannesburg",
            workspaceOwnerProfile: { displayName: "Maya", initials: "MC" },
          },
        });
        if (scope === AuthOrchestrationReadScope) {
          expect(yield* save.pipe(Effect.flip)).toMatchObject({
            requiredScope: AuthOrchestrationOperateScope,
          });
          expect(handled).toBe(0);
        } else {
          const saved = yield* save;
          expect(saved.workspaceDisplayTimeZone).toBe("Africa/Johannesburg");
          expect(saved.workspaceOwnerProfile).toEqual({ displayName: "Maya", initials: "MC" });
          expect(handled).toBe(1);
        }
      }
    }).pipe(Effect.scoped),
);

it.effect(
  "reads descriptions with read scope and requires operate scope to set or clear them",
  () =>
    Effect.gen(function* () {
      const tools = yield* Tools.WorkspaceTools;
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("description-auth");
      yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Description','/synthetic','[]','2026-10-17T12:00:00Z','2026-10-17T12:00:00Z')`;
      const tested = [
        WS_METHODS.workspaceListProjectOverview,
        WS_METHODS.workspaceGetProjectConfig,
        WS_METHODS.workspaceSaveProjectConfig,
      ] as const;
      const group = WsRpcGroup.omit(
        ...[...WsRpcGroup.requests.keys()].filter(
          (tag): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, (typeof tested)[number]> =>
            !(tested as readonly string[]).includes(tag),
        ),
      );
      for (const scope of [AuthOrchestrationReadScope, AuthOrchestrationOperateScope]) {
        const client = yield* RpcTest.makeClient(group).pipe(
          Effect.provide(
            Layer.mergeAll(
              group.toLayerHandler(WS_METHODS.workspaceListProjectOverview, tools.overview),
              group.toLayerHandler(WS_METHODS.workspaceGetProjectConfig, ({ projectId }) =>
                tools.config(projectId),
              ),
              group.toLayerHandler(WS_METHODS.workspaceSaveProjectConfig, tools.saveConfig),
              rpcScopeAuthorizationLayer([AuthOrchestrationReadScope, scope]),
            ),
          ),
        );
        expect(
          (yield* client[WS_METHODS.workspaceListProjectOverview]({
            limit: 50,
            filter: "",
            drive: "all",
            order: "title",
          })).projects.map((p) => p.projectId),
        ).toEqual([projectId]);
        const original = yield* client[WS_METHODS.workspaceGetProjectConfig]({ projectId });
        expect(original.description).toBeNull();
        for (const description of ["  Authorized description  ", null]) {
          const save = client[WS_METHODS.workspaceSaveProjectConfig]({ ...original, description });
          if (scope === AuthOrchestrationReadScope) {
            expect(yield* save.pipe(Effect.flip)).toMatchObject({
              requiredScope: AuthOrchestrationOperateScope,
            });
            expect((yield* tools.config(projectId)).description).toBeNull();
            expect(yield* tools.currentChange).toBe(0);
          } else {
            const saved = yield* save;
            expect(saved.description).toBe(description?.trim() ?? null);
            expect(
              (yield* client[WS_METHODS.workspaceGetProjectConfig]({ projectId })).description,
            ).toBe(saved.description);
          }
        }
      }
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Tools.layer.pipe(
          Layer.provide(
            Layer.succeed(
              ServerEnvironmentIdentity,
              ServerEnvironmentIdentity.of({
                getEnvironmentId: Effect.succeed(EnvironmentId.make("auth-test")),
              }),
            ),
          ),
          Layer.provideMerge(SqlitePersistenceMemory),
          Layer.provide(NodeCrypto.layer),
        ),
      ),
    ),
);
