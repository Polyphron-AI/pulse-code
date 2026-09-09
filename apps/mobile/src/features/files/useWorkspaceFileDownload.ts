import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { useCallback } from "react";
import { Alert } from "react-native";
import { assetEnvironment } from "../../state/assets";
import { usePreparedConnection } from "../../state/session";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { openWorkspaceFileWith } from "./openWorkspaceFileWith";

export function useWorkspaceFileDownload(
  environmentId: EnvironmentId | null,
  threadId: ThreadId | null,
) {
  const connection = usePreparedConnection(environmentId);
  const createUrl = useAtomQueryRunner(assetEnvironment.createUrl, { reportFailure: false });
  return useCallback(
    (path: string) => {
      void openWorkspaceFileWith({
        key: JSON.stringify([environmentId, threadId, path]),
        path,
        resolveAssetUrl: async () => {
          if (!environmentId || !threadId || connection._tag === "None") return null;
          const result = await createUrl({
            environmentId,
            input: {
              resource: {
                _tag: "workspace-file",
                threadId,
                path,
                download: true,
              },
            },
          });
          return result._tag === "Success"
            ? resolveAssetUrl(connection.value.httpBaseUrl, result.value.relativeUrl)
            : null;
        },
      }).catch(() =>
        Alert.alert(
          "Could not download file",
          "Check the environment connection and available storage, then try again.",
        ),
      );
    },
    [environmentId, threadId, connection, createUrl],
  );
}
