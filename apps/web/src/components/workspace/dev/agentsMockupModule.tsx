import { WorkspaceAgentsView } from "../WorkspaceAgentsView";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  let disposed = false;
  const pending = new Set<Promise<void>>();
  const run = (kind: "open-thread" | "unlink", key: string) => {
    if (disposed) return;
    const agent = session.seed.agents.find((row) => row.threadId === key);
    if (!agent) return;
    const command = session.record(kind, { type: "thread", threadId: agent.threadId });
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
        onAssign={() => {}}
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
