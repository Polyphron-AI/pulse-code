import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import type { ProjectIconColor, ProjectIconOverride } from "@t3tools/contracts";
import { AppText as Text } from "../../../components/AppText";
import {
  ProjectIcon,
  NATIVE_PROJECT_ICONS,
  NATIVE_PROJECT_ICON_COLORS,
} from "../../../components/ProjectIcon";
import { useProjects } from "../../../state/entities";
import { useEnvironments } from "../../../state/environments";
import { projectEnvironment } from "../../../state/projects";
import { useAtomCommand } from "../../../state/use-atom-command";
import { SettingsSection } from "./SettingsSection";
import { SettingsRow } from "./SettingsRow";

const EMOJIS = [
  "💻",
  "🛠️",
  "🚀",
  "🤖",
  "✨",
  "⚡",
  "🌐",
  "📱",
  "🖥️",
  "⌨️",
  "⚙️",
  "🗄️",
  "☁️",
  "📦",
  "📚",
  "🧪",
];

export function ProjectIconSettings() {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const updateProject = useAtomCommand(projectEnvironment.update, "project icon setting");
  const [selected, setSelected] = useState<string | null>(null);
  const [color, setColor] = useState<ProjectIconColor>("blue");
  const supported = projects.filter((project) => project.projectIcon !== undefined);
  const project = supported.find((item) => `${item.environmentId}:${item.id}` === selected);
  const connected = (environmentId: string) =>
    environments.some(
      (item) => item.environmentId === environmentId && item.connection.phase === "connected",
    );
  const save = (projectIcon: ProjectIconOverride | null) => {
    if (!project || !connected(project.environmentId)) return;
    void updateProject({
      environmentId: project.environmentId,
      input: { projectId: project.id, faviconPath: null, projectIcon },
    });
    setSelected(null);
  };
  if (supported.length === 0) return null;
  return (
    <>
      <SettingsSection title="Project icons">
        {supported.map((item) => (
          <SettingsRow
            key={`${item.environmentId}:${item.id}`}
            icon="paintbrush"
            label={item.title}
            value={
              environments.find((environment) => environment.environmentId === item.environmentId)
                ?.label ?? item.environmentId
            }
            disabled={!connected(item.environmentId)}
            onPress={() => {
              setColor(item.projectIcon?.kind === "lucide" ? item.projectIcon.color : "blue");
              setSelected(`${item.environmentId}:${item.id}`);
            }}
          />
        ))}
      </SettingsSection>
      <Modal
        visible={project !== undefined}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <ScrollView
          className="flex-1 bg-background"
          contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 24 }}
        >
          <Text className="text-xl text-foreground">{project?.title} icon</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={() => setSelected(null)}
          >
            <Text className="text-foreground">Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use automatic icon"
            disabled={!project || !connected(project.environmentId)}
            onPress={() => save(null)}
          >
            <Text className="text-foreground">Use automatic icon</Text>
          </Pressable>
          <View className="flex-row flex-wrap gap-4">
            {EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${emoji}`}
                disabled={!project || !connected(project.environmentId)}
                onPress={() => save({ kind: "emoji", emoji })}
              >
                <Text style={{ fontSize: 30 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-foreground">Icon color</Text>
          <View className="flex-row flex-wrap gap-3">
            {(Object.keys(NATIVE_PROJECT_ICON_COLORS) as ProjectIconColor[]).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={item}
                accessibilityState={{ selected: item === color }}
                onPress={() => setColor(item)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: NATIVE_PROJECT_ICON_COLORS[item],
                  borderWidth: item === color ? 3 : 0,
                  borderColor: "#ffffff",
                }}
              />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-4">
            {Object.keys(NATIVE_PROJECT_ICONS).map((name) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${name}`}
                disabled={!project || !connected(project.environmentId)}
                onPress={() => save({ kind: "lucide", name, color })}
              >
                <ProjectIcon
                  projectTitle={name}
                  projectIcon={{ kind: "lucide", name, color }}
                  size={32}
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}
