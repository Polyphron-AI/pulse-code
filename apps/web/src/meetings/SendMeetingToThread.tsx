import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { buildMeetingThreadPrompt } from "@t3tools/client-runtime/state/meetings";
import type { MeetingDetail } from "@t3tools/contracts";
import { MessageSquarePlusIcon } from "lucide-react";
import { useState } from "react";

import { useComposerDraftStore } from "../composerDraftStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useProjects } from "../state/entities";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toastManager } from "../components/ui/toast";

const projectKey = (project: { readonly environmentId: string; readonly id: string }) =>
  `${project.environmentId}\u0000${project.id}`;

/**
 * Opens a new thread draft in the chosen project with the meeting's title, summary and transcript
 * already in the composer, so the user can add an instruction before sending.
 */
export function SendMeetingToThread({ meeting }: { readonly meeting: MeetingDetail }) {
  const projects = useProjects();
  const { defaultProjectRef, handleNewThread } = useHandleNewThread();
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // The meetings page has no thread of its own, so the default is the project the sidebar lists
  // first, which is the one the user ordered to the top.
  const defaultKey =
    defaultProjectRef === null
      ? null
      : projectKey({
          environmentId: defaultProjectRef.environmentId,
          id: defaultProjectRef.projectId,
        });
  const selectedKey =
    [chosenKey, defaultKey].find(
      (key) => key !== null && projects.some((project) => projectKey(project) === key),
    ) ?? (projects[0] ? projectKey(projects[0]) : null);
  const selectedProject = projects.find((project) => projectKey(project) === selectedKey) ?? null;

  if (projects.length === 0) return null;

  const send = async () => {
    if (selectedProject === null) return;
    setOpening(true);
    try {
      const opened = await handleNewThread(
        scopeProjectRef(selectedProject.environmentId, selectedProject.id),
      );
      if (opened === null) {
        toastManager.add({
          type: "error",
          title: "Could not open a new thread",
          description: "Try again, or start a thread in that project first.",
        });
        return;
      }
      const store = useComposerDraftStore.getState();
      const text = buildMeetingThreadPrompt(meeting);
      const existing = store.getComposerDraft(opened.draftId)?.prompt ?? "";
      // An existing draft keeps what the user already wrote; the meeting goes after it.
      store.setPrompt(
        opened.draftId,
        existing.trim().length === 0 ? text : `${existing.trimEnd()}\n\n${text}`,
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Select
        value={selectedKey ?? ""}
        onValueChange={(value) => {
          if (typeof value === "string") setChosenKey(value);
        }}
      >
        <SelectTrigger
          aria-label="Project"
          size="compact"
          variant="ghost"
          className="w-auto min-w-0"
        >
          <SelectValue>{selectedProject?.title ?? "Project"}</SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" alignItemWithTrigger={false}>
          {projects.map((project) => (
            <SelectItem key={projectKey(project)} value={projectKey(project)}>
              {project.title}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={selectedProject === null || opening || meeting.segments.length === 0}
        onClick={() => void send()}
      >
        <MessageSquarePlusIcon />
        Send to thread
      </Button>
    </div>
  );
}
