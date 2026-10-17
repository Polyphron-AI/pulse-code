import { WorkspaceItemActionButtons } from "../WorkspaceItemActionButtons";
import { WorkspaceAgentsView } from "../WorkspaceAgentsView";
import { WorkspaceLinkProvenance } from "../mail/WorkspaceLinkProvenance";
import type { CreateWorkspaceMockupModule, MockupMutation } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  let disposed = false;
  const pending = new Set<Promise<void>>();
  const run = (kind: MockupMutation, key?: string) => {
    if (disposed) return;
    const agent = session.seed.agents.find((row) => row.threadId === key);
    const item = agent
      ? { type: "thread" as const, threadId: agent.threadId }
      : { type: "project" as const, projectId: session.resourceProjectId };
    const command = session.record(kind, item);
    pending.add(command);
    void command.then(
      () => pending.delete(command),
      () => pending.delete(command),
    );
  };
  return {
    area: "agents",
    readyRegions: ["resource"],
    resource: (
      <WorkspaceAgentsView
        projectTitle={
          session.seed.projects.find((project) => project.id === session.resourceProjectId)
            ?.title ?? "SynKEK"
        }
        rows={session.seed.agents.map((agent) => ({
          key: agent.threadId,
          title: agent.title,
          initials: agent.monogram,
          status: agent.activity,
          active: agent.status === "working",
        }))}
        onOpen={(key) => run("open-thread", key)}
        onAssign={() => run("link")}
        projectActions={
          <WorkspaceItemActionButtons
            layout="menu"
            startThread={{ onClick: () => run("open-thread") }}
          />
        }
        renderRowProvenance={() => <WorkspaceLinkProvenance source={{ type: "user" }} />}
        renderRowActions={(key) => (
          <WorkspaceItemActionButtons
            layout="menu"
            startThread={{ onClick: () => run("open-thread", key) }}
            addToProject={{ onClick: () => run("add-to-project", key) }}
            startProject={{ onClick: () => run("start-project", key) }}
            startAutomation={{ onClick: () => run("start-automation", key) }}
          />
        )}
        onUnassign={(key) => run("unlink", key)}
      />
    ),
    settled: async () => {
      await Promise.all(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
    },
  };
};
