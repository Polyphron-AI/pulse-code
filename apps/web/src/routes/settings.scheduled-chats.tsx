import { createFileRoute } from "@tanstack/react-router";

import { ScheduledChatsSettingsPanel } from "../components/settings/ScheduledChatsSettings";

function SettingsScheduledChatsRoute() {
  return <ScheduledChatsSettingsPanel />;
}

export const Route = createFileRoute("/settings/scheduled-chats")({
  component: SettingsScheduledChatsRoute,
});
