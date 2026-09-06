import {
  AuthAccessWriteScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { RPC_REQUIRED_SCOPES, requiredScopeForRpcMethod } from "./RpcAuthorization.ts";

describe("RPC authorization scopes", () => {
  it("separates reading participant history from changing identity and work", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.mailGetPeopleContext)).toBe(
      AuthOrchestrationReadScope,
    );
    for (const method of [
      WS_METHODS.mailReviewPerson,
      WS_METHODS.mailSavePeopleWork,
      WS_METHODS.mailReviewConnection,
    ])
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
  });
  it("requires account administration for mail setup and operation authority for sending", () => {
    for (const method of [
      WS_METHODS.mailSetEnabled,
      WS_METHODS.mailSaveAccount,
      WS_METHODS.mailDisconnectAccount,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthAccessWriteScope);
    }
    for (const method of [
      WS_METHODS.mailGetStatus,
      WS_METHODS.mailReadMessage,
      WS_METHODS.mailListDrafts,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationReadScope);
    }
    for (const method of [
      WS_METHODS.mailSendDraft,
      WS_METHODS.mailSaveMetadata,
      WS_METHODS.mailActOnMessages,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
    }
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

  it("reads the reviewer menu under the same scope as the pull request it belongs to", () => {
    // The candidate list is a read like the detail beside it, and asking somebody for a review is
    // a write like every other pull request operation.
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsReviewerCandidates)).toBe(
      requiredScopeForRpcMethod(WS_METHODS.pullRequestsDetail),
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsRequestReviewers)).toBe(
      requiredScopeForRpcMethod(WS_METHODS.pullRequestsComment),
    );
  });

  it("separates integration reads from lifecycle and confirmed writes", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.integrationsListConnections)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.integrationsIssueContext)).toBe(
      AuthOrchestrationReadScope,
    );
    for (const method of [
      WS_METHODS.integrationsDisconnect,
      WS_METHODS.integrationsSetProjectMapping,
      WS_METHODS.integrationsRemoveProjectMapping,
      WS_METHODS.integrationsIssuePreviewStatus,
      WS_METHODS.integrationsIssueConfirmStatus,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
    }
  });

  it("rejects unknown RPC method names", () => {
    for (const method of ["server.notRegistered", "toString", "constructor"]) {
      expect(() => requiredScopeForRpcMethod(method)).toThrow(
        `RPC method ${method} has no declared authorization scope.`,
      );
    }
  });
});
