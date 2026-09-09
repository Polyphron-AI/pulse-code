import type { ProjectIconColor, ProjectIconOverride } from "@t3tools/contracts";
import { selectProjectIcon } from "@t3tools/client-runtime/state/projects";
import {
  IconBook,
  IconCode,
  IconDatabase,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconFolder,
  IconGitBranch,
  IconHammer,
  IconHeart,
  IconMusic,
  IconPackage,
  IconPhoto,
  IconRocket,
  IconServer,
  IconShield,
  IconSparkles,
  IconTerminal2,
  IconWorld,
  type Icon,
} from "@tabler/icons-react-native";
import { Text, View } from "react-native";

export const NATIVE_PROJECT_ICONS: Readonly<Record<string, Icon>> = {
  "book-open": IconBook,
  "code-2": IconCode,
  code: IconCode,
  braces: IconCode,
  database: IconDatabase,
  monitor: IconDeviceDesktop,
  smartphone: IconDeviceMobile,
  folder: IconFolder,
  "folder-code": IconFolder,
  "git-branch": IconGitBranch,
  wrench: IconHammer,
  heart: IconHeart,
  music: IconMusic,
  package: IconPackage,
  image: IconPhoto,
  rocket: IconRocket,
  server: IconServer,
  "shield-check": IconShield,
  sparkles: IconSparkles,
  terminal: IconTerminal2,
  globe: IconWorld,
  "globe-2": IconWorld,
};
export const NATIVE_PROJECT_ICON_COLORS: Record<ProjectIconColor, string> = {
  gray: "#6b7280",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

export function ProjectIcon(props: {
  readonly projectTitle: string;
  readonly workspaceRoot?: string | null;
  readonly projectIcon?: ProjectIconOverride | null;
  readonly size: number;
}) {
  const override = props.projectIcon;
  if (override?.kind === "lucide") {
    const NativeIcon = NATIVE_PROJECT_ICONS[override.name] ?? IconFolder;
    return (
      <NativeIcon
        size={props.size}
        color={NATIVE_PROJECT_ICON_COLORS[override.color]}
        accessibilityLabel={`${props.projectTitle} icon`}
      />
    );
  }
  const automatic = selectProjectIcon(props.projectTitle, props.workspaceRoot ?? "");
  const emoji =
    override?.kind === "emoji"
      ? override.emoji
      : automatic.kind === "emoji"
        ? automatic.emoji
        : "📁";
  return (
    <View accessible accessibilityLabel={`${props.projectTitle} icon`}>
      <Text style={{ fontSize: props.size, lineHeight: props.size * 1.2 }}>{emoji}</Text>
    </View>
  );
}
