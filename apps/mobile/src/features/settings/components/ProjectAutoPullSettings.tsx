import { useProjects } from "../../../state/entities";
import { useEnvironments } from "../../../state/environments";
import { projectEnvironment } from "../../../state/projects";
import { useAtomCommand } from "../../../state/use-atom-command";
import { SettingsSection } from "./SettingsSection";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

export function ProjectAutoPullSettings() {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const updateProject = useAtomCommand(projectEnvironment.update, "automatic project pull setting");
  const supported = projects.filter((project) => project.autoPull !== undefined);
  if (supported.length === 0) return null;
  return (
    <SettingsSection title="Project automatic pull">
      {supported.map((project) => {
        const environment = environments.find(
          (item) => item.environmentId === project.environmentId,
        );
        const connected = environment?.connection.phase === "connected";
        return (
          <SettingsSwitchRow
            key={`${project.environmentId}:${project.id}`}
            icon="arrow.down.circle"
            label={`${project.title} (${environment?.label ?? project.environmentId})`}
            subtitle="Pull the clean default branch in the background, only when there are no local changes or commits."
            value={project.autoPull === true}
            disabled={!connected}
            onValueChange={(enabled) => {
              if (!connected) return;
              void updateProject({
                environmentId: project.environmentId,
                input: { projectId: project.id, autoPull: enabled },
              });
            }}
          />
        );
      })}
    </SettingsSection>
  );
}
