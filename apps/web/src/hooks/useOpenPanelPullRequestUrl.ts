import { EnvironmentId, ProjectId, type ScopedThreadRef } from "@t3tools/contracts";

import { selectActiveRightPanelSurface, useRightPanelStore } from "../rightPanelStore";
import { pullRequestEnvironment } from "../state/pullRequests";
import { useEnvironmentQuery } from "../state/query";

/** Keep an open PR panel authoritative while its provider-specific URL loads. */
export function useOpenPanelPullRequestUrl(threadRef: ScopedThreadRef | null) {
  const surface = useRightPanelStore((state) =>
    selectActiveRightPanelSurface(state.byThreadKey, threadRef),
  );
  const reference = surface?.kind === "pull-request" ? surface : null;
  const environmentId = reference?.environmentId
    ? EnvironmentId.make(reference.environmentId)
    : threadRef?.environmentId;
  const detail = useEnvironmentQuery(
    reference && environmentId
      ? pullRequestEnvironment.detail({
          environmentId,
          input: {
            projectId: ProjectId.make(reference.projectId),
            repository: reference.repository,
            number: reference.number,
          },
        })
      : null,
  ).data;
  if (reference === null) return undefined;
  return detail?.projectId === reference.projectId &&
    detail.repository.toLowerCase() === reference.repository.toLowerCase() &&
    detail.number === reference.number
    ? detail.url
    : null;
}
