export const INTEGRATIONS_SETTINGS_SECTIONS = [
  { label: "Skills", targetId: "skills" },
  { label: "MCP", targetId: "mcp" },
  { label: "Voice dictation", targetId: "dictation" },
  { label: "Browser", targetId: "browser" },
] as const;

export type IntegrationsSettingsSectionId =
  (typeof INTEGRATIONS_SETTINGS_SECTIONS)[number]["targetId"];
