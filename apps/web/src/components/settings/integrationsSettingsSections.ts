export const INTEGRATIONS_SETTINGS_SECTIONS = [
  { label: "Skills", targetId: "skills" },
  { label: "MCP", targetId: "mcp" },
  { label: "Voice dictation", targetId: "dictation" },
  { label: "Telegram", targetId: "telegram" },
  { label: "Google Drive", targetId: "drive" },
  { label: "Browser", targetId: "browser" },
] as const;

export type IntegrationsSettingsSectionId =
  (typeof INTEGRATIONS_SETTINGS_SECTIONS)[number]["targetId"];
