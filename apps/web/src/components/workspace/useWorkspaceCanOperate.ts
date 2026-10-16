import {
  AuthOrchestrationOperateScope,
  type AuthSessionState,
  type EnvironmentId,
} from "@t3tools/contracts";
import { useEnvironmentSessionState } from "../../state/session";

export function canOperateSession(data: AuthSessionState | null) {
  return (
    data?.authenticated === true && data.scopes?.includes(AuthOrchestrationOperateScope) === true
  );
}

export function useWorkspaceCanOperate(environmentId: EnvironmentId) {
  const session = useEnvironmentSessionState(environmentId);
  return canOperateSession(session.data);
}
