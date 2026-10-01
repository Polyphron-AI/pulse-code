import { useNavigation } from "@react-navigation/native";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { buildMeetingThreadPrompt } from "@t3tools/client-runtime/state/meetings";
import type { MeetingDetail } from "@t3tools/contracts";
import { useCallback } from "react";

import {
  createNewTaskDraft,
  getComposerDraftSnapshot,
  setComposerDraftText,
} from "../../state/use-composer-drafts";

/**
 * Opens a new task draft in the chosen project with the meeting's title, summary and transcript in
 * the composer, so the user can add an instruction before sending. An existing draft for that
 * project keeps its text; the meeting goes after it.
 */
export function useSendMeetingToThread(): (
  meeting: MeetingDetail,
  project: EnvironmentProject,
) => void {
  const navigation = useNavigation();
  return useCallback(
    (meeting, project) => {
      const draftId = createNewTaskDraft({
        environmentId: project.environmentId,
        projectId: project.id,
      });
      const text = buildMeetingThreadPrompt(meeting);
      const existing = getComposerDraftSnapshot(draftId).text;
      setComposerDraftText(
        draftId,
        existing.trim().length === 0 ? text : `${existing.trimEnd()}\n\n${text}`,
      );
      navigation.navigate("NewTaskSheet", {
        screen: "NewTaskDraft",
        params: {
          draftId,
          environmentId: String(project.environmentId),
          projectId: String(project.id),
        },
      });
    },
    [navigation],
  );
}
