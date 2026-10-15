import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProjectId,
  WorkspaceItemRef,
  WorkspaceLinkId,
  WorkspaceLinkEndpoint,
  WorkspaceLinkSource,
} from "@t3tools/contracts";
import { useCallback } from "react";

import { useAtomCommand } from "../../../state/use-atom-command";
import { workspaceLinks } from "../../../state/workspaceLinks";
import { endpointTitle, projectItemRef } from "./linkedItems";

/** A command failure's message for the user. */
export const linkErrorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Something went wrong.";

/** Link and unlink from Mail. Both reject with the server's reason for the caller to show. */
export function useMailLinks(environmentId: EnvironmentId) {
  const link = useAtomCommand(workspaceLinks.link, { reportFailure: false });
  const unlink = useAtomCommand(workspaceLinks.unlink, { reportFailure: false });
  const linkToProject = useCallback(
    async (
      message: { readonly ref: WorkspaceItemRef; readonly title: string },
      project: { readonly id: ProjectId; readonly title: string },
      source?: Extract<WorkspaceLinkSource, { type: "action" }>,
    ) => {
      const endpoint = { ref: message.ref, title: endpointTitle(message.title) };
      const result = await link({
        environmentId,
        input: {
          a: endpoint,
          b: { ref: projectItemRef(project.id), title: endpointTitle(project.title) },
          // The message is what the user had open, so it is the origin's "while viewing".
          viewing: endpoint,
          ...(source === undefined ? {} : { source }),
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    },
    [environmentId, link],
  );
  const unlinkLink = useCallback(
    async (id: WorkspaceLinkId) => {
      const result = await unlink({ environmentId, input: { id } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    },
    [environmentId, unlink],
  );
  const linkItem = async (a: WorkspaceLinkEndpoint, b: WorkspaceLinkEndpoint) => {
    const result = await link({ environmentId, input: { a, b, viewing: a } });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  };
  return { linkToProject, linkItem, unlink: unlinkLink };
}
